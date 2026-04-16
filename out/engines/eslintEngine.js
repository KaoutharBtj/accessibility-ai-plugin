"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESLintEngine = void 0;
const eslint_1 = require("eslint");
class ESLintEngine {
    static getLinter() {
        if (!ESLintEngine.linter) {
            ESLintEngine.linter = new eslint_1.Linter();
            // Define jsx-a11y rules
            ESLintEngine.linter.defineRule('jsx-a11y/alt-text', {
                meta: {
                    type: 'problem',
                    docs: {
                        description: 'Enforce alt text for images',
                    },
                },
                create(context) {
                    return {
                        JSXElement(node) {
                            if (node.openingElement.name.name === 'img') {
                                const hasAlt = node.openingElement.attributes.some((attr) => attr.name && attr.name.name === 'alt');
                                if (!hasAlt) {
                                    context.report({
                                        node,
                                        message: 'Images must have an alt prop',
                                    });
                                }
                            }
                        },
                    };
                },
            });
        }
        return ESLintEngine.linter;
    }
    static async run(fileContent, filePath) {
        // Only process JSX/TSX files
        if (!filePath.match(/\.(jsx|tsx|js|ts)$/i)) {
            console.log('[ESLintEngine] Skipping non-JSX/TSX file:', filePath);
            return [];
        }
        try {
            const linter = ESLintEngine.getLinter();
            const results = linter.verify(fileContent, {
                parserOptions: {
                    ecmaVersion: 2020,
                    sourceType: 'module',
                    ecmaFeatures: {
                        jsx: true,
                    },
                },
                rules: {
                    'jsx-a11y/alt-text': 'warn',
                },
            }, filePath);
            return ESLintEngine.mapResults(results, filePath);
        }
        catch (err) {
            console.error('[ESLintEngine] Linting error:', err);
            return [];
        }
    }
    static mapResults(results, filePath) {
        const issues = [];
        for (const msg of results) {
            const severity = ESLintEngine.mapSeverity(msg.severity);
            const issue = {
                id: msg.ruleId || 'unknown',
                message: msg.message,
                severity,
                file: filePath,
                line: msg.line,
                column: msg.column,
                source: 'eslint',
                rule: msg.ruleId ?? undefined,
            };
            issues.push(issue);
        }
        return issues;
    }
    static mapSeverity(severity) {
        switch (severity) {
            case 2: return 'high'; // Error
            case 1: return 'medium'; // Warning
            default: return 'low';
        }
    }
}
exports.ESLintEngine = ESLintEngine;
ESLintEngine.linter = null;
//# sourceMappingURL=eslintEngine.js.map