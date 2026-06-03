import * as axe from 'axe-core';
import { chromium, Browser, Page } from 'playwright';
import { A11yIssue, Severity } from '../core/types';
import { EXTRACT_COMPUTED_STYLES_SCRIPT, EXTRACT_FOCUS_STYLES_SCRIPT } from '../core/computedStylesExtractor';

interface ContrastData {
  fgColor: string;
  bgColor: string;
  contrastRatio: number;
  expectedRatio: number;
}

export interface AxeEngineResult {
  violations: A11yIssue[];
  computedStyles: Map<string, any>;
  focusStyles: Map<string, any>;
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

  private static detectFrameworks(html: string): string[] {
    const frameworks: string[] = [];

    // Tailwind heuristique
    if (/(bg-|text-|flex|grid|p-\d|m-\d)/.test(html)) {
      frameworks.push('tailwind');
    }

    // Bootstrap heuristique
    if (/(container|row|col-|btn|navbar)/.test(html)) {
      frameworks.push('bootstrap');
    }

    return frameworks;
  }

  private static async injectFrameworkStyles(page: Page, html: string) {
    const frameworks = AxeEngine.detectFrameworks(html);

    if (frameworks.includes('tailwind')) {
      await page.addStyleTag({
        url: 'https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css',
      });
    }

    if (frameworks.includes('bootstrap')) {
      await page.addStyleTag({
        url: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
      });
    }
  }

  /**
   * Enhanced rendering pipeline with full DOM preparation
   * - Sets content with network idle wait
   * - Injects framework styles (Tailwind, Bootstrap)
   * - Waits for fonts and images
   * - Stabilizes rendering
   */
  private static async preparePageForAnalysis(page: Page, htmlContent: string, cssContent: string): Promise<void> {
    const htmlWithCss = AxeEngine.injectCss(htmlContent, cssContent);

    // 1. Set content with network idle wait
    await page.setContent(htmlWithCss, {
      waitUntil: 'domcontentloaded',
    });

    // 2. Emulate light color scheme for consistent rendering
    await page.emulateMedia({ colorScheme: 'light' });

    // 3. Inject framework styles to resolve Tailwind/Bootstrap
    await AxeEngine.injectFrameworkStyles(page, htmlContent);

    // 4. Wait for custom fonts to load
    try {
      await page.evaluate(() => {
        if ('fonts' in document) {
          return (document as any).fonts.ready;
        }
        return Promise.resolve();
      });
    } catch (e) {
      console.warn('[AxeEngine] Font loading check failed, continuing');
    }

    // 5. Extra stabilization for complex layouts
    await page.waitForTimeout(500);
  }

  /**
   * Extract computed styles from all elements in rendered page
   */
  private static async extractComputedStyles(page: Page): Promise<Map<string, any>> {
    const styles = await page.evaluate(EXTRACT_COMPUTED_STYLES_SCRIPT) as any[];
    const styleMap = new Map<string, any>();

    for (const style of styles) {
      styleMap.set(style.selector, style);
    }

    console.log('[AxeEngine] Extracted computed styles from', styleMap.size, 'elements');
    return styleMap;
  }

  /**
   * Extract focus styles to detect focus visibility issues
   */
  private static async extractFocusStyles(page: Page): Promise<Map<string, any>> {
    try {
      const styles = await page.evaluate(EXTRACT_FOCUS_STYLES_SCRIPT) as any[];
      const styleMap = new Map<string, any>();

      for (const style of styles) {
        styleMap.set(style.selector, style);
      }

      console.log('[AxeEngine] Extracted focus styles from', styleMap.size, 'rules');
      return styleMap;
    } catch (e) {
      console.warn('[AxeEngine] Failed to extract focus styles:', e);
      return new Map();
    }
  }

  /**
   * Run axe-core on prepared page with full analysis
   */
  public static async run(
    htmlContent: string,
    cssContent: string = '',
    enabledRules: string[] = ['link-in-text-block']
  ): Promise<A11yIssue[]> {
    const result = await AxeEngine.runWithContext(htmlContent, cssContent, enabledRules);
    return result.violations;
  }

  /**
   * Run axe-core and return full context (violations + computed styles)
   * Used by Orchestrator for validation layer
   */
  public static async runWithContext(
    htmlContent: string,
    cssContent: string = '',
    enabledRules: string[] = ['link-in-text-block']
  ): Promise<AxeEngineResult> {
    const browser = await AxeEngine.getBrowser();
    const page = await browser.newPage();

    try {
      // 1. Prepare page with full rendering pipeline
      await AxeEngine.preparePageForAnalysis(page, htmlContent, cssContent);

      // 2. Inject axe-core
      await page.addScriptTag({ content: (axe as any).source });

      // 3. Extract computed styles BEFORE running axe
      const computedStyles = await AxeEngine.extractComputedStyles(page);
      const focusStyles = await AxeEngine.extractFocusStyles(page);

      // 4. Run axe-core (structural rules only)
      const rulesConfig = AxeEngine.buildRulesConfig(enabledRules);

      const violations: axe.Result[] = await page.evaluate((cfg) => {
        return (window as any).axe.run(document, {
          rules: cfg,
          reporter: 'v2',
        }).then((r: any) => r.violations);
      }, rulesConfig);

      console.log('[AxeEngine] Raw axe violations:', violations.map(v => v.id).length);

      const mappedViolations = AxeEngine.mapViolations(violations, 'index.html');

      return {
        violations: mappedViolations,
        computedStyles,
        focusStyles,
      };

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
          rule: v.id,
        };

        // Add line/column if available
        if (node.target && node.target.length > 0) {
          const targetStr = node.target[0]?.toString();
          if (targetStr) {
            issue.message += `\n  • Selector: ${targetStr}`;
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

}