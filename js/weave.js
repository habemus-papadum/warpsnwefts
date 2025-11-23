import { renderCanvas } from './renderers/canvas.js';
import { renderSVG } from './renderers/svg.js';
import { renderWebGL } from './renderers/webgl.js';
import { renderWebGPU } from './renderers/webgpu.js';

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

  // Helper to handle Canvas lifecycle
  const getCanvas = (contextType) => {
    // Remove SVG if present
    const svg = container.querySelector('svg');
    if (svg) svg.remove();

    let canvas = container.querySelector('canvas');
    const currentContext = canvas ? canvas.getAttribute('data-context') : null;

    // If canvas exists but has wrong context, replace it
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

  switch (effectiveBackend) {
    case 'canvas': {
      const canvas = getCanvas('2d');
      const doRender = () => renderCanvas(canvas, definition, optsWithMode);

      // Remove existing handlers if they exist (to ensure we use fresh closures)
      if (container.__zoomHandlers) {
        canvas.removeEventListener('click', container.__zoomHandlers.onClick);
        canvas.removeEventListener('mousemove', container.__zoomHandlers.onMove);
        canvas.removeEventListener('wheel', container.__zoomHandlers.onWheel);
      }

      const onClick = (evt) => {
        const rect = canvas.getBoundingClientRect();
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
        doRender();
      };
      const onMove = (evt) => {
        if (!zoomState.active) return;
        const rect = canvas.getBoundingClientRect();
        zoomState.center = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
        doRender();
      };
      const onWheel = (evt) => {
        if (!zoomState.active) return;
        evt.preventDefault();
        // Some devices (especially with Shift) report horizontal scroll in deltaX.
        const useX = evt.shiftKey && Math.abs(evt.deltaX) > Math.abs(evt.deltaY);
        const raw = useX ? evt.deltaX : evt.deltaY;
        const direction = raw > 0 ? 1 : -1; // positive usually means scroll down/right
        if (evt.shiftKey) {
          // Grow radius when scrolling up (deltaY<0), shrink when scrolling down
          const delta = zoomState.radius * zoomState.scrollFactor;
          const signedDelta = direction < 0 ? delta : -delta;
          const before = zoomState.radius;
          zoomState.radius = Math.max(10, zoomState.radius + signedDelta);
          console.log(
            '[zoomLoop] radius change',
            { deltaY: evt.deltaY, deltaX: evt.deltaX, useX, direction, scrollFactor: zoomState.scrollFactor, delta, signedDelta, before, after: zoomState.radius }
          );
        } else {
          const before = zoomState.factor;
          zoomState.factor = Math.max(0.5, zoomState.factor * (1 + direction * zoomState.scrollFactor));
          console.log(
            '[zoomLoop] factor change',
            { deltaY: evt.deltaY, deltaX: evt.deltaX, useX, direction, scrollFactor: zoomState.scrollFactor, before, after: zoomState.factor }
          );
        }
        doRender();
      };

      canvas.addEventListener('click', onClick);
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      
      container.__zoomHandlers = { onClick, onMove, onWheel };

      return doRender();
    }
    case 'webgl': {
      const canvas = getCanvas('webgl');
      return renderWebGL(canvas, definition, optsWithMode);
    }
    case 'webgpu': {
      const canvas = getCanvas('webgpu');
      return renderWebGPU(canvas, definition, optsWithMode);
    }
    case 'svg': {
      // Remove Canvas if present
      const canvas = container.querySelector('canvas');
      if (canvas) canvas.remove();
      return renderSVG(container, definition, optsWithMode);
    }
    default:
      console.warn(`Unknown backend '${backend}', falling back to canvas.`);
      const canvas = getCanvas('2d');
      return renderCanvas(canvas, definition, optsWithMode);
  }
}
