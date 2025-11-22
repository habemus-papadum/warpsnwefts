
export function renderSVG(element, definition, options) {
  const { threading, warp_colors, weft_colors } = definition;
  const { width, height, intersection_size = 1 } = options;

  // Clear container
  element.innerHTML = '';

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  element.appendChild(svg);

  // Validate inputs / Empty State
  if (!threading || !threading.length || !threading[0].length) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", width);
    rect.setAttribute("height", height);
    rect.setAttribute("fill", "#ffffff");
    svg.appendChild(rect);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", 12);
    text.setAttribute("y", 24);
    text.setAttribute("fill", "#555555");
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("font-size", "14");
    text.textContent = "No data";
    svg.appendChild(text);
    return;
  }

  const threadingHeight = threading.length;
  const threadingWidth = threading[0].length;
  
  const numWarps = Math.ceil(width / intersection_size);
  const numWefts = Math.ceil(height / intersection_size);

  // Create a fragment to minimize DOM reflows
  const fragment = document.createDocumentFragment();

  for (let j = 0; j < numWefts; j++) {
    for (let i = 0; i < numWarps; i++) {
      const threadY = j % threadingHeight;
      const threadX = i % threadingWidth;
      
      const isWarpOnTop = threading[threadY][threadX];
      
      let color;
      if (isWarpOnTop) {
        const colorIndex = i % warp_colors.length;
        color = warp_colors[colorIndex];
      } else {
        const colorIndex = j % weft_colors.length;
        color = weft_colors[colorIndex];
      }
      
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", i * intersection_size);
      rect.setAttribute("y", j * intersection_size);
      rect.setAttribute("width", intersection_size);
      rect.setAttribute("height", intersection_size);
      rect.setAttribute("fill", color);
      // Shape-rendering optimizeSpeed helps with performance for pixel-like grids
      rect.setAttribute("shape-rendering", "crispEdges"); 
      
      fragment.appendChild(rect);
    }
  }
  
  svg.appendChild(fragment);
}
