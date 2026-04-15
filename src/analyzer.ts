import * as vscode from 'vscode';
import * as axe from 'axe-core';
import { chromium, Browser } from 'playwright';
import { findLinkedCssFiles, resolveCssForHtml } from './cssResolver';

export interface A11yIssue {
  ruleId: string;
  wcagCriteria: string[];
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  help: string;
  helpUrl: string;
  target: string[];
  contrastData?: ContrastData;
  sourceLine?: number;
}

export interface ContrastData {
  fgColor: string;
  bgColor: string;
  contrastRatio: number;
  expectedRatio: number;
}

export class A11yAnalyzer {

  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      console.log('[css-a11y] Launching Playwright browser...');
      this.browser = await chromium.launch({ headless: true });
      console.log('[css-a11y] Browser launched.');
    }
    return this.browser;
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('[css-a11y] Browser closed.');
    }
  }

  async analyze(document: vscode.TextDocument): Promise<A11yIssue[]> {
    const config = vscode.workspace.getConfiguration('cssA11y');

    const enabledRules = config.get<string[]>('enabledRules', [
      'color-contrast',
      'color-contrast-enhanced',
      'link-in-text-block',
      'scrollable-region-focusable',
    ]);

    let htmlContent: string;
    let cssContent: string;

    if (document.languageId === 'html') {
      htmlContent = document.getText();
      cssContent = await resolveCssForHtml(document, htmlContent);
      console.log('[css-a11y] CSS resolved, length:', cssContent.length);
    } else {
      const paired = await findLinkedCssFiles(document);
      if (!paired) {
        console.log('[css-a11y] No paired HTML found for CSS file.');
        return [];
      }
      htmlContent = paired.htmlContent;
      cssContent = document.getText();
    }

    const safeRules = this.sanitizeRules(enabledRules);
    console.log('[css-a11y] Running axe with rules:', safeRules);
    return this.runAxe(htmlContent, cssContent, safeRules);
  }

  private async runAxe(
    html: string,
    css: string,
    rules: string[]
  ): Promise<A11yIssue[]> {

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      const htmlWithCss = this.injectCss(html, css);
      await page.setContent(htmlWithCss, { waitUntil: 'domcontentloaded' });
      await page.addScriptTag({ content: (axe as any).source });

      const rulesConfig = this.buildRulesConfig(rules);

      const violations: axe.Result[] = await page.evaluate((cfg) => {
        return (window as any).axe.run(document, {
          rules: cfg,
          reporter: 'v2',
        }).then((r: any) => r.violations);
      }, rulesConfig);

      console.log('[css-a11y] Raw violations:', violations.map(v => v.id));
      return this.mapViolations(violations);

    } finally {
      await page.close();
    }
  }

  private injectCss(html: string, css: string): string {
    if (!css) return html;
    const styleTag = `<style>${css}</style>`;
    if (html.includes('</head>')) {
      return html.replace('</head>', `${styleTag}</head>`);
    }
    return styleTag + html;
  }

  private sanitizeRules(rules: string[]): string[] {
    const valid = [
      'color-contrast',
      'color-contrast-enhanced',
      'link-in-text-block',
      'scrollable-region-focusable',
    ];
    return rules.filter(r => valid.includes(r));
  }

  private buildRulesConfig(
  enabledRules: string[]
): { [key: string]: { enabled: boolean } } {
  const allCssRules = [
    'color-contrast',
    'color-contrast-enhanced',
    'link-in-text-block',
    'scrollable-region-focusable',
    'region',
    'landmark-one-main',
  ];

  const config: { [key: string]: { enabled: boolean } } = {};
  allCssRules.forEach(rule => {
    if (rule === 'region') {
      config[rule] = { enabled: false };
    } else {
      config[rule] = { enabled: enabledRules.includes(rule) };
    }
  });

  return config;
}

  private mapViolations(violations: axe.Result[]): A11yIssue[] {
    const issues: A11yIssue[] = [];

    for (const v of violations) {
      for (const node of v.nodes) {
        const issue: A11yIssue = {
          ruleId: v.id,
          wcagCriteria: v.tags.filter(t => t.startsWith('wcag')),
          impact: (node.impact ?? v.impact ?? 'moderate') as A11yIssue['impact'],
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          target: node.target.map(t => t.toString()),
        };

        if (v.id === 'color-contrast' || v.id === 'color-contrast-enhanced') {
          issue.contrastData = this.extractContrastData(node);
        }

        issues.push(issue);
      }
    }

    return issues;
  }

  private extractContrastData(node: axe.NodeResult): ContrastData | undefined {
    const anyChecks = [...(node.any || []), ...(node.all || [])];

    for (const check of anyChecks) {
      if (check.id === 'color-contrast' && check.data) {
        const d = check.data as any;
        return {
          fgColor: d.fgColor ?? 'unknown',
          bgColor: d.bgColor ?? 'unknown',
          contrastRatio: d.contrastRatio ?? 0,
          expectedRatio: d.expectedContrastRatio ?? 4.5,
        };
      }
    }

    return undefined;
  }
}