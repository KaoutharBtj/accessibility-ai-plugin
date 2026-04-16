import * as vscode from 'vscode';
import * as ts from 'typescript';
import { A11yIssue, Severity } from '../core/types';

/**
 * TypeScript Engine - Static analysis for TypeScript accessibility patterns
 * 
 * This engine performs static analysis on TypeScript/JavaScript files to detect
 * common accessibility issues that can't be caught by other tools.
 */
export class TSEngine {
  // Common accessibility-related patterns to check
  private static readonly ACCESSIBILITY_PATTERNS = [
    {
      // Missing alt prop on img
      pattern: /<img[^>]*(?<!alt)=["'][^"']*["']/gi,
      rule: 'img-missing-alt',
      message: 'Images must have an alt prop',
      severity: 'high' as Severity,
    },
    {
      // Missing lang attribute on html
      pattern: /<html[^>]*(?<!lang)=["'][^"']*["']/gi,
      rule: 'html-missing-lang',
      message: 'HTML element must have a lang attribute',
      severity: 'high' as Severity,
    },
    {
      // Interactive elements without keyboard handlers
      pattern: /<(button|a|input|select|textarea)[^>]*onClick[^>]*>(?![\s\S]*onKey)/gi,
      rule: 'interactive-no-keyboard',
      message: 'Interactive elements should have keyboard event handlers',
      severity: 'medium' as Severity,
    },
    {
      // Missing form label
      pattern: /<input[^>]*type=["'](?:text|email|password|search|tel|url)[^"']*["'][^>]*id=["'][^"']*["'][^>]*(?<!aria-label)(?<!aria-labelledby)(?<!aria-describedby)/gi,
      rule: 'input-missing-label',
      message: 'Form inputs should have associated labels',
      severity: 'high' as Severity,
    },
  ];

  /**
   * Run TypeScript static analysis on file content
   */
  public static async run(
    fileContent: string,
    filePath: string
  ): Promise<A11yIssue[]> {
    // Only process TS/TSX/JS/JSX files
    if (!filePath.match(/\.(ts|tsx|js|jsx)$/i)) {
      console.log('[TSEngine] Skipping non-TS/JS file:', filePath);
      return [];
    }

    const issues: A11yIssue[] = [];

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
  private static analyzePatterns(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    for (const pattern of TSEngine.ACCESSIBILITY_PATTERNS) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);

      while ((match = regex.exec(content)) !== null) {
        const lineInfo = TSEngine.getLineFromIndex(content, match.index);
        
        const issue: A11yIssue = {
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
  private static analyzeAST(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    try {
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );

      // Visit all nodes in the AST
      function visit(node: ts.Node) {
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
    } catch (err) {
      console.error('[TSEngine] AST analysis error:', err);
    }

    return issues;
  }

  /**
   * Check if a JSX element has a specific attribute
   */
  private static hasJsxAttribute(node: ts.Node, attrName: string): boolean {
    if (ts.isJsxSelfClosingElement(node)) {
      return node.attributes.properties.some(
        prop => ts.isJsxAttribute(prop) && prop.name.getText() === attrName
      );
    }
    if (ts.isJsxElement(node)) {
      return node.openingElement.attributes.properties.some(
        prop => ts.isJsxAttribute(prop) && prop.name.getText() === attrName
      );
    }
    return false;
  }

  /**
   * Get line and column from character index
   */
  private static getLineFromIndex(content: string, index: number): { line: number; column: number } {
    const lines = content.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }
}