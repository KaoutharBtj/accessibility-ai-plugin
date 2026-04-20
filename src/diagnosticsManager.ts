import * as vscode from 'vscode';
import { Severity } from './core/types';
import { MergedIssue } from './core/deduplicationEngine';

const SEVERITY_TO_VSCODE: Record<Severity, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error,
  high:     vscode.DiagnosticSeverity.Error,
  medium:   vscode.DiagnosticSeverity.Warning,
  low:      vscode.DiagnosticSeverity.Information,
};

export class DiagnosticsManager implements vscode.Disposable {

  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('css-a11y');
  }

  update(uri: vscode.Uri, issues: MergedIssue[]): void {
    const diagnostics = issues.map(issue => this.issueToDiagnostic(issue, uri));
    this.collection.set(uri, diagnostics);
    console.log('[DiagnosticsManager] Updated', diagnostics.length, 'diagnostics for', uri.toString());
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }

  private issueToDiagnostic(
    issue: MergedIssue,
    uri: vscode.Uri
  ): vscode.Diagnostic {

    const range = this.resolveRange(uri, issue);

    // Message enrichi avec les sources
    const sourcesLabel = issue.sources && issue.sources.length > 1
      ? `\n[Sources: ${issue.sources.join(', ')}]`
      : '';

    const occurrencesLabel = issue.occurrences > 1
      ? ` (détecté par ${issue.occurrences} moteurs)`
      : '';

    const fullMessage = `[${issue.normalizedType || issue.id}] ${issue.message}${occurrencesLabel}${sourcesLabel}`;

    const diagnostic = new vscode.Diagnostic(
      range,
      fullMessage,
      SEVERITY_TO_VSCODE[issue.severity] ?? vscode.DiagnosticSeverity.Warning
    );

    diagnostic.source = `a11y-${issue.source}`;
    diagnostic.code   = issue.normalizedType || issue.rule;

    if (issue.severity === 'low') {
      diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
    }

    return diagnostic;
  }

  private resolveRange(uri: vscode.Uri, issue: MergedIssue): vscode.Range {
    if (issue.line !== undefined) {
      const line   = Math.max(0, (issue.line ?? 1) - 1);
      const column = Math.max(0, (issue.column ?? 1) - 1);
      return new vscode.Range(line, column, line, column + 1);
    }

    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (!doc) return new vscode.Range(0, 0, 0, 1);

    const text  = doc.getText();
    const lines = text.split('\n');

    const searchTerms = issue.rule ? [issue.rule] : [];
    for (let i = 0; i < lines.length; i++) {
      const lowerLine = lines[i].toLowerCase();
      for (const term of searchTerms) {
        if (lowerLine.includes(term.toLowerCase())) {
          const col = Math.max(0, lines[i].search(/\S/));
          return new vscode.Range(i, col, i, lines[i].length);
        }
      }
    }

    return new vscode.Range(0, 0, 0, 1);
  }
}