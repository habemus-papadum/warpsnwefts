
import { resolvePalette } from './utils.js';

const wrapIndex = (n, mod) => ((n % mod) + mod) % mod;

export function renderCanvas(element, definition, options) {
  const { threading, warp_colors, weft_colors } = definition;
  const displayModeRaw = options.display_mode || options.displayMode || { type: 'simple', cellSize: options.cell_size || options.cellSize || 1 };
  const displayMode = { ...displayModeRaw, type: (displayModeRaw.type || 'simple').toLowerCase().trim() };
  const intersection_size = displayMode.cellSize || 1;
  const { width, height } = options;
  const zoom = options.zoom_state || { active: false };

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
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  // Validate inputs / Empty State
  if (!threading || !threading.length || !threading[0].length) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#555555';
    ctx.font = '14px sans-serif';
    ctx.fillText('No data', 12, 24);
    return;
  }

  const warpPalette = resolvePalette(warp_colors);
  const weftPalette = resolvePalette(weft_colors);

  drawPattern(ctx, {
    width,
    height,
    threading,
    warpPalette,
    weftPalette,
    intersectionSize: intersection_size,
    displayMode,
    offsetWarp: 0,
    offsetWeft: 0,
  });

  if (zoom.active) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(zoom.center.x, zoom.center.y, zoom.radius, 0, Math.PI * 2);
    ctx.clip();
    // Fill background inside loop to avoid mixing with underlying pattern
    ctx.fillStyle = zoom.backgroundColor || 'rgba(255,255,255,1)';
    ctx.fillRect(zoom.center.x - zoom.radius, zoom.center.y - zoom.radius, zoom.radius * 2, zoom.radius * 2);

    const scaledCell = Math.max(1, Math.round(displayMode.cellSize * zoom.factor));
    const scaledMode = displayMode.type === 'interlacing'
      ? {
          ...displayMode,
          cellSize: scaledCell,
          thread_thickness: Math.max(1, Math.round((displayMode.thread_thickness ?? 6) * zoom.factor)),
          border_size: Math.max(0, Math.round((displayMode.border_size ?? 1) * zoom.factor)),
          cut_size: Math.max(0, Math.round((displayMode.cut_size ?? 1) * zoom.factor)),
        }
      : { ...displayMode, cellSize: scaledCell };

    const startWarp = Math.floor((zoom.center.x - zoom.radius) / displayMode.cellSize);
    const startWeft = Math.floor((zoom.center.y - zoom.radius) / displayMode.cellSize);

    ctx.translate(zoom.center.x - zoom.radius, zoom.center.y - zoom.radius);
    drawPattern(ctx, {
      width: zoom.radius * 2,
      height: zoom.radius * 2,
      threading,
      warpPalette,
      weftPalette,
      intersectionSize: scaledCell,
      displayMode: scaledMode,
      offsetWarp: startWarp,
      offsetWeft: startWeft,
    });
    ctx.restore();

    // Border
    ctx.save();
    ctx.beginPath();
    ctx.arc(zoom.center.x, zoom.center.y, zoom.radius, 0, Math.PI * 2);
    ctx.lineWidth = zoom.borderSize;
    ctx.strokeStyle = zoom.borderColor;
    ctx.stroke();
    ctx.restore();
  }
}

function drawPattern(ctx, params) {
  const {
    width,
    height,
    threading,
    warpPalette,
    weftPalette,
    intersectionSize,
    displayMode,
    offsetWarp,
    offsetWeft,
  } = params;
  const threadingHeight = threading.length;
  const threadingWidth = threading[0].length;

  const numWarps = Math.ceil(width / intersectionSize);
  const numWefts = Math.ceil(height / intersectionSize);

  if (displayMode.type === 'interlacing') {
    renderInterlacing({
      ctx,
      width,
      height,
      threading,
      warpPalette,
      weftPalette,
      intersectionSize,
      threadThickness: displayMode.thread_thickness ?? 6,
      borderSize: displayMode.border_size ?? 1,
      cutSize: displayMode.cut_size ?? 1,
      offsetWarp,
      offsetWeft,
    });
    return;
  }

  for (let j = 0; j < numWefts; j++) {
    for (let i = 0; i < numWarps; i++) {
      const threadY = wrapIndex(j + offsetWeft, threadingHeight);
      const threadX = wrapIndex(i + offsetWarp, threadingWidth);
      
      const isWarpOnTop = threading[threadY][threadX];
      
      const color = isWarpOnTop
        ? warpPalette[wrapIndex(i + offsetWarp, warpPalette.length)].css
        : weftPalette[wrapIndex(j + offsetWeft, weftPalette.length)].css;
      ctx.fillStyle = color;
      ctx.fillRect(
        i * intersectionSize, 
        j * intersectionSize, 
        intersectionSize, 
        intersectionSize
      );
    }
  }
}

function renderInterlacing({ ctx, width, height, threading, warpPalette, weftPalette, intersectionSize, threadThickness, borderSize, cutSize, offsetWarp, offsetWeft }) {
  const threadingHeight = threading.length;
  const threadingWidth = threading[0].length;
  const numWarps = Math.ceil(width / intersectionSize);
  const numWefts = Math.ceil(height / intersectionSize);
  const borderColor = '#111';

  for (let j = 0; j < numWefts; j++) {
    for (let i = 0; i < numWarps; i++) {
      const cellX = i * intersectionSize;
      const cellY = j * intersectionSize;

      const threadY = wrapIndex(j + offsetWeft, threadingHeight);
      const threadX = wrapIndex(i + offsetWarp, threadingWidth);
      const isWarpOnTop = threading[threadY][threadX];

      const warpColor = warpPalette[wrapIndex(i + offsetWarp, warpPalette.length)].css;
      const weftColor = weftPalette[wrapIndex(j + offsetWeft, weftPalette.length)].css;

      if (isWarpOnTop) {
        const topOuter = threadThickness + borderSize * 2;
        drawThread(ctx, cellX, cellY, intersectionSize, 'weft', weftColor, borderColor, threadThickness, borderSize, cutSize, false, topOuter);
        drawThread(ctx, cellX, cellY, intersectionSize, 'warp', warpColor, borderColor, threadThickness, borderSize, 0, true, 0);
      } else {
        const topOuter = threadThickness + borderSize * 2;
        drawThread(ctx, cellX, cellY, intersectionSize, 'warp', warpColor, borderColor, threadThickness, borderSize, cutSize, false, topOuter);
        drawThread(ctx, cellX, cellY, intersectionSize, 'weft', weftColor, borderColor, threadThickness, borderSize, 0, true, 0);
      }
    }
  }
}

function drawThread(ctx, cellX, cellY, cellSize, orientation, color, borderColor, threadThickness, borderSize, cutSize, isTop, topOuterSize) {
  const isWarp = orientation === 'warp';
  const topSpan = topOuterSize ?? 0;
  const gap = isTop ? 0 : Math.max(0, Math.min(cellSize, topSpan + 2 * cutSize));

  const borderWidthFull = isWarp ? (threadThickness + borderSize * 2) : cellSize;
  const borderHeightFull = isWarp ? cellSize : (threadThickness + borderSize * 2);
  const innerWidthFull = isWarp ? threadThickness : cellSize;
  const innerHeightFull = isWarp ? cellSize : threadThickness;
  const borderXFull = isWarp ? cellX + (cellSize - borderWidthFull) / 2 : cellX;
  const borderYFull = isWarp ? cellY : cellY + (cellSize - borderHeightFull) / 2;
  const innerXFull = isWarp ? cellX + (cellSize - innerWidthFull) / 2 : cellX;
  const innerYFull = isWarp ? cellY : cellY + (cellSize - innerHeightFull) / 2;

  const drawSegment = (xStart, yStart, segWidth, segHeight) => {
    if (segWidth <= 0 || segHeight <= 0) return;
    if (borderSize > 0) {
      ctx.fillStyle = borderColor;
      if (isWarp) {
        // vertical thread: left/right strips only
        ctx.fillRect(xStart, yStart, borderSize, segHeight);
        ctx.fillRect(xStart + borderSize + threadThickness, yStart, borderSize, segHeight);
      } else {
        // horizontal thread: top/bottom strips only
        ctx.fillRect(xStart, yStart, segWidth, borderSize);
        ctx.fillRect(xStart, yStart + borderSize + threadThickness, segWidth, borderSize);
      }
    }
    ctx.fillStyle = color;
    const innerX = isWarp ? xStart + borderSize : xStart;
    const innerY = isWarp ? yStart : yStart + borderSize;
    const innerW = isWarp ? threadThickness : segWidth;
    const innerH = isWarp ? segHeight : threadThickness;
    ctx.fillRect(innerX, innerY, innerW, innerH);
  };

  if (gap <= 0) {
    // Single continuous thread
    if (isWarp) {
      drawSegment(innerXFull - borderSize, cellY, threadThickness + 2 * borderSize, cellSize);
    } else {
      drawSegment(cellX, innerYFull - borderSize, cellSize, threadThickness + 2 * borderSize);
    }
    return;
  }

  // Under-thread split into two segments leaving a gap that accounts for the top thread span plus cutSize on each side.
  if (isWarp) {
    // Vertical thread split horizontally into two segments
    const segHeight = Math.max(0, (cellSize - gap) / 2);
    drawSegment(innerXFull - borderSize, cellY, threadThickness + 2 * borderSize, segHeight);
    drawSegment(innerXFull - borderSize, cellY + segHeight + gap, threadThickness + 2 * borderSize, segHeight);
  } else {
    // Horizontal thread split vertically into two segments
    const segWidth = Math.max(0, (cellSize - gap) / 2);
    drawSegment(cellX, innerYFull - borderSize, segWidth, threadThickness + 2 * borderSize);
    drawSegment(cellX + segWidth + gap, innerYFull - borderSize, segWidth, threadThickness + 2 * borderSize);
  }
}
