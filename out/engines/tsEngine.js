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
exports.TSEngine = void 0;
const ts = __importStar(require("typescript"));
/**
 * TypeScript Engine - Static analysis for TypeScript accessibility patterns
 *
 * This engine performs static analysis on TypeScript/JavaScript files to detect
 * common accessibility issues that can't be caught by other tools.
 */
class TSEngine {
    /**
     * Run TypeScript static analysis on file content
     */
    static async run(fileContent, filePath) {
        // Only process TS/TSX/JS/JSX files
        if (!filePath.match(/\.(ts|tsx|js|jsx)$/i)) {
            console.log('[TSEngine] Skipping non-TS/JS file:', filePath);
            return [];
        }
        const issues = [];
        // Run pattern-based analysis
        const patternIssues = TSEngine.analyzePatterns(fileContent, filePath);
        issues.push(...patternIssues);
        // Run AST-based analysis for TypeScript files
        if (filePath.match(/\.(ts|tsx)$/i)) {
            const astIssues = TSEngine.analyzeAST(fileContent, filePath);
            issues.push(...astIssues);
        }
        return issues;
    }
    /**
     * Pattern-based analysis for common accessibility issues
     */
    static analyzePatterns(content, filePath) {
        const issues = [];
        for (const pattern of TSEngine.ACCESSIBILITY_PATTERNS) {
            let match;
            const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
            while ((match = regex.exec(content)) !== null) {
                const lineInfo = TSEngine.getLineFromIndex(content, match.index);
                const issue = {
                    id: pattern.rule,
                    message: pattern.message,
                    severity: pattern.severity,
                    file: filePath,
                    line: lineInfo.line,
                    column: lineInfo.column,
                    source: 'typescript',
                    rule: pattern.rule,
                };
                issues.push(issue);
            }
        }
        return issues;
    }
    /**
     * AST-based analysis for TypeScript files
     */
    static analyzeAST(content, filePath) {
        const issues = [];
        try {
            const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
            // Visit all nodes in the AST
            function visit(node) {
                // Check for img elements without alt prop
                if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
                    const tagName = node.getFirstToken()?.getText();
                    if (tagName === 'img') {
                        const hasAlt = TSEngine.hasJsxAttribute(node, 'alt');
                        if (!hasAlt) {
                            const pos = node.getStart();
                            const lineInfo = TSEngine.getLineFromIndex(content, pos);
                            issues.push({
                                id: 'img-missing-alt',
                                message: 'img element must have an alt attribute',
                                severity: 'high',
                                file: filePath,
                                line: lineInfo.line,
                                column: lineInfo.column,
                                source: 'typescript',
                                rule: 'img-missing-alt',
                            });
                        }
                    }
                }
                // Check for html element without lang
                if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
                    const tagName = node.getFirstToken()?.getText();
                    if (tagName === 'html' || tagName === 'Html') {
                        const hasLang = TSEngine.hasJsxAttribute(node, 'lang');
                        if (!hasLang) {
                            const pos = node.getStart();
                            const lineInfo = TSEngine.getLineFromIndex(content, pos);
                            issues.push({
                                id: 'html-missing-lang',
                                message: 'html element must have a lang attribute',
                                severity: 'high',
                                file: filePath,
                                line: lineInfo.line,
                                column: lineInfo.column,
                                source: 'typescript',
                                rule: 'html-missing-lang',
                            });
                        }
                    }
                }
                ts.forEachChild(node, visit);
            }
            visit(sourceFile);
        }
        catch (err) {
            console.error('[TSEngine] AST analysis error:', err);
        }
        return issues;
    }
    /**
     * Check if a JSX element has a specific attribute
     */
    static hasJsxAttribute(node, attrName) {
        if (ts.isJsxSelfClosingElement(node)) {
            return node.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText() === attrName);
        }
        if (ts.isJsxElement(node)) {
            return node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText() === attrName);
        }
        return false;
    }
    /**
     * Get line and column from character index
     */
    static getLineFromIndex(content, index) {
        const lines = content.substring(0, index).split('\n');
        return {
            line: lines.length,
            column: lines[lines.length - 1].length + 1,
        };
    }
}
exports.TSEngine = TSEngine;
// Common accessibility-related patterns to check
TSEngine.ACCESSIBILITY_PATTERNS = [
    {
        // Missing alt prop on img
        pattern: /<img[^>]*(?<!alt)=["'][^"']*["']/gi,
        rule: 'img-missing-alt',
        message: 'Images must have an alt prop',
        severity: 'high',
    },
    {
        // Missing lang attribute on html
        pattern: /<html[^>]*(?<!lang)=["'][^"']*["']/gi,
        rule: 'html-missing-lang',
        message: 'HTML element must have a lang attribute',
        severity: 'high',
    },
    {
        // Interactive elements without keyboard handlers
        pattern: /<(button|a|input|select|textarea)[^>]*onClick[^>]*>(?![\s\S]*onKey)/gi,
        rule: 'interactive-no-keyboard',
        message: 'Interactive elements should have keyboard event handlers',
        severity: 'medium',
    },
    {
        // Missing form label
        pattern: /<input[^>]*type=["'](?:text|email|password|search|tel|url)[^"']*["'][^>]*id=["'][^"']*["'][^>]*(?<!aria-label)(?<!aria-labelledby)(?<!aria-describedby)/gi,
        rule: 'input-missing-label',
        message: 'Form inputs should have associated labels',
        severity: 'high',
    },
];
//# sourceMappingURL=tsEngine.js.map