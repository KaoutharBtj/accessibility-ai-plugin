import * as vscode from 'vscode';
import { Orchestrator } from './core/orchestrator';
import { DiagnosticsManager } from './diagnosticsManager';
import { debounce } from './utils';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  console.log('[css-a11y] Extension activated');
  vscode.window.showInformationMessage('CSS A11y Extension Activated!');

  const diagnosticsManager = new DiagnosticsManager();
  const orchestrator = Orchestrator.getInstance();

  const runAnalysis = debounce(async (document: vscode.TextDocument) => {
    if (!['html', 'css', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact'].includes(document.languageId)) {
      return;
    }

    // APRÈS
  try {
    console.log('[css-a11y] Analyzing:', document.fileName, 'language:', document.languageId);
  
    const issues = await orchestrator.run(
      document.getText(),
      document.fileName,
      document.languageId
    );
  
    console.log('[css-a11y] Issues found:', issues.length);
    diagnosticsManager.update(document.uri, issues);

    // ✅ Écriture automatique du JSON
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const targetDir = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(document.uri.fsPath);
    
    const report = {
      generatedAt: new Date().toISOString(),
      file: document.fileName,
      language: document.languageId,
      issueCount: issues.length,
      issues: issues.map((issue: any) => ({
        rule:     issue.rule     ?? issue.code    ?? 'unknown',
        severity: issue.severity ?? 'warning',
        message:  issue.message  ?? String(issue),
        line:     issue.range?.start?.line      ?? issue.line   ?? null,
        column:   issue.range?.start?.character ?? issue.column ?? null,
      }))
    };

    const jsonPath = path.join(targetDir, 'accessibility-errors.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('[css-a11y] Report written to:', jsonPath);

  } catch (err) {
    console.error('[css-a11y] Analysis error:', err);
  }
  }, getDebounceMs());

  const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
    runAnalysis(event.document);
  });

  const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
    runAnalysis(doc);
  });

  const saveListener = vscode.workspace.onDidSaveTextDocument(doc => {
    runAnalysis(doc);
  });

  vscode.workspace.textDocuments.forEach(doc => runAnalysis(doc));

  const commandDisposable = vscode.commands.registerCommand(
    'cssA11y.runNow',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        console.log('[css-a11y] Manual trigger on:', editor.document.fileName);
        runAnalysis(editor.document);
      }
    }
  );

  context.subscriptions.push(
    changeListener,
    openListener,
    saveListener,
    commandDisposable,
    diagnosticsManager,
    new vscode.Disposable(() => orchestrator.dispose()),
  );
}

export function deactivate() {
  console.log('[css-a11y] Extension deactivated');
}

function getDebounceMs(): number {
  return vscode.workspace
    .getConfiguration('cssA11y')
    .get<number>('debounceMs', 500);
}

