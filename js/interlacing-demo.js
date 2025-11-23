import { renderWeave } from './weave.js';

const container = document.getElementById('preview');
const orderSelect = document.getElementById('thread-order');
const backendSelect = document.getElementById('backend-select');
const cellSizeInput = document.getElementById('cell-size');
const cellSizeVal = document.getElementById('cell-size-val');
const threadThicknessInput = document.getElementById('thread-thickness');
const threadThicknessVal = document.getElementById('thread-thickness-val');
const borderSizeInput = document.getElementById('border-size');
const borderSizeVal = document.getElementById('border-size-val');
const cutSizeInput = document.getElementById('cut-size');
const cutSizeVal = document.getElementById('cut-size-val');

const definition = {
  threading: [[true]], // updated dynamically
  warp_colors: ['#d32f2f'], // vertical
  weft_colors: ['#1976d2'], // horizontal (blue for clarity)
};

async function render() {
  const intersectionSize = parseInt(cellSizeInput.value, 10);
  const threadThickness = parseInt(threadThicknessInput.value, 10);
  const borderSize = parseInt(borderSizeInput.value, 10);
  const cutSize = parseInt(cutSizeInput.value, 10);

  cellSizeVal.textContent = intersectionSize;
  threadThicknessVal.textContent = threadThickness;
  borderSizeVal.textContent = borderSize;
  cutSizeVal.textContent = cutSize;

  const displayMode = {
    type: 'interlacing',
    cellSize: intersectionSize,
    thread_thickness: threadThickness,
    border_size: borderSize,
    cut_size: cutSize,
  };

  const warpOnTop = orderSelect.value === 'warp';
  definition.threading = [[warpOnTop]];

  const options = {
    width: intersectionSize,
    height: intersectionSize,
    backend: backendSelect.value,
    display_mode: displayMode,
    cell_size: intersectionSize,
  };

  await renderWeave(container, definition, options);
}

orderSelect.addEventListener('change', render);
backendSelect.addEventListener('change', render);
cellSizeInput.addEventListener('input', render);
threadThicknessInput.addEventListener('input', render);
borderSizeInput.addEventListener('input', render);
cutSizeInput.addEventListener('input', render);
render();
