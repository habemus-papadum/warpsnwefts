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
    const mode = opts.display_mode || opts.displayMode || { type: 'simple', cellSize: baseSize };
    if (mode.type === 'interlacing') {
      const cellSize = mode.cellSize ?? baseSize ?? 10;
      return {
        ...mode,
        type: 'interlacing',
        cellSize,
        thread_thickness: mode.thread_thickness ?? 6,
        border_size: mode.border_size ?? 1,
        cut_size: mode.cut_size ?? 1,
      };
    }
    const cellSize = mode.cellSize ?? baseSize ?? 1;
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
      return renderCanvas(canvas, definition, optsWithMode);
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
