
import { resolvePalette } from './utils.js';

export function renderSVG(element, definition, options) {
  const { threading, warp_colors, weft_colors } = definition;
  const displayMode = options.display_mode || options.displayMode || { type: 'simple', cellSize: options.cell_size || options.cellSize || 1 };
  const intersection_size = displayMode.cellSize || 1;
  const { width, height } = options;
  const warpPalette = resolvePalette(warp_colors);
  const weftPalette = resolvePalette(weft_colors);

  // Clear container
  element.innerHTML = '';

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  element.appendChild(svg);

  // Validate inputs / Empty State
  if (!threading || !threading.length || !threading[0].length) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", width);
    rect.setAttribute("height", height);
    rect.setAttribute("fill", "#ffffff");
    svg.appendChild(rect);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", 12);
    text.setAttribute("y", 24);
    text.setAttribute("fill", "#555555");
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("font-size", "14");
    text.textContent = "No data";
    svg.appendChild(text);
    return;
  }

  const threadingHeight = threading.length;
  const threadingWidth = threading[0].length;
  
  const numWarps = Math.ceil(width / intersection_size);
  const numWefts = Math.ceil(height / intersection_size);

  // Create a fragment to minimize DOM reflows
  const fragment = document.createDocumentFragment();

  if (displayMode.type === 'interlacing') {
    const borderColor = '#111111';
    const threadThickness = displayMode.thread_thickness ?? 6;
    const borderSize = displayMode.border_size ?? 1;
    const cutSize = displayMode.cut_size ?? 1;

    for (let j = 0; j < numWefts; j++) {
      for (let i = 0; i < numWarps; i++) {
        const cellX = i * intersection_size;
        const cellY = j * intersection_size;
        const threadY = j % threadingHeight;
        const threadX = i % threadingWidth;
        const isWarpOnTop = threading[threadY][threadX];
        const warpColor = warpPalette[i % warpPalette.length].css;
        const weftColor = weftPalette[j % weftPalette.length].css;
        const topOuter = threadThickness + borderSize * 2;

        if (isWarpOnTop) {
          addUnderSegments(fragment, cellX, cellY, intersection_size, 'weft', weftColor, borderColor, threadThickness, borderSize, cutSize, topOuter);
          addTopThread(fragment, cellX, cellY, intersection_size, 'warp', warpColor, borderColor, threadThickness, borderSize);
        } else {
          addUnderSegments(fragment, cellX, cellY, intersection_size, 'warp', warpColor, borderColor, threadThickness, borderSize, cutSize, topOuter);
          addTopThread(fragment, cellX, cellY, intersection_size, 'weft', weftColor, borderColor, threadThickness, borderSize);
        }
      }
    }
  } else {
    for (let j = 0; j < numWefts; j++) {
      for (let i = 0; i < numWarps; i++) {
        const threadY = j % threadingHeight;
        const threadX = i % threadingWidth;
        
        const isWarpOnTop = threading[threadY][threadX];
        
        let color;
        if (isWarpOnTop) {
          const colorIndex = i % warpPalette.length;
          color = warpPalette[colorIndex].css;
        } else {
          const colorIndex = j % weftPalette.length;
          color = weftPalette[colorIndex].css;
        }
        
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", i * intersection_size);
        rect.setAttribute("y", j * intersection_size);
        rect.setAttribute("width", intersection_size);
        rect.setAttribute("height", intersection_size);
        rect.setAttribute("fill", color);
        rect.setAttribute("shape-rendering", "crispEdges"); 
        
        fragment.appendChild(rect);
      }
    }
  }
  
  svg.appendChild(fragment);
}

function addTopThread(fragment, cellX, cellY, cellSize, orientation, color, borderColor, thickness, borderSize) {
  const isWarp = orientation === 'warp';
  const outer = thickness + 2 * borderSize;
  const outerWidth = isWarp ? outer : cellSize;
  const outerHeight = isWarp ? cellSize : outer;
  const outerX = isWarp ? cellX + (cellSize - outer) / 2 : cellX;
  const outerY = isWarp ? cellY : cellY + (cellSize - outer) / 2;

  if (borderSize > 0) {
    const borderRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    borderRect.setAttribute("x", outerX);
    borderRect.setAttribute("y", outerY);
    borderRect.setAttribute("width", outerWidth);
    borderRect.setAttribute("height", outerHeight);
    borderRect.setAttribute("fill", borderColor);
    borderRect.setAttribute("shape-rendering", "crispEdges");
    fragment.appendChild(borderRect);
  }

  const innerWidth = isWarp ? thickness : cellSize;
  const innerHeight = isWarp ? cellSize : thickness;
  const innerX = isWarp ? cellX + (cellSize - thickness) / 2 : cellX;
  const innerY = isWarp ? cellY : cellY + (cellSize - thickness) / 2;
  const innerRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  innerRect.setAttribute("x", innerX);
  innerRect.setAttribute("y", innerY);
  innerRect.setAttribute("width", innerWidth);
  innerRect.setAttribute("height", innerHeight);
  innerRect.setAttribute("fill", color);
  innerRect.setAttribute("shape-rendering", "crispEdges");
  fragment.appendChild(innerRect);
}

function addUnderSegments(fragment, cellX, cellY, cellSize, orientation, color, borderColor, thickness, borderSize, cutSize, topOuter) {
  const isWarp = orientation === 'warp';
  const gap = Math.max(0, Math.min(cellSize, topOuter + 2 * cutSize));
  const segSize = Math.max(0, (cellSize - gap) / 2);
  if (segSize <= 0) return;

  if (isWarp) {
    // vertical: split in Y
    const outerWidth = thickness + 2 * borderSize;
    const centerX = cellX + (cellSize - outerWidth) / 2;
    const segments = [
      { y: cellY, height: segSize },
      { y: cellY + segSize + gap, height: segSize }
    ];
    for (const seg of segments) {
      if (borderSize > 0) {
        // left/right strips only
        const left = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        left.setAttribute("x", centerX);
        left.setAttribute("y", seg.y);
        left.setAttribute("width", borderSize);
        left.setAttribute("height", seg.height);
        left.setAttribute("fill", borderColor);
        left.setAttribute("shape-rendering", "crispEdges");
        fragment.appendChild(left);

        const right = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        right.setAttribute("x", centerX + borderSize + thickness);
        right.setAttribute("y", seg.y);
        right.setAttribute("width", borderSize);
        right.setAttribute("height", seg.height);
        right.setAttribute("fill", borderColor);
        right.setAttribute("shape-rendering", "crispEdges");
        fragment.appendChild(right);
      }
      const innerRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      innerRect.setAttribute("x", centerX + borderSize);
      innerRect.setAttribute("y", seg.y);
      innerRect.setAttribute("width", thickness);
      innerRect.setAttribute("height", seg.height);
      innerRect.setAttribute("fill", color);
      innerRect.setAttribute("shape-rendering", "crispEdges");
      fragment.appendChild(innerRect);
    }
  } else {
    // horizontal: split in X
    const outerHeight = thickness + 2 * borderSize;
    const centerY = cellY + (cellSize - outerHeight) / 2;
    const segments = [
      { x: cellX, width: segSize },
      { x: cellX + segSize + gap, width: segSize }
    ];
    for (const seg of segments) {
      if (borderSize > 0) {
        // top/bottom strips only
        const top = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        top.setAttribute("x", seg.x);
        top.setAttribute("y", centerY);
        top.setAttribute("width", seg.width);
        top.setAttribute("height", borderSize);
        top.setAttribute("fill", borderColor);
        top.setAttribute("shape-rendering", "crispEdges");
        fragment.appendChild(top);

        const bottom = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bottom.setAttribute("x", seg.x);
        bottom.setAttribute("y", centerY + borderSize + thickness);
        bottom.setAttribute("width", seg.width);
        bottom.setAttribute("height", borderSize);
        bottom.setAttribute("fill", borderColor);
        bottom.setAttribute("shape-rendering", "crispEdges");
        fragment.appendChild(bottom);
      }
      const innerRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      innerRect.setAttribute("x", seg.x);
      innerRect.setAttribute("y", centerY + borderSize);
      innerRect.setAttribute("width", seg.width);
      innerRect.setAttribute("height", thickness);
      innerRect.setAttribute("fill", color);
      innerRect.setAttribute("shape-rendering", "crispEdges");
      fragment.appendChild(innerRect);
    }
  }
}
