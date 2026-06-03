import { A11yIssue } from '../core/types';

// ============================================================
// UTILITAIRES COULEUR — calcul de contraste WCAG
// ============================================================

interface ColorRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4', azure: '#f0ffff',
  beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd', blue: '#0000ff',
  blueviolet: '#8a2be2', brown: '#a52a2a', burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
  chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b', darkgray: '#a9a9a9',
  darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b', darkmagenta: '#8b008b', darkolivegreen: '#556b2f',
  darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b', darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1',
  darkviolet: '#9400d3', deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22', fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520', gray: '#808080',
  green: '#008000', greenyellow: '#adff2f', grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4',
  indianred: '#cd5c5c', indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080',
  lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3', lightgreen: '#90ee90', lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1', lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899',
  lightslategrey: '#778899', lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd',
  mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585', midnightblue: '#191970',
  mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080',
  oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6',
  palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093', papayawhip: '#ffefd5',
  peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080',
  rebeccapurple: '#663399', red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513',
  salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0',
  skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
  springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347',
  transparent: '#00000000', turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff',
  whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
};

function normalizeHex(hex: string): string | null {
  const clean = hex.replace('#', '').trim().toLowerCase();
  if (/^[0-9a-f]{3}$/.test(clean)) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(clean)) {
    return `#${clean}`;
  }
  if (/^[0-9a-f]{8}$/.test(clean)) {
    const alpha = clean.slice(6);
    if (alpha === 'ff') {
      return `#${clean.slice(0, 6)}`;
    }
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function parseRgb(value: string): ColorRgba | null {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;

  const parts = match[1].split(',').map(x => x.trim());
  if (parts.length < 3) return null;

  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  const a = parts.length === 4 ? parseFloat(parts[3]) : 1;
  if ([r, g, b].some(n => Number.isNaN(n))) return null;
  return { r, g, b, a: Number.isNaN(a) ? 1 : a };
}

function parseHsl(value: string): ColorRgba | null {
  const match = value.match(/hsla?\(([^)]+)\)/i);
  if (!match) return null;

  const parts = match[1].split(',').map(x => x.trim());
  if (parts.length < 3) return null;

  const h = Number(parts[0].replace(/deg$/, ''));
  const s = Number(parts[1].replace('%', '')) / 100;
  const l = Number(parts[2].replace('%', '')) / 100;
  const a = parts.length === 4 ? parseFloat(parts[3]) : 1;
  if ([h, s, l].some(n => Number.isNaN(n))) return null;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: Number.isNaN(a) ? 1 : a };
}

function blendAlpha(fg: ColorRgba, bg: ColorRgba): ColorRgba {
  const alpha = fg.a + bg.a * (1 - fg.a);
  if (alpha === 0) return { r: 255, g: 255, b: 255, a: 1 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / alpha,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / alpha,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / alpha,
    a: alpha,
  };
}

function parseColorValue(value: string, variables: Record<string, string>): ColorRgba | null {
  if (!value) return null;

  let normalized = value.trim().replace(/!important$/, '').trim();
  normalized = resolveCssVariable(normalized, variables);
  normalized = normalized.trim().toLowerCase();

  if (!normalized) return null;
  if (normalized === 'transparent') {
    return { r: 255, g: 255, b: 255, a: 0 };
  }

  if (NAMED_COLORS[normalized]) {
    const hex = normalizeHex(NAMED_COLORS[normalized]);
    if (hex) {
      const rgb = hexToRgb(hex);
      return rgb ? { ...rgb, a: 1 } : null;
    }
  }

  if (normalized.startsWith('#')) {
    const hex = normalizeHex(normalized);
    if (!hex) return null;
    const rgb = hexToRgb(hex);
    return rgb ? { ...rgb, a: 1 } : null;
  }

  const rgb = parseRgb(normalized);
  if (rgb) return rgb;

  const hsl = parseHsl(normalized);
  if (hsl) return hsl;

  return null;
}

function resolveCssVariable(value: string, variables: Record<string, string>, depth = 0): string {
  if (depth > 10) return value;
  return value.replace(/var\(\s*(--[\w-]+)(?:\s*,\s*([^\)]+))?\s*\)/g, (match, varName, fallback) => {
    const replacement = variables[varName];
    if (replacement !== undefined) {
      return resolveCssVariable(replacement, variables, depth + 1);
    }
    if (fallback !== undefined) {
      return resolveCssVariable(fallback.trim(), variables, depth + 1);
    }
    return match;
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const clean = normalized.replace('#', '');
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrastRatio(fg: ColorRgba, bg: ColorRgba): number | null {
  if (bg.a < 1) {
    return null;
  }


  const opaqueFg = fg.a < 1 ? blendAlpha(fg, bg) : fg;
  const l1 = relativeLuminance(opaqueFg.r, opaqueFg.g, opaqueFg.b);
  const l2 = relativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getLineFromIndex(content: string, index: number): { line: number; column: number } {
  const lines = content.substring(0, index).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function parseDeclarations(block: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  const regex = /([\w-]+)\s*:\s*([^;]+)/g;
  let match;
  while ((match = regex.exec(block)) !== null) {
    declarations[match[1].toLowerCase()] = match[2].trim();
  }
  return declarations;
}

function parseCssRules(content: string): Array<{ selector: string; declarations: Record<string, string>; line: number; column: number }> {
  const rules: Array<{ selector: string; declarations: Record<string, string>; line: number; column: number }> = [];
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = blockPattern.exec(content)) !== null) {
    const selector = match[1].trim();
    const declarations = parseDeclarations(match[2]);
    const position = getLineFromIndex(content, match.index);
    rules.push({ selector, declarations, line: position.line, column: position.column });
  }

  return rules;
}

function buildVariableMap(rules: Array<{ selector: string; declarations: Record<string, string> }>): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const rule of rules) {
    for (const [property, value] of Object.entries(rule.declarations)) {
      if (property.startsWith('--')) {
        variables[property] = value;
      }
    }
  }
  return variables;
}

function extractBackgroundColor(declarations: Record<string, string>, variables: Record<string, string>): ColorRgba | null {
  const backgroundValue = declarations['background-color'] || declarations['background'];
  if (!backgroundValue) return null;

  const candidate = parseColorValue(backgroundValue, variables);
  if (candidate) return candidate;

  // Support background shorthand: background: url(...) center/cover #fff;
  const tokens = backgroundValue.split(/\s+/);
  for (const token of tokens) {
    const parsed = parseColorValue(token, variables);
    if (parsed) return parsed;
  }

  return null;
}

function extractTextColor(declarations: Record<string, string>, variables: Record<string, string>): ColorRgba | null {
  const colorValue = declarations['color'];
  if (!colorValue) return null;
  return parseColorValue(colorValue, variables);
}

function getGlobalBackground(rules: Array<{ selector: string; declarations: Record<string, string> }>, variables: Record<string, string>): ColorRgba | null {
  const globalSelectors = ['body', 'html', ':root'];
  for (const selector of globalSelectors) {
    const rule = rules.find(r => r.selector.split(',').map(s => s.trim()).includes(selector));
    if (rule) {
      const bg = extractBackgroundColor(rule.declarations, variables);
      if (bg) return bg;
    }
  }
  return null;
}

function parseColorFromDeclaration(value: string | undefined, variables: Record<string, string>): ColorRgba | null {
  if (!value) return null;
  return parseColorValue(value, variables);
}

function buildPropertiesKey(selector: string, rule: { declarations: Record<string, string>; line: number; column: number }) {
  return selector + ':' + rule.line + ':' + rule.column;
}

function indexRulesBySelector(rules: Array<{ selector: string; declarations: Record<string, string>; line: number; column: number }>) {
  const map = new Map<string, { declarations: Record<string, string>; line: number; column: number }>();
  for (const rule of rules) {
    const selectors = rule.selector.split(',').map(s => s.trim());
    for (const sel of selectors) {
      map.set(sel, rule);
    }
  }
  return map;
}

function resolveEffectiveBackground(
  selector: string,
  rules: Array<{ selector: string; declarations: Record<string, string>; line: number; column: number }>,
  variables: Record<string, string>
): ColorRgba | null {

  // 1. Le sélecteur lui-même a un fond explicite
  const selfRule = rules.find(r =>
    r.selector.split(',').map(s => s.trim()).includes(selector)
  );
  if (selfRule) {
    const bg = extractBackgroundColor(selfRule.declarations, variables);
    if (bg && bg.a > 0) return bg;
  }

  // 2. Remonter les parents sémantiques du sélecteur
  //    Ex: "header h1" → tester "header", puis body/html
  const parts = selector.split(/\s+/);
  for (let i = parts.length - 2; i >= 0; i--) {
    const parentSelector = parts.slice(0, i + 1).join(' ');
    const parentRule = rules.find(r =>
      r.selector.split(',').map(s => s.trim()).some(s =>
        s === parentSelector || s === parts[i]
      )
    );
    if (parentRule) {
      const bg = extractBackgroundColor(parentRule.declarations, variables);
      if (bg && bg.a > 0) return bg;
    }
  }

  // 3. Correspondance par tag simple : "header h1" → chercher "header"
  const firstTag = parts[0].replace(/[:.#\[].*/g, '');
  if (firstTag && firstTag !== parts[0]) {
    const tagRule = rules.find(r =>
      r.selector.split(',').map(s => s.trim()).includes(firstTag)
    );
    if (tagRule) {
      const bg = extractBackgroundColor(tagRule.declarations, variables);
      if (bg && bg.a > 0) return bg;
    }
  }

  // 4. Fallback : fond global (body / html)
  return getGlobalBackground(rules, variables);
}

// ============================================================
// DÉDUPLICATION CSS — par type + fichier + ligne proche
// ============================================================

function deduplicateCssIssues(issues: A11yIssue[]): A11yIssue[] {
  const seen = new Map<string, A11yIssue>();
  const severityOrder: Record<string, number> = {
    critical: 4, high: 3, medium: 2, low: 1,
  };

  for (const issue of issues) {
    // Clé = type + fichier + ligne arrondie (tolérance ±2)
    const roundedLine = Math.floor((issue.line ?? 0) / 2) * 2;
    const key = `${issue.rule}:${issue.file}:${roundedLine}`;

    if (!seen.has(key)) {
      seen.set(key, { ...issue });
    } else {
      const existing = seen.get(key)!;
      // Garder la severity la plus haute
      if ((severityOrder[issue.severity] || 0) > (severityOrder[existing.severity] || 0)) {
        existing.severity = issue.severity;
      }
    }
  }

  return Array.from(seen.values());
}

// ============================================================
// RÈGLE 1 — Font size trop petite (< 12px)
// ============================================================

function checkFontSize(content: string, filePath: string): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const pattern = /font-size\s*:\s*([\d.]+)(px|rem|em|pt)/gi;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const value = parseFloat(match[1]);
    const unit  = match[2].toLowerCase();

    let valuePx = value;
    if (unit === 'rem' || unit === 'em') valuePx = value * 16;
    if (unit === 'pt')                   valuePx = value * 1.333;

    if (valuePx < 12) {
      const { line, column } = getLineFromIndex(content, match.index);
      issues.push({
        id:       'css-font-size-too-small',
        rule:     'css-font-size-too-small',
        message:  `Police trop petite : ${value}${unit} ≈ ${Math.round(valuePx)}px — minimum recommandé 12px (WCAG 1.4.4). Augmentez la taille pour améliorer la lisibilité.`,
        severity: 'medium',
        file:     filePath,
        line,
        column,
      });
    }
  }

  return issues;
}

// ============================================================
// RÈGLE 2 — Contraste réel WCAG (ratio < 4.5:1)
// ============================================================


function isLargeTextSelector(
  selector: string,
  fontSize: string | undefined,
  fontWeight: string | undefined,
  rules: Array<{ selector: string; declarations: Record<string, string>; line: number; column: number }>,
  variables: Record<string, string>
): boolean {
  // Résoudre la taille de fonte effective
  let resolvedSize = fontSize;
  if (!resolvedSize) {
    // Chercher dans les parents
    const parts = selector.split(/\s+/);
    for (let i = parts.length - 1; i >= 0; i--) {
      const parentRule = rules.find(r =>
        r.selector.split(',').map(s => s.trim()).includes(parts[i])
      );
      if (parentRule?.declarations['font-size']) {
        resolvedSize = parentRule.declarations['font-size'];
        break;
      }
    }
  }

  let sizePx = 16; // défaut navigateur
  if (resolvedSize) {
    resolvedSize = resolveCssVariable(resolvedSize, variables);
    const match = resolvedSize.match(/([\d.]+)(px|rem|em|pt)/i);
    if (match) {
      const val = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      if (unit === 'px') sizePx = val;
      else if (unit === 'rem' || unit === 'em') sizePx = val * 16;
      else if (unit === 'pt') sizePx = val * 1.333;
    }
  }

  // Résoudre le font-weight
  let weight = 400;
  const resolvedWeight = fontWeight
    ? resolveCssVariable(fontWeight, variables)
    : undefined;
  if (resolvedWeight === 'bold' || resolvedWeight === 'bolder') weight = 700;
  else if (resolvedWeight) weight = parseInt(resolvedWeight) || 400;

  // WCAG : large text = ≥18px normal OU ≥14px bold (≥700)
  return sizePx >= 18 || (sizePx >= 14 && weight >= 700);
}

function checkColorContrast(content: string, filePath: string): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const rules = parseCssRules(content);
  const variables = buildVariableMap(rules);

  for (const rule of rules) {
    const selector = rule.selector;
    const textColor = extractTextColor(rule.declarations, variables);

    // ✅ Résolution de cascade : cherche le fond réel en remontant les parents
    const backgroundColor =
      extractBackgroundColor(rule.declarations, variables) ??
      resolveEffectiveBackground(selector, rules, variables);

    if (!textColor) continue;

    if (!backgroundColor) {
      issues.push({
        id:       'css-color-no-background',
        rule:     'css-color-no-background',
        message:  `Couleur définie dans "${selector}" sans background-color associé — le contraste ne peut pas être vérifié.`,
        severity: 'low',
        file:     filePath,
        line:     rule.line,
        column:   rule.column,
      });
      continue;
    }

    const ratio = getContrastRatio(textColor, backgroundColor);
    if (ratio === null) continue;

    // ✅ Tenir compte de la taille du texte pour le seuil
    const fontSize = rule.declarations['font-size'];
    const fontWeight = rule.declarations['font-weight'];
    const isLargeText = isLargeTextSelector(selector, fontSize, fontWeight, rules, variables);
    const threshold = isLargeText ? 3.0 : 4.5;

    const line = rule.line;
    const column = rule.column;

    if (ratio < threshold) {
      issues.push({
        id:       'css-color-contrast',
        rule:     'css-color-contrast',
        message:  `Contraste insuffisant dans "${selector}" : ratio ${ratio.toFixed(2)}:1 (minimum WCAG ${isLargeText ? 'AA large = 3.0' : 'AA normal = 4.5'}:1). Ajustez la couleur ou le fond.`,
        severity: ratio < 3 ? 'high' : 'medium',
        file:     filePath,
        line,
        column,
      });
    }
  }

  return issues;
}
// ============================================================
// RÈGLE 3 — :hover sans :focus équivalent
// ============================================================

function checkHoverWithoutFocus(content: string, filePath: string): A11yIssue[] {
  const issues: A11yIssue[] = [];

  const hoverSelectors  = new Map<string, number>();
  const focusSelectors  = new Set<string>();

  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = blockPattern.exec(content)) !== null) {
    const rawSelector = match[1].trim();

    // Gérer les sélecteurs multiples séparés par virgule
    const parts = rawSelector.split(',').map(s => s.trim());

    for (const part of parts) {
      if (part.includes(':hover')) {
        const base = part.replace(/:hover/g, '').trim();
        if (!hoverSelectors.has(base)) {
          hoverSelectors.set(base, match.index);
        }
      }

      if (part.includes(':focus') || part.includes(':focus-visible') || part.includes(':focus-within')) {
        const base = part
          .replace(/:focus-visible/g, '')
          .replace(/:focus-within/g, '')
          .replace(/:focus/g, '')
          .trim();
        focusSelectors.add(base);
      }
    }
  }

  for (const [base, index] of hoverSelectors.entries()) {
    if (!focusSelectors.has(base)) {
      const { line, column } = getLineFromIndex(content, index);
      issues.push({
        id:       'css-hover-without-focus',
        rule:     'css-hover-without-focus',
        message:  `"${base}:hover" sans équivalent ":focus" — les utilisateurs clavier et lecteurs d'écran ne verront pas ce style. Ajoutez "${base}:focus { ... }" ou "${base}:focus-visible { ... }".`,
        severity: 'medium',
        file:     filePath,
        line,
        column,
      });
    }
  }

  return issues;
}

// ============================================================
// RÈGLE 4 — Animation infinie sans prefers-reduced-motion
// ============================================================

function checkInfiniteAnimation(content: string, filePath: string): A11yIssue[] {
  const issues: A11yIssue[] = [];

  const isInsideReducedMotion = (index: number): boolean => {
    const before = content.substring(0, index);
    const opens  = (before.match(/@media[^{]*prefers-reduced-motion[^{]*\{/g) || []).length;
    const closes = (before.match(/\}/g) || []).length;
    return opens > 0 && opens > closes;
  };

  // animation: ... infinite
  const animShorthand = /animation\s*:[^;]*\binfinite\b[^;]*;/gi;
  let match;
  while ((match = animShorthand.exec(content)) !== null) {
    if (!isInsideReducedMotion(match.index)) {
      const { line, column } = getLineFromIndex(content, match.index);
      issues.push({
        id:       'css-infinite-animation',
        rule:     'css-infinite-animation',
        message:  `Animation infinie détectée sans @media (prefers-reduced-motion) — peut provoquer des nausées ou crises (WCAG 2.3.3). Enveloppez cette règle dans @media (prefers-reduced-motion: no-preference) { ... }.`,
        severity: 'medium',
        file:     filePath,
        line,
        column,
      });
    }
  }

  // animation-iteration-count: infinite
  const animIteration = /animation-iteration-count\s*:\s*infinite/gi;
  while ((match = animIteration.exec(content)) !== null) {
    if (!isInsideReducedMotion(match.index)) {
      const { line, column } = getLineFromIndex(content, match.index);
      issues.push({
        id:       'css-infinite-animation',
        rule:     'css-infinite-animation',
        message:  `animation-iteration-count: infinite sans @media (prefers-reduced-motion) (WCAG 2.3.3). Ajoutez @media (prefers-reduced-motion: reduce) { animation: none; }.`,
        severity: 'medium',
        file:     filePath,
        line,
        column,
      });
    }
  }

  return issues;
}

// ============================================================
// RÈGLE 5 — outline:none / outline:0 (focus invisible)
// ============================================================

function checkOutlineNone(content: string, filePath: string): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const pattern = /outline\s*:\s*(?:none|0\b)/gi;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    // Vérifier si dans un bloc :focus — dans ce cas c'est critique
    const before      = content.substring(0, match.index);
    const lastBrace   = before.lastIndexOf('{');
    const beforeBlock = before.substring(0, lastBrace);
    const isFocusBlock = /:focus/i.test(beforeBlock.split('}').pop() || '');

    const { line, column } = getLineFromIndex(content, match.index);
    issues.push({
      id:       'css-outline-none',
      rule:     'css-outline-none',
      message:  isFocusBlock
        ? `outline:none dans un bloc :focus — supprime totalement l'indicateur de focus clavier (WCAG 2.4.7). Remplacez par un style de focus visible personnalisé.`
        : `outline:none détecté — peut supprimer l'indicateur de focus si appliqué à un élément interactif (WCAG 2.4.7). Vérifiez que le focus reste visible.`,
      severity: isFocusBlock ? 'high' : 'medium',
      file:     filePath,
      line,
      column,
    });
  }

  return issues;
}

// ============================================================
// RÈGLE 6 — visibility:hidden / display:none
// ============================================================

function checkHiddenContent(content: string, filePath: string): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const pattern = /(?:visibility\s*:\s*hidden|display\s*:\s*none)/gi;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const { line, column } = getLineFromIndex(content, match.index);
    issues.push({
      id:       'css-hidden-content',
      rule:     'css-hidden-content',
      message:  `Contenu masqué avec "${match[0].trim()}" — ce contenu sera invisible pour tous les utilisateurs, y compris les lecteurs d'écran. Si vous voulez cacher visuellement mais garder accessible, utilisez la classe .sr-only à la place.`,
      severity: 'low',
      file:     filePath,
      line,
      column,
    });
  }

  return issues;
}

// ============================================================
// FONCTION PRINCIPALE — analyzeCSS()
// ============================================================

export function analyzeCSS(content: string, filePath: string): A11yIssue[] {
  const raw: A11yIssue[] = [
    ...checkFontSize(content, filePath),
    ...checkColorContrast(content, filePath),
    ...checkHoverWithoutFocus(content, filePath),
    ...checkInfiniteAnimation(content, filePath),
    ...checkOutlineNone(content, filePath),
    ...checkHiddenContent(content, filePath),
  ];

  // Déduplication finale
  return deduplicateCssIssues(raw);
}