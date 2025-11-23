# AGENTS.md — Guide for Agents Working on the JS Weave Renderer

This package contains a browser-oriented rendering library that draws fabric weave patterns with multiple backends (Canvas 2D, SVG, WebGL, WebGPU) plus demos and Vitest browser tests. Use this guide whenever you need to extend the visualizations or debug rendering differences.

---

## Quick Start

1. Install dependencies once: `npm install`.
2. (First test run only) Install a Chromium binary for Playwright: `npx playwright install chromium`.
3. Run the dev server for the vanilla or React demos: `npm run dev` and open `http://localhost:5174/index.html` or `/demo-react.html`.
4. Run the Vitest + Playwright suite: `npm test -- --run` (or `npx vitest run`). The extra `--run` flag disables watch mode so the command exits automatically instead of waiting for you to press `q`.
5. Create production bundles: `npm run build`; preview them with `npm run preview`.

---

## Repository Map

| Path | Purpose |
| --- | --- |
| `weave.js` | Entry point that routes to the right backend renderer and manages `<canvas>/<svg>` lifecycles. |
| `renderers/canvas.js` | Pure Canvas 2D renderer used as the reference implementation. |
| `renderers/svg.js` | SVG renderer that builds a grid of `<rect>` nodes. |
| `renderers/webgl.js` | WebGL pipeline using two textures (threading matrix + color palette) and a single full-screen quad. |
| `renderers/webgpu.js` | WebGPU compute via storage buffers and a fullscreen render pass (requires `navigator.gpu`). |
| `renderers/utils.js` | Shared helpers (currently `colorToRgb`) that normalize CSS color strings into `[0,1]` floats. |
| `demo.js` + `index.html` | Vanilla playground with code editors, backend selector, and a benchmark harness. |
| `demo-react.js`, `demo-react.html`, `WeaveCanvas.jsx` | React examples/wrapper that call the vanilla library inside `useEffect`. |
| `weave.test.js` | Vitest browser suite that rasterizes Canvas/WebGL/SVG output and compares pixel buffers. |
| `vitest.config.js` | Enables the Playwright browser provider for Vitest. |

---

## Core Data Model

- **Definition** (`definition` in `weave.js`):  
  - `threading`: 2D boolean array; `true` means warp thread sits on top.  
  - `warp_colors` & `weft_colors`: arrays of CSS color strings. Colors repeat modulo their lengths as we tile the pattern.
- **Options** (`options` argument everywhere):  
  - `width`, `height`: pixel dimensions of the output.  
  - `display_mode`: `{ type: 'simple', cellSize }` (default) or `{ type: 'interlacing', cellSize, thread_thickness, border_size, cut_size }`.  
  - `backend`: `'canvas' | 'webgl' | 'webgpu' | 'svg'`; defaults to Canvas.
- Renderers must treat the threading matrix as periodic: we map `Math.ceil(width / cellSize)` warp cells and `Math.ceil(height / cellSize)` weft cells back into the definition via modulo.
- Empty or malformed definitions should display the neutral "No data" placeholder implemented in `renderers/canvas.js` and `renderers/svg.js` or clear the GPU targets to white (`renderers/webgl.js` and `renderers/webgpu.js`).

Keep this contract stable—`demo.js`, `WeaveCanvas.jsx`, and the tests all rely on it.

---

## Renderer Expectations

- **Canvas 2D (`renderers/canvas.js`)**  
  - Serves as the simplest ground truth. Always update this first when changing semantics.  
  - Disables image smoothing so each intersection stays crisp.  
  - Draws one filled rect per intersection; loops modulo pattern dimensions.

- **SVG (`renderers/svg.js`)**  
  - Rebuilds the `<svg>` tree on every call (clears container, repopulates).  
  - Uses a `DocumentFragment` for batching and `shape-rendering="crispEdges"` for pixel-art sharpness.

- **WebGL (`renderers/webgl.js`)**  
  - Converts `threading` to an RGBA texture (Uint8).  
  - Builds a second texture for warp/weft palettes (currently packed as two rows).  
  - Shader samples the textures, computes grid coordinates from `gl_FragCoord`, and outputs colors.  
  - Any feature that touches colors must also adjust the `colorToRgb` helper so WebGL/WebGPU stay in sync.

- **WebGPU (`renderers/webgpu.js`)**  
  - Gracefully exits when `navigator.gpu` is absent (tests will still pass).  
  - Uploads threading + palette data via storage buffers and draws a fullscreen quad.  
  - Keep uniform buffer layout consistent with the WGSL struct when adding parameters.

When adding new options or changing how colors/indices are interpreted, ensure **all four** backends stay behaviorally identical. The Vitest suite diffing Canvas/WebGL/SVG output will catch regressions, but WebGPU parity currently requires manual verification via the demo.

---

## React Wrapper & Demos

- `WeaveCanvas.jsx` mirrors the demo logic: it accepts either arrays or generator functions for threading and colors, materializes them inside `useEffect`, and calls `renderWeave`.  
- `demo-react.js` provides a CDN React example without JSX (uses `React.createElement`).  
- `demo.js` powers the vanilla playground. Useful hooks:  
  - `examples` map contains ready-made patterns (plain, twill, satin, plaid, gradient).  
  - `runBenchmark()` renders each backend five times at 800×800 to compare timings.  
  - User inputs are executed via `new Function`, so keep security implications in mind if this ever goes beyond local demos.

Use `npm run dev` and open `index.html` to prototype or reproduce bugs visually. The UI also exposes a backend selector, so you can flip between Canvas/WebGL/WebGPU/SVG quickly.

---

- Command: `npm test -- --run` (or `npx vitest run`). Without `--run`, Vitest starts in watch mode and hangs until you press `q`, which is awkward for automation—always include the flag when running in CI or as an agent.  
- Config: `vitest.config.js` enables Vitest’s browser mode with the Playwright provider (`chromium` instance). No Node-only DOM shims are used; tests run inside real Chromium so WebGL APIs exist.
- Test file: `weave.test.js`. Each case:  
  1. Creates two off-DOM containers, renders the same pattern via different backends, and grabs pixel data.  
  2. `getCanvasPixelData()` handles both 2D and WebGL contexts (with Y-flip).  
  3. `getSVGPixelData()` serializes the SVG, rasterizes it into a `<canvas>`, and resolves pixel data via `Image`.  
  4. `comparePixelData()` allows slight tolerance (default `2`, `5` for SVG) plus ≤1 % mismatches. On failure, the test logs sample pixels for manual diffing.
- Test coverage today:  
  - Plain weave: Canvas vs WebGL at 200×200.  
  - Twill 2/2: Canvas vs WebGL and Canvas vs SVG.
- WebGPU is not part of the automated suite; test manually through the demo, and consider extending Vitest with a flag-guarded WebGPU check once Playwright supports it reliably.

When you change rendering math, **update or add tests**: copy an existing scenario, tweak the backend pair, and adjust tolerances if a new rasterization path needs it.

---

## Development Tips & Conventions

- Modules use ES import/export syntax even though `package.json` sets `"type": "commonjs"`. Vite handles bundling for the demos/tests. Keep new files in ESM form for consistency.
- DOM access is assumed. `renderers/utils.js` relies on a hidden `<canvas>` to parse color strings; avoid calling it in non-browser contexts.
- `renderWeave()` (in `weave.js`) is async to accommodate `renderWebGPU`, so always `await renderWeave(...)` in callers/tests even when the backend is synchronous.
- Keep renderer functions idempotent: they should fully overwrite previous draws without needing external cleanup. `renderWeave()` already handles reusing/replacing `<canvas>` or `<svg>` nodes.
- Any new backend must implement the same empty-state semantics and hook into `renderWeave`’s switch.
- Prefer constants/utility helpers for shared math; duplicating logic across renderers makes parity maintenance harder.
- React wrapper: avoid storing renderer output in React state—`WeaveCanvas` intentionally manipulates the DOM directly for performance. Follow that pattern if you add new React-facing APIs.

---

## Manual QA Checklist

1. **Visual smoke test**: run the dev server, render each example with every backend, and confirm colors/tiling match.  
2. **Benchmark**: (optional) use the UI’s “Run Benchmark” to sanity-check performance after shader changes.  
3. **Regression tests**: run `npm test`; inspect console output if a mismatch occurs (the helper dumps grid samples).  
4. **WebGPU**: if you touch that renderer, verify in a browser that supports `navigator.gpu` (Chrome Canary/Edge with flag).  
5. **React**: if you modify `WeaveCanvas.jsx`, import it into `demo-react.js` or your own sandbox and ensure the effect reruns when props change.

---

## Future Opportunities / TODOs

- `TODO.md` lists open ideas (“make a package”, “make zoom view”, “integrate with lean”, “best backend”). Document decisions in this AGENTS file when you start tackling them so future agents know the expected direction.
- Consider expanding test coverage to WebGPU and more complex threading/color functions once Playwright supports the required APIs.

Use this document as the single source of truth for workflows and invariants—update it whenever you add features so the next agent can ramp up quickly.
