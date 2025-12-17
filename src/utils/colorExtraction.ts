/**
 * Edge-compatible color extraction from SVG images
 * Extracts colors for use in OG image generation
 */

export interface ChainColors {
  primary: string;
  secondary: string | null;
}

/**
 * Parse a color string (hex, rgb, named) to hex format
 */
function normalizeColor(color: string): string | null {
  color = color.trim().toLowerCase();

  // Already hex
  if (color.startsWith('#')) {
    // Convert short hex to full hex
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    }
    if (color.length === 7) {
      return color;
    }
    return null;
  }

  // RGB/RGBA
  const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // Common named colors
  const namedColors: Record<string, string> = {
    white: '#ffffff',
    black: '#000000',
    red: '#ff0000',
    green: '#008000',
    blue: '#0000ff',
    yellow: '#ffff00',
    cyan: '#00ffff',
    magenta: '#ff00ff',
    orange: '#ffa500',
    purple: '#800080',
    pink: '#ffc0cb',
    gray: '#808080',
    grey: '#808080',
  };

  return namedColors[color] || null;
}

/**
 * Check if a color should be skipped (background/outline colors)
 */
function shouldSkipColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Skip white/near-white (likely background)
  if (r > 240 && g > 240 && b > 240) return true;

  // Skip black/near-black (likely outlines)
  if (r < 15 && g < 15 && b < 15) return true;

  // Skip very light grays
  if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r > 200) return true;

  return false;
}

/**
 * Extract gradient stop colors from SVG content (in order)
 */
function extractGradientColors(svgContent: string): string[] {
  const colors: string[] = [];

  // Match stop-color in gradients, preserving order
  const stopColorRegex = /stop-color\s*[=:]\s*["']?([^"';\s)]+)/gi;
  let match;
  while ((match = stopColorRegex.exec(svgContent)) !== null) {
    const color = normalizeColor(match[1]);
    if (color && !shouldSkipColor(color) && !colors.includes(color)) {
      colors.push(color);
    }
  }

  return colors;
}

/**
 * Extract fill colors from SVG content
 */
function extractFillColors(svgContent: string): string[] {
  const colorCounts = new Map<string, number>();

  // Match fill attributes: fill="color" or fill='color'
  const fillAttrRegex = /fill\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = fillAttrRegex.exec(svgContent)) !== null) {
    const color = normalizeColor(match[1]);
    if (color && !shouldSkipColor(color)) {
      colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
    }
  }

  // Match fill in style attributes
  const styleRegex = /style\s*=\s*["'][^"']*fill\s*:\s*([^;"']+)/gi;
  while ((match = styleRegex.exec(svgContent)) !== null) {
    const color = normalizeColor(match[1]);
    if (color && !shouldSkipColor(color)) {
      colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
    }
  }

  // Sort by count and return
  const sorted = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.map(([hex]) => hex);
}

/**
 * Known brand colors for chains that use currentColor or have no extractable colors
 */
const KNOWN_CHAIN_COLORS: Record<string, ChainColors> = {
  // Chains using currentColor or hard to extract
  eclipse: { primary: '#5865F2', secondary: '#9945FF' }, // Discord-like purple
  eclipsemainnet: { primary: '#5865F2', secondary: '#9945FF' },
  // Popular chains with known brand colors
  ethereum: { primary: '#627EEA', secondary: '#3C3C3D' },
  polygon: { primary: '#8247E5', secondary: '#7B3FE4' },
  arbitrum: { primary: '#28A0F0', secondary: '#213147' },
  optimism: { primary: '#FF0420', secondary: '#E8E8E8' },
  base: { primary: '#0052FF', secondary: '#E8E8E8' },
  avalanche: { primary: '#E84142', secondary: '#E8E8E8' },
  bsc: { primary: '#F0B90B', secondary: '#1A1A1A' },
  binance: { primary: '#F0B90B', secondary: '#1A1A1A' },
};

/**
 * Extract colors from an SVG image URL
 * Returns primary and secondary colors for gradient use
 */
export async function extractChainColors(
  imageUrl: string,
  chainName: string,
): Promise<ChainColors | null> {
  // Check known colors first
  const known = KNOWN_CHAIN_COLORS[chainName.toLowerCase()];
  if (known) return known;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const svgContent = await response.text();

    // Verify it's SVG
    if (!svgContent.includes('<svg') && !svgContent.includes('<?xml')) {
      return null;
    }

    // First try gradient colors (best for multi-color logos like Solana)
    const gradientColors = extractGradientColors(svgContent);
    if (gradientColors.length >= 2) {
      return {
        primary: gradientColors[0],
        secondary: gradientColors[1],
      };
    }
    if (gradientColors.length === 1) {
      return {
        primary: gradientColors[0],
        secondary: null,
      };
    }

    // Fall back to fill colors
    const fillColors = extractFillColors(svgContent);
    if (fillColors.length >= 2) {
      return {
        primary: fillColors[0],
        secondary: fillColors[1],
      };
    }
    if (fillColors.length === 1) {
      return {
        primary: fillColors[0],
        secondary: null,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Adjust color brightness/saturation for better visibility on dark backgrounds
 */
export function adjustColorForBackground(hex: string): string {
  // Parse hex color
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Convert to HSL
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6;
        break;
      case gNorm:
        h = ((bNorm - rNorm) / d + 2) / 6;
        break;
      case bNorm:
        h = ((rNorm - gNorm) / d + 4) / 6;
        break;
    }
  }

  // Adjust for dark background: ensure good lightness and saturation
  const newL = Math.min(0.65, Math.max(0.35, l));
  const newS = Math.min(0.9, Math.max(0.4, s));

  // Convert back to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = newL < 0.5 ? newL * (1 + newS) : newL + newS - newL * newS;
  const p = 2 * newL - q;

  const newR = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const newG = Math.round(hue2rgb(p, q, h) * 255);
  const newB = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Default colors when extraction fails
export const DEFAULT_CHAIN_COLORS: ChainColors = {
  primary: '#6366f1',
  secondary: '#818cf8',
};
