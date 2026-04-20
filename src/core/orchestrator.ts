import { A11yIssue } from './types';
import { AxeEngine } from '../engines/axeEngine';
import { ESLintEngine } from '../engines/eslintEngine';
import { TSEngine } from '../engines/tsEngine';
import { RgaaEngine } from '../engines/rgaaEngine';
import { DeduplicationEngine, MergedIssue } from './deduplicationEngine';


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
    fileContent: string,
    filePath: string,
    languageId: string
  ): Promise<MergedIssue[]> {
    console.log('[Orchestrator] Starting analysis for:', filePath, 'language:', languageId);

    // 1. Collecter toutes les issues brutes de tous les engines
    const rawIssues = await this.runEngines(fileContent, filePath, languageId);
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
    fileContent: string,
    filePath: string,
    languageId: string
  ): Promise<A11yIssue[]> {
    const enginePromises: { name: string; promise: Promise<A11yIssue[]> }[] = [];

    if (languageId === 'html') {
      enginePromises.push(
        { name: 'AxeEngine',  promise: this.runAxe(fileContent, filePath) },
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

  private async runAxe(htmlContent: string, filePath: string): Promise<A11yIssue[]> {
    try {
      return await AxeEngine.run(htmlContent, '', [
        'color-contrast',
        'color-contrast-enhanced',
        'link-in-text-block',
        'scrollable-region-focusable',
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