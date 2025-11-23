
import { colorToRgb } from './utils.js';



export function renderWebGL(element, definition, options) {
  const { threading, warp_colors, weft_colors } = definition;
  const displayMode = options.display_mode || options.displayMode || { type: 'simple', cellSize: options.cell_size || options.cellSize || 1 };
  const intersection_size = displayMode.cellSize || 1;
  const isInterlacing = displayMode.type === 'interlacing';
  const threadThickness = isInterlacing ? (displayMode.thread_thickness ?? 6) : 0;
  const borderSize = isInterlacing ? (displayMode.border_size ?? 1) : 0;
  const cutSize = isInterlacing ? (displayMode.cut_size ?? 1) : 0;
  const { width, height } = options;

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
  const gl = canvas.getContext('webgl');

  if (!gl) {
    console.error("WebGL not supported");
    return;
  }

  // Validate inputs / Empty State
  if (!threading || !threading.length || !threading[0].length) {
    gl.viewport(0, 0, width, height);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return;
  }

  const threadingHeight = threading.length;
  const threadingWidth = threading[0].length;
  const warpColorsRgb = warp_colors.map(colorToRgb);
  const weftColorsRgb = weft_colors.map(colorToRgb);

  // --- Data Preparation ---

  // 1. Threading Texture
  // We use RGBA format for maximum compatibility
  const threadingData = new Uint8Array(threadingWidth * threadingHeight * 4);
  for (let y = 0; y < threadingHeight; y++) {
    for (let x = 0; x < threadingWidth; x++) {
      const idx = (y * threadingWidth + x) * 4;
      const val = threading[y][x] ? 255 : 0;
      threadingData[idx] = val;     // R
      threadingData[idx + 1] = val; // G
      threadingData[idx + 2] = val; // B
      threadingData[idx + 3] = 255; // A
    }
  }
  // 2. Color Texture
  // We need to store two palettes: Warp and Weft.
  // We can put them in a single texture of height 2.
  // Row 0: Warp Colors, Row 1: Weft Colors.
  // Width will be max(warp_colors.length, weft_colors.length).
  const maxColors = Math.max(warpColorsRgb.length, weftColorsRgb.length);
  const colorData = new Float32Array(maxColors * 2 * 4); // RGBA floats

  // Fill Warp Colors (Row 0)
  for (let i = 0; i < warpColorsRgb.length; i++) {
    const c = warpColorsRgb[i];
    const offset = i * 4;
    colorData[offset] = c[0];
    colorData[offset + 1] = c[1];
    colorData[offset + 2] = c[2];
    colorData[offset + 3] = c[3];
  }

  // Fill Weft Colors (Row 1)
  for (let i = 0; i < weftColorsRgb.length; i++) {
    const c = weftColorsRgb[i];
    const offset = (maxColors + i) * 4; // Start of second row
    colorData[offset] = c[0];
    colorData[offset + 1] = c[1];
    colorData[offset + 2] = c[2];
    colorData[offset + 3] = c[3];
  }

  // --- Shaders ---

  const vsSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
    }
  `;

  const fsSourceSimple = `
    precision mediump float;
    
    uniform vec2 u_resolution;
    uniform float u_intersection_size;
    
    uniform sampler2D u_threading;
    uniform vec2 u_threading_size; // width, height
    
    uniform sampler2D u_colors;
    uniform vec2 u_colors_size; // width (maxColors), height (2)
    uniform float u_warp_count;
    uniform float u_weft_count;

    void main() {
      vec2 pixelCoord = gl_FragCoord.xy;
      float gridX = floor(pixelCoord.x / u_intersection_size);
      float gridY = floor((u_resolution.y - pixelCoord.y) / u_intersection_size);

      float tx = mod(gridX, u_threading_size.x);
      float ty = mod(gridY, u_threading_size.y);

      vec2 tUv = (vec2(tx, ty) + 0.5) / u_threading_size;
      float isWarp = texture2D(u_threading, tUv).r;

      vec4 warpColor = vec4(texture2D(u_colors, (vec2(mod(gridX, u_warp_count), 0.0) + 0.5) / u_colors_size).rgb, 1.0);
      vec4 weftColor = vec4(texture2D(u_colors, (vec2(mod(gridY, u_weft_count), 1.0) + 0.5) / u_colors_size).rgb, 1.0);

      gl_FragColor = isWarp > 0.5 ? warpColor : weftColor;
    }
  `;

  const fsSourceInterlacing = `
    precision mediump float;
    
    uniform vec2 u_resolution;
    uniform float u_intersection_size;
    uniform float u_thread_thickness;
    uniform float u_border_size;
    uniform float u_cut_size;
    uniform float u_mode; // 0 = simple, 1 = interlacing
    
    uniform sampler2D u_threading;
    uniform vec2 u_threading_size; // width, height
    
    uniform sampler2D u_colors;
    uniform vec2 u_colors_size; // width (maxColors), height (2)
    uniform float u_warp_count;
    uniform float u_weft_count;

    const vec4 BORDER_COLOR = vec4(17.0/255.0, 17.0/255.0, 17.0/255.0, 1.0);

    float sampleThread(bool isWarp, bool isTop, vec2 local, float cellSize, float topOuter) {
      float outerThickness = u_thread_thickness + 2.0 * u_border_size;
      float gap = isTop ? 0.0 : min(cellSize, topOuter + 2.0 * u_cut_size);

      if (isWarp) {
        float outerHalfX = outerThickness * 0.5;
        float centerX = cellSize * 0.5;
        float xDist = abs(local.x - centerX);
        if (xDist > outerHalfX) return 0.0;

        float segLen = max(0.0, (cellSize - gap) * 0.5);
        bool inSeg = local.y <= segLen || local.y >= cellSize - segLen;
        if (!isTop && !inSeg) return 0.0;

        float innerHalfX = u_thread_thickness * 0.5;
        return xDist <= innerHalfX ? 2.0 : 1.0;
      } else {
        float outerHalfY = outerThickness * 0.5;
        float centerY = cellSize * 0.5;
        float yDist = abs(local.y - centerY);
        if (yDist > outerHalfY) return 0.0;

        float segLen = max(0.0, (cellSize - gap) * 0.5);
        bool inSeg = local.x <= segLen || local.x >= cellSize - segLen;
        if (!isTop && !inSeg) return 0.0;

        float innerHalfY = u_thread_thickness * 0.5;
        return yDist <= innerHalfY ? 2.0 : 1.0;
      }
    }

    void main() {
      // Pixel coordinates - gl_FragCoord.y grows from bottom, but our reference
      // implementations (Canvas/SVG) assume y=0 at the top. Flip Y here so
      // grid coordinates line up with the other backends.
      vec2 pixelCoord = gl_FragCoord.xy;
      float gridX = floor(pixelCoord.x / u_intersection_size);
      float gridY = floor((u_resolution.y - pixelCoord.y) / u_intersection_size);
      float localX = mod(pixelCoord.x, u_intersection_size);
      float localY = mod(u_resolution.y - pixelCoord.y, u_intersection_size);
      vec2 local = vec2(localX, localY);

      // Threading coordinates (modulo)
      float tx = mod(gridX, u_threading_size.x);
      float ty = mod(gridY, u_threading_size.y);

      // Look up threading value
      // Texture coords are 0.0 to 1.0. We need to map center of texel.
      vec2 tUv = (vec2(tx, ty) + 0.5) / u_threading_size;
      float isWarp = texture2D(u_threading, tUv).r; // Red channel for RGBA format

      vec4 warpColor = vec4(texture2D(u_colors, (vec2(mod(gridX, u_warp_count), 0.0) + 0.5) / u_colors_size).rgb, 1.0);
      vec4 weftColor = vec4(texture2D(u_colors, (vec2(mod(gridY, u_weft_count), 1.0) + 0.5) / u_colors_size).rgb, 1.0);

      if (u_mode < 0.5) {
        gl_FragColor = isWarp > 0.5 ? warpColor : weftColor;
        return;
      }
      vec4 outColor = vec4(0.0);
      float topOuter = u_thread_thickness + 2.0 * u_border_size;

      if (isWarp > 0.5) {
        float underSample = sampleThread(false, false, local, u_intersection_size, topOuter);
        if (underSample > 0.0) {
          outColor = underSample == 2.0 ? weftColor : BORDER_COLOR;
        }
        float topSample = sampleThread(true, true, local, u_intersection_size, 0.0);
        if (topSample > 0.0) {
          outColor = topSample == 2.0 ? warpColor : BORDER_COLOR;
        }
      } else {
        float underSample = sampleThread(true, false, local, u_intersection_size, topOuter);
        if (underSample > 0.0) {
          outColor = underSample == 2.0 ? warpColor : BORDER_COLOR;
        }
        float topSample = sampleThread(false, true, local, u_intersection_size, 0.0);
        if (topSample > 0.0) {
          outColor = topSample == 2.0 ? weftColor : BORDER_COLOR;
        }
      }

      gl_FragColor = outColor;
    }
  `;

  const fsSource = isInterlacing ? fsSourceInterlacing : fsSourceSimple;

  const program = createProgram(gl, vsSource, fsSource);
  gl.useProgram(program);

  // --- Uniforms ---
  const locRes = gl.getUniformLocation(program, "u_resolution");
  const locSize = gl.getUniformLocation(program, "u_intersection_size");
  const locThreadingSize = gl.getUniformLocation(program, "u_threading_size");
  const locColorsSize = gl.getUniformLocation(program, "u_colors_size");
  const locWarpCount = gl.getUniformLocation(program, "u_warp_count");
  const locWeftCount = gl.getUniformLocation(program, "u_weft_count");
  const locThreadingTex = gl.getUniformLocation(program, "u_threading");
  const locColorsTex = gl.getUniformLocation(program, "u_colors");

  gl.uniform2f(locRes, width, height);
  gl.uniform1f(locSize, intersection_size);
  gl.uniform2f(locThreadingSize, threadingWidth, threadingHeight);
  gl.uniform2f(locColorsSize, maxColors, 2);
  gl.uniform1f(locWarpCount, warpColorsRgb.length);
  gl.uniform1f(locWeftCount, weftColorsRgb.length);
  gl.uniform1i(locThreadingTex, 0); // Texture unit 0
  gl.uniform1i(locColorsTex, 1);    // Texture unit 1

  if (isInterlacing) {
    const locThreadThickness = gl.getUniformLocation(program, "u_thread_thickness");
    const locBorderSize = gl.getUniformLocation(program, "u_border_size");
    const locCutSize = gl.getUniformLocation(program, "u_cut_size");
    const locMode = gl.getUniformLocation(program, "u_mode");
    gl.uniform1f(locThreadThickness, threadThickness);
    gl.uniform1f(locBorderSize, borderSize);
    gl.uniform1f(locCutSize, cutSize);
    gl.uniform1f(locMode, 1);
  }

  // --- Textures ---

  // Threading Texture (Unit 0)
  const threadingTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, threadingTex);
  // Use RGBA format for maximum compatibility
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, threadingWidth, threadingHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, threadingData);
  const texError = gl.getError();
  if (texError !== gl.NO_ERROR) {
    console.error('WebGL error after texImage2D:', texError);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Colors Texture (Unit 1)
  const colorsTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, colorsTex);
  // We use FLOAT texture if OES_texture_float is available, otherwise generic byte texture.
  // Actually, standard WebGL 1.0 doesn't support FLOAT textures by default without extension.
  // Let's convert float colors to Uint8 for compatibility.
  const colorDataUint8 = new Uint8Array(colorData.length);
  for(let i=0; i<colorData.length; i++) colorDataUint8[i] = colorData[i] * 255;

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, maxColors, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, colorDataUint8);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // --- Geometry (Full Screen Quad) ---
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
  ]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  // Ensure textures are bound before drawing
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, threadingTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, colorsTex);

  // --- Draw ---
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}
