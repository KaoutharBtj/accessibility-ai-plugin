import * as vscode from 'vscode';
import { MergedIssue } from './core/deduplicationEngine';

// ============================================================
// STOCKAGE GLOBAL DES ISSUES PAR FICHIER
// exporté pour être utilisé dans extension.ts
// ============================================================
export const issuesStore = new Map<string, MergedIssue[]>();

export function updateIssuesStore(filePath: string, issues: MergedIssue[]): void {
  issuesStore.set(filePath, issues);
}

export function clearIssuesStore(filePath: string): void {
  issuesStore.delete(filePath);
}

// ============================================================
// CODELENS PROVIDER
// Affiche les annotations cliquables au-dessus des lignes
// ============================================================
export class A11yCodeLensProvider implements vscode.CodeLensProvider {

  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const issues = issuesStore.get(document.fileName);
    if (!issues || issues.length === 0) return [];

    const lenses: vscode.CodeLens[] = [];

    // Grouper les issues par ligne
    const byLine = new Map<number, MergedIssue[]>();
    for (const issue of issues) {
      const line = Math.max(0, (issue.line ?? 1) - 1);
      if (line >= document.lineCount) continue;
      if (!byLine.has(line)) byLine.set(line, []);
      byLine.get(line)!.push(issue);
    }

    // Créer un CodeLens par ligne
    for (const [line, lineIssues] of byLine.entries()) {
      const range = new vscode.Range(line, 0, line, 0);

      const icons  = lineIssues.map(i => severityIcon(i.severity)).join(' ');
      const label  = lineIssues.length === 1
        ? `${icons} ${lineIssues[0].message}`
        : `${icons} ${lineIssues.length} problèmes d'accessibilité`;

      // CodeLens principal — cliquable
      lenses.push(new vscode.CodeLens(range, {
        title:     label,
        command:   'cssA11y.showIssueDetail',
        arguments: [lineIssues, document.fileName, line],
      }));

      // CodeLens secondaire — bouton correction IA
      lenses.push(new vscode.CodeLens(range, {
        title:     '✨ Corriger avec IA',
        command:   'cssA11y.fixWithAI',
        arguments: [document, line + 1],
      }));
    }

    return lenses;
  }
}

// ============================================================
// UTILITAIRE
// ============================================================
function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '$(error)';
    case 'high':     return '$(error)';
    case 'medium':   return '$(warning)';
    case 'low':      return '$(info)';
    default:         return '$(question)';
  }
}