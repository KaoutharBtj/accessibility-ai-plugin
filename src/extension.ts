import * as vscode from 'vscode';
import { A11yAnalyzer } from './analyzer';
import { DiagnosticsManager } from './diagnosticsManager';
import { debounce } from './utils';

export function activate(context: vscode.ExtensionContext) {
  console.log('[css-a11y] Extension activated');

  const diagnosticsManager = new DiagnosticsManager();
  const analyzer = new A11yAnalyzer();

  const runAnalysis = debounce(async (document: vscode.TextDocument) => {
    if (!['html', 'css'].includes(document.languageId)) return;

    try {
      console.log('[css-a11y] Analyzing:', document.fileName);
      const issues = await analyzer.analyze(document);
      console.log('[css-a11y] Issues found:', issues.length, issues.map(i => i.ruleId));
      diagnosticsManager.update(document.uri, issues);
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
    new vscode.Disposable(() => analyzer.dispose()),
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