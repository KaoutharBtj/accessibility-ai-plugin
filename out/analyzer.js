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
exports.A11yAnalyzer = void 0;
const vscode = __importStar(require("vscode"));
const axe = __importStar(require("axe-core"));
const playwright_1 = require("playwright");
const cssResolver_1 = require("./cssResolver");
class A11yAnalyzer {
    constructor() {
        this.browser = null;
    }
    async getBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            console.log('[css-a11y] Launching Playwright browser...');
            this.browser = await playwright_1.chromium.launch({ headless: true });
            console.log('[css-a11y] Browser launched.');
        }
        return this.browser;
    }
    async dispose() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            console.log('[css-a11y] Browser closed.');
        }
    }
    async analyze(document) {
        const config = vscode.workspace.getConfiguration('cssA11y');
        const enabledRules = config.get('enabledRules', [
            'color-contrast',
            'color-contrast-enhanced',
            'link-in-text-block',
            'scrollable-region-focusable',
        ]);
        let htmlContent;
        let cssContent;
        if (document.languageId === 'html') {
            htmlContent = document.getText();
            cssContent = await (0, cssResolver_1.resolveCssForHtml)(document, htmlContent);
            console.log('[css-a11y] CSS resolved, length:', cssContent.length);
        }
        else {
            const paired = await (0, cssResolver_1.findLinkedCssFiles)(document);
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
    async runAxe(html, css, rules) {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        try {
            const htmlWithCss = this.injectCss(html, css);
            await page.setContent(htmlWithCss, { waitUntil: 'domcontentloaded' });
            await page.addScriptTag({ content: axe.source });
            const rulesConfig = this.buildRulesConfig(rules);
            const violations = await page.evaluate((cfg) => {
                return window.axe.run(document, {
                    rules: cfg,
                    reporter: 'v2',
                }).then((r) => r.violations);
            }, rulesConfig);
            console.log('[css-a11y] Raw violations:', violations.map(v => v.id));
            return this.mapViolations(violations);
        }
        finally {
            await page.close();
        }
    }
    injectCss(html, css) {
        if (!css)
            return html;
        const styleTag = `<style>${css}</style>`;
        if (html.includes('</head>')) {
            return html.replace('</head>', `${styleTag}</head>`);
        }
        return styleTag + html;
    }
    sanitizeRules(rules) {
        const valid = [
            'color-contrast',
            'color-contrast-enhanced',
            'link-in-text-block',
            'scrollable-region-focusable',
        ];
        return rules.filter(r => valid.includes(r));
    }
    buildRulesConfig(enabledRules) {
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
    mapViolations(violations) {
        const issues = [];
        for (const v of violations) {
            for (const node of v.nodes) {
                const issue = {
                    ruleId: v.id,
                    wcagCriteria: v.tags.filter(t => t.startsWith('wcag')),
                    impact: (node.impact ?? v.impact ?? 'moderate'),
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
    extractContrastData(node) {
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
exports.A11yAnalyzer = A11yAnalyzer;
//# sourceMappingURL=analyzer.js.map