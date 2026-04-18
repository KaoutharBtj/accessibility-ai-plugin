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
 * TSEngine — AST + pattern analysis for TypeScript/JavaScript files.
 *
 * Works on both JSX files (looks for JSX nodes) and plain TS files
 * (looks for DOM API calls like createElement, setAttribute, etc.)
 */
class TSEngine {
    static async run(fileContent, filePath) {
        if (!filePath.match(/\.(ts|tsx|js|jsx)$/i)) {
            return [];
        }
        const issues = [];
        // AST analysis (TypeScript compiler)
        const astIssues = TSEngine.analyzeAST(fileContent, filePath);
        issues.push(...astIssues);
        return issues;
    }
    // ── AST Analysis ──────────────────────────────────────────────────────────
    static analyzeAST(content, filePath) {
        const issues = [];
        try {
            const isJsx = /\.(tsx|jsx)$/i.test(filePath) ||
                /<[A-Z][A-Za-z]*[\s/>]/.test(content) ||
                /<(div|span|img|button|a|input)\s/.test(content);
            const scriptKind = isJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
            const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
            TSEngine.visit(sourceFile, content, issues);
        }
        catch (err) {
            console.error('[TSEngine] AST analysis error:', err);
        }
        return issues;
    }
    static visit(node, content, issues) {
        // ── JSX checks ─────────────────────────────────────────────────
        if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
            const tag = node.tagName.getText();
            const attrs = node.attributes.properties;
            // img without alt
            if (tag === 'img') {
                if (!TSEngine.hasAttr(attrs, 'alt')) {
                    TSEngine.addIssue(issues, content, node.getStart(), {
                        id: 'jsx-img-missing-alt',
                        message: '<img> is missing an alt attribute (WCAG 1.1.1)',
                        severity: 'high',
                        rule: 'jsx-img-missing-alt',
                    });
                }
            }
            // html without lang
            if (tag === 'html' || tag === 'Html') {
                if (!TSEngine.hasAttr(attrs, 'lang')) {
                    TSEngine.addIssue(issues, content, node.getStart(), {
                        id: 'jsx-html-missing-lang',
                        message: '<html> is missing a lang attribute (WCAG 3.1.1)',
                        severity: 'high',
                        rule: 'jsx-html-missing-lang',
                    });
                }
            }
            // iframe without title
            if (tag === 'iframe') {
                if (!TSEngine.hasAttr(attrs, 'title')) {
                    TSEngine.addIssue(issues, content, node.getStart(), {
                        id: 'jsx-iframe-missing-title',
                        message: '<iframe> must have a non-empty title attribute (WCAG 4.1.2)',
                        severity: 'high',
                        rule: 'jsx-iframe-missing-title',
                    });
                }
            }
            // input/select/textarea without label association
            if (['input', 'select', 'textarea'].includes(tag)) {
                const hasLabel = TSEngine.hasAttr(attrs, 'aria-label') ||
                    TSEngine.hasAttr(attrs, 'aria-labelledby') ||
                    TSEngine.hasAttr(attrs, 'id');
                if (!hasLabel) {
                    TSEngine.addIssue(issues, content, node.getStart(), {
                        id: 'jsx-input-missing-label',
                        message: `<${tag}> needs an associated label via aria-label, aria-labelledby, or id+<label for> (WCAG 1.3.1)`,
                        severity: 'high',
                        rule: 'jsx-input-missing-label',
                    });
                }
            }
            // aria-hidden on focusable elements
            const ariaHiddenAttr = TSEngine.getAttrValue(attrs, 'aria-hidden');
            if (ariaHiddenAttr === 'true' || ariaHiddenAttr === '{true}') {
                const focusableTags = ['a', 'button', 'input', 'select', 'textarea'];
                const hasTabIndex = TSEngine.hasAttr(attrs, 'tabIndex');
                if (focusableTags.includes(tag) || hasTabIndex) {
                    TSEngine.addIssue(issues, content, node.getStart(), {
                        id: 'jsx-aria-hidden-focusable',
                        message: `aria-hidden="true" on a focusable <${tag}> creates an invisible focus trap (WCAG 4.1.2)`,
                        severity: 'critical',
                        rule: 'jsx-aria-hidden-focusable',
                    });
                }
            }
            // Positive tabIndex
            const tabIndexVal = TSEngine.getAttrValue(attrs, 'tabIndex');
            if (tabIndexVal !== null) {
                const num = parseInt(tabIndexVal.replace(/[{}'"]/g, ''), 10);
                if (!isNaN(num) && num > 0) {
                    TSEngine.addIssue(issues, content, node.getStart(), {
                        id: 'jsx-positive-tabindex',
                        message: `tabIndex=${num} is positive. Use 0 or -1 to avoid breaking tab order (WCAG 2.4.3)`,
                        severity: 'medium',
                        rule: 'jsx-positive-tabindex',
                    });
                }
            }
            // div/span with onClick but no role + tabIndex + keyboard
            if (['div', 'span', 'li', 'p', 'td'].includes(tag)) {
                if (TSEngine.hasAttr(attrs, 'onClick')) {
                    const hasRole = TSEngine.hasAttr(attrs, 'role');
                    const hasTabIdx = TSEngine.hasAttr(attrs, 'tabIndex');
                    const hasKeyboard = TSEngine.hasAttr(attrs, 'onKeyDown') ||
                        TSEngine.hasAttr(attrs, 'onKeyUp');
                    if (!hasRole || !hasTabIdx || !hasKeyboard) {
                        TSEngine.addIssue(issues, content, node.getStart(), {
                            id: 'jsx-clickable-not-accessible',
                            message: `<${tag}> has onClick but is missing role, tabIndex, or onKeyDown/onKeyUp. Non-native elements need all three for keyboard accessibility (WCAG 2.1.1)`,
                            severity: 'high',
                            rule: 'jsx-clickable-not-accessible',
                        });
                    }
                }
            }
            // Empty aria-label
            const ariaLabel = TSEngine.getAttrValue(attrs, 'aria-label');
            if (ariaLabel !== null && ariaLabel.replace(/[{}'"\s]/g, '') === '') {
                TSEngine.addIssue(issues, content, node.getStart(), {
                    id: 'jsx-empty-aria-label',
                    message: 'aria-label is empty. Provide a meaningful label or remove it (WCAG 4.1.2)',
                    severity: 'high',
                    rule: 'jsx-empty-aria-label',
                });
            }
            // video/audio without controls
            if (tag === 'video' || tag === 'audio') {
                const hasControls = TSEngine.hasAttr(attrs, 'controls');
                const hasAutoPlay = TSEngine.hasAttr(attrs, 'autoPlay') || TSEngine.hasAttr(attrs, 'autoplay');
                if (!hasControls) {
                    TSEngine.addIssue(issues, content, node.getStart(), {
                        id: 'jsx-media-no-controls',
                        message: `<${tag}> without controls attribute — users cannot pause/stop media (WCAG 2.2.2)`,
                        severity: hasAutoPlay ? 'high' : 'medium',
                        rule: 'jsx-media-no-controls',
                    });
                }
            }
        }
        // ── Call expression checks (DOM API) ───────────────────────────
        if (ts.isCallExpression(node)) {
            const expr = node.expression;
            // document.getElementById(...).focus() on non-focusable (hard to detect, but flag raw .focus() chains)
            if (ts.isPropertyAccessExpression(expr)) {
                const method = expr.name.text;
                // setAttribute('aria-hidden', 'true')
                if (method === 'setAttribute' && node.arguments.length >= 2) {
                    const arg0 = node.arguments[0].getText().replace(/['"]/g, '');
                    const arg1 = node.arguments[1].getText().replace(/['"]/g, '');
                    if (arg0 === 'aria-hidden' && arg1 === 'true') {
                        TSEngine.addIssue(issues, content, node.getStart(), {
                            id: 'dom-setAttribute-aria-hidden',
                            message: 'setAttribute("aria-hidden","true") detected. Ensure the element is not focusable (WCAG 4.1.2)',
                            severity: 'medium',
                            rule: 'dom-setAttribute-aria-hidden',
                        });
                    }
                    // setAttribute('tabindex', positive)
                    if (arg0 === 'tabindex') {
                        const num = parseInt(arg1, 10);
                        if (!isNaN(num) && num > 0) {
                            TSEngine.addIssue(issues, content, node.getStart(), {
                                id: 'dom-positive-tabindex',
                                message: `setAttribute("tabindex","${num}") — positive tabindex breaks focus order (WCAG 2.4.3)`,
                                severity: 'medium',
                                rule: 'dom-positive-tabindex',
                            });
                        }
                    }
                }
                // .innerHTML = ... (XSS + no ARIA on injected content)
                if (method === 'innerHTML' && ts.isPropertyAccessExpression(node.parent)) {
                    // covered by assignment check below
                }
            }
        }
        // ── Assignment checks ──────────────────────────────────────────
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            const left = node.left.getText();
            // el.style.outline = 'none'
            if (/\.style\.outline$/.test(left)) {
                const right = node.right.getText().replace(/['"]/g, '').trim();
                if (right === 'none' || right === '0') {
                    TSEngine.addIssue(issues, content, node.getStart(), {
                        id: 'dom-style-outline-none',
                        message: 'Removing outline via JS hides keyboard focus indicator (WCAG 2.4.7)',
                        severity: 'high',
                        rule: 'dom-style-outline-none',
                    });
                }
            }
            // el.innerHTML = ...
            if (/\.innerHTML$/.test(left)) {
                TSEngine.addIssue(issues, content, node.getStart(), {
                    id: 'dom-innerHTML-assignment',
                    message: 'innerHTML assignment detected. Injected content may lack ARIA roles/labels. Consider using textContent or a safe DOM method (WCAG 4.1.2)',
                    severity: 'low',
                    rule: 'dom-innerHTML-assignment',
                });
            }
            // el.tabIndex = positive
            if (/\.tabIndex$/.test(left)) {
                const val = parseInt(node.right.getText(), 10);
                if (!isNaN(val) && val > 0) {
                    TSEngine.addIssue(issues, content, node.getStart(), {
                        id: 'dom-tabindex-positive',
                        message: `tabIndex = ${val} — positive values break natural focus order (WCAG 2.4.3)`,
                        severity: 'medium',
                        rule: 'dom-tabindex-positive',
                    });
                }
            }
        }
        ts.forEachChild(node, child => TSEngine.visit(child, content, issues));
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    static hasAttr(props, name) {
        return props.some(p => ts.isJsxAttribute(p) && p.name.getText() === name);
    }
    static getAttrValue(props, name) {
        for (const p of props) {
            if (ts.isJsxAttribute(p) && p.name.getText() === name) {
                return p.initializer ? p.initializer.getText() : null;
            }
        }
        return null;
    }
    static addIssue(issues, content, index, partial) {
        const { line, column } = TSEngine.getLineFromIndex(content, index);
        issues.push({
            ...partial,
            file: '', // filled by orchestrator
            source: 'typescript',
            line,
            column,
        });
    }
    static getLineFromIndex(content, index) {
        const lines = content.substring(0, index).split('\n');
        return { line: lines.length, column: lines[lines.length - 1].length + 1 };
    }
}
exports.TSEngine = TSEngine;
//# sourceMappingURL=tsEngine.js.map