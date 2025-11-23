
export function renderCanvas(element, definition, options) {
  const { threading, warp_colors, weft_colors } = definition;
  const displayMode = options.display_mode || options.displayMode || { type: 'simple', cellSize: options.cell_size || options.cellSize || 1 };
  const intersection_size = displayMode.cellSize || 1;
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

  const threadingHeight = threading.length;
  const threadingWidth = threading[0].length;
  
  const numWarps = Math.ceil(width / intersection_size);
  const numWefts = Math.ceil(height / intersection_size);

  if (displayMode.type === 'interlacing') {
    renderInterlacing({
      ctx,
      width,
      height,
      threading,
      warp_colors,
      weft_colors,
      intersectionSize: intersection_size,
      threadThickness: displayMode.thread_thickness ?? 6,
      borderSize: displayMode.border_size ?? 1,
      cutSize: displayMode.cut_size ?? 1,
    });
    return;
  }

  for (let j = 0; j < numWefts; j++) {
    for (let i = 0; i < numWarps; i++) {
      // Map visual coordinate to threading coordinate
      const threadY = j % threadingHeight;
      const threadX = i % threadingWidth;
      
      const isWarpOnTop = threading[threadY][threadX];
      
      let color;
      if (isWarpOnTop) {
        // Warp color
        const colorIndex = i % warp_colors.length;
        color = warp_colors[colorIndex];
      } else {
        // Weft color
        const colorIndex = j % weft_colors.length;
        color = weft_colors[colorIndex];
      }
      
      ctx.fillStyle = color;
      ctx.fillRect(
        i * intersection_size, 
        j * intersection_size, 
        intersection_size, 
        intersection_size
      );
    }
  }
}

function renderInterlacing({ ctx, width, height, threading, warp_colors, weft_colors, intersectionSize, threadThickness, borderSize, cutSize }) {
  const threadingHeight = threading.length;
  const threadingWidth = threading[0].length;
  const numWarps = Math.ceil(width / intersectionSize);
  const numWefts = Math.ceil(height / intersectionSize);
  const borderColor = '#111';

  for (let j = 0; j < numWefts; j++) {
    for (let i = 0; i < numWarps; i++) {
      const cellX = i * intersectionSize;
      const cellY = j * intersectionSize;

      const threadY = j % threadingHeight;
      const threadX = i % threadingWidth;
      const isWarpOnTop = threading[threadY][threadX];

      const warpColor = warp_colors[i % warp_colors.length];
      const weftColor = weft_colors[j % weft_colors.length];

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
