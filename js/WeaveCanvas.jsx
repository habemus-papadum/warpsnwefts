import * as React from 'react';
import { renderWeave } from './weave.js';

const e = React.createElement;

/**
 * React component wrapper for the weave visualization library.
 * 
 * @param {Object} props
 * @param {Function|Array<Array<boolean>>} props.threading - Threading pattern as function or 2D array
 * @param {Function|Array<string>} props.warpColors - Warp colors as function or array
 * @param {Function|Array<string>} props.weftColors - Weft colors as function or array
 * @param {number} props.width - Canvas width in pixels
 * @param {number} props.height - Canvas height in pixels
 * @param {number} [props.intersectionSize=1] - Size of each intersection in pixels
 * @param {string} [props.backend='canvas'] - Rendering backend: 'canvas', 'webgl', 'webgpu', 'svg'
 * @param {string} [props.className] - CSS class for the container
 * @param {number} [props.rangeLimit=100] - Number of threads to generate for function-based colors
 */
function WeaveCanvas(props) {
  const {
    threading,
    warpColors,
    weftColors,
    width,
    height,
    intersectionSize = 1,
    backend = 'canvas',
    className,
    rangeLimit = 100
  } = props;

  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Prepare threading data
    let threadingData;
    if (typeof threading === 'function') {
      // Generate threading from function
      const rows = Math.ceil(height / intersectionSize);
      const cols = Math.ceil(width / intersectionSize);
      threadingData = Array(rows).fill(0).map((_, j) =>
        Array(cols).fill(0).map((_, i) => threading(i, j))
      );
    } else if (Array.isArray(threading)) {
      threadingData = threading;
    } else {
      console.error('threading must be a function or 2D array');
      return;
    }

    // Prepare warp colors
    let warpColorsData;
    if (typeof warpColors === 'function') {
      warpColorsData = Array(rangeLimit).fill(0).map((_, i) => warpColors(i));
    } else if (Array.isArray(warpColors)) {
      warpColorsData = warpColors;
    } else {
      console.error('warpColors must be a function or array');
      return;
    }

    // Prepare weft colors
    let weftColorsData;
    if (typeof weftColors === 'function') {
      weftColorsData = Array(rangeLimit).fill(0).map((_, j) => weftColors(j));
    } else if (Array.isArray(weftColors)) {
      weftColorsData = weftColors;
    } else {
      console.error('weftColors must be a function or array');
      return;
    }

    const definition = {
      threading: threadingData,
      warp_colors: warpColorsData,
      weft_colors: weftColorsData
    };

    const options = {
      width,
      height,
      intersection_size: intersectionSize,
      backend
    };

    // Render the weave
    renderWeave(container, definition, options);
  }, [threading, warpColors, weftColors, width, height, intersectionSize, backend, rangeLimit]);

  return e('div', { ref: containerRef, className });
}

export default WeaveCanvas;
