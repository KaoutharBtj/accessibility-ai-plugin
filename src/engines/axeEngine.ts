import * as axe from 'axe-core';
import { chromium, Browser, Page } from 'playwright';
import { A11yIssue, Severity } from '../core/types';

interface ContrastData {
  fgColor: string;
  bgColor: string;
  contrastRatio: number;
  expectedRatio: number;
}

export class AxeEngine {
  private static browser: Browser | null = null;

  private static async getBrowser(): Promise<Browser> {
    if (!AxeEngine.browser || !AxeEngine.browser.isConnected()) {
      console.log('[AxeEngine] Launching Playwright browser...');
      AxeEngine.browser = await chromium.launch({ headless: true });
      console.log('[AxeEngine] Browser launched.');
    }
    return AxeEngine.browser;
  }

  public static async dispose(): Promise<void> {
    if (AxeEngine.browser) {
      await AxeEngine.browser.close();
      AxeEngine.browser = null;
      console.log('[AxeEngine] Browser closed.');
    }
  }

  /**
   * Run axe-core accessibility analysis on HTML content
   */
  public static async run(
    htmlContent: string,
    cssContent: string = '',
    enabledRules: string[] = ['color-contrast', 'color-contrast-enhanced', 'link-in-text-block']
  ): Promise<A11yIssue[]> {
    const browser = await AxeEngine.getBrowser();
    const page = await browser.newPage();

    try {
      const htmlWithCss = AxeEngine.injectCss(htmlContent, cssContent);
      await page.setContent(htmlWithCss, { waitUntil: 'domcontentloaded' });
      await page.addScriptTag({ content: (axe as any).source });

      const rulesConfig = AxeEngine.buildRulesConfig(enabledRules);

      const violations: axe.Result[] = await page.evaluate((cfg) => {
        return (window as any).axe.run(document, {
          rules: cfg,
          reporter: 'v2',
        }).then((r: any) => r.violations);
      }, rulesConfig);

      console.log('[AxeEngine] Raw violations:', violations.map(v => v.id));
      return AxeEngine.mapViolations(violations, 'index.html');

    } finally {
      await page.close();
    }
  }

  private static injectCss(html: string, css: string): string {
    if (!css) return html;
    const styleTag = `<style>${css}</style>`;
    if (html.includes('</head>')) {
      return html.replace('</head>', `${styleTag}</head>`);
    }
    return styleTag + html;
  }

  private static buildRulesConfig(
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

  private static mapViolations(violations: axe.Result[], file: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    for (const v of violations) {
      for (const node of v.nodes) {
        const severity = AxeEngine.mapImpactToSeverity(node.impact ?? v.impact ?? 'moderate');
        
        const issue: A11yIssue = {
          id: v.id,
          message: AxeEngine.buildMessage(v, node),
          severity,
          file,
          source: 'axe',
          rule: v.id,
        };

        // Add line/column if available
        if (node.target && node.target.length > 0) {
          const targetStr = node.target[0]?.toString();
          if (targetStr) {
            issue.message += `\n  • Selector: ${targetStr}`;
          }
        }

        // Add contrast data if applicable
        if (v.id === 'color-contrast' || v.id === 'color-contrast-enhanced') {
          const contrastData = AxeEngine.extractContrastData(node);
          if (contrastData) {
            issue.message += `\n  • Contrast: ${contrastData.contrastRatio.toFixed(2)}:1 (required ≥ ${contrastData.expectedRatio}:1)`;
            issue.message += `\n  • FG: ${contrastData.fgColor} | BG: ${contrastData.bgColor}`;
          }
        }

        issues.push(issue);
      }
    }

    return issues;
  }

  private static mapImpactToSeverity(impact: string): Severity {
    switch (impact) {
      case 'critical': return 'critical';
      case 'serious': return 'high';
      case 'moderate': return 'medium';
      case 'minor': return 'low';
      default: return 'medium';
    }
  }

  private static buildMessage(v: axe.Result, node: axe.NodeResult): string {
    const wcag = v.tags.filter(t => t.startsWith('wcag')).join(', ') || 'best-practice';
    return `[${(node.impact ?? v.impact ?? 'moderate').toUpperCase()}] ${v.help} (${wcag})`;
  }

  private static extractContrastData(node: axe.NodeResult): ContrastData | undefined {
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