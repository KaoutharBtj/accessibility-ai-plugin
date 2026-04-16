"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Orchestrator = void 0;
const axeEngine_1 = require("../engines/axeEngine");
const eslintEngine_1 = require("../engines/eslintEngine");
const tsEngine_1 = require("../engines/tsEngine");
const rgaaEngine_1 = require("../engines/rgaaEngine");
/**
 * Orchestrator - Central brain that coordinates all analysis engines
 *
 * This class implements the orchestrator pattern to unify multiple
 * accessibility analysis engines (axe-core, ESLint jsx-a11y, TypeScript rules)
 * and normalize their results into a single format for VSCode diagnostics.
 */
class Orchestrator {
    constructor() { }
    static getInstance() {
        if (!Orchestrator.instance) {
            Orchestrator.instance = new Orchestrator();
        }
        return Orchestrator.instance;
    }
    /**
     * Run all accessibility engines on the given file content
     *
     * @param fileContent - The content of the file to analyze
     * @param filePath - The path to the file being analyzed
     * @param languageId - The VSCode language ID (html, css, javascript, etc.)
     * @returns Promise<A11yIssue[]> - Array of unified accessibility issues
     */
    async run(fileContent, filePath, languageId) {
        console.log('[Orchestrator] Starting analysis for:', filePath, 'language:', languageId);
        const results = await this.runEngines(fileContent, filePath, languageId);
        // Sort by severity (critical first)
        const sortedResults = this.sortBySeverity(results);
        console.log('[Orchestrator] Analysis complete. Total issues:', sortedResults.length);
        return sortedResults;
    }
    /**
     * Run all enabled engines in parallel
     */
    async runEngines(fileContent, filePath, languageId) {
        const enginePromises = [];
        // Determine which engines to run based on file type
        if (languageId === 'html') {
            // HTML files: run axe + RGAA for accessibility
            enginePromises.push(this.runAxe(fileContent, filePath), rgaaEngine_1.RgaaEngine.run(fileContent, filePath));
        }
        else if (languageId === 'css') {
            // CSS files: run axe (needs HTML context)
            // For now, return empty - CSS analysis requires HTML context
            console.log('[Orchestrator] CSS analysis requires HTML context');
        }
        else if (languageId === 'javascript' || languageId === 'javascriptreact') {
            // JS/JSX files: run ESLint, TS engine, and RGAA
            enginePromises.push(eslintEngine_1.ESLintEngine.run(fileContent, filePath), tsEngine_1.TSEngine.run(fileContent, filePath), rgaaEngine_1.RgaaEngine.run(fileContent, filePath));
        }
        else if (languageId === 'typescript' || languageId === 'typescriptreact') {
            // TS/TSX files: run ESLint, TS engine, and RGAA
            enginePromises.push(eslintEngine_1.ESLintEngine.run(fileContent, filePath), tsEngine_1.TSEngine.run(fileContent, filePath), rgaaEngine_1.RgaaEngine.run(fileContent, filePath));
        }
        // Run all engines in parallel
        const results = await Promise.all(enginePromises);
        // Flatten and merge results
        return results.flat();
    }
    /**
     * Run Axe engine for HTML content
     */
    async runAxe(htmlContent, filePath) {
        try {
            return await axeEngine_1.AxeEngine.run(htmlContent, '', [
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
    /**
     * Sort issues by severity (critical > high > medium > low)
     */
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
    /**
     * Clean up resources (browser, etc.)
     */
    async dispose() {
        await axeEngine_1.AxeEngine.dispose();
        console.log('[Orchestrator] Disposed all engine resources');
    }
}
exports.Orchestrator = Orchestrator;
Orchestrator.instance = null;
//# sourceMappingURL=orchestrator.js.map