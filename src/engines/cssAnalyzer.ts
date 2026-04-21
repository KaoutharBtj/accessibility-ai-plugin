import { A11yIssue, Severity } from '../core/types';

// ============================================================
// UTILITAIRES COULEUR — calcul de contraste WCAG
// ============================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number | null {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return null;

  const l1 = relativeLuminance(c1.r, c1.g, c1.b);
  const l2 = relativeLuminance(c2.r, c2.g, c2.b);
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getLineFromIndex(content: string, index: number): { line: number; column: number } {
  const lines = content.substring(0, index).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
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

function checkColorContrast(content: string, filePath: string): A11yIssue[] {
  const issues: A11yIssue[] = [];

  // Extraire les blocs CSS avec color ET background-color
  const blockPattern = /([^{}]*)\{([^{}]*)\}/g;
  let blockMatch;

  while ((blockMatch = blockPattern.exec(content)) !== null) {
    const selector    = blockMatch[1].trim();
    const declaration = blockMatch[2];

    const colorMatch = /\bcolor\s*:\s*(#[0-9a-fA-F]{3,6})/i.exec(declaration);
    const bgMatch    = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/i.exec(declaration);

    if (colorMatch && bgMatch) {
      const ratio = contrastRatio(colorMatch[1], bgMatch[1]);

      if (ratio !== null && ratio < 4.5) {
        const { line, column } = getLineFromIndex(content, blockMatch.index);
        issues.push({
          id:       'css-color-contrast',
          rule:     'css-color-contrast',
          message:  `Contraste insuffisant dans "${selector}" : ratio ${ratio.toFixed(2)}:1 (minimum WCAG AA = 4.5:1). Ajustez la couleur ${colorMatch[1]} ou le fond ${bgMatch[1]}.`,
          severity: ratio < 3 ? 'high' : 'medium',
          file:     filePath,
          line,
          column,
        });
      }
    } else if (colorMatch && !bgMatch) {
      // color définie sans background — risque de contraste inconnu
      const { line, column } = getLineFromIndex(content, blockMatch.index);
      issues.push({
        id:       'css-color-no-background',
        rule:     'css-color-no-background',
        message:  `Couleur définie dans "${selector}" sans background-color associé — le contraste ne peut pas être vérifié. Définissez les deux propriétés ensemble.`,
        severity: 'low',
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