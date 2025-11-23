# Zoom Loop Bug (Interlacing Fallback) - Handoff Notes

## What We Implemented
- **Zoom loop (canvas backend)**:
  - Activate: click the canvas. If inactive, zoom turns on at the click point; if active and you click inside the loop, zoom turns off; click outside moves the loop center.
  - Move: when active, the loop follows mousemove.
  - Scroll: normal scroll changes zoom factor (up = grow, down = shrink). Shift + scroll changes radius (up/left = grow, down/right = shrink). We use `deltaX` when Shift is held (trackpad horizontal deltas), otherwise `deltaY`.
  - Rendering: draw base pattern, clip a circle at zoom center, fill with `zoomLoop.backgroundColor` (default white), render scaled weave inside (scaled `cellSize`, and scaled interlacing thickness/border/cut when applicable) with offsets for alignment, then stroke the circular border.
- **Options/Naming**:
  - `display_mode`/`displayMode`: `{ type: 'simple' | 'interlacing', cellSize, thread_thickness, border_size, cut_size }`.
  - `cell_size`/`cellSize` (replaces `intersection_size`).
  - `zoomLoop`: `{ radius, factor, borderSize, borderColor, backgroundColor, scrollFactor }`.
- **UI (index.html + demo.js)**: sliders auto-render; interlacing sliders remain visible but disable in simple mode; backend selector covers canvas/webgl/webgpu/svg. Zoom loop uses canvas backend; other backends still render base view.

## Current Bug to Debug
- Starting in **interlacing** mode, clicking to activate zoom sometimes makes the zoomed region render in **simple** style immediately (even before moving the mouse). UI still shows interlacing; base view is correct.

## Where to Look
- `weave.js` (`renderWeave`): display_mode normalization; zoom state (`zoomLoop`); canvas event handlers.
- `renderers/canvas.js`: `renderCanvas`/`drawPattern` zoom branch—ensure `displayMode.type` remains `'interlacing'` in the zoom overlay; check `scaledMode` and offsets (`offsetWarp`, `offsetWeft`).
- Confirm no fallback to simple when zoom is active.

## Repro/Demo
- `npm run dev`, open `http://localhost:5174/index.html`.
- Set Display Mode: Interlacing (e.g., cell size 10, thickness 6, border 1, cut 1).
- Click canvas to activate zoom: observe zoom area; move mouse to see if it flips to simple.

## Tests
- `npm test -- --run` covers canvas/webgl/svg parity and interlacing sampling but **does not include the zoom overlay**. WebGPU not in automated suite.
- For zoom debugging, add a Playwright step to activate zoom in interlacing mode and screenshot the zoom area; compare to expected interlacing pixels.

## Suggested Next Steps
1. Instrument `renderers/canvas.js` zoom branch to log `displayMode.type` and `scaledMode.type` when zoom is active.
2. Verify offsets passed to `drawPattern` in zoom path don’t clobber `displayMode` or force simple.
3. Add a minimal Playwright script/test that activates zoom in interlacing mode, captures the zoom circle, and compares to the base interlacing pattern.

## Fix Implemented
- **Issue**: Stale closure in event handlers. The `onClick`, `onMove`, and `onWheel` handlers were only attached once and closed over the initial `doRender` and `zoomState`. When `renderWeave` was called with new options (e.g., changing display mode), the handlers continued to use the old render function and state.
- **Fix**: Modified `weave.js` to remove existing event listeners and re-attach them with fresh closures on every call to `renderWeave`.
- **Verification**:
  - Created a reproduction script (`reproduce_bug.mjs`) that simulated the user flow (switch to interlacing -> click to zoom) and captured console logs.
  - Confirmed that before the fix, the zoom render used `simple` mode.
  - Confirmed that after the fix, the zoom render correctly used `interlacing` mode.
  - Verified that existing tests pass with `npm test`.
