# Weave Visualization Library

A JavaScript library for rendering weave patterns using multiple backends: Canvas 2D, SVG, WebGL, and WebGPU.

## Installation

```bash
npm install
```

## Running the Demo

```bash
npm run dev
```

Then open:
- **Vanilla Demo**: http://localhost:5174/index.html
- **React Demo**: http://localhost:5174/demo-react.html

## Running Tests

The test suite uses Vitest with Playwright to test rendering consistency across all backends.

### First Time Setup

Install Playwright browsers:

```bash
npx playwright install chromium
```

### Run Tests

```bash
npm test
```

This will:
1. Launch Chromium in headless mode
2. Render test patterns with each backend (Canvas, SVG, WebGL, WebGPU)
3. Compare pixel data to ensure all backends produce identical output
4. Report any discrepancies

## Project Structure

- `weave.js` - Core module that dispatches to backend renderers
- `renderers/` - Individual rendering implementations
  - `canvas.js` - Canvas 2D renderer
  - `svg.js` - SVG renderer
  - `webgl.js` - WebGL renderer (GPU-accelerated)
  - `webgpu.js` - WebGPU renderer (GPU-accelerated)
  - `utils.js` - Shared utilities (color parsing)
- `demo.js` - Vanilla JavaScript demo
- `demo-react.js` - React demo using `React.createElement`
- `WeaveCanvas.jsx` - React component wrapper (reference)
- `weave.test.js` - Vitest test suite

## Usage

### Vanilla JavaScript

```javascript
import { renderWeave } from './weave.js';

const definition = {
  threading: [
    [true, false],
    [false, true],
  ],
  warp_colors: ['black'],
  weft_colors: ['red'],
};

const options = {
  width: 400,
  height: 400,
  display_mode: { type: 'simple', cellSize: 10 },
  backend: 'webgl', // 'canvas', 'svg', 'webgl', or 'webgpu'
};

const container = document.getElementById('container');
await renderWeave(container, definition, options);
```

### React

```javascript
import WeaveCanvas from './WeaveCanvas.jsx';

function App() {
  return React.createElement(WeaveCanvas, {
    threading: (i, j) => (i + j) % 2 === 0,
    warpColors: (i) => 'black',
    weftColors: (j) => 'red',
    width: 400,
    height: 400,
    intersectionSize: 10,
    backend: 'webgl',
  });
}
```

## Development

- Run dev server: `npm run dev`
- Run tests: `npm test`
- Build: `npm run build`
