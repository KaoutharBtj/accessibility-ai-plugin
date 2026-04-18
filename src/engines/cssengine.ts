import { A11yIssue, Severity } from '../core/types';

interface CssRule {
  id: string;
  message: string;
  severity: Severity;
  wcag: string;
  check: (content: string) => CssMatch[];
}

interface CssMatch {
  index: number;
  snippet: string;
}

/**
 * CSSEngine — Static analysis of CSS files for accessibility issues.
 *
 * Detects:
 *  - outline:none / focus suppression (WCAG 2.4.7)
 *  - Animations without prefers-reduced-motion (WCAG 2.3.3)
 *  - Font sizes too small or in fixed px (WCAG 1.4.4)
 *  - Forced color / high-contrast mode issues
 *  - color-only indicators (WCAG 1.4.1)
 *  - Overflow hiding that breaks reflow (WCAG 1.4.10)
 *  - pointer-events:none on interactive elements
 *  - user-select:none on text content
 */
export class CSSEngine {
  private static readonly RULES: CssRule[] = [

    // ── FOCUS SUPPRESSION ───────────────────────────────────────────
    {
      id: 'css-focus-outline-none',
      message:
        '[HIGH] outline:none detected without :focus-visible fallback. ' +
        'This removes keyboard focus indicators (WCAG 2.4.7). ' +
        'Use :focus-visible { outline: 2px solid; } instead.',
      severity: 'high',
      wcag: 'wcag2aa / 2.4.7',
      check(content) {
        const matches: CssMatch[] = [];
        // Match outline:none or outline:0 — including with !important
        const re = /outline\s*:\s*(none|0)\s*(!important)?/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          matches.push({ index: m.index, snippet: m[0] });
        }
        return matches;
      },
    },

    {
      id: 'css-focus-visible-suppressed',
      message:
        '[HIGH] :focus-visible { outline:none } detected. ' +
        'This removes the modern keyboard focus indicator (WCAG 2.4.7).',
      severity: 'high',
      wcag: 'wcag2aa / 2.4.7',
      check(content) {
        const matches: CssMatch[] = [];
        const re = /:focus-visible\s*\{[^}]*outline\s*:\s*(none|0)/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          matches.push({ index: m.index, snippet: m[0].slice(0, 80) });
        }
        return matches;
      },
    },

    // ── ANIMATIONS WITHOUT REDUCED MOTION ──────────────────────────
    {
      id: 'css-animation-no-reduced-motion',
      message:
        '[MEDIUM] Animation defined without @media (prefers-reduced-motion: reduce) guard. ' +
        'Users with vestibular disorders may be harmed (WCAG 2.3.3). ' +
        'Wrap in: @media (prefers-reduced-motion: reduce) { animation: none; }',
      severity: 'medium',
      wcag: 'wcag2aa / 2.3.3',
      check(content) {
        // If the file uses animation but has no prefers-reduced-motion query, flag each animation property
        const hasReducedMotion = /prefers-reduced-motion/i.test(content);
        if (hasReducedMotion) return [];

        const matches: CssMatch[] = [];
        const re = /animation\s*:[^;}{]+;/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          matches.push({ index: m.index, snippet: m[0].slice(0, 80) });
        }
        return matches;
      },
    },

    {
      id: 'css-transition-no-reduced-motion',
      message:
        '[LOW] transition: all detected without prefers-reduced-motion guard. ' +
        'Broad transitions can cause motion sickness (WCAG 2.3.3).',
      severity: 'low',
      wcag: 'wcag2aa / 2.3.3',
      check(content) {
        const hasReducedMotion = /prefers-reduced-motion/i.test(content);
        if (hasReducedMotion) return [];

        const matches: CssMatch[] = [];
        const re = /transition\s*:\s*all\b[^;}{]+;/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          matches.push({ index: m.index, snippet: m[0].slice(0, 80) });
        }
        return matches;
      },
    },

    // ── FONT SIZE ───────────────────────────────────────────────────
    {
      id: 'css-font-size-too-small',
      message:
        '[MEDIUM] Font size below 11px detected. ' +
        'Text smaller than 11px is very difficult to read and fails WCAG 1.4.4. ' +
        'Use rem/em units and a minimum of 1rem (16px equivalent).',
      severity: 'medium',
      wcag: 'wcag2aa / 1.4.4',
      check(content) {
        const matches: CssMatch[] = [];
        const re = /font-size\s*:\s*([0-9.]+)px/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const size = parseFloat(m[1]);
          if (size < 11) {
            matches.push({ index: m.index, snippet: m[0] });
          }
        }
        return matches;
      },
    },

    {
      id: 'css-font-size-px-fixed',
      message:
        '[LOW] Font size defined in px. ' +
        'Fixed px sizes do not scale with user browser font preferences (WCAG 1.4.4). ' +
        'Use rem or em units instead.',
      severity: 'low',
      wcag: 'wcag2aa / 1.4.4',
      check(content) {
        const matches: CssMatch[] = [];
        // Only flag small px values (< 16px) that are likely body text
        const re = /\bfont-size\s*:\s*([0-9.]+)px/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const size = parseFloat(m[1]);
          if (size < 16) {
            matches.push({ index: m.index, snippet: m[0] });
          }
        }
        return matches;
      },
    },

    // ── LINE HEIGHT ─────────────────────────────────────────────────
    {
      id: 'css-line-height-too-tight',
      message:
        '[LOW] line-height below 1.5 detected. ' +
        'WCAG 1.4.12 recommends at least 1.5 times the font size for body text.',
      severity: 'low',
      wcag: 'wcag2aa / 1.4.12',
      check(content) {
        const matches: CssMatch[] = [];
        const re = /line-height\s*:\s*([0-9.]+)\s*;/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const val = parseFloat(m[1]);
          // Only flag unitless values < 1.5 (ratios)
          if (val < 1.5 && val > 0 && val < 5) {
            matches.push({ index: m.index, snippet: m[0] });
          }
        }
        return matches;
      },
    },

    // ── OVERFLOW HIDDEN (reflow / WCAG 1.4.10) ─────────────────────
    {
      id: 'css-overflow-hidden-fixed-height',
      message:
        '[MEDIUM] overflow:hidden with a fixed height may clip content when user zooms to 400% (WCAG 1.4.10 Reflow). ' +
        'Use min-height instead of height, or remove overflow:hidden.',
      severity: 'medium',
      wcag: 'wcag2aa / 1.4.10',
      check(content) {
        const matches: CssMatch[] = [];
        // Find blocks with overflow:hidden AND a fixed height
        const blockRe = /([^{}]*)\{([^{}]*)\}/gi;
        let block: RegExpExecArray | null;
        while ((block = blockRe.exec(content)) !== null) {
          const body = block[2];
          if (/overflow\s*:\s*hidden/i.test(body) && /\bheight\s*:\s*[0-9]+px/i.test(body)) {
            matches.push({ index: block.index, snippet: block[0].slice(0, 100) });
          }
        }
        return matches;
      },
    },

    // ── POINTER-EVENTS NONE ─────────────────────────────────────────
    {
      id: 'css-pointer-events-none',
      message:
        '[MEDIUM] pointer-events:none detected. ' +
        'If applied to an interactive element, it makes it completely inaccessible to mouse users (WCAG 2.1.1).',
      severity: 'medium',
      wcag: 'wcag2aa / 2.1.1',
      check(content) {
        const matches: CssMatch[] = [];
        const re = /pointer-events\s*:\s*none/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          matches.push({ index: m.index, snippet: m[0] });
        }
        return matches;
      },
    },

    // ── USER-SELECT NONE ────────────────────────────────────────────
    {
      id: 'css-user-select-none',
      message:
        '[LOW] user-select:none detected. ' +
        'Prevents users from copying text, which harms accessibility for users with cognitive disabilities.',
      severity: 'low',
      wcag: 'best-practice',
      check(content) {
        const matches: CssMatch[] = [];
        const re = /user-select\s*:\s*none/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          matches.push({ index: m.index, snippet: m[0] });
        }
        return matches;
      },
    },

    // ── FORCED COLORS / HIGH CONTRAST ──────────────────────────────
    {
      id: 'css-no-forced-colors-support',
      message:
        '[LOW] Custom colors detected but no @media (forced-colors: active) block found. ' +
        'Windows High Contrast mode may make your UI invisible (WCAG 1.4.3).',
      severity: 'low',
      wcag: 'wcag2aa / 1.4.3',
      check(content) {
        const hasForcedColors = /forced-colors/i.test(content);
        if (hasForcedColors) return [];

        const hasCustomColors =
          /background-color\s*:/i.test(content) || /\bcolor\s*:/i.test(content);

        if (!hasCustomColors) return [];

        // Flag at position 0 — file-level warning
        return [{ index: 0, snippet: '(file-level) Missing @media (forced-colors: active)' }];
      },
    },

    // ── BOX-SHADOW AS ONLY BORDER (lost in forced-colors) ──────────
    {
      id: 'css-box-shadow-only-border',
      message:
        '[LOW] box-shadow used without a border. ' +
        'In Windows High Contrast / forced-colors mode, box-shadows are removed and the element loses its visual boundary.',
      severity: 'low',
      wcag: 'wcag2aa / 1.4.3',
      check(content) {
        const matches: CssMatch[] = [];
        const blockRe = /([^{}]*)\{([^{}]*)\}/gi;
        let block: RegExpExecArray | null;
        while ((block = blockRe.exec(content)) !== null) {
          const body = block[2];
          if (/box-shadow\s*:/i.test(body) && !/\bborder\s*:/i.test(body)) {
            matches.push({ index: block.index, snippet: block[0].slice(0, 100) });
          }
        }
        return matches;
      },
    },

    // ── COLOR ONLY INDICATORS (WCAG 1.4.1) ─────────────────────────
    {
      id: 'css-link-no-underline',
      message:
        '[MEDIUM] a { text-decoration:none } detected. ' +
        'Links must be distinguishable from surrounding text by more than color alone (WCAG 1.4.1). ' +
        'Add an underline or another non-color indicator.',
      severity: 'medium',
      wcag: 'wcag2aa / 1.4.1',
      check(content) {
        const matches: CssMatch[] = [];
        // Look for rules that target <a> and set text-decoration:none
        const re = /\ba\b[^{}]*\{[^{}]*text-decoration\s*:\s*none/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          matches.push({ index: m.index, snippet: m[0].slice(0, 100) });
        }
        return matches;
      },
    },

    // ── CURSOR ──────────────────────────────────────────────────────
    {
      id: 'css-cursor-default-on-clickable',
      message:
        '[LOW] cursor:default detected. ' +
        'If applied to a clickable element, it misleads sighted users about interactivity (WCAG 2.4.13).',
      severity: 'low',
      wcag: 'best-practice',
      check(content) {
        const matches: CssMatch[] = [];
        const re = /cursor\s*:\s*default/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          matches.push({ index: m.index, snippet: m[0] });
        }
        return matches;
      },
    },
  ];

  /**
   * Run all CSS accessibility rules on the given content.
   */
  public static async run(fileContent: string, filePath: string): Promise<A11yIssue[]> {
    if (!filePath.match(/\.css$/i)) {
      return [];
    }

    console.log('[CSSEngine] Analyzing:', filePath);
    const issues: A11yIssue[] = [];

    for (const rule of CSSEngine.RULES) {
      const matches = rule.check(fileContent);

      for (const match of matches) {
        const lineInfo = CSSEngine.getLineFromIndex(fileContent, match.index);

        issues.push({
          id: rule.id,
          message: `${rule.message}  [${rule.wcag}]`,
          severity: rule.severity,
          file: filePath,
          line: lineInfo.line,
          column: lineInfo.column,
          source: 'typescript', // uses the existing union type
          rule: rule.id,
        });
      }
    }

    console.log('[CSSEngine] Issues found:', issues.length);
    return issues;
  }

  private static getLineFromIndex(
    content: string,
    index: number
  ): { line: number; column: number } {
    const lines = content.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }
}