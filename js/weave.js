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
 * @param {number} [options.intersection_size=1] - Size of each thread intersection in pixels.
 * @param {string} [options.backend='canvas'] - Rendering backend: 'canvas', 'webgl', 'webgpu', 'svg'.
 */
export async function renderWeave(container, definition, options) {
  const backend = options.backend || 'canvas';

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

  switch (backend) {
    case 'canvas': {
      const canvas = getCanvas('2d');
      return renderCanvas(canvas, definition, options);
    }
    case 'webgl': {
      const canvas = getCanvas('webgl');
      return renderWebGL(canvas, definition, options);
    }
    case 'webgpu': {
      const canvas = getCanvas('webgpu');
      return renderWebGPU(canvas, definition, options);
    }
    case 'svg': {
      // Remove Canvas if present
      const canvas = container.querySelector('canvas');
      if (canvas) canvas.remove();
      return renderSVG(container, definition, options);
    }
    default:
      console.warn(`Unknown backend '${backend}', falling back to canvas.`);
      const canvas = getCanvas('2d');
      return renderCanvas(canvas, definition, options);
  }
}
