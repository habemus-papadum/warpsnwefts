
const dummyCtx = document.createElement('canvas').getContext('2d');

export function colorToRgb(color) {
  dummyCtx.fillStyle = color;
  const computed = dummyCtx.fillStyle;

  if (computed.startsWith('#')) {
    return hexToRgb(computed);
  }
  if (computed.startsWith('rgb')) {
    return parseRgb(computed);
  }
  // Fallback
  return [0, 0, 0, 1];
}

function hexToRgb(hex) {
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
    1.0
  ] : [0, 0, 0, 1];
}

function parseRgb(rgbStr) {
  // Handles rgb(r, g, b) and rgba(r, g, b, a)
  const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return [
      parseInt(match[1], 10) / 255,
      parseInt(match[2], 10) / 255,
      parseInt(match[3], 10) / 255,
      match[4] !== undefined ? parseFloat(match[4]) : 1.0
    ];
  }
  return [0, 0, 0, 1];
}
