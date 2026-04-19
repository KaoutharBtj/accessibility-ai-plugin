import * as vscode from 'vscode';
import { Orchestrator } from './core/orchestrator';
import { DiagnosticsManager } from './diagnosticsManager';
import { debounce } from './utils';

export function activate(context: vscode.ExtensionContext) {
  console.log('[css-a11y] Extension activated');

  const diagnosticsManager = new DiagnosticsManager();
  const orchestrator = Orchestrator.getInstance();

  const runAnalysis = debounce(async (document: vscode.TextDocument) => {
    if (!['html', 'css', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact'].includes(document.languageId)) {
      return;
    }

    try {
      console.log('[css-a11y] Analyzing:', document.fileName, 'language:', document.languageId);
      const issues = await orchestrator.run(
        document.getText(),
        document.fileName,
        document.languageId
      );
      console.log('[css-a11y] Issues found:', issues.length);
      diagnosticsManager.update(document.uri, issues);
    } catch (err) {
      console.error('[css-a11y] Analysis error:', err);
    }
  }, getDebounceMs());

  const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.contentChanges.length > 0) {
      runAnalysis(event.document);
    }
  });

  const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
    runAnalysis(doc);
  });

  const saveListener = vscode.workspace.onDidSaveTextDocument(doc => {
    runAnalysis.flush(doc);
  });

  // Analyse quand on change d'onglet
  const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      runAnalysis(editor.document);
    }
  });

  // Analyser le document actif immédiatement
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    runAnalysis(activeEditor.document);
  }

  // Analyser tous les documents ouverts au démarrage
  vscode.workspace.textDocuments.forEach(doc => runAnalysis(doc));

  // Refresh toutes les 500ms sur le document actif
  const intervalListener = setInterval(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      runAnalysis.flush(editor.document);
    }
  }, 500);

  const commandDisposable = vscode.commands.registerCommand(
    'cssA11y.runNow',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        console.log('[css-a11y] Manual trigger on:', editor.document.fileName);
        runAnalysis.flush(editor.document);
      }
    }
  );

  context.subscriptions.push(
    changeListener,
    openListener,
    saveListener,
    editorChangeListener,
    commandDisposable,
    diagnosticsManager,
    new vscode.Disposable(() => {
      clearInterval(intervalListener);
      orchestrator.dispose();
    }),
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