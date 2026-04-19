import * as vscode from 'vscode';
import { A11yIssue, Severity } from './core/types';

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

  /**
   * Update diagnostics for a given URI with the unified A11yIssue array
   */
  update(uri: vscode.Uri, issues: A11yIssue[]): void {
    const diagnostics = issues.map(issue => this.issueToDiagnostic(issue, uri));
    this.collection.set(uri, diagnostics);
    console.log('[DiagnosticsManager] Updated', diagnostics.length, 'diagnostics for', uri.toString());
  }

  /**
   * Clear diagnostics for a given URI
   */
  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }

  /**
   * Convert unified A11yIssue to VSCode Diagnostic
   */
  private issueToDiagnostic(
    issue: A11yIssue,
    uri: vscode.Uri
  ): vscode.Diagnostic {

    const range = this.resolveRange(uri, issue);
    const diagnostic = new vscode.Diagnostic(
      range,
      issue.message,
      SEVERITY_TO_VSCODE[issue.severity] ?? vscode.DiagnosticSeverity.Warning
    );

    diagnostic.source = `a11y-${issue.source}`;
    diagnostic.code = issue.rule;

    // Add tags for low severity
    if (issue.severity === 'low') {
      diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
    }

    return diagnostic;
  }

  /**
   * Resolve the range for a diagnostic based on line/column or file content
   */
  private resolveRange(uri: vscode.Uri, issue: A11yIssue): vscode.Range {
    if (issue.line !== undefined) {
      // FIX — forcer line et column à être >= 0
      const line   = Math.max(0, (issue.line ?? 1) - 1);
      const column = Math.max(0, (issue.column ?? 1) - 1);
      return new vscode.Range(line, column, line, column + 1);
    }

    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (!doc) return new vscode.Range(0, 0, 0, 1);

    const text = doc.getText();
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
