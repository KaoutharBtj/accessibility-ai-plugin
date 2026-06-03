/**
 * Validation layer to filter false positives from axe-core
 * Applies WCAG rules to real computed styles from rendered DOM
 */

import { A11yIssue, Severity } from './types';
import { validateContrast, calculateContrastRatio, validateOpacity } from './computedStylesExtractor';

export interface ValidationContext {
  /** CSS computed styles from rendered page */
  computedStyles: Map<string, any>;
  
  /** Raw axe-core violations */
  axeViolations: A11yIssue[];
  
  /** Raw RGAA/linter violations */
  otherViolations: A11yIssue[];
  
  /** Focus styles found */
  focusStyles: Map<string, any>;
}

export class ValidationEngine {
  /**
   * Main validation pipeline
   * Filters out false positives from axe-core based on rendered DOM
   */
  public static validate(context: ValidationContext): A11yIssue[] {
    const validated: A11yIssue[] = [];

    // 1. Validate axe-core violations against computed styles
    const validatedAxe = this.validateAxeViolations(
      context.axeViolations,
      context.computedStyles,
      context.focusStyles
    );

    validated.push(...validatedAxe);

    // 2. Keep other violations as-is (they don't have false positives)
    validated.push(...context.otherViolations);

    // 3. Remove duplicates
    return this.deduplicateIssues(validated);
  }

  /**
   * Validate axe-core violations against real computed styles
   */
  private static validateAxeViolations(
    violations: A11yIssue[],
    computedStyles: Map<string, any>,
    focusStyles: Map<string, any>
  ): A11yIssue[] {
    return violations
      .filter(violation => {
        // Color contrast: validate against computed styles
        if (violation.rule === 'color-contrast' || violation.rule === 'color-contrast-enhanced') {
          return this.validateColorContrast(violation, computedStyles);
        }

        // CSS outline: validate focus styles
        if (violation.rule === 'css-outline-none' || violation.rule === 'css-hover-without-focus') {
          return this.validateFocusVisibility(violation, focusStyles);
        }

        // Opacity: validate text isn't hidden by opacity
        if (violation.rule === 'css-opacity-text') {
          return this.validateOpacityIssue(violation, computedStyles);
        }

        // Keep all other violations
        return true;
      });
  }

  /**
   * Validate color contrast against computed styles
   * Returns false if contrast is actually valid (false positive)
   */
  private static validateColorContrast(
    violation: A11yIssue,
    computedStyles: Map<string, any>
  ): boolean {
    // Extract selector from violation message if available
    const selectorMatch = violation.message.match(/Selector:\s*([^\n]+)/);
    if (!selectorMatch) return true; // Keep if we can't parse

    const selector = selectorMatch[1].trim();
    const styles = this.findComputedStylesForSelector(selector, computedStyles);

    if (!styles) {
      // No computed styles found for this selector, keep violation
      console.log(`[ValidationEngine] No computed style found for selector: ${selector}`);
      return true;
    }

    let bgColor = styles.backgroundColor;
    if (bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
      const bodyStyle = computedStyles.get('body') || computedStyles.get('html');
      if (bodyStyle && bodyStyle.backgroundColor && bodyStyle.backgroundColor !== 'transparent') {
        bgColor = bodyStyle.backgroundColor;
      }
    }

    const validation = validateContrast(
      styles.color,
      bgColor,
      'AA',
      this.isLargeText(styles.fontSize, styles.fontWeight)
    );

    if (validation.isValid) {
      console.log(`[ValidationEngine] FILTERED false positive: ${selector} has contrast ${validation.ratio}:1`);
      return false;
    }

    return true;
  }

  private static findComputedStylesForSelector(
    selector: string,
    computedStyles: Map<string, any>
  ): any | undefined {
    const exact = computedStyles.get(selector);
    if (exact) return exact;

    for (const [key, styles] of computedStyles.entries()) {
      if (
        key === selector ||
        key.endsWith(selector) ||
        selector.endsWith(key) ||
        key.startsWith(selector + '.') ||
        key.startsWith(selector + '#')
      ) {
        return styles;
      }
    }

    return undefined;
  }

  /**
   * Validate focus visibility
   */
  private static validateFocusVisibility(
    violation: A11yIssue,
    focusStyles: Map<string, any>
  ): boolean {
    // Check if there's a visible outline for focus
    let hasFocusOutline = false;

    for (const [selector, style] of focusStyles.entries()) {
      if (style.outline && style.outline !== 'none' && style.outlineWidth !== '0px') {
        hasFocusOutline = true;
        break;
      }
    }

    // If focus outline exists, filter out the violation
    if (hasFocusOutline) {
      console.log('[ValidationEngine] FILTERED false positive: focus styles are visible');
      return false;
    }

    // Keep violation
    return true;
  }

  /**
   * Validate opacity doesn't hide text
   */
  private static validateOpacityIssue(
    violation: A11yIssue,
    computedStyles: Map<string, any>
  ): boolean {
    for (const [, styles] of computedStyles.entries()) {
      const validation = validateOpacity(styles.opacity);
      if (!validation.isValid) {
        // Keep violation
        return true;
      }
    }

    // Opacity is valid, filter it out
    return false;
  }

  /**
   * Check if text is "large" per WCAG (18pt+ or 14pt+ bold)
   */
  private static isLargeText(fontSize: string, fontWeight: string): boolean {
    const sizeMatch = fontSize.match(/(\d+)px/);
    if (!sizeMatch) return false;

    const size = parseInt(sizeMatch[1]);
    const weight = parseInt(fontWeight) || 400;

    // 18pt = ~24px, 14pt bold = ~18.67px
    return (size >= 24) || (size >= 18.67 && weight >= 700);
  }

  /**
   * Remove duplicate issues (same rule, same line, same file)
   */
  private static deduplicateIssues(issues: A11yIssue[]): A11yIssue[] {
    const seen = new Map<string, A11yIssue>();
    const severityRank: Record<Severity, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    for (const issue of issues) {
      const key = `${issue.file}:${issue.line}:${issue.rule}`;

      if (!seen.has(key)) {
        seen.set(key, issue);
      } else {
        const existing = seen.get(key)!;
        // Keep highest severity
        if ((severityRank[issue.severity] || 0) > (severityRank[existing.severity] || 0)) {
          seen.set(key, issue);
        }
      }
    }

    return Array.from(seen.values());
  }
}
