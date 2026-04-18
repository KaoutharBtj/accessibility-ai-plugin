"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESLintEngine = void 0;
const eslint_1 = require("eslint");
/**
 * ESLintEngine — runs eslint-plugin-jsx-a11y rules on JS/TS/JSX/TSX files.
 *
 * For pure .ts/.js files (no JSX), we fall back to DOM-pattern checks
 * since jsx-a11y only fires on JSX syntax.
 */
class ESLintEngine {
    static getLinter() {
        if (!ESLintEngine.linter) {
            ESLintEngine.linter = new eslint_1.Linter({ configType: 'flat' });
        }
        return ESLintEngine.linter;
    }
    static async run(fileContent, filePath) {
        if (!filePath.match(/\.(jsx|tsx|js|ts)$/i)) {
            return [];
        }
        const isJsx = filePath.match(/\.(jsx|tsx)$/i) !== null ||
            fileContent.includes('React') ||
            /<[A-Z][A-Za-z]*[\s/>]/.test(fileContent) ||
            /<(div|span|img|button|a|input|form|nav|main|header|footer)\s/.test(fileContent);
        const issues = [];
        if (isJsx) {
            const jsxIssues = ESLintEngine.runJsxRules(fileContent, filePath);
            issues.push(...jsxIssues);
        }
        // Always run DOM pattern checks (works on all TS/JS files)
        const domIssues = ESLintEngine.runDomPatterns(fileContent, filePath);
        issues.push(...domIssues);
        return issues;
    }
    // ── JSX Rules via ESLint Linter ────────────────────────────────────────────
    static runJsxRules(fileContent, filePath) {
        try {
            const linter = ESLintEngine.getLinter();
            // We manually define the rules that matter most from jsx-a11y
            // (the full plugin import doesn't work well in extension context)
            linter.defineRule('a11y/img-alt', {
                meta: { type: 'problem', docs: { description: 'img must have alt' } },
                create(ctx) {
                    return {
                        JSXOpeningElement(node) {
                            if (node.name.name !== 'img')
                                return;
                            const hasAlt = node.attributes.some((a) => a.type === 'JSXAttribute' && a.name?.name === 'alt');
                            if (!hasAlt)
                                ctx.report({ node, message: 'img elements must have an alt attribute (WCAG 1.1.1)' });
                        },
                    };
                },
            });
            linter.defineRule('a11y/button-label', {
                meta: { type: 'problem', docs: { description: 'button must have label' } },
                create(ctx) {
                    return {
                        JSXElement(node) {
                            const opening = node.openingElement;
                            if (opening.name.name !== 'button')
                                return;
                            const hasAriaLabel = opening.attributes.some((a) => a.name?.name === 'aria-label' || a.name?.name === 'aria-labelledby');
                            const hasChildren = node.children.some((c) => (c.type === 'JSXText' && c.value.trim()) || c.type === 'JSXElement');
                            if (!hasAriaLabel && !hasChildren) {
                                ctx.report({ node, message: 'button elements must have a label (WCAG 4.1.2)' });
                            }
                        },
                    };
                },
            });
            linter.defineRule('a11y/anchor-label', {
                meta: { type: 'problem', docs: { description: 'anchor must have label' } },
                create(ctx) {
                    return {
                        JSXElement(node) {
                            const opening = node.openingElement;
                            if (opening.name.name !== 'a')
                                return;
                            const hasAriaLabel = opening.attributes.some((a) => a.name?.name === 'aria-label' || a.name?.name === 'aria-labelledby');
                            const hasChildren = node.children.some((c) => (c.type === 'JSXText' && c.value.trim()) || c.type === 'JSXElement');
                            if (!hasAriaLabel && !hasChildren) {
                                ctx.report({ node, message: 'anchor elements must have label text (WCAG 2.4.4)' });
                            }
                        },
                    };
                },
            });
            linter.defineRule('a11y/input-label', {
                meta: { type: 'problem', docs: { description: 'input must have label' } },
                create(ctx) {
                    return {
                        JSXOpeningElement(node) {
                            const name = node.name.name;
                            if (!['input', 'select', 'textarea'].includes(name))
                                return;
                            const hasLabel = node.attributes.some((a) => a.name?.name === 'aria-label' ||
                                a.name?.name === 'aria-labelledby' ||
                                a.name?.name === 'id');
                            if (!hasLabel) {
                                ctx.report({ node, message: `${name} must have an associated label (WCAG 1.3.1)` });
                            }
                        },
                    };
                },
            });
            linter.defineRule('a11y/interactive-keyboard', {
                meta: { type: 'suggestion', docs: { description: 'interactive elements must support keyboard' } },
                create(ctx) {
                    return {
                        JSXOpeningElement(node) {
                            const hasOnClick = node.attributes.some((a) => a.name?.name === 'onClick');
                            if (!hasOnClick)
                                return;
                            const tag = node.name.name;
                            // Non-native-interactive elements with onClick need keyboard support
                            if (['div', 'span', 'li', 'td', 'p'].includes(tag)) {
                                const hasKeyboard = node.attributes.some((a) => a.name?.name === 'onKeyDown' || a.name?.name === 'onKeyUp' || a.name?.name === 'onKeyPress');
                                const hasRole = node.attributes.some((a) => a.name?.name === 'role');
                                const hasTabIndex = node.attributes.some((a) => a.name?.name === 'tabIndex');
                                if (!hasKeyboard || !hasRole || !hasTabIndex) {
                                    ctx.report({
                                        node,
                                        message: `<${tag}> with onClick must also have onKeyDown/onKeyUp, role, and tabIndex (WCAG 2.1.1)`,
                                    });
                                }
                            }
                        },
                    };
                },
            });
            linter.defineRule('a11y/no-positive-tabindex', {
                meta: { type: 'suggestion', docs: { description: 'avoid positive tabIndex' } },
                create(ctx) {
                    return {
                        JSXAttribute(node) {
                            if (node.name?.name !== 'tabIndex')
                                return;
                            const val = node.value;
                            const num = val?.type === 'Literal' ? Number(val.value) :
                                val?.expression?.type === 'Literal' ? Number(val.expression.value) : NaN;
                            if (!isNaN(num) && num > 0) {
                                ctx.report({ node, message: `Avoid positive tabIndex (${num}). Use 0 or -1. (WCAG 2.4.3)` });
                            }
                        },
                    };
                },
            });
            linter.defineRule('a11y/aria-hidden-focusable', {
                meta: { type: 'problem', docs: { description: 'aria-hidden must not be on focusable elements' } },
                create(ctx) {
                    return {
                        JSXOpeningElement(node) {
                            const isHidden = node.attributes.some((a) => a.name?.name === 'aria-hidden' &&
                                (a.value?.value === true || a.value?.value === 'true' || a.value?.expression?.value === true));
                            if (!isHidden)
                                return;
                            const tag = node.name.name;
                            const isFocusable = ['a', 'button', 'input', 'select', 'textarea'].includes(tag) ||
                                node.attributes.some((a) => a.name?.name === 'tabIndex');
                            if (isFocusable) {
                                ctx.report({ node, message: 'aria-hidden must not be applied to focusable elements (WCAG 4.1.2)' });
                            }
                        },
                    };
                },
            });
            linter.defineRule('a11y/html-lang', {
                meta: { type: 'problem', docs: { description: 'html must have lang' } },
                create(ctx) {
                    return {
                        JSXOpeningElement(node) {
                            if (node.name.name !== 'html' && node.name.name !== 'Html')
                                return;
                            const hasLang = node.attributes.some((a) => a.name?.name === 'lang');
                            if (!hasLang) {
                                ctx.report({ node, message: 'html element must have a lang attribute (WCAG 3.1.1)' });
                            }
                        },
                    };
                },
            });
            linter.defineRule('a11y/iframe-title', {
                meta: { type: 'problem', docs: { description: 'iframe must have title' } },
                create(ctx) {
                    return {
                        JSXOpeningElement(node) {
                            if (node.name.name !== 'iframe')
                                return;
                            const hasTitle = node.attributes.some((a) => a.name?.name === 'title' && a.value?.value?.trim());
                            if (!hasTitle) {
                                ctx.report({ node, message: 'iframe must have a non-empty title attribute (WCAG 4.1.2)' });
                            }
                        },
                    };
                },
            });
            const results = linter.verify(fileContent, {
                plugins: {},
                languageOptions: {
                    ecmaVersion: 2022,
                    sourceType: 'module',
                    parserOptions: { ecmaFeatures: { jsx: true } },
                },
                rules: {
                    'a11y/img-alt': 'error',
                    'a11y/button-label': 'error',
                    'a11y/anchor-label': 'error',
                    'a11y/input-label': 'warn',
                    'a11y/interactive-keyboard': 'warn',
                    'a11y/no-positive-tabindex': 'warn',
                    'a11y/aria-hidden-focusable': 'error',
                    'a11y/html-lang': 'error',
                    'a11y/iframe-title': 'error',
                },
            });
            return ESLintEngine.mapResults(results, filePath);
        }
        catch (err) {
            console.error('[ESLintEngine] JSX linting error:', err);
            return [];
        }
    }
    static runDomPatterns(content, filePath) {
        const issues = [];
        for (const pattern of ESLintEngine.DOM_PATTERNS) {
            const re = new RegExp(pattern.re.source, pattern.re.flags);
            let m;
            while ((m = re.exec(content)) !== null) {
                const lineInfo = ESLintEngine.getLineFromIndex(content, m.index);
                issues.push({
                    id: pattern.id,
                    message: pattern.message,
                    severity: pattern.severity,
                    file: filePath,
                    line: lineInfo.line,
                    column: lineInfo.column,
                    source: 'eslint',
                    rule: pattern.id,
                });
            }
        }
        return issues;
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    static mapResults(results, filePath) {
        return results.map(msg => ({
            id: msg.ruleId || 'unknown',
            message: msg.message,
            severity: msg.severity === 2 ? 'high' : 'medium',
            file: filePath,
            line: msg.line,
            column: msg.column,
            source: 'eslint',
            rule: msg.ruleId ?? undefined,
        }));
    }
    static getLineFromIndex(content, index) {
        const lines = content.substring(0, index).split('\n');
        return { line: lines.length, column: lines[lines.length - 1].length + 1 };
    }
}
exports.ESLintEngine = ESLintEngine;
ESLintEngine.linter = null;
// ── DOM Pattern Checks (vanilla TS/JS) ────────────────────────────────────
ESLintEngine.DOM_PATTERNS = [
    {
        id: 'dom-outline-none',
        re: /\.style\.outline\s*=\s*['"]none['"]/g,
        message: 'Setting style.outline=none removes focus indicator (WCAG 2.4.7)',
        severity: 'high',
    },
    {
        id: 'dom-aria-hidden-focus',
        re: /setAttribute\s*\(\s*['"]aria-hidden['"]\s*,\s*['"]true['"]\s*\)/g,
        message: 'setAttribute("aria-hidden","true") may hide focusable elements from screen readers (WCAG 4.1.2). Verify element is not focusable.',
        severity: 'medium',
    },
    {
        id: 'dom-missing-alt-dynamic',
        re: /createElement\s*\(\s*['"]img['"]\s*\)(?![^;]*\.alt\s*=)/g,
        message: 'createElement("img") without setting .alt — dynamic images must have alt text (WCAG 1.1.1)',
        severity: 'high',
    },
    {
        id: 'dom-live-region-missing',
        re: /\.textContent\s*=|\.innerHTML\s*=/g,
        message: 'Dynamic content update detected. If this content is important, add aria-live="polite" to the container (WCAG 4.1.3)',
        severity: 'low',
    },
    {
        id: 'dom-click-no-keyboard',
        re: /addEventListener\s*\(\s*['"]click['"]/g,
        message: 'click listener detected. Ensure an equivalent keydown/keyup handler exists for keyboard users (WCAG 2.1.1)',
        severity: 'medium',
    },
    {
        id: 'dom-timeout-no-warning',
        re: /setTimeout\s*\([^,]+,\s*[0-9]{6,}/g,
        message: 'Long setTimeout detected. If this triggers a session expiry or navigation, warn the user first (WCAG 2.2.1)',
        severity: 'medium',
    },
    {
        id: 'dom-color-only-status',
        re: /\.style\.color\s*=\s*['"](?:red|green|#[0-9a-f]{3,6})['"]/gi,
        message: 'Status communicated by color alone. Add text or icon indicator alongside color change (WCAG 1.4.1)',
        severity: 'medium',
    },
    {
        id: 'dom-font-size-px',
        re: /\.style\.fontSize\s*=\s*[`'"]\d+px[`'"]/g,
        message: 'Font size set in px via JS. Use rem/em to respect user font preferences (WCAG 1.4.4)',
        severity: 'low',
    },
    {
        id: 'dom-tabindex-positive',
        re: /\.tabIndex\s*=\s*[1-9][0-9]*/g,
        message: 'Positive tabIndex set via JS breaks natural focus order (WCAG 2.4.3)',
        severity: 'medium',
    },
    {
        id: 'dom-blank-target-no-warning',
        re: /\.target\s*=\s*['"]_blank['"]/g,
        message: 'target="_blank" opens in new tab without warning. Add aria-label or visible text "(opens in new tab)" (WCAG 3.2.5)',
        severity: 'low',
    },
    {
        id: 'dom-keycode-deprecated',
        re: /e\.keyCode|event\.keyCode/g,
        message: 'keyCode is deprecated. Use e.key === "Enter" / e.key === " " for accessible keyboard handling',
        severity: 'low',
    },
    {
        id: 'dom-no-page-title-update',
        re: /history\.pushState|history\.replaceState/g,
        message: 'SPA navigation detected. Update document.title after route change so screen readers announce the new page (WCAG 2.4.2)',
        severity: 'medium',
    },
];
//# sourceMappingURL=eslintEngine.js.map