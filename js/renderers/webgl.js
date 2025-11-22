
import { colorToRgb } from './utils.js';



export function renderWebGL(element, definition, options) {
  const { threading, warp_colors, weft_colors } = definition;
  const { width, height, intersection_size = 1 } = options;

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
  // We flatten the 2D threading array into a 1D Uint8Array (0 or 1)
  // We'll use a LUMINANCE texture.
  const threadingData = new Uint8Array(threadingWidth * threadingHeight);
  for (let y = 0; y < threadingHeight; y++) {
    for (let x = 0; x < threadingWidth; x++) {
      threadingData[y * threadingWidth + x] = threading[y][x] ? 255 : 0;
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

  const fsSource = `
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
      // Pixel coordinates (0.5 to width-0.5)
      vec2 pixelCoord = gl_FragCoord.xy;
      
      // Flip Y because WebGL 0,0 is bottom-left, but our logic assumes top-left
      pixelCoord.y = u_resolution.y - pixelCoord.y;

      // Grid coordinates
      float gridX = floor(pixelCoord.x / u_intersection_size);
      float gridY = floor(pixelCoord.y / u_intersection_size);

      // Threading coordinates (modulo)
      float tx = mod(gridX, u_threading_size.x);
      float ty = mod(gridY, u_threading_size.y);

      // Look up threading value
      // Texture coords are 0.0 to 1.0. We need to map center of texel.
      // NOTE: Swap tx/ty because threading array is [row][col] but texture is sampled [u][v]
      vec2 tUv = (vec2(ty, tx) + 0.5) / u_threading_size;
      float isWarp = texture2D(u_threading, tUv).r; // > 0.5 means Warp

      vec4 color;
      if (isWarp > 0.5) {
        // Warp Color (Row 0)
        float cIndex = mod(gridX, u_warp_count);
        vec2 cUv = (vec2(cIndex, 0.0) + 0.5) / u_colors_size;
        color = texture2D(u_colors, cUv);
      } else {
        // Weft Color (Row 1)
        float cIndex = mod(gridY, u_weft_count);
        vec2 cUv = (vec2(cIndex, 1.0) + 0.5) / u_colors_size;
        color = texture2D(u_colors, cUv);
      }

      gl_FragColor = color;
    }
  `;

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

  // --- Textures ---

  // Threading Texture (Unit 0)
  const threadingTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, threadingTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, threadingWidth, threadingHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, threadingData);
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
