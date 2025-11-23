import { renderCanvas } from './renderers/canvas.js';
import { renderSVG } from './renderers/svg.js';
import { renderWebGL } from './renderers/webgl.js';
import { renderWebGPU } from './renderers/webgpu.js';
import { resolvePalette } from './renderers/utils.js';

/**
 * Renders a weave pattern into a container element.
 * 
 * @param {HTMLElement} element - The DOM element to append the canvas to.
 * @param {Object} definition - The weave definition.
 * @param {boolean[][]} definition.threading - Matrix where true = warp on top, false = weft on top.
 * @param {string[]} definition.warp_colors - Array of colors for warp threads.
 * @param {string[]} definition.weft_colors - Array of colors for weft threads.
 * @param {Object} options - Visualization options.
 * @param {number} options.width - Total width of the image in pixels.
 * @param {number} options.height - Total height of the image in pixels.
 * @param {number} [options.cell_size=1] - Size of each cell/intersection in pixels.
 * @param {string} [options.backend='canvas'] - Rendering backend: 'canvas', 'webgl', 'webgpu', 'svg'.
 */
export async function renderWeave(container, definition, options) {
  const backend = options.backend || 'canvas';

  const normalizeDisplayMode = (opts) => {
    const baseSize = opts.cell_size ?? opts.cellSize ?? (opts.display_mode ? opts.display_mode.cellSize : undefined) ?? 1;
    const rawMode = opts.display_mode || opts.displayMode || { type: 'simple', cellSize: baseSize };
    const modeType = (rawMode.type || 'simple').toLowerCase().trim();
    if (modeType === 'interlacing') {
      const cellSize = rawMode.cellSize ?? baseSize ?? 10;
      return {
        ...rawMode,
        type: 'interlacing',
        cellSize,
        thread_thickness: rawMode.thread_thickness ?? 6,
        border_size: rawMode.border_size ?? 1,
        cut_size: rawMode.cut_size ?? 1,
      };
    }
    const cellSize = rawMode.cellSize ?? baseSize ?? 1;
    return { type: 'simple', cellSize };
  };

  const displayMode = normalizeDisplayMode(options);
  const optsWithMode = {
    ...options,
    display_mode: displayMode,
    displayMode,
    cell_size: displayMode.cellSize,
    cellSize: displayMode.cellSize,
  };
  const zoomState = (() => {
    const existing = container.__zoomState || {};
    const loopOpts = options.zoomLoop || {};
    const state = {
      active: existing.active || false,
      center: existing.center || { x: optsWithMode.width / 2, y: optsWithMode.height / 2 },
      radius: loopOpts.radius ?? existing.radius ?? 200,
      factor: loopOpts.factor ?? existing.factor ?? 4,
      borderSize: loopOpts.borderSize ?? existing.borderSize ?? 10,
      borderColor: loopOpts.borderColor ?? existing.borderColor ?? 'rgba(0,0,0,0.85)',
      backgroundColor: loopOpts.backgroundColor ?? existing.backgroundColor ?? 'rgba(255,255,255,1)',
      scrollFactor: loopOpts.scrollFactor ?? existing.scrollFactor ?? 0.1,
    };
    container.__zoomState = state;
    return state;
  })();
  optsWithMode.zoom_state = zoomState;
  const effectiveBackend = backend;
  if (!container.style.position) {
    container.style.position = 'relative';
  }

  // Helper to handle Canvas lifecycle
  const getCanvas = (contextType) => {
    let canvas = container.querySelector('canvas');
    const currentContext = canvas ? canvas.getAttribute('data-context') : null;

    if (canvas && currentContext !== contextType) {
      canvas.remove();
      canvas = null;
    }

    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('data-context', contextType);
      container.appendChild(canvas);
    }
    return canvas;
  };

  // pick base element and base render function
  let baseElement = null;
  let baseRender = null;
  const renderOverlay = () => {};

  if (effectiveBackend === 'canvas') {
    baseElement = getCanvas('2d');
    baseRender = () => renderCanvas(baseElement, definition, optsWithMode);
  } else if (effectiveBackend === 'webgl') {
    baseElement = getCanvas('webgl');
    baseRender = () => {
      const res = renderWebGL(baseElement, definition, optsWithMode);
      renderZoomOverlay2D(container, baseElement, definition, displayMode, zoomState);
      return res;
    };
  } else if (effectiveBackend === 'webgpu') {
    baseElement = getCanvas('webgpu');
    baseRender = () => {
      const res = renderWebGPU(baseElement, definition, optsWithMode);
      renderZoomOverlay2D(container, baseElement, definition, displayMode, zoomState);
      return res;
    };
  } else if (effectiveBackend === 'svg') {
    const canvas = container.querySelector('canvas');
    if (canvas) canvas.remove();
    renderSVG(container, definition, optsWithMode);
    baseElement = container.querySelector('svg');
    baseRender = () => {
      renderSVG(container, definition, optsWithMode);
      renderZoomOverlay2D(container, baseElement, definition, displayMode, zoomState);
    };
  } else {
    console.warn(`Unknown backend '${backend}', falling back to canvas.`);
    baseElement = getCanvas('2d');
    baseRender = () => renderCanvas(baseElement, definition, optsWithMode);
  }

  const attachHandlers = () => {
    if (!baseElement) return;
    if (container.__zoomHandlers) {
      baseElement.removeEventListener('click', container.__zoomHandlers.onClick);
      baseElement.removeEventListener('mousemove', container.__zoomHandlers.onMove);
      baseElement.removeEventListener('wheel', container.__zoomHandlers.onWheel);
    }

    const onClick = (evt) => {
      const rect = baseElement.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;
      const dx = x - zoomState.center.x;
      const dy = y - zoomState.center.y;
      const inside = Math.sqrt(dx * dx + dy * dy) <= zoomState.radius;
      if (!zoomState.active) {
        zoomState.active = true;
        zoomState.center = { x, y };
      } else if (inside) {
        zoomState.active = false;
      } else {
        zoomState.center = { x, y };
      }
      baseRender();
    };

    const onMove = (evt) => {
      if (!zoomState.active) return;
      const rect = baseElement.getBoundingClientRect();
      zoomState.center = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
      baseRender();
    };

    const onWheel = (evt) => {
      if (!zoomState.active) return;
      evt.preventDefault();
      const useX = evt.shiftKey && Math.abs(evt.deltaX) > Math.abs(evt.deltaY);
      const raw = useX ? evt.deltaX : evt.deltaY;
      const direction = raw > 0 ? 1 : -1;
      if (evt.shiftKey) {
        const delta = zoomState.radius * zoomState.scrollFactor;
        const signedDelta = direction < 0 ? delta : -delta;
        const before = zoomState.radius;
        zoomState.radius = Math.max(10, zoomState.radius + signedDelta);
        console.log('[zoomLoop] radius change', { deltaY: evt.deltaY, deltaX: evt.deltaX, useX, direction, scrollFactor: zoomState.scrollFactor, delta, signedDelta, before, after: zoomState.radius });
      } else {
        const before = zoomState.factor;
        zoomState.factor = Math.max(0.5, zoomState.factor * (1 + direction * zoomState.scrollFactor));
        console.log('[zoomLoop] factor change', { deltaY: evt.deltaY, deltaX: evt.deltaX, useX, direction, scrollFactor: zoomState.scrollFactor, before, after: zoomState.factor });
      }
      baseRender();
    };

    baseElement.addEventListener('click', onClick);
    baseElement.addEventListener('mousemove', onMove);
    baseElement.addEventListener('wheel', onWheel, { passive: false });
    container.__zoomHandlers = { onClick, onMove, onWheel };
  };

  attachHandlers();
  return baseRender();
}

// Helpers for non-canvas zoom overlay using a 2D overlay canvas
function renderZoomOverlay2D(container, baseElement, definition, displayMode, zoomState) {
  if (!zoomState.active) return;
  const rect = baseElement.getBoundingClientRect();
  const width = rect.width || baseElement.clientWidth;
  const height = rect.height || baseElement.clientHeight;
  if (!width || !height) return;

  let overlay = container.querySelector('canvas[data-context="zoom-overlay"]');
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.setAttribute('data-context', 'zoom-overlay');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.pointerEvents = 'none';
    container.appendChild(overlay);
  }
  overlay.width = width;
  overlay.height = height;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, width, height);

const warpPalette = resolvePalette(definition.warp_colors);
const weftPalette = resolvePalette(definition.weft_colors);

  ctx.save();
  ctx.beginPath();
  ctx.arc(zoomState.center.x, zoomState.center.y, zoomState.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = zoomState.backgroundColor || 'rgba(255,255,255,1)';
  ctx.fillRect(zoomState.center.x - zoomState.radius, zoomState.center.y - zoomState.radius, zoomState.radius * 2, zoomState.radius * 2);

  const scaledCell = Math.max(1, Math.round(displayMode.cellSize * zoomState.factor));
  const scaledMode = displayMode.type === 'interlacing'
    ? {
        ...displayMode,
        cellSize: scaledCell,
        thread_thickness: Math.max(1, Math.round((displayMode.thread_thickness ?? 6) * zoomState.factor)),
        border_size: Math.max(0, Math.round((displayMode.border_size ?? 1) * zoomState.factor)),
        cut_size: Math.max(0, Math.round((displayMode.cut_size ?? 1) * zoomState.factor)),
      }
    : { ...displayMode, cellSize: scaledCell };

  const startWarp = Math.floor((zoomState.center.x - zoomState.radius) / displayMode.cellSize);
  const startWeft = Math.floor((zoomState.center.y - zoomState.radius) / displayMode.cellSize);

  ctx.translate(zoomState.center.x - zoomState.radius, zoomState.center.y - zoomState.radius);
  drawPattern2D(ctx, {
    width: zoomState.radius * 2,
    height: zoomState.radius * 2,
    threading: definition.threading,
    warpPalette,
    weftPalette,
    intersectionSize: scaledCell,
    displayMode: scaledMode,
    offsetWarp: startWarp,
    offsetWeft: startWeft,
  });
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(zoomState.center.x, zoomState.center.y, zoomState.radius, 0, Math.PI * 2);
  ctx.lineWidth = zoomState.borderSize;
  ctx.strokeStyle = zoomState.borderColor;
  ctx.stroke();
  ctx.restore();
}

function drawPattern2D(ctx, params) {
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
    renderInterlacing2D({
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
      const threadY = wrapIndexLocal(j + offsetWeft, threadingHeight);
      const threadX = wrapIndexLocal(i + offsetWarp, threadingWidth);
      const isWarpOnTop = threading[threadY][threadX];
      const color = isWarpOnTop
        ? warpPalette[wrapIndexLocal(i + offsetWarp, warpPalette.length)].css
        : weftPalette[wrapIndexLocal(j + offsetWeft, weftPalette.length)].css;
      ctx.fillStyle = color;
      ctx.fillRect(i * intersectionSize, j * intersectionSize, intersectionSize, intersectionSize);
    }
  }
}

function renderInterlacing2D({ ctx, width, height, threading, warpPalette, weftPalette, intersectionSize, threadThickness, borderSize, cutSize, offsetWarp, offsetWeft }) {
  const threadingHeight = threading.length;
  const threadingWidth = threading[0].length;
  const numWarps = Math.ceil(width / intersectionSize);
  const numWefts = Math.ceil(height / intersectionSize);
  const borderColor = '#111';

  for (let j = 0; j < numWefts; j++) {
    for (let i = 0; i < numWarps; i++) {
      const cellX = i * intersectionSize;
      const cellY = j * intersectionSize;

      const threadY = wrapIndexLocal(j + offsetWeft, threadingHeight);
      const threadX = wrapIndexLocal(i + offsetWarp, threadingWidth);
      const isWarpOnTop = threading[threadY][threadX];

      const warpColor = warpPalette[wrapIndexLocal(i + offsetWarp, warpPalette.length)].css;
      const weftColor = weftPalette[wrapIndexLocal(j + offsetWeft, weftPalette.length)].css;
      const topOuter = threadThickness + borderSize * 2;

      if (isWarpOnTop) {
        drawThread2D(ctx, cellX, cellY, intersectionSize, 'weft', weftColor, borderColor, threadThickness, borderSize, cutSize, false, topOuter);
        drawThread2D(ctx, cellX, cellY, intersectionSize, 'warp', warpColor, borderColor, threadThickness, borderSize, 0, true, 0);
      } else {
        drawThread2D(ctx, cellX, cellY, intersectionSize, 'warp', warpColor, borderColor, threadThickness, borderSize, cutSize, false, topOuter);
        drawThread2D(ctx, cellX, cellY, intersectionSize, 'weft', weftColor, borderColor, threadThickness, borderSize, 0, true, 0);
      }
    }
  }
}

function drawThread2D(ctx, cellX, cellY, cellSize, orientation, color, borderColor, threadThickness, borderSize, cutSize, isTop, topOuterSize) {
  const isWarp = orientation === 'warp';
  const topSpan = topOuterSize ?? 0;
  const gap = isTop ? 0 : Math.max(0, Math.min(cellSize, topSpan + 2 * cutSize));

  const drawSegment = (xStart, yStart, segWidth, segHeight) => {
    if (segWidth <= 0 || segHeight <= 0) return;
    if (borderSize > 0) {
      ctx.fillStyle = borderColor;
      if (isWarp) {
        ctx.fillRect(xStart, yStart, borderSize, segHeight);
        ctx.fillRect(xStart + borderSize + threadThickness, yStart, borderSize, segHeight);
      } else {
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
    if (isWarp) {
      drawSegment(cellX + (cellSize - (threadThickness + 2 * borderSize)) / 2, cellY, threadThickness + 2 * borderSize, cellSize);
    } else {
      drawSegment(cellX, cellY + (cellSize - (threadThickness + 2 * borderSize)) / 2, cellSize, threadThickness + 2 * borderSize);
    }
    return;
  }

  if (isWarp) {
    const segHeight = Math.max(0, (cellSize - gap) / 2);
    const xStart = cellX + (cellSize - (threadThickness + 2 * borderSize)) / 2;
    drawSegment(xStart, cellY, threadThickness + 2 * borderSize, segHeight);
    drawSegment(xStart, cellY + segHeight + gap, threadThickness + 2 * borderSize, segHeight);
  } else {
    const segWidth = Math.max(0, (cellSize - gap) / 2);
    const yStart = cellY + (cellSize - (threadThickness + 2 * borderSize)) / 2;
    drawSegment(cellX, yStart, segWidth, threadThickness + 2 * borderSize);
    drawSegment(cellX + segWidth + gap, yStart, segWidth, threadThickness + 2 * borderSize);
  }
}

function wrapIndexLocal(n, mod) {
  return ((n % mod) + mod) % mod;
}
