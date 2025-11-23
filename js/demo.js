import { renderWeave } from './weave.js';
import chroma from 'https://esm.sh/chroma-js';

const canvasContainer = document.getElementById('canvas-container');
const exampleSelect = document.getElementById('example-select');

const backendSelect = document.getElementById('backend-select');
const displayModeSelect = document.getElementById('display-mode');
const benchmarkBtn = document.getElementById('benchmark-btn');
const benchmarkResults = document.getElementById('benchmark-results');
const valueLabels = {
    cellSize: document.getElementById('cell-size-val'),
    threadThickness: document.getElementById('thread-thickness-val'),
    borderSize: document.getElementById('border-size-val'),
    cutSize: document.getElementById('cut-size-val'),
    rangeLimit: document.getElementById('range-limit-val'),
};

const inputs = {
    width: document.getElementById('width'),
    height: document.getElementById('height'),
    cellSize: document.getElementById('cell-size'),
    threadThickness: document.getElementById('thread-thickness'),
    borderSize: document.getElementById('border-size'),
    cutSize: document.getElementById('cut-size'),
    zoomBg: document.getElementById('zoom-bg'),
    zoomBorder: document.getElementById('zoom-border-color'),
    threading: document.getElementById('threading-func'),
    warpColors: document.getElementById('warp-colors-func'),
    weftColors: document.getElementById('weft-colors-func'),
    rangeLimit: document.getElementById('range-limit')
};

const examples = {
    plain: {
        threading: "(i, j) => (i + j) % 2 === 0",
        warpColors: "(i) => 'black'",
        weftColors: "(j) => 'red'",
        intersection: 10
    },
    twill: {
        threading: "(i, j) => (i + j) % 4 < 2",
        warpColors: "(i) => 'navy'",
        weftColors: "(j) => 'gold'",
        intersection: 4
    },
    satin: {
        threading: "(i, j) => (j * 2 + i) % 5 === 0", // 5-harness satin
        warpColors: "(i) => 'crimson'",
        weftColors: "(j) => 'pink'",
        intersection: 8
    },
    plaid: {
        threading: "(i, j) => (i + j) % 4 < 2", // Twill base
        warpColors: "(i) => {\n  const p = i % 60;\n  if (p < 10) return 'red';\n  if (p < 12) return 'yellow';\n  if (p < 22) return 'green';\n  if (p < 24) return 'yellow';\n  if (p < 34) return 'red';\n  if (p < 60) return 'black';\n  return 'black';\n}",
        weftColors: "(j) => {\n  const p = j % 60;\n  if (p < 10) return 'red';\n  if (p < 12) return 'yellow';\n  if (p < 22) return 'green';\n  if (p < 24) return 'yellow';\n  if (p < 34) return 'red';\n  if (p < 60) return 'black';\n  return 'black';\n}",
        intersection: 2
    },
    gradient: {
        threading: "(i, j) => (i * j) % 7 < 3",
        warpColors: "(i) => chroma.scale(['ffa500','004dff']).mode('lch')(i / 100).hex()",
        weftColors: "(j) => chroma.scale(['004dff','ffa500']).mode('lch')(j / 100).hex()",
        intersection: 4
    }
};

exampleSelect.addEventListener('change', (e) => {
    const key = e.target.value;
    if (examples[key]) {
        const ex = examples[key];
        inputs.threading.value = ex.threading;
        inputs.warpColors.value = ex.warpColors;
        inputs.weftColors.value = ex.weftColors;
        if (ex.intersection) inputs.cellSize.value = ex.intersection;
        debouncedRender();
    }
});

function setValueLabel(name, val) {
    if (valueLabels[name]) valueLabels[name].textContent = val;
}

function toggleInterlacingControls() {
    const isInterlacing = displayModeSelect.value === 'interlacing';
    document.querySelectorAll('.interlacing-only').forEach(el => {
        el.classList.toggle('disabled', !isInterlacing);
        const input = el.querySelector('input');
        if (input) input.disabled = !isInterlacing;
    });
}

function debounce(fn, delay = 120) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

const debouncedRender = debounce(render, 60);

async function render() {
    try {
        const width = parseInt(inputs.width.value, 10);
        const height = parseInt(inputs.height.value, 10);
        const cellSize = parseInt(inputs.cellSize.value, 10);
        const rangeLimit = parseInt(inputs.rangeLimit.value, 10);
        const backend = backendSelect.value;
        const displayMode = buildDisplayMode(cellSize);

        setValueLabel('cellSize', cellSize);
        setValueLabel('threadThickness', inputs.threadThickness.value);
        setValueLabel('borderSize', inputs.borderSize.value);
        setValueLabel('cutSize', inputs.cutSize.value);
        setValueLabel('rangeLimit', rangeLimit);

        // Evaluate functions
        const threadingFunc = new Function('return ' + inputs.threading.value)();
        const warpColorFunc = new Function('chroma', 'return ' + inputs.warpColors.value)(chroma);
        const weftColorFunc = new Function('chroma', 'return ' + inputs.weftColors.value)(chroma);

        const rows = rangeLimit;
        const cols = rangeLimit;
        const threading = [];
        
        for (let j = 0; j < rows; j++) {
            const row = [];
            for (let i = 0; i < cols; i++) {
                row.push(!!threadingFunc(i, j));
            }
            threading.push(row);
        }

        const warpColors = [];
        for (let i = 0; i < cols; i++) {
            warpColors.push(warpColorFunc(i));
        }

        const weftColors = [];
        for (let j = 0; j < rows; j++) {
            weftColors.push(weftColorFunc(j));
        }

        const definition = {
            threading,
            warp_colors: warpColors,
            weft_colors: weftColors
        };

        const options = {
            width,
            height,
            backend,
            display_mode: displayMode,
            cell_size: displayMode.cellSize,
            zoomLoop: {
                backgroundColor: inputs.zoomBg.value,
                borderColor: inputs.zoomBorder.value
            }
        };

        await renderWeave(canvasContainer, definition, options);

    } catch (err) {
        console.error(err);
        alert("Error rendering: " + err.message);
    }
}

async function runBenchmark() {
    benchmarkResults.innerHTML = "Running benchmark...";
    const iterations = 5;
    const backends = ['canvas', 'webgl', 'webgpu', 'svg'];
    const results = {};

    // Use current settings
    const width = 800; // Force larger size for better measurement
    const height = 800;
    const intersectionSize = 2;
    const rangeLimit = 100;
    const displayMode = { type: 'simple', cellSize: intersectionSize };
    
    // Generate data once
    const threadingFunc = new Function('return ' + inputs.threading.value)();
    const warpColorFunc = new Function('chroma', 'return ' + inputs.warpColors.value)(chroma);
    const weftColorFunc = new Function('chroma', 'return ' + inputs.weftColors.value)(chroma);

    const rows = rangeLimit;
    const cols = rangeLimit;
    const threading = [];
    for (let j = 0; j < rows; j++) {
        const row = [];
        for (let i = 0; i < cols; i++) {
            row.push(!!threadingFunc(i, j));
        }
        threading.push(row);
    }
    const warpColors = [];
    for (let i = 0; i < cols; i++) { warpColors.push(warpColorFunc(i)); }
    const weftColors = [];
    for (let j = 0; j < rows; j++) { weftColors.push(weftColorFunc(j)); }

    const definition = { threading, warp_colors: warpColors, weft_colors: weftColors };
    const options = { width, height, display_mode: displayMode, cell_size: intersectionSize };

    // Create a hidden container for benchmarking to not disturb the UI too much
    const benchContainer = document.createElement('div');
    document.body.appendChild(benchContainer);
    benchContainer.style.position = 'absolute';
    benchContainer.style.top = '-9999px';

    for (const backend of backends) {
        if (backend === 'webgpu' && !navigator.gpu) {
            results[backend] = "N/A";
            continue;
        }

        let totalTime = 0;
        options.backend = backend;

        // Warmup
        try {
            await renderWeave(benchContainer, definition, options);
        } catch (e) {
            results[backend] = "Error";
            continue;
        }

        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            await renderWeave(benchContainer, definition, options);
            const end = performance.now();
            totalTime += (end - start);
        }
        
        results[backend] = (totalTime / iterations).toFixed(2) + "ms";
    }

    document.body.removeChild(benchContainer);

    let html = "<strong>Benchmark Results (800x800, 5 runs):</strong><br>";
    for (const [backend, time] of Object.entries(results)) {
        html += `${backend}: ${time}<br>`;
    }
    benchmarkResults.innerHTML = html;
}

backendSelect.addEventListener('change', debouncedRender);
displayModeSelect.addEventListener('change', () => {
    toggleInterlacingControls();
    debouncedRender();
});
benchmarkBtn.addEventListener('click', runBenchmark);

['width', 'height', 'cellSize', 'threadThickness', 'borderSize', 'cutSize', 'rangeLimit'].forEach(key => {
    inputs[key].addEventListener('input', debouncedRender);
});
['threading', 'warpColors', 'weftColors'].forEach(key => {
    inputs[key].addEventListener('input', debouncedRender);
});
['zoomBg', 'zoomBorder'].forEach(key => {
    inputs[key].addEventListener('input', debouncedRender);
});

function buildDisplayMode(cellSize) {
    const mode = displayModeSelect.value || 'simple';
    if (mode === 'interlacing') {
        return {
            type: 'interlacing',
            cellSize,
            thread_thickness: parseInt(inputs.threadThickness.value, 10),
            border_size: parseInt(inputs.borderSize.value, 10),
            cut_size: parseInt(inputs.cutSize.value, 10)
        };
    }
    return { type: 'simple', cellSize };
}

// Initial render
toggleInterlacingControls();
render();
