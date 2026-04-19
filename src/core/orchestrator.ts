import { A11yIssue } from './types';
import { AxeEngine } from '../engines/axeEngine';
import { ESLintEngine } from '../engines/eslintEngine';
import { TSEngine } from '../engines/tsEngine';
import { RgaaEngine } from '../engines/rgaaEngine';

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
  ): Promise<A11yIssue[]> {
    console.log('[Orchestrator] Starting analysis for:', filePath, 'language:', languageId);

    const results = await this.runEngines(fileContent, filePath, languageId);
    const sortedResults = this.sortBySeverity(results);

    console.log('[Orchestrator] Analysis complete. Total issues:', sortedResults.length);
    return sortedResults;
  }

  private async runEngines(
    fileContent: string,
    filePath: string,
    languageId: string
  ): Promise<A11yIssue[]> {
    const enginePromises: { name: string; promise: Promise<A11yIssue[]> }[] = [];

    if (languageId === 'html') {
      enginePromises.push(
        { name: 'AxeEngine', promise: this.runAxe(fileContent, filePath) },
        { name: 'RgaaEngine', promise: RgaaEngine.run(fileContent, filePath) }
      );
    } else if (languageId === 'css') {
        enginePromises.push(
          { name: 'RgaaEngine', promise: RgaaEngine.runCss(fileContent, filePath) }
        );
    } else if (['javascript', 'javascriptreact', 'typescript', 'typescriptreact'].includes(languageId)) {
      enginePromises.push(
        { name: 'ESLintEngine', promise: ESLintEngine.run(fileContent, filePath) },
        { name: 'TSEngine', promise: TSEngine.run(fileContent, filePath) },
        { name: 'RgaaEngine', promise: RgaaEngine.run(fileContent, filePath) }
      );
    }

    // Promise.allSettled — un crash n'arrête pas les autres engines
    const results = await Promise.allSettled(enginePromises.map(e => e.promise));

    results.forEach((result, index) => {
      const name = enginePromises[index].name;
      if (result.status === 'rejected') {
        console.error(`[Orchestrator] ${name} CRASHED:`, result.reason);
      } else {
        console.log(`[Orchestrator] ${name} found:`, result.value.length, 'issues');
      }
    });

    return results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => (r as PromiseFulfilledResult<A11yIssue[]>).value);
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

  private sortBySeverity(issues: A11yIssue[]): A11yIssue[] {
    const severityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    return [...issues].sort((a, b) => {
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });
  }

  public async dispose(): Promise<void> {
    await AxeEngine.dispose();
    console.log('[Orchestrator] Disposed all engine resources');
  }
}