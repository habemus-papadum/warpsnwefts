
import { colorToRgb } from './utils.js';



export async function renderWebGPU(element, definition, options) {
  const { threading, warp_colors, weft_colors } = definition;
  const displayMode = options.display_mode || options.displayMode || { type: 'simple', cellSize: options.cell_size || options.cellSize || 1 };
  const intersection_size = displayMode.cellSize || 1;
  const isInterlacing = displayMode.type === 'interlacing';
  const threadThickness = isInterlacing ? (displayMode.thread_thickness ?? 6) : 0;
  const borderSize = isInterlacing ? (displayMode.border_size ?? 1) : 0;
  const cutSize = isInterlacing ? (displayMode.cut_size ?? 1) : 0;
  const { width, height } = options;

  if (!navigator.gpu) {
    console.error("WebGPU not supported on this browser.");
    return;
  }

  let canvas;
  if (element.tagName === 'CANVAS') {
    canvas = element;
  } else {
    canvas = element.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      element.appendChild(canvas);
    }
  }

  canvas.width = width;
  canvas.height = height;

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.error("No appropriate GPUAdapter found.");
    return;
  }
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "premultiplied",
  });

  // Validate inputs / Empty State
  if (!threading || !threading.length || !threading[0].length) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.end();
    device.queue.submit([encoder.finish()]);
    return;
  }

  const threadingHeight = threading.length;
  const threadingWidth = threading[0].length;
  const warpColorsRgb = warp_colors.map(colorToRgb);
  const weftColorsRgb = weft_colors.map(colorToRgb);

  // --- Data Preparation ---

  // 1. Threading Buffer (Uint32 for simplicity in shader, though Uint8 is tighter)
  const threadingData = new Uint32Array(threadingWidth * threadingHeight);
  for (let y = 0; y < threadingHeight; y++) {
    for (let x = 0; x < threadingWidth; x++) {
      threadingData[y * threadingWidth + x] = threading[y][x] ? 1 : 0;
    }
  }

  // 2. Color Buffers (Float32)
  const warpData = new Float32Array(warpColorsRgb.flat());
  const weftData = new Float32Array(weftColorsRgb.flat());

  // 3. Uniforms
  const uniformData = new Float32Array([
    width, height, intersection_size, 0, // vec4 padding
    threadingWidth, threadingHeight, 0, 0,
    warpColorsRgb.length, weftColorsRgb.length, 0, 0,
    threadThickness, borderSize, cutSize, isInterlacing ? 1 : 0,
  ]);

  // --- Buffers ---
  const createBuffer = (arr, usage) => {
    const buffer = device.createBuffer({
      size: arr.byteLength,
      usage: usage | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, arr);
    return buffer;
  };

  const threadingBuffer = createBuffer(threadingData, GPUBufferUsage.STORAGE);
  const warpBuffer = createBuffer(warpData, GPUBufferUsage.STORAGE);
  const weftBuffer = createBuffer(weftData, GPUBufferUsage.STORAGE);
  const uniformBuffer = createBuffer(uniformData, GPUBufferUsage.UNIFORM);

  // --- Shader ---
  const shaderModule = device.createShaderModule({
    code: `
      struct Uniforms {
        resolution : vec2f,
        intersection_size : f32,
        padding1 : f32,
        threading_size : vec2f,
        padding2 : vec2f,
        color_counts : vec2f,
        padding3 : vec2f,
        thread_thickness : f32,
        border_size : f32,
        cut_size : f32,
        mode : f32,
      }

      @group(0) @binding(0) var<uniform> uniforms : Uniforms;
      @group(0) @binding(1) var<storage, read> threading : array<u32>;
      @group(0) @binding(2) var<storage, read> warp_colors : array<vec4f>;
      @group(0) @binding(3) var<storage, read> weft_colors : array<vec4f>;

      struct VertexOutput {
        @builtin(position) position : vec4f,
      }

      fn sampleThread(
        isWarp: bool,
        isTop: bool,
        local: vec2f,
        cellSize: f32,
        topOuterSize: f32,
        threadThickness: f32,
        borderSize: f32,
        cutSize: f32
      ) -> f32 {
        let outerThickness = threadThickness + 2.0 * borderSize;
        var gap: f32;
        if (isTop) {
          gap = 0.0;
        } else {
          gap = min(cellSize, topOuterSize + 2.0 * cutSize);
        }

        if (isWarp) {
          let outerHalfX = outerThickness * 0.5;
          let centerX = cellSize * 0.5;
          let xDist = abs(local.x - centerX);
          if (xDist > outerHalfX) { return 0.0; }
          let segLen = max(0.0, (cellSize - gap) * 0.5);
          let inSeg = local.y <= segLen || local.y >= cellSize - segLen;
          if (!isTop && !inSeg) { return 0.0; }
          let innerHalfX = threadThickness * 0.5;
          if (xDist <= innerHalfX) {
            return 2.0;
          } else {
            return 1.0;
          }
        } else {
          let outerHalfY = outerThickness * 0.5;
          let centerY = cellSize * 0.5;
          let yDist = abs(local.y - centerY);
          if (yDist > outerHalfY) { return 0.0; }
          let segLen = max(0.0, (cellSize - gap) * 0.5);
          let inSeg = local.x <= segLen || local.x >= cellSize - segLen;
          if (!isTop && !inSeg) { return 0.0; }
          let innerHalfY = threadThickness * 0.5;
          if (yDist <= innerHalfY) {
            return 2.0;
          } else {
            return 1.0;
          }
        }
      }

      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
        var pos = array<vec2f, 6>(
          vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
          vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
        );
        var output : VertexOutput;
        output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
        return output;
      }

      @fragment
      fn fs_main(@builtin(position) pixelCoord : vec4f) -> @location(0) vec4f {
        let gridX = floor(pixelCoord.x / uniforms.intersection_size);
        let gridY = floor(pixelCoord.y / uniforms.intersection_size);

        let localX = pixelCoord.x % uniforms.intersection_size;
        let localY = pixelCoord.y % uniforms.intersection_size;

        let tx = u32(gridX) % u32(uniforms.threading_size.x);
        let ty = u32(gridY) % u32(uniforms.threading_size.y);
        
        let tIndex = ty * u32(uniforms.threading_size.x) + tx;
        let isWarp = threading[tIndex] > 0u;

        let warpColor = warp_colors[u32(gridX) % u32(uniforms.color_counts.x)];
        let weftColor = weft_colors[u32(gridY) % u32(uniforms.color_counts.y)];
        let borderColor = vec4f(17.0/255.0, 17.0/255.0, 17.0/255.0, 1.0);
        let topOuter = uniforms.thread_thickness + 2.0 * uniforms.border_size;

        if (uniforms.mode < 0.5) {
          if (isWarp) {
            return warpColor;
          } else {
            return weftColor;
          }
        }

        // sampleThread equivalent
        var outColor : vec4f = vec4f(0.0, 0.0, 0.0, 0.0);
        // helper for warp (vertical)

        if (isWarp) {
          let underSample = sampleThread(false, false, vec2f(localX, localY), uniforms.intersection_size, topOuter, uniforms.thread_thickness, uniforms.border_size, uniforms.cut_size);
          if (underSample > 0.0) {
            if (underSample == 2.0) {
              outColor = weftColor;
            } else {
              outColor = borderColor;
            }
          }
          let topSample = sampleThread(true, true, vec2f(localX, localY), uniforms.intersection_size, 0.0, uniforms.thread_thickness, uniforms.border_size, uniforms.cut_size);
          if (topSample > 0.0) {
            if (topSample == 2.0) {
              outColor = warpColor;
            } else {
              outColor = borderColor;
            }
          }
        } else {
          let underSample = sampleThread(true, false, vec2f(localX, localY), uniforms.intersection_size, topOuter, uniforms.thread_thickness, uniforms.border_size, uniforms.cut_size);
          if (underSample > 0.0) {
            if (underSample == 2.0) {
              outColor = warpColor;
            } else {
              outColor = borderColor;
            }
          }
          let topSample = sampleThread(false, true, vec2f(localX, localY), uniforms.intersection_size, 0.0, uniforms.thread_thickness, uniforms.border_size, uniforms.cut_size);
          if (topSample > 0.0) {
            if (topSample == 2.0) {
              outColor = weftColor;
            } else {
              outColor = borderColor;
            }
          }
        }

        return outColor;
      }
    `
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vs_main",
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fs_main",
      targets: [{ format: presentationFormat }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: threadingBuffer } },
      { binding: 2, resource: { buffer: warpBuffer } },
      { binding: 3, resource: { buffer: weftBuffer } },
    ],
  });

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: "clear",
      storeOp: "store",
    }],
  });

  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.draw(6);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
}
