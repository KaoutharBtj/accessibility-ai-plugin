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
    // If line is provided, use it directly
    if (issue.line !== undefined) {
      const column = issue.column ?? 0;
      return new vscode.Range(issue.line - 1, column, issue.line - 1, column + 1);
    }

    // Otherwise, try to find the selector in the file
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (!doc) return new vscode.Range(0, 0, 0, 1);

    const text = doc.getText();
    const lines = text.split('\n');

    // Try to find a relevant line based on the rule or message
    const searchTerms = issue.rule ? [issue.rule] : [];
    
    for (let i = 0; i < lines.length; i++) {
      const lowerLine = lines[i].toLowerCase();
      for (const term of searchTerms) {
        if (lowerLine.includes(term.toLowerCase())) {
          const col = lines[i].search(/\S/);
          return new vscode.Range(i, col, i, lines[i].length);
        }
      }
    }

    return new vscode.Range(0, 0, 0, 1);
  }
}
