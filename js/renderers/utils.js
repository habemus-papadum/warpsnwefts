import chroma from 'chroma-js';

/**
 * Resolve any color input into normalized RGBA (0-1 floats) and a CSS rgba string.
 */
export function resolveColor(color) {
  const c = chroma(color);
  const [r, g, b, a] = c.rgba(); // r,g,b in 0-255, a in 0-1
  const norm = [r / 255, g / 255, b / 255, a];
  const css = `rgba(${r}, ${g}, ${b}, ${a})`;
  return { norm, css };
}

export function resolvePalette(colors) {
  return colors.map(resolveColor);
}
