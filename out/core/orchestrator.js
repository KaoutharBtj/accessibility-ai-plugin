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
exports.Orchestrator = void 0;
const axeEngine_1 = require("../engines/axeEngine");
const eslintEngine_1 = require("../engines/eslintEngine");
const tsEngine_1 = require("../engines/tsEngine");
const rgaaEngine_1 = require("../engines/rgaaEngine");
const cssengine_1 = require("../engines/cssengine");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class Orchestrator {
    constructor() { }
    static getInstance() {
        if (!Orchestrator.instance) {
            Orchestrator.instance = new Orchestrator();
        }
        return Orchestrator.instance;
    }
    async run(fileContent, filePath, languageId) {
        console.log('[Orchestrator] Starting analysis for:', filePath, 'language:', languageId);
        const results = await this.runEngines(fileContent, filePath, languageId);
        const sortedResults = this.sortBySeverity(results);
        console.log('[Orchestrator] Analysis complete. Total issues:', sortedResults.length);
        return sortedResults;
    }
    async runEngines(fileContent, filePath, languageId) {
        const enginePromises = [];
        if (languageId === 'html') {
            // Collect linked CSS to inject into axe analysis
            const cssContent = this.collectLinkedCss(fileContent, filePath);
            enginePromises.push(this.runAxe(fileContent, filePath, cssContent), rgaaEngine_1.RgaaEngine.run(fileContent, filePath));
        }
        else if (languageId === 'css') {
            // ✅ CSS: dedicated CSS engine for static analysis
            enginePromises.push(cssengine_1.CSSEngine.run(fileContent, filePath));
        }
        else if (languageId === 'javascript' ||
            languageId === 'javascriptreact' ||
            languageId === 'typescript' ||
            languageId === 'typescriptreact') {
            // ✅ TS/JS: ESLint (jsx-a11y) + TSEngine (AST + DOM patterns)
            enginePromises.push(eslintEngine_1.ESLintEngine.run(fileContent, filePath), tsEngine_1.TSEngine.run(fileContent, filePath), rgaaEngine_1.RgaaEngine.run(fileContent, filePath));
        }
        const results = await Promise.all(enginePromises);
        return results.flat();
    }
    /**
     * Try to find and load CSS files linked from HTML, to give axe full context.
     */
    collectLinkedCss(htmlContent, htmlFilePath) {
        const cssBlocks = [];
        const dir = path.dirname(htmlFilePath);
        // Extract <link rel="stylesheet" href="...">
        const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
        let match;
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
            }
            catch (e) {
                console.warn('[Orchestrator] Could not load CSS:', href, e);
            }
        }
        return cssBlocks.join('\n');
    }
    async runAxe(htmlContent, filePath, cssContent = '') {
        try {
            return await axeEngine_1.AxeEngine.run(htmlContent, cssContent, [
                'color-contrast',
                'color-contrast-enhanced',
                'link-in-text-block',
                'scrollable-region-focusable',
            ]);
        }
        catch (err) {
            console.error('[Orchestrator] Axe engine error:', err);
            return [];
        }
    }
    sortBySeverity(issues) {
        const severityOrder = {
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
    async dispose() {
        await axeEngine_1.AxeEngine.dispose();
        console.log('[Orchestrator] Disposed all engine resources');
    }
}
exports.Orchestrator = Orchestrator;
Orchestrator.instance = null;
//# sourceMappingURL=orchestrator.js.map