import * as vscode from 'vscode';
import { MergedIssue } from './core/deduplicationEngine';

// ============================================================
// DÉCORATIONS — soulignement zigzag uniquement
// Pas de texte inline, pas de background
// Le message apparaît SEULEMENT au survol (hover)
// ============================================================

const underlineTypes = {
  critical: vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline wavy #ff4444',
    overviewRulerColor: '#ff4444',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  }),

  high: vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline wavy #ff6b6b',
    overviewRulerColor: '#ff6b6b',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  }),

  medium: vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline wavy #ffcc00',
    overviewRulerColor: '#ffcc00',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  }),

  low: vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline wavy #4fc3f7',
    overviewRulerColor: '#4fc3f7',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  }),
};

// ============================================================
// CLASSE PRINCIPALE
// ============================================================

export class HighlightDecorator implements vscode.Disposable {

  update(editor: vscode.TextEditor, issues: MergedIssue[]): void {
    const bySeverity: Record<string, vscode.DecorationOptions[]> = {
      critical: [],
      high:     [],
      medium:   [],
      low:      [],
    };

    for (const issue of issues) {
      if (issue.file !== editor.document.fileName) continue;

      const line   = Math.max(0, (issue.line ?? 1) - 1);
      const column = Math.max(0, (issue.column ?? 1) - 1);

      if (line >= editor.document.lineCount) continue;

      const lineText  = editor.document.lineAt(line).text;
      const endColumn = findElementEnd(lineText, column);
      const range     = new vscode.Range(line, column, line, endColumn);

      const severity = issue.severity as keyof typeof underlineTypes;
      if (bySeverity[severity]) {
        bySeverity[severity].push({
          range,
          // Message visible UNIQUEMENT au survol
          hoverMessage: buildHoverMessage(issue),
        });
      }
    }

    editor.setDecorations(underlineTypes.critical, bySeverity.critical);
    editor.setDecorations(underlineTypes.high,     bySeverity.high);
    editor.setDecorations(underlineTypes.medium,   bySeverity.medium);
    editor.setDecorations(underlineTypes.low,      bySeverity.low);
  }

  clear(editor: vscode.TextEditor): void {
    editor.setDecorations(underlineTypes.critical, []);
    editor.setDecorations(underlineTypes.high,     []);
    editor.setDecorations(underlineTypes.medium,   []);
    editor.setDecorations(underlineTypes.low,      []);
  }

  dispose(): void {
    underlineTypes.critical.dispose();
    underlineTypes.high.dispose();
    underlineTypes.medium.dispose();
    underlineTypes.low.dispose();
  }
}

// ============================================================
// TROUVER LA FIN DE L'ÉLÉMENT SUR LA LIGNE
// ============================================================

function findElementEnd(lineText: string, startColumn: number): number {
  const slice      = lineText.slice(startColumn);
  const selfClose  = slice.indexOf('/>');
  const close      = slice.indexOf('>');

  if (selfClose !== -1 && (close === -1 || selfClose < close)) {
    return startColumn + selfClose + 2;
  }
  if (close !== -1) {
    return startColumn + close + 1;
  }
  return lineText.length;
}

// ============================================================
// TOOLTIP AU SURVOL — cadre avec message + correction
// ============================================================

function buildHoverMessage(issue: MergedIssue): vscode.MarkdownString {
  const icons: Record<string, string> = {
    critical: '🔴', high: '🔴', medium: '🟡', low: '🔵',
  };

  const fixes: Record<string, string> = {
    IMAGE_MISSING_ALT:
      '```tsx\n<img src="..." alt="Description de l\'image" />\n```',
    INPUT_MISSING_LABEL:
      '```tsx\n<label htmlFor="field">Étiquette</label>\n<input id="field" type="text" />\n```',
    INTERACTIVE_NO_KEYBOARD:
      '```tsx\n<div\n  role="button"\n  tabIndex={0}\n  onClick={fn}\n  onKeyDown={(e) => e.key === \'Enter\' && fn()}\n/>\n```',
    IFRAME_MISSING_TITLE:
      '```tsx\n<iframe src="..." title="Description du contenu" />\n```',
    HTML_MISSING_LANG:
      '```html\n<html lang="fr">\n```',
    BUTTON_MISSING_TYPE:
      '```tsx\n<button type="button">Libellé</button>\n```',
    ARIA_MISSING_LABEL:
      '```tsx\n<div role="button" aria-label="Description" tabIndex={0}>\n```',
    CSS_HOVER_NO_FOCUS:
      '```css\na:hover,\na:focus,\na:focus-visible { /* styles */ }\n```',
    CSS_INFINITE_ANIMATION:
      '```css\n@media (prefers-reduced-motion: no-preference) {\n  .el { animation: spin 1s infinite; }\n}\n```',
    FOCUS_NOT_VISIBLE:
      '```css\n:focus-visible {\n  outline: 2px solid #005fcc;\n  outline-offset: 2px;\n}\n```',
    CSS_FONT_TOO_SMALL:
      '```css\nbody { font-size: 16px; } /* minimum 12px */\n```',
  };

  const icon    = icons[issue.severity] || '⚠️';
  const type    = issue.normalizedType || issue.id;
  const fix     = fixes[type];

  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;

  md.appendMarkdown(`${icon} **${type}**\n\n`);



  return md;
}