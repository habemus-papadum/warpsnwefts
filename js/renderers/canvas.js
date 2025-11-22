
export function renderCanvas(element, definition, options) {
  const { threading, warp_colors, weft_colors } = definition;
  const { width, height, intersection_size = 1 } = options;

  let canvas;
  if (element.tagName === 'CANVAS') {
    canvas = element;
  } else {
    canvas = element.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      element.appendChild(canvas);
    }
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  // Validate inputs / Empty State
  if (!threading || !threading.length || !threading[0].length) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#555555';
    ctx.font = '14px sans-serif';
    ctx.fillText('No data', 12, 24);
    return;
  }

  const threadingHeight = threading.length;
  const threadingWidth = threading[0].length;
  
  const numWarps = Math.ceil(width / intersection_size);
  const numWefts = Math.ceil(height / intersection_size);

  for (let j = 0; j < numWefts; j++) {
    for (let i = 0; i < numWarps; i++) {
      // Map visual coordinate to threading coordinate
      const threadY = j % threadingHeight;
      const threadX = i % threadingWidth;
      
      const isWarpOnTop = threading[threadY][threadX];
      
      let color;
      if (isWarpOnTop) {
        // Warp color
        const colorIndex = i % warp_colors.length;
        color = warp_colors[colorIndex];
      } else {
        // Weft color
        const colorIndex = j % weft_colors.length;
        color = weft_colors[colorIndex];
      }
      
      ctx.fillStyle = color;
      ctx.fillRect(
        i * intersection_size, 
        j * intersection_size, 
        intersection_size, 
        intersection_size
      );
    }
  }
}
