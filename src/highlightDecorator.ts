import * as vscode from 'vscode';
import { MergedIssue } from './core/deduplicationEngine';

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

export class HighlightDecorator implements vscode.Disposable {

  update(editor: vscode.TextEditor, issues: MergedIssue[]): void {
    const bySeverity: Record<string, vscode.DecorationOptions[]> = {
      critical: [], high: [], medium: [], low: [],
    };

    for (const issue of issues) {
      if (issue.file !== editor.document.fileName) continue;
      const line   = Math.max(0, (issue.line ?? 1) - 1);
      const column = Math.max(0, (issue.column ?? 1) - 1);
      if (line >= editor.document.lineCount) continue;
      const lineText  = editor.document.lineAt(line).text;
      const endColumn = findElementEnd(lineText, column);
      const range     = new vscode.Range(line, column, line, endColumn);
      const severity  = issue.severity as keyof typeof underlineTypes;
      if (bySeverity[severity]) {
        bySeverity[severity].push({ range, hoverMessage: buildHoverMessage(issue) });
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

function findElementEnd(lineText: string, startColumn: number): number {
  const slice     = lineText.slice(startColumn);
  const selfClose = slice.indexOf('/>');
  const close     = slice.indexOf('>');
  if (selfClose !== -1 && (close === -1 || selfClose < close)) {
    return startColumn + selfClose + 2;
  }
  if (close !== -1) return startColumn + close + 1;
  return lineText.length;
}

function buildHoverMessage(issue: MergedIssue): vscode.MarkdownString {
  const icons: Record<string, string> = {
    critical: '🔴', high: '🔴', medium: '🟡', low: '🔵',
  };
  const severityLabels: Record<string, string> = {
    critical: 'Critique', high: 'Élevé', medium: 'Moyen', low: 'Faible',
  };

  const icon     = icons[issue.severity]          || '⚠️';
  const severity = severityLabels[issue.severity] || issue.severity;
  const type     = issue.normalizedType           || issue.id;
  const line     = issue.line                     ?? 1;

  const md = new vscode.MarkdownString('', true);
  md.isTrusted         = true;
  md.supportThemeIcons = true;

  md.appendMarkdown(`${icon} **${type}** — *${severity}*\n\n`);
  md.appendMarkdown(`${issue.message}\n\n`);
  md.appendMarkdown(`---\n\n`);

  const detailArgs = encodeURIComponent(
    JSON.stringify([[issue], issue.file, line - 1])
  );
  md.appendMarkdown(
    `[$(info) Voir détails](command:cssA11y.showIssueDetail?${detailArgs})`
  );

  md.appendMarkdown(`\u00a0\u00a0|\u00a0\u00a0`);

  const aiArgs = encodeURIComponent(
    JSON.stringify([issue.file, line])
  );
  md.appendMarkdown(
    `[$(sparkle) Corriger avec IA](command:cssA11y.fixWithAIFromHover?${aiArgs})`
  );

  return md;
}