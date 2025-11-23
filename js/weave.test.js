import { describe, test, expect } from 'vitest';
import { renderWeave } from './weave.js';

// Test definition for Twill 2/2 pattern
const twillDefinition = {
  threading: [
    [true, true, false, false],
    [true, false, false, false],
    [false, false, false, true],
    [false, false, true, true],
  ],
  warp_colors: ['navy', 'gold'],
  weft_colors: ['navy', 'gold'],
};

// Test definition for Plain weave
const plainDefinition = {
  threading: [
    [true, false],
    [false, true],
  ],
  warp_colors: ['black'],
  weft_colors: ['red'],
};

// Focused debug definition with unique colors to expose coordinate mistakes
const debugDefinition = {
  threading: [
    [true, true, false, false],
    [false, true, true, false],
    [false, false, true, true],
    [true, false, false, true],
  ],
  warp_colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'],
  weft_colors: ['#00ffff', '#ff00ff', '#ffffff', '#000000'],
};

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/**
 * Helper to extract pixel data from a canvas (2D or WebGL)
 */
function getCanvasPixelData(container) {
  const canvas = container.querySelector('canvas');
  if (!canvas) throw new Error('No canvas found');
  
  // Try to get 2D context first
  let ctx = canvas.getContext('2d');
  if (ctx) {
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }
  
  // If 2D context fails, it might be a WebGL canvas
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (gl) {
    // Read pixels from WebGL
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    
    // WebGL has origin at bottom-left, need to flip Y
    const flipped = new Uint8ClampedArray(pixels.length);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const srcIdx = ((canvas.height - 1 - y) * canvas.width + x) * 4;
        const dstIdx = (y * canvas.width + x) * 4;
        flipped[dstIdx] = pixels[srcIdx];
        flipped[dstIdx + 1] = pixels[srcIdx + 1];
        flipped[dstIdx + 2] = pixels[srcIdx + 2];
        flipped[dstIdx + 3] = pixels[srcIdx + 3];
      }
    }
    return flipped;
  }
  
  throw new Error('Could not get 2D or WebGL context from canvas');
}

/**
 * Helper to convert SVG to canvas and extract pixel data
 */
function getSVGPixelData(container, width, height) {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('No SVG found');
  
  // Create a canvas to rasterize the SVG
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  // Serialize SVG to data URL
  const svgData = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  // Return a promise that resolves with pixel data
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(ctx.getImageData(0, 0, width, height).data);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Compare two pixel data arrays with tolerance for minor differences
 */
function comparePixelData(data1, data2, tolerance = 2) {
  if (data1.length !== data2.length) {
    return { match: false, reason: 'Different lengths' };
  }
  
  let mismatchCount = 0;
  const maxMismatches = data1.length * 0.01; // Allow 1% mismatch
  
  for (let i = 0; i < data1.length; i++) {
    const diff = Math.abs(data1[i] - data2[i]);
    if (diff > tolerance) {
      mismatchCount++;
      if (mismatchCount > maxMismatches) {
        return {
          match: false,
          reason: `Too many mismatches (${mismatchCount}/${data1.length / 4} pixels)`,
          firstMismatchIndex: i,
        };
      }
    }
  }
  
  return { match: true };
}

/**
 * Sample the center pixel of each intersection and return a grid of RGB tuples
 */
function sampleGridColors(pixelData, width, height, intersectionSize) {
  const cols = Math.floor(width / intersectionSize);
  const rows = Math.floor(height / intersectionSize);
  const grid = [];
  for (let gy = 0; gy < rows; gy++) {
    const row = [];
    for (let gx = 0; gx < cols; gx++) {
      const sampleX = Math.min(width - 1, Math.floor(gx * intersectionSize + intersectionSize / 2));
      const sampleY = Math.min(height - 1, Math.floor(gy * intersectionSize + intersectionSize / 2));
      const idx = (sampleY * width + sampleX) * 4;
      row.push([pixelData[idx], pixelData[idx + 1], pixelData[idx + 2]]);
    }
    grid.push(row);
  }
  return grid;
}

function rgbToHex([r, g, b]) {
  return [r, g, b]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}

function logGrid(label, grid) {
  console.log(label);
  grid.forEach((row, rowIdx) => {
    const asHex = row.map((rgb) => rgbToHex(rgb));
    console.log(`Row ${rowIdx}: ${asHex.join(' ')}`);
  });
}

function samplePixel(data, width, x, y) {
  const idx = (y * width + x) * 4;
  return [data[idx], data[idx + 1], data[idx + 2]];
}

function expectColorApprox(actual, expected, tolerance = 4) {
  const close = actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);
  if (!close) {
    throw new Error(`Expected ${expected} got ${actual}`);
  }
}

describe('Weave Rendering - Backend Consistency', () => {
  test('Plain weave: Canvas vs WebGL', async () => {
    const width = 200;
    const height = 200;
    const options = { width, height, intersection_size: 10 };
    
    // Render with Canvas
    const canvasContainer = document.createElement('div');
    document.body.appendChild(canvasContainer);
    await renderWeave(canvasContainer, plainDefinition, { ...options, backend: 'canvas' });
    const canvasData = getCanvasPixelData(canvasContainer);
    
    // Render with WebGL
    const webglContainer = document.createElement('div');
    document.body.appendChild(webglContainer);
    await renderWeave(webglContainer, plainDefinition, { ...options, backend: 'webgl' });
    const webglData = getCanvasPixelData(webglContainer);
    
    // Compare
    const result = comparePixelData(canvasData, webglData);
    
    // Debug output
    if (!result.match) {
      console.error('Plain weave pixel mismatch:', result);
      // Sample first few pixels
      console.log('Canvas first 40 bytes:', Array.from(canvasData.slice(0, 40)));
      console.log('WebGL first 40 bytes:', Array.from(webglData.slice(0, 40)));
      
      // Check specific grid positions
      const w = 200;
      const intersectionSize = 10;
      for (let gy = 0; gy < 3; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          const px = gx * intersectionSize;
          const py = gy * intersectionSize;
          const idx = (py * w + px) * 4;
          const canvasR = canvasData[idx];
          const webglR = webglData[idx];
          console.log(`Grid(${gx},${gy}): Canvas RGB(${canvasR},${canvasData[idx+1]},${canvasData[idx+2]}) vs WebGL RGB(${webglR},${webglData[idx+1]},${webglData[idx+2]})`);
        }
      }
    }
    
    // Cleanup
    canvasContainer.remove();
    webglContainer.remove();
    
    expect(result.match).toBe(true);
  });
  
  test('Twill 2/2: Canvas vs WebGL', async () => {
    const width = 200;
    const height = 200;
    const options = { width, height, intersection_size: 8 };
    
    // Render with Canvas
    const canvasContainer = document.createElement('div');
    document.body.appendChild(canvasContainer);
    await renderWeave(canvasContainer, twillDefinition, { ...options, backend: 'canvas' });
    const canvasData = getCanvasPixelData(canvasContainer);
    
    // Render with WebGL
    const webglContainer = document.createElement('div');
    document.body.appendChild(webglContainer);
    await renderWeave(webglContainer, twillDefinition, { ...options, backend: 'webgl' });
    const webglData = getCanvasPixelData(webglContainer);
    
    // Compare
    const result = comparePixelData(canvasData, webglData);
    
    // Cleanup
    canvasContainer.remove();
    webglContainer.remove();
    
    if (!result.match) {
      console.error('Pixel mismatch:', result);
    }
    
    expect(result.match).toBe(true);
  });
  
  test('Twill 2/2: Canvas vs SVG', async () => {
    const width = 200;
    const height = 200;
    const options = { width, height, intersection_size: 8 };
    
    // Render with Canvas
    const canvasContainer = document.createElement('div');
    document.body.appendChild(canvasContainer);
    await renderWeave(canvasContainer, twillDefinition, { ...options, backend: 'canvas' });
    const canvasData = getCanvasPixelData(canvasContainer);
    
    // Render with SVG
    const svgContainer = document.createElement('div');
    document.body.appendChild(svgContainer);
    await renderWeave(svgContainer, twillDefinition, { ...options, backend: 'svg' });
    const svgData = await getSVGPixelData(svgContainer, width, height);
    
    // Compare
    const result = comparePixelData(canvasData, svgData, 5); // Higher tolerance for SVG rasterization
    
    // Cleanup
    canvasContainer.remove();
    svgContainer.remove();
    
    if (!result.match) {
      console.error('Pixel mismatch:', result);
    }
    
    expect(result.match).toBe(true);
  });

  test('Debug: Canvas vs WebGL grid capture for twill-like pattern', async () => {
    const width = 160;
    const height = 160;
    const intersectionSize = 20;
    const options = { width, height, intersection_size: intersectionSize };

    const canvasContainer = document.createElement('div');
    document.body.appendChild(canvasContainer);
    await renderWeave(canvasContainer, debugDefinition, { ...options, backend: 'canvas' });
    const canvasData = getCanvasPixelData(canvasContainer);

    const webglContainer = document.createElement('div');
    document.body.appendChild(webglContainer);
    await renderWeave(webglContainer, debugDefinition, { ...options, backend: 'webgl' });
    const webglData = getCanvasPixelData(webglContainer);

    const canvasGrid = sampleGridColors(canvasData, width, height, intersectionSize);
    const webglGrid = sampleGridColors(webglData, width, height, intersectionSize);

    if (JSON.stringify(canvasGrid) !== JSON.stringify(webglGrid)) {
      logGrid('Canvas grid (hex RGB):', canvasGrid);
      logGrid('WebGL grid (hex RGB):', webglGrid);
    }

    canvasContainer.remove();
    webglContainer.remove();

    expect(webglGrid).toEqual(canvasGrid);
  });

  test('Interlacing display mode shows both threads in a cell (canvas only)', async () => {
    const cellSize = 20;
    const width = cellSize * 2;
    const height = cellSize * 2;
    const options = {
      width,
      height,
      backend: 'canvas',
      display_mode: {
        type: 'interlacing',
        cellSize: cellSize,
        thread_thickness: 8,
        border_size: 1,
        cut_size: 1,
      },
      cell_size: cellSize,
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderWeave(container, debugDefinition, options);
    const data = getCanvasPixelData(container);

    // Cell (0,0): warp on top -> center shows warp color, side shows weft color
    const warpTopColor = hexToRgb(debugDefinition.warp_colors[0]);
    const weftColorRow0 = hexToRgb(debugDefinition.weft_colors[0]);
    const center00 = samplePixel(data, width, cellSize / 2, cellSize / 2);
    const side00 = samplePixel(data, width, 2, cellSize / 2);
    expectColorApprox(center00, warpTopColor);
    expectColorApprox(side00, weftColorRow0);

    // Cell (0,1): weft on top -> center shows weft, corner shows warp underneath
    const weftColorRow1 = hexToRgb(debugDefinition.weft_colors[1]);
    const center01 = samplePixel(data, width, cellSize / 2, cellSize + cellSize / 2);
    const warpTopCorner = samplePixel(data, width, cellSize / 2, cellSize + 1);
    expectColorApprox(center01, weftColorRow1);
    expectColorApprox(warpTopCorner, warpTopColor);

    container.remove();
  });

  test('Interlacing display mode matches across canvas/webgl/svg for single cell', async () => {
    const cellSize = 50;
    const options = {
      width: cellSize,
      height: cellSize,
      display_mode: {
        type: 'interlacing',
        cellSize: cellSize,
        thread_thickness: 17,
        border_size: 3,
        cut_size: 3,
      },
      cell_size: cellSize,
    };

    const def = {
      threading: [[true]], // warp on top
      warp_colors: ['#ff0000'],
      weft_colors: ['#0000ff'],
    };

    const canvasContainer = document.createElement('div');
    document.body.appendChild(canvasContainer);
    await renderWeave(canvasContainer, def, { ...options, backend: 'canvas' });
    const canvasData = getCanvasPixelData(canvasContainer);

    const webglContainer = document.createElement('div');
    document.body.appendChild(webglContainer);
    await renderWeave(webglContainer, def, { ...options, backend: 'webgl' });
    const webglData = getCanvasPixelData(webglContainer);

    const svgContainer = document.createElement('div');
    document.body.appendChild(svgContainer);
    await renderWeave(svgContainer, def, { ...options, backend: 'svg' });
    const svgData = await getSVGPixelData(svgContainer, cellSize, cellSize);

    // Center should be warp (red)
    const center = [Math.floor(cellSize / 2), Math.floor(cellSize / 2)];
    const canvasCenter = samplePixel(canvasData, cellSize, ...center);
    expectColorApprox(canvasCenter, [255, 0, 0]);
    expectColorApprox(samplePixel(webglData, cellSize, ...center), canvasCenter);
    expectColorApprox(samplePixel(svgData, cellSize, ...center), canvasCenter);

    // Side mid should match canvas (weft segment)
    const side = [Math.min(cellSize - 1, 1 + options.display_mode.border_size), Math.floor(cellSize / 2)];
    const canvasSide = samplePixel(canvasData, cellSize, ...side);
    expectColorApprox(samplePixel(webglData, cellSize, ...side), canvasSide);
    expectColorApprox(samplePixel(svgData, cellSize, ...side), canvasSide);

    // Gap near crossing midpoint along under-thread axis should be transparent/background (alpha 0 or white)
    const gapX = Math.floor(cellSize / 2);
    const gapY = Math.floor(cellSize / 2);
    const gapIdx = (gapY * cellSize + gapX) * 4;
    const canvasGapAlpha = canvasData[gapIdx + 3];
    const webglGapAlpha = webglData[gapIdx + 3];
    const svgGapAlpha = svgData[gapIdx + 3];
    expect(canvasGapAlpha).toBeGreaterThan(0); // warp drawn on top
    expect(webglGapAlpha).toBeGreaterThan(0);
    expect(svgGapAlpha).toBeGreaterThan(0);

    canvasContainer.remove();
    webglContainer.remove();
    svgContainer.remove();
  });
});
