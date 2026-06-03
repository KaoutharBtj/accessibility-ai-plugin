/**
 * Extracts computed styles from rendered DOM elements.
 * Handles CSS variables, frameworks (Tailwind, Bootstrap), and real contrast ratios.
 */

export interface ComputedElementStyle {
  selector: string;
  color: string;
  backgroundColor: string;
  contrastRatio: number;
  fontSize: string;
  fontWeight: string;
  opacity: string;
  display: string;
  visibility: string;
}

export interface ContrastValidation {
  isValid: boolean;
  ratio: number;
  requiredRatio: number;
  fgColor: string;
  bgColor: string;
}

/**
 * Converts RGB/hex color to RGB format
 */
function normalizeColor(color: string): string {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
    return '#ffffff';
  }
  
  // Already in hex
  if (color.startsWith('#')) {
    return color;
  }

  // rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
  }

  // Default fallback
  return '#ffffff';
}

/**
 * Convert hex to RGB components
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 255, g: 255, b: 255 };
}

/**
 * Calculate relative luminance per WCAG 2.0
 */
function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map(x => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 * Returns ratio >= 1.0
 */
export function calculateContrastRatio(fgColor: string, bgColor: string): number {
  const fgHex = normalizeColor(fgColor);
  const bgHex = normalizeColor(bgColor);

  const l1 = getLuminance(fgHex);
  const l2 = getLuminance(bgHex);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Validate computed contrast against WCAG levels
 */
export function validateContrast(
  fgColor: string,
  bgColor: string,
  level: 'AA' | 'AAA' = 'AA',
  isLargeText: boolean = false
): ContrastValidation {
  const ratio = calculateContrastRatio(fgColor, bgColor);

  // WCAG AA: 4.5:1 normal, 3:1 large (18pt+ or 14pt+ bold)
  // WCAG AAA: 7:1 normal, 4.5:1 large
  const requiredRatio = level === 'AAA'
    ? isLargeText ? 4.5 : 7
    : isLargeText ? 3 : 4.5;

  return {
    isValid: ratio >= requiredRatio,
    ratio: Math.round(ratio * 100) / 100,
    requiredRatio,
    fgColor: normalizeColor(fgColor),
    bgColor: normalizeColor(bgColor),
  };
}

/**
 * Extract computed styles for all elements from rendered page
 * This runs in the browser context via Playwright evaluate
 */
export const EXTRACT_COMPUTED_STYLES_SCRIPT = `
  (function() {
    const elements = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.offsetParent === null && node.style.display !== 'none') continue; // Hidden
      
      const style = window.getComputedStyle(node);
      const color = style.color;
      const bg = style.backgroundColor;
      
      elements.push({
        selector: node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') + (node.className ? '.' + node.className.split(' ').join('.') : ''),
        color: color,
        backgroundColor: bg,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility,
        text: (node.textContent || '').substring(0, 100),
      });
    }

    return elements;
  })()
`;

/**
 * Validate opacity is not used for text visibility (WCAG 1.4.3)
 */
export function validateOpacity(opacity: string): { isValid: boolean; message?: string } {
  const opacityNum = parseFloat(opacity) || 1;
  
  if (opacityNum < 1) {
    return {
      isValid: false,
      message: `Opacity < 1 detected (${opacityNum}) — do not use opacity for text visibility`,
    };
  }

  return { isValid: true };
}

/**
 * Validate focus styles are visible
 */
export const EXTRACT_FOCUS_STYLES_SCRIPT = `
  (function() {
    const focusStyles = [];
    const sheets = document.styleSheets;

    for (let i = 0; i < sheets.length; i++) {
      try {
        const rules = sheets[i].cssRules || sheets[i].rules;
        
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          if (rule.selectorText && (
            rule.selectorText.includes(':focus') ||
            rule.selectorText.includes(':focus-visible')
          )) {
            focusStyles.push({
              selector: rule.selectorText,
              outline: rule.style.outline || 'none',
              outlineWidth: rule.style.outlineWidth || '0px',
              outlineColor: rule.style.outlineColor || 'transparent',
            });
          }
        }
      } catch (e) {
        // CORS or cross-origin stylesheets
      }
    }

    return focusStyles;
  })()
`;
