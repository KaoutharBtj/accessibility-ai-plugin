import * as vscode from 'vscode';
import { A11yIssue } from './types';
import { AxeEngine, AxeEngineResult } from '../engines/axeEngine';
import { ESLintEngine } from '../engines/eslintEngine';
import { TSEngine } from '../engines/tsEngine';
import { RgaaEngine } from '../engines/rgaaEngine';
import { DeduplicationEngine, MergedIssue } from './deduplicationEngine';
import { ValidationEngine, ValidationContext } from './validationEngine';
import { resolveCssForHtml } from '../cssResolver';


function globalDeduplication(issues: A11yIssue[]): A11yIssue[] {
  const RULE_GROUPS: Record<string, string> = {
    // Images
    'rgaa-1.1': 'img-alt', 'rgaa-1.2': 'img-alt',
    'image-alt': 'img-alt', 'img-missing-alt': 'img-alt',
    'jsx-a11y/alt-text': 'img-alt',
    // Labels
    'rgaa-11.1': 'input-label', 'input-missing-label': 'input-label',
    'jsx-a11y/input-missing-label': 'input-label', 'label': 'input-label',
    // Clavier
    'rgaa-7.3': 'keyboard', 'interactive-no-keyboard': 'keyboard',
    'jsx-a11y/interactive-no-keyboard': 'keyboard',
    'wcag-2.1.1-mouse-enter': 'keyboard', 'wcag-2.1.1-mouse-leave': 'keyboard',
    // iframe
    'rgaa-2.1': 'iframe-title', 'iframe-missing-title': 'iframe-title',
    // Lang
    'rgaa-8.3': 'html-lang', 'html-missing-lang': 'html-lang',
    // Bouton
    'rgaa-11.9': 'button-type', 'wcag-4.1.2-button-type': 'button-type',
    'jsx-a11y/button-has-type': 'button-type',
    // Contraste
    'css-color-contrast': 'color-contrast', 'color-contrast': 'color-contrast',
    // Focus
    'css-outline-none': 'focus-visible', 'css-hover-without-focus': 'focus-visible',
    // Animation
    'css-infinite-animation': 'animation',
    // Font
    'css-font-size-too-small': 'font-size', 'css-font-too-small': 'font-size',
  };

  const severityOrder: Record<string, number> = {
    critical: 4, high: 3, medium: 2, low: 1,
  };

  const seen = new Map<string, A11yIssue>();

  for (const issue of issues) {
    const group      = RULE_GROUPS[issue.rule || issue.id] || (issue.rule || issue.id);
    const roundedLine = Math.floor((issue.line ?? 0) / 2) * 2;
    const key         = `${issue.file}:${roundedLine}:${group}`;

    if (!seen.has(key)) {
      seen.set(key, { ...issue });
    } else {
      const existing = seen.get(key)!;
      if ((severityOrder[issue.severity] || 0) > (severityOrder[existing.severity] || 0)) {
        existing.severity = issue.severity;
      }
    }
  }

  return Array.from(seen.values());
}


export class Orchestrator {
  private static instance: Orchestrator | null = null;

  private constructor() {}

  public static getInstance(): Orchestrator {
    if (!Orchestrator.instance) {
      Orchestrator.instance = new Orchestrator();
    }
    return Orchestrator.instance;
  }

  public async run(
    document: vscode.TextDocument
  ): Promise<MergedIssue[]> {
    const fileContent = document.getText();
    const filePath = document.fileName;
    const languageId = document.languageId;

    console.log('[Orchestrator] Starting analysis for:', filePath, 'language:', languageId);

    // 1. Collecter toutes les issues brutes de tous les engines
    const rawIssues = await this.runEngines(document, fileContent, filePath, languageId);
    console.log('[Orchestrator] Raw issues before dedup:', rawIssues.length);

    // 2. Dédupliquer et merger intelligemment
    const mergedIssues = DeduplicationEngine.mergeIssues(rawIssues);
    console.log('[Orchestrator] Merged issues after dedup:', mergedIssues.length);

    // 3. Logger les doublons supprimés
    const duplicatesRemoved = rawIssues.length - mergedIssues.length;
    if (duplicatesRemoved > 0) {
      console.log(`[Orchestrator] Removed ${duplicatesRemoved} duplicates`);
    }

    return mergedIssues;
  }

 private async runEngines(
    document: vscode.TextDocument,
    fileContent: string,
    filePath: string,
    languageId: string
  ): Promise<A11yIssue[]> {
    const enginePromises: { name: string; promise: Promise<A11yIssue[]> }[] = [];
    let axeResult: AxeEngineResult | null = null;

    if (languageId === 'html') {
      // For HTML, use enhanced AxeEngine with validation layer
      try {
        axeResult = await this.runAxeWithContext(document, fileContent, filePath);
      } catch (err) {
        console.error('[Orchestrator] Axe engine with validation failed:', err);
      }

      // Fallback to RGAA if Axe fails
      enginePromises.push(
        { name: 'RgaaEngine', promise: RgaaEngine.run(fileContent, filePath) }
      );
    } else if (languageId === 'css') {
      enginePromises.push(
        { name: 'RgaaEngine', promise: RgaaEngine.runCss(fileContent, filePath) }
      );
    } else if (['javascript', 'javascriptreact', 'typescript', 'typescriptreact'].includes(languageId)) {
      enginePromises.push(
        { name: 'ESLintEngine', promise: ESLintEngine.run(fileContent, filePath) },
        { name: 'TSEngine',     promise: TSEngine.run(fileContent, filePath) },
        { name: 'RgaaEngine',   promise: RgaaEngine.run(fileContent, filePath) }
      );
    }

    const results = await Promise.allSettled(enginePromises.map(e => e.promise));

    results.forEach((result, index) => {
      const name = enginePromises[index].name;
      if (result.status === 'rejected') {
        console.error(`[Orchestrator] ${name} CRASHED:`, result.reason);
      } else {
        console.log(`[Orchestrator] ${name} found:`, result.value.length, 'issues');
      }
    });

    const allIssues = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => (r as PromiseFulfilledResult<A11yIssue[]>).value);

    return globalDeduplication(allIssues);
  }

  /**
   * Run Axe with validation layer to filter false positives
   */
  private async runAxeWithContext(
    document: vscode.TextDocument,
    htmlContent: string,
    filePath: string
  ): Promise<AxeEngineResult> {
    try {
      const cssContent = await resolveCssForHtml(document, htmlContent);

      // Run axe-core with full context (computed styles, focus styles)
      const axeResult = await AxeEngine.runWithContext(htmlContent, cssContent, [
        'link-in-text-block',
        'scrollable-region-focusable',
        'region',
        'landmark-one-main',
      ]);

      console.log('[Orchestrator] Raw axe violations:', axeResult.violations.length);
      console.log('[Orchestrator] Computed styles available:', axeResult.computedStyles.size);

      // Create validation context
      const validationContext: ValidationContext = {
        computedStyles: axeResult.computedStyles,
        axeViolations: axeResult.violations,
        otherViolations: [], // Add other violations if needed
        focusStyles: axeResult.focusStyles,
      };

      // Validate and filter false positives
      const validatedViolations = ValidationEngine.validate(validationContext);
      console.log('[Orchestrator] Violations after validation:', validatedViolations.length);

      return {
        ...axeResult,
        violations: validatedViolations,
      };
    } catch (err) {
      console.error('[Orchestrator] Axe validation failed:', err);
      throw err;
    }
  }

  private async runAxe(
    document: vscode.TextDocument,
    htmlContent: string,
    filePath: string
  ): Promise<A11yIssue[]> {
    try {
      const cssContent = await resolveCssForHtml(document, htmlContent);
      return await AxeEngine.run(htmlContent, cssContent, [
        'link-in-text-block',
        'scrollable-region-focusable',
        'region',
        'landmark-one-main',
      ]);
    } catch (err) {
      console.error('[Orchestrator] Axe engine error:', err);
      return [];
    }
  }

  public async dispose(): Promise<void> {
    await AxeEngine.dispose();
    console.log('[Orchestrator] Disposed all engine resources');
  }
}