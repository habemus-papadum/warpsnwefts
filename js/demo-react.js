import { renderWeave } from './weave.js';

// Get React from global window (loaded from CDN)
const React = window.React;
const ReactDOM = window.ReactDOM;
const e = React.createElement;

/**
 * React component wrapper for the weave visualization library.
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
      cell_size: intersectionSize,
      backend
    };

    renderWeave(container, definition, options);
  }, [threading, warpColors, weftColors, width, height, intersectionSize, backend, rangeLimit]);

  return e('div', { ref: containerRef, className });
}

// Example patterns
const examples = {
  plain: {
    threading: (i, j) => (i + j) % 2 === 0,
    warpColors: (i) => 'black',
    weftColors: (j) => 'red',
    intersectionSize: 10
  },
  twill: {
    threading: (i, j) => ((i + j) % 4) < 2,
    warpColors: (i) => i % 2 === 0 ? 'navy' : 'gold',
    weftColors: (j) => j % 2 === 0 ? 'navy' : 'gold',
    intersectionSize: 8
  },
  plaid: {
    threading: (i, j) => (i + j) % 2 === 0,
    warpColors: (i) => {
      const stripe = Math.floor(i / 5) % 3;
      return ['darkred', 'black', 'darkgreen'][stripe];
    },
    weftColors: (j) => {
      const stripe = Math.floor(j / 5) % 3;
      return ['darkred', 'black', 'darkgreen'][stripe];
    },
    intersectionSize: 6
  }
};

// Main App Component
function App() {
  const [backend, setBackend] = React.useState('canvas');

  // TEMPORARILY HARDCODE TWILL FOR TESTING
  const currentExample = examples.twill;

  return e('div', null,
    // Controls
    e('div', null,
      e('div', { className: 'control-group' },
        e('label', { htmlFor: 'example-select' }, 'Example Pattern'),
        e('select', {
          id: 'example-select',
          onChange: (ev) => setExample(ev.target.value),
          value: example
        },
          e('option', { value: 'plain' }, 'Plain Weave'),
          e('option', { value: 'twill' }, 'Twill 2/2'),
          e('option', { value: 'plaid' }, 'Classic Plaid')
        )
      ),
      e('div', { className: 'control-group' },
        e('label', { htmlFor: 'backend-select' }, 'Rendering Backend'),
        e('select', {
          id: 'backend-select',
          onChange: (ev) => setBackend(ev.target.value),
          value: backend
        },
          e('option', { value: 'canvas' }, 'Canvas 2D'),
          e('option', { value: 'webgl' }, 'WebGL'),
          e('option', { value: 'webgpu' }, 'WebGPU'),
          e('option', { value: 'svg' }, 'SVG')
        )
      ),
      e('div', { style: { marginTop: '20px', fontSize: '0.9rem' } },
        e('strong', null, 'How it works:'),
        e('ul', { style: { paddingLeft: '20px', marginTop: '10px' } },
          e('li', null, 'WeaveCanvas is a React component'),
          e('li', null, 'It wraps the vanilla JS weave library'),
          e('li', null, 'No JSX - uses React.createElement'),
          e('li', null, 'Accepts functions or arrays for patterns')
        )
      )
    ),
    // Weave Canvas
    e('div', { style: { marginTop: '20px' } },
      e(WeaveCanvas, {
        threading: currentExample.threading,
        warpColors: currentExample.warpColors,
        weftColors: currentExample.weftColors,
        width: 400,
        height: 400,
        intersectionSize: currentExample.intersectionSize,
        backend,
        rangeLimit: 100
      })
    )
  );
}

// Mount the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(App));
