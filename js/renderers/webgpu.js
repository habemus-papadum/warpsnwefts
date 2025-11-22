
import { colorToRgb } from './utils.js';



export async function renderWebGPU(element, definition, options) {
  const { threading, warp_colors, weft_colors } = definition;
  const { width, height, intersection_size = 1 } = options;

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
    warpColorsRgb.length, weftColorsRgb.length, 0, 0
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
      }

      @group(0) @binding(0) var<uniform> uniforms : Uniforms;
      @group(0) @binding(1) var<storage, read> threading : array<u32>;
      @group(0) @binding(2) var<storage, read> warp_colors : array<vec4f>;
      @group(0) @binding(3) var<storage, read> weft_colors : array<vec4f>;

      struct VertexOutput {
        @builtin(position) position : vec4f,
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
        // Pixel coordinates (0.5 to width-0.5)
        // WebGPU coords are top-left 0,0? No, standard is usually top-left for window, but let's check.
        // @builtin(position) is in framebuffer coords.
        
        let gridX = floor(pixelCoord.x / uniforms.intersection_size);
        let gridY = floor(pixelCoord.y / uniforms.intersection_size);

        let tx = u32(gridX) % u32(uniforms.threading_size.x);
        let ty = u32(gridY) % u32(uniforms.threading_size.y);
        
        // Threading index
        let tIndex = ty * u32(uniforms.threading_size.x) + tx;
        let isWarp = threading[tIndex];

        var color : vec4f;
        if (isWarp > 0) {
          let cIndex = u32(gridX) % u32(uniforms.color_counts.x);
          color = warp_colors[cIndex];
        } else {
          let cIndex = u32(gridY) % u32(uniforms.color_counts.y);
          color = weft_colors[cIndex];
        }
        
        return color;
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
