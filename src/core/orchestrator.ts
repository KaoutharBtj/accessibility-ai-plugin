import { A11yIssue } from './types';
import { AxeEngine } from '../engines/axeEngine';
import { ESLintEngine } from '../engines/eslintEngine';
import { TSEngine } from '../engines/tsEngine';
import { RgaaEngine } from '../engines/rgaaEngine';
import { CSSEngine } from '../engines/cssengine';
import * as fs from 'fs';
import * as path from 'path';

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
    const enginePromises: Promise<A11yIssue[]>[] = [];

    if (languageId === 'html') {
      // Collect linked CSS to inject into axe analysis
      const cssContent = this.collectLinkedCss(fileContent, filePath);

      enginePromises.push(
        this.runAxe(fileContent, filePath, cssContent),
        RgaaEngine.run(fileContent, filePath)
      );

    } else if (languageId === 'css') {
      // ✅ CSS: dedicated CSS engine for static analysis
      enginePromises.push(
        CSSEngine.run(fileContent, filePath)
      );

    } else if (
      languageId === 'javascript' ||
      languageId === 'javascriptreact' ||
      languageId === 'typescript' ||
      languageId === 'typescriptreact'
    ) {
      // ✅ TS/JS: ESLint (jsx-a11y) + TSEngine (AST + DOM patterns)
      enginePromises.push(
        ESLintEngine.run(fileContent, filePath),
        TSEngine.run(fileContent, filePath),
        RgaaEngine.run(fileContent, filePath)
      );
    }

    const results = await Promise.all(enginePromises);
    return results.flat();
  }

  /**
   * Try to find and load CSS files linked from HTML, to give axe full context.
   */
  private collectLinkedCss(htmlContent: string, htmlFilePath: string): string {
    const cssBlocks: string[] = [];
    const dir = path.dirname(htmlFilePath);

    // Extract <link rel="stylesheet" href="...">
    const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(htmlContent)) !== null) {
      const href = match[1];
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
        continue; // Skip external CDN stylesheets
      }
      try {
        const cssPath = path.resolve(dir, href);
        if (fs.existsSync(cssPath)) {
          cssBlocks.push(fs.readFileSync(cssPath, 'utf8'));
          console.log('[Orchestrator] Loaded CSS:', cssPath);
        }
      } catch (e) {
        console.warn('[Orchestrator] Could not load CSS:', href, e);
      }
    }

    return cssBlocks.join('\n');
  }

  private async runAxe(
    htmlContent: string,
    filePath: string,
    cssContent: string = ''
  ): Promise<A11yIssue[]> {
    try {
      return await AxeEngine.run(htmlContent, cssContent, [
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
      const orderA = severityOrder[a.severity] || 0;
      const orderB = severityOrder[b.severity] || 0;
      return orderB - orderA;
    });
  }

  public async dispose(): Promise<void> {
    await AxeEngine.dispose();
    console.log('[Orchestrator] Disposed all engine resources');
  }
}