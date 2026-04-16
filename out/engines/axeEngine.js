"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AxeEngine = void 0;
const axe = __importStar(require("axe-core"));
const playwright_1 = require("playwright");
class AxeEngine {
    static async getBrowser() {
        if (!AxeEngine.browser || !AxeEngine.browser.isConnected()) {
            console.log('[AxeEngine] Launching Playwright browser...');
            AxeEngine.browser = await playwright_1.chromium.launch({ headless: true });
            console.log('[AxeEngine] Browser launched.');
        }
        return AxeEngine.browser;
    }
    static async dispose() {
        if (AxeEngine.browser) {
            await AxeEngine.browser.close();
            AxeEngine.browser = null;
            console.log('[AxeEngine] Browser closed.');
        }
    }
    /**
     * Run axe-core accessibility analysis on HTML content
     */
    static async run(htmlContent, cssContent = '', enabledRules = ['color-contrast', 'color-contrast-enhanced', 'link-in-text-block']) {
        const browser = await AxeEngine.getBrowser();
        const page = await browser.newPage();
        try {
            const htmlWithCss = AxeEngine.injectCss(htmlContent, cssContent);
            await page.setContent(htmlWithCss, { waitUntil: 'domcontentloaded' });
            await page.addScriptTag({ content: axe.source });
            const rulesConfig = AxeEngine.buildRulesConfig(enabledRules);
            const violations = await page.evaluate((cfg) => {
                return window.axe.run(document, {
                    rules: cfg,
                    reporter: 'v2',
                }).then((r) => r.violations);
            }, rulesConfig);
            console.log('[AxeEngine] Raw violations:', violations.map(v => v.id));
            return AxeEngine.mapViolations(violations, 'index.html');
        }
        finally {
            await page.close();
        }
    }
    static injectCss(html, css) {
        if (!css)
            return html;
        const styleTag = `<style>${css}</style>`;
        if (html.includes('</head>')) {
            return html.replace('</head>', `${styleTag}</head>`);
        }
        return styleTag + html;
    }
    static buildRulesConfig(enabledRules) {
        const allCssRules = [
            'color-contrast',
            'color-contrast-enhanced',
            'link-in-text-block',
            'scrollable-region-focusable',
            'region',
            'landmark-one-main',
        ];
        const config = {};
        allCssRules.forEach(rule => {
            if (rule === 'region') {
                config[rule] = { enabled: false };
            }
            else {
                config[rule] = { enabled: enabledRules.includes(rule) };
            }
        });
        return config;
    }
    static mapViolations(violations, file) {
        const issues = [];
        for (const v of violations) {
            for (const node of v.nodes) {
                const severity = AxeEngine.mapImpactToSeverity(node.impact ?? v.impact ?? 'moderate');
                const issue = {
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
    static mapImpactToSeverity(impact) {
        switch (impact) {
            case 'critical': return 'critical';
            case 'serious': return 'high';
            case 'moderate': return 'medium';
            case 'minor': return 'low';
            default: return 'medium';
        }
    }
    static buildMessage(v, node) {
        const wcag = v.tags.filter(t => t.startsWith('wcag')).join(', ') || 'best-practice';
        return `[${(node.impact ?? v.impact ?? 'moderate').toUpperCase()}] ${v.help} (${wcag})`;
    }
    static extractContrastData(node) {
        const anyChecks = [...(node.any || []), ...(node.all || [])];
        for (const check of anyChecks) {
            if (check.id === 'color-contrast' && check.data) {
                const d = check.data;
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
exports.AxeEngine = AxeEngine;
AxeEngine.browser = null;
//# sourceMappingURL=axeEngine.js.map