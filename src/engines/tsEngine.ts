import * as ts from 'typescript';
import { A11yIssue, Severity } from '../core/types';

export class TSEngine {
  // Seulement les patterns NON couverts par l'AST
  private static readonly ACCESSIBILITY_PATTERNS = [
    {
      // Interactive elements without keyboard handlers
      pattern: /<(div|span|li|td)[^>]*onClick[^>]*>/gi,
      rule: 'interactive-no-keyboard',
      message: 'Interactive elements should have keyboard event handlers',
      severity: 'medium' as Severity,
    },
    {
      // Missing form label
      pattern: /<input[^>]*type=["'](?:text|email|password|search|tel|url)[^"']*["'][^>]*(?!aria-label)(?!aria-labelledby)(?!id=)[^>]*>/gi,
      rule: 'input-missing-label',
      message: 'Form inputs should have associated labels',
      severity: 'high' as Severity,
    },
  ];

  public static async run(
    fileContent: string,
    filePath: string
  ): Promise<A11yIssue[]> {
    if (!filePath.match(/\.(ts|tsx|js|jsx)$/i)) {
      console.log('[TSEngine] Skipping non-TS/JS file:', filePath);
      return [];
    }

    const issues: A11yIssue[] = [];

    // Patterns uniquement pour les fichiers JS/JSX
    if (filePath.match(/\.(js|jsx)$/i)) {
      issues.push(...TSEngine.analyzePatterns(fileContent, filePath));
    }

    // AST pour les fichiers TS/TSX (plus précis)
    if (filePath.match(/\.(ts|tsx)$/i)) {
      issues.push(...TSEngine.analyzeAST(fileContent, filePath));
    }

    return issues;
  }

  private static analyzePatterns(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    for (const pattern of TSEngine.ACCESSIBILITY_PATTERNS) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);

      while ((match = regex.exec(content)) !== null) {
        const lineInfo = TSEngine.getLineFromIndex(content, match.index);
        issues.push({
          id: pattern.rule,
          message: pattern.message,
          severity: pattern.severity,
          file: filePath,
          line: lineInfo.line,
          column: lineInfo.column,
          source: 'typescript',
          rule: pattern.rule,
        });
      }
    }

    return issues;
  }

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

function visit(node: ts.Node) {
        if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
          const tagName = ts.isJsxSelfClosingElement(node)
            ? node.tagName.getText()
            : node.openingElement.tagName.getText();

          // img sans alt
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

          // html sans lang
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

          // input/textarea/select sans label
          if (['input', 'textarea', 'select'].includes(tagName)) {
            const hasLabel =
              TSEngine.hasJsxAttribute(node, 'aria-label') ||
              TSEngine.hasJsxAttribute(node, 'aria-labelledby') ||
              TSEngine.hasJsxAttribute(node, 'id');
            if (!hasLabel) {
              const pos = node.getStart();
              const lineInfo = TSEngine.getLineFromIndex(content, pos);
              issues.push({
                id: 'input-missing-label',
                message: 'Form inputs should have associated labels',
                severity: 'high',
                file: filePath,
                line: lineInfo.line,
                column: lineInfo.column,
                source: 'typescript',
                rule: 'input-missing-label',
              });
            }
          }

          // onClick sans onKeyDown sur éléments non natifs
          if (!['button', 'a', 'input', 'select', 'textarea'].includes(tagName)) {
            const hasClick = TSEngine.hasJsxAttribute(node, 'onClick');
            const hasKeyboard =
              TSEngine.hasJsxAttribute(node, 'onKeyDown') ||
              TSEngine.hasJsxAttribute(node, 'onKeyUp') ||
              TSEngine.hasJsxAttribute(node, 'onKeyPress');
            if (hasClick && !hasKeyboard) {
              const pos = node.getStart();
              const lineInfo = TSEngine.getLineFromIndex(content, pos);
              issues.push({
                id: 'interactive-no-keyboard',
                message: 'Interactive elements should have keyboard event handlers',
                severity: 'medium',
                file: filePath,
                line: lineInfo.line,
                column: lineInfo.column,
                source: 'typescript',
                rule: 'interactive-no-keyboard',
              });
            }
          }

          // iframe sans title
          if (tagName === 'iframe') {
            const hasTitle = TSEngine.hasJsxAttribute(node, 'title');
            if (!hasTitle) {
              const pos = node.getStart();
              const lineInfo = TSEngine.getLineFromIndex(content, pos);
              issues.push({
                id: 'iframe-missing-title',
                message: 'iframe must have a title attribute',
                severity: 'high',
                file: filePath,
                line: lineInfo.line,
                column: lineInfo.column,
                source: 'typescript',
                rule: 'iframe-missing-title',
              });
            }
          }

          // ✅ onMouseEnter sans onFocus — WCAG 2.1.1
          if (!['button', 'a', 'input', 'select', 'textarea'].includes(tagName)) {
            const hasMouseEnter = TSEngine.hasJsxAttribute(node, 'onMouseEnter');
            const hasMouseLeave = TSEngine.hasJsxAttribute(node, 'onMouseLeave');
            const hasFocus      = TSEngine.hasJsxAttribute(node, 'onFocus');
            const hasBlur       = TSEngine.hasJsxAttribute(node, 'onBlur');

            if (hasMouseEnter && !hasFocus) {
              const pos = node.getStart();
              const lineInfo = TSEngine.getLineFromIndex(content, pos);
              issues.push({
                id: 'wcag-2.1.1-mouse-enter',
                message: 'onMouseEnter sans onFocus — les utilisateurs clavier ne peuvent pas déclencher cet événement',
                severity: 'high',
                file: filePath,
                line: lineInfo.line,
                column: lineInfo.column,
                source: 'typescript',
                rule: 'wcag-2.1.1-mouse-enter',
              });
            }

            if (hasMouseLeave && !hasBlur) {
              const pos = node.getStart();
              const lineInfo = TSEngine.getLineFromIndex(content, pos);
              issues.push({
                id: 'wcag-2.1.1-mouse-leave',
                message: 'onMouseLeave sans onBlur — les utilisateurs clavier ne peuvent pas déclencher cet événement',
                severity: 'high',
                file: filePath,
                line: lineInfo.line,
                column: lineInfo.column,
                source: 'typescript',
                rule: 'wcag-2.1.1-mouse-leave',
              });
            }
          }

          // ✅ Bouton sans type — WCAG 4.1.2
          if (tagName === 'button') {
            const hasType = TSEngine.hasJsxAttribute(node, 'type');
            if (!hasType) {
              const pos = node.getStart();
              const lineInfo = TSEngine.getLineFromIndex(content, pos);
              issues.push({
                id: 'wcag-4.1.2-button-type',
                message: 'Bouton sans attribut type — ajouter type="button", type="submit" ou type="reset"',
                severity: 'medium',
                file: filePath,
                line: lineInfo.line,
                column: lineInfo.column,
                source: 'typescript',
                rule: 'wcag-4.1.2-button-type',
              });
            }
          }

          // ✅ Role interactif sans aria-label — WCAG 4.1.2
          const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option', 'switch'];
          const roleAttr = TSEngine.getJsxAttributeValue(node, 'role');

          if (roleAttr && interactiveRoles.includes(roleAttr)) {
            const hasAriaLabel      = TSEngine.hasJsxAttribute(node, 'aria-label');
            const hasAriaLabelledby = TSEngine.hasJsxAttribute(node, 'aria-labelledby');

            if (!hasAriaLabel && !hasAriaLabelledby) {
              const pos = node.getStart();
              const lineInfo = TSEngine.getLineFromIndex(content, pos);
              issues.push({
                id: 'wcag-4.1.2-aria-label',
                message: `Élément avec role="${roleAttr}" sans aria-label ou aria-labelledby`,
                severity: 'high',
                file: filePath,
                line: lineInfo.line,
                column: lineInfo.column,
                source: 'typescript',
                rule: 'wcag-4.1.2-aria-label',
              });
            }
          }

        } // ← fermeture du if isJsxElement — TOUT est à l'intérieur

        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    } catch (err) {
      console.error('[TSEngine] AST analysis error:', err);
    }

    return issues;
  }

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

  private static getJsxAttributeValue(node: ts.Node, attrName: string): string | null {
    let attributes: ts.NodeArray<ts.JsxAttributeLike> | null = null;
 
    if (ts.isJsxSelfClosingElement(node)) {
      attributes = node.attributes.properties;
    } else if (ts.isJsxElement(node)) {
      attributes = node.openingElement.attributes.properties;
    }
 
    if (!attributes) return null;
 
    for (const prop of attributes) {
      if (ts.isJsxAttribute(prop) && prop.name.getText() === attrName) {
        if (prop.initializer && ts.isStringLiteral(prop.initializer)) {
          return prop.initializer.text;
        }
      }
    }
 
    return null;
  }

  private static getLineFromIndex(content: string, index: number): { line: number; column: number } {
    const lines = content.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }
}