import * as vscode from 'vscode';
import { Linter } from 'eslint';
import { A11yIssue, Severity } from '../core/types';

export class ESLintEngine {
  private static linter: Linter | null = null;

  private static getLinter(): Linter {
    if (!ESLintEngine.linter) {
      ESLintEngine.linter = new Linter();
      
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
            JSXElement(node: any) {
              if (node.openingElement.name.name === 'img') {
                const hasAlt = node.openingElement.attributes.some(
                  (attr: any) =>
                    attr.type === 'JSXAttribute' &&
                    attr.name?.name === 'alt'
                );
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

  public static async run(
    fileContent: string,
    filePath: string
  ): Promise<A11yIssue[]> {
    // Only process JSX/TSX files
    if (!filePath.match(/\.(jsx|tsx|js)$/i)) {
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
    } catch (err) {
      console.error('[ESLintEngine] Linting error:', err);
      return [];
    }
  }

  private static mapResults(results: Linter.LintMessage[], filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    for (const msg of results) {
      const severity = ESLintEngine.mapSeverity(msg.severity);
      
      const issue: A11yIssue = {
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

  private static mapSeverity(severity: number): Severity {
    switch (severity) {
      case 2: return 'high'; // Error
      case 1: return 'medium'; // Warning
      default: return 'low';
    }
  }
}