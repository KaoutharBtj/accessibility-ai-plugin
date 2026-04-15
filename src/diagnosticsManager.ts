import * as vscode from 'vscode';
import { A11yIssue } from './analyzer';

const IMPACT_SEVERITY: Record<string, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error,
  serious:  vscode.DiagnosticSeverity.Error,
  moderate: vscode.DiagnosticSeverity.Warning,
  minor:    vscode.DiagnosticSeverity.Information,
};

export class DiagnosticsManager implements vscode.Disposable {

  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('css-a11y');
  }

  update(uri: vscode.Uri, issues: A11yIssue[]): void {
    const diagnostics = issues.map(issue => this.issueToDiagnostic(issue, uri));
    this.collection.set(uri, diagnostics);
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }


  private issueToDiagnostic(
    issue: A11yIssue,
    uri: vscode.Uri
  ): vscode.Diagnostic {

    const range = this.resolveRange(uri, issue);

    const message = this.buildMessage(issue);

    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      IMPACT_SEVERITY[issue.impact] ?? vscode.DiagnosticSeverity.Warning
    );

    diagnostic.source = 'css-a11y';
    diagnostic.code = {
      value: issue.ruleId,
      target: vscode.Uri.parse(issue.helpUrl),
    };

    if (issue.impact === 'minor') {
      diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
    }

    return diagnostic;
  }


  private buildMessage(issue: A11yIssue): string {
    const wcag = issue.wcagCriteria.join(', ') || 'best-practice';
    let msg = `[${issue.impact.toUpperCase()}] ${issue.help} (${wcag})`;

    if (issue.contrastData) {
      const { fgColor, bgColor, contrastRatio, expectedRatio } = issue.contrastData;
      msg +=
        `\n  • Contrast ratio: ${contrastRatio.toFixed(2)}:1 ` +
        `(required ≥ ${expectedRatio}:1)` +
        `\n  • Foreground: ${fgColor}  Background: ${bgColor}`;
    }

    msg += `\n  • Selector: ${issue.target.join(' > ')}`;
    return msg;
  }

  private resolveRange(uri: vscode.Uri, issue: A11yIssue): vscode.Range {
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (!doc) return new vscode.Range(0, 0, 0, 1);

    const text = doc.getText();
    const lines = text.split('\n');
    const selector = issue.target[0] ?? '';
    const simplePart = selector.split(/\s*[>+~]\s*/).pop()?.trim() ?? '';

    if (!simplePart) return new vscode.Range(0, 0, 0, 1);

    const patterns = selectorToPatterns(simplePart);

    for (let i = 0; i < lines.length; i++) {
      if (patterns.some(p => lines[i].toLowerCase().includes(p.toLowerCase()))) {
        const col = lines[i].search(/\S/); // first non-whitespace col
        return new vscode.Range(i, col, i, lines[i].length);
      }
    }

    return new vscode.Range(0, 0, 0, 1);
  }
}


function selectorToPatterns(selector: string): string[] {
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return [`id="${id}"`, `id='${id}'`];
  }
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return [`class="${cls}"`, `class='${cls}'`, `class="${cls} `, `class='${cls} `];
  }
  // Tag selector
  return [`<${selector.replace(/[:[.#].*/, '')}`];
}
