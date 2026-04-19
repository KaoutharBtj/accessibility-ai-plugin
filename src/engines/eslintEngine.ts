import { Linter } from 'eslint';
import { A11yIssue, Severity } from '../core/types';

export class ESLintEngine {
  private static linter: Linter | null = null;

  private static getLinter(): Linter {
    if (!ESLintEngine.linter) {
      ESLintEngine.linter = new Linter();

      // Parser TypeScript
      ESLintEngine.linter.defineParser(
        '@typescript-eslint/parser',
        require('@typescript-eslint/parser')
      );

      // Règle 1 — alt-text
      ESLintEngine.linter.defineRule('jsx-a11y/alt-text', {
        meta: {
          type: 'problem',
          docs: { description: 'Enforce alt text for images' },
        },
        create(context) {
          return {
            JSXElement(node: any) {
              if (node.openingElement.name.name === 'img') {
                const hasAlt = node.openingElement.attributes.some(
                  (attr: any) =>
                    attr.type === 'JSXAttribute' &&
                    attr.name?.name === 'alt'
                );
                if (!hasAlt) {
                  context.report({ node, message: 'Images must have an alt prop' });
                }
              }
            },
          };
        },
      });

      // Règle 2 — input-missing-label
      ESLintEngine.linter.defineRule('jsx-a11y/input-missing-label', {
        meta: {
          type: 'problem',
          docs: { description: 'Form inputs must have labels' },
        },
        create(context) {
          return {
            JSXElement(node: any) {
              const name = node.openingElement.name.name;
              if (['input', 'textarea', 'select'].includes(name)) {
                const attrs = node.openingElement.attributes;
                const hasLabel =
                  attrs.some((a: any) => a.name?.name === 'aria-label') ||
                  attrs.some((a: any) => a.name?.name === 'aria-labelledby') ||
                  attrs.some((a: any) => a.name?.name === 'id');
                if (!hasLabel) {
                  context.report({
                    node,
                    message: 'Form inputs should have associated labels',
                  });
                }
              }
            },
          };
        },
      });

      // Règle 3 — interactive-no-keyboard
      ESLintEngine.linter.defineRule('jsx-a11y/interactive-no-keyboard', {
        meta: {
          type: 'suggestion',
          docs: { description: 'Interactive elements need keyboard handlers' },
        },
        create(context) {
          return {
            JSXElement(node: any) {
              const attrs = node.openingElement.attributes;
              const hasClick = attrs.some((a: any) => a.name?.name === 'onClick');
              const hasKeyboard = attrs.some((a: any) =>
                ['onKeyDown', 'onKeyUp', 'onKeyPress'].includes(a.name?.name)
              );
              const tagName = node.openingElement.name.name;
              const isNative = ['button', 'a', 'input', 'select', 'textarea'].includes(tagName);
              if (hasClick && !hasKeyboard && !isNative) {
                context.report({
                  node,
                  message: 'Interactive elements should have keyboard event handlers',
                });
              }
            },
          };
        },
      });
    }
    return ESLintEngine.linter;
  }

  public static async run(
    fileContent: string,
    filePath: string
  ): Promise<A11yIssue[]> {
    if (!filePath.match(/\.(jsx|tsx|js|ts)$/i)) {
      console.log('[ESLintEngine] Skipping non-JSX/TSX file:', filePath);
      return [];
    }

    try {
      const linter = ESLintEngine.getLinter();

      const results = linter.verify(fileContent, {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        rules: {
          'jsx-a11y/alt-text': 'error',
          'jsx-a11y/input-missing-label': 'error',
          'jsx-a11y/interactive-no-keyboard': 'warn',
        },
      }, filePath);

      return ESLintEngine.mapResults(results, filePath);
    } catch (err) {
      console.error('[ESLintEngine] Linting error:', err);
      return [];
    }
  }

  private static mapResults(results: Linter.LintMessage[], filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];
    for (const msg of results) {
      issues.push({
        id: msg.ruleId || 'unknown',
        message: msg.message,
        severity: ESLintEngine.mapSeverity(msg.severity),
        file: filePath,
        line: msg.line,
        column: msg.column,
        source: 'eslint',
        rule: msg.ruleId ?? undefined,
      });
    }
    return issues;
  }

  private static mapSeverity(severity: number): Severity {
    switch (severity) {
      case 2: return 'high';
      case 1: return 'medium';
      default: return 'low';
    }
  }
}