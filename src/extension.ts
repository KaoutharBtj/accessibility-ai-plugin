import * as vscode from 'vscode';
import { Orchestrator } from './core/orchestrator';
import { DiagnosticsManager } from './diagnosticsManager';
import { MergedIssue } from './core/deduplicationEngine';
import { debounce } from './utils';
import { HighlightDecorator } from './highlightDecorator';

export function activate(context: vscode.ExtensionContext) {
  console.log('[css-a11y] Extension activated');

  const diagnosticsManager = new DiagnosticsManager();
  const orchestrator       = Orchestrator.getInstance();
  const highlightDecorator = new HighlightDecorator();


  const runAnalysis = debounce(async (document: vscode.TextDocument) => {
    if (!['html', 'css', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact']
      .includes(document.languageId)) {
      return;
    }

    try {
      console.log('[css-a11y] Analyzing:', document.fileName);

      const issues = await orchestrator.run(
        document.getText(),
        document.fileName,
        document.languageId
      );

      console.log('[css-a11y] Issues found:', issues.length);

      // 1. Panneau Problèmes
      diagnosticsManager.update(document.uri, issues);
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === document.uri.toString()
      );
      if (editor) {
        highlightDecorator.update(editor, issues);
      }

    } catch (err) {
      console.error('[css-a11y] Analysis error:', err);
    }
  }, getDebounceMs());

  // Commande — afficher le détail d'une issue dans un panel
  const showDetailCommand = vscode.commands.registerCommand(
    'cssA11y.showIssueDetail',
    (issues: MergedIssue[], fileName: string, line: number) => {
      showIssuePanel(issues, fileName, line, context);
    }
  );

  // Commande manuelle
  const runNowCommand = vscode.commands.registerCommand(
    'cssA11y.runNow',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) runAnalysis.flush(editor.document);
    }
  );

  // Listeners
  const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.contentChanges.length > 0) runAnalysis(event.document);
  });

  const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
    runAnalysis(doc);
  });

  const saveListener = vscode.workspace.onDidSaveTextDocument(doc => {
    runAnalysis.flush(doc);
  });

  const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) runAnalysis(editor.document);
  });

  const closeListener = vscode.workspace.onDidCloseTextDocument(doc => {
    diagnosticsManager.clear(doc.uri);
    // Effacer le zigzag quand le fichier se ferme
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === doc.uri.toString()
    );
    if (editor) highlightDecorator.clear(editor);
  });

  // Analyser au démarrage
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) runAnalysis(activeEditor.document);
  vscode.workspace.textDocuments.forEach(doc => runAnalysis(doc));

  // Refresh toutes les 500ms
  const intervalListener = setInterval(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) runAnalysis.flush(editor.document);
  }, 500);

  context.subscriptions.push(
    changeListener,
    openListener,
    saveListener,
    editorChangeListener,
    closeListener,
    showDetailCommand,
    highlightDecorator,
    runNowCommand,
    diagnosticsManager,
    new vscode.Disposable(() => {
      clearInterval(intervalListener);
      orchestrator.dispose();
    }),
  );
}

// ============================================================
// PANEL WEBVIEW — détail d'une issue au clic sur CodeLens
// ============================================================
function showIssuePanel(
  issues: MergedIssue[],
  fileName: string,
  line: number,
  context: vscode.ExtensionContext
): void {
  const panel = vscode.window.createWebviewPanel(
    'a11yIssueDetail',
    `♿ Accessibilité — ligne ${line + 1}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );

  const severityLabels: Record<string, string> = {
    critical: '🔴 Critique',
    high:     '🔴 Élevé',
    medium:   '🟡 Moyen',
    low:      '🔵 Faible',
  };

  const fixes: Record<string, string> = {
    IMAGE_MISSING_ALT:      `&lt;img src="..." alt="Description de l'image" /&gt;`,
    INPUT_MISSING_LABEL:    `&lt;label htmlFor="field"&gt;Étiquette&lt;/label&gt;\n&lt;input id="field" type="text" /&gt;`,
    INTERACTIVE_NO_KEYBOARD:`&lt;div\n  onClick={fn}\n  onKeyDown={(e) =&gt; e.key === 'Enter' &amp;&amp; fn()}\n  role="button"\n  tabIndex={0}\n&gt;`,
    IFRAME_MISSING_TITLE:   `&lt;iframe src="..." title="Description du contenu" /&gt;`,
    HTML_MISSING_LANG:      `&lt;html lang="fr"&gt;`,
    BUTTON_MISSING_TYPE:    `&lt;button type="button"&gt;Libellé&lt;/button&gt;`,
    ARIA_MISSING_LABEL:     `&lt;div role="button" aria-label="Description" tabIndex={0}&gt;`,
    CSS_HOVER_NO_FOCUS:     `a:hover,\na:focus,\na:focus-visible {\n  /* styles */\n}`,
    CSS_INFINITE_ANIMATION: `@media (prefers-reduced-motion: no-preference) {\n  .element { animation: spin 1s infinite; }\n}`,
    FOCUS_NOT_VISIBLE:      `:focus-visible {\n  outline: 2px solid #005fcc;\n  outline-offset: 2px;\n}`,
  };

  const issuesHtml = issues.map(issue => {
    const fix = fixes[issue.normalizedType] || '';
    const fixBlock = fix
      ? `<div class="fix"><div class="fix-label">💡 Correction suggérée</div><pre>${fix}</pre></div>`
      : '';


    return `
      <div class="issue ${issue.severity}">
        <div class="issue-header">
          <span class="severity">${severityLabels[issue.severity] || issue.severity}</span>
          <span class="type">${issue.normalizedType || issue.id}</span>
        </div>
        <div class="message">${issue.message}</div>
        ${fixBlock}
      </div>
    `;
  }).join('');

  panel.webview.html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px;
    margin: 0;
  }
  h2 { font-size: 15px; font-weight: 500; margin: 0 0 16px; }
  .file { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
  .issue {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 12px;
  }
  .issue.critical, .issue.high { border-left: 3px solid var(--vscode-errorForeground); }
  .issue.medium { border-left: 3px solid var(--vscode-editorWarning-foreground); }
  .issue.low    { border-left: 3px solid var(--vscode-editorInfo-foreground); }
  .issue-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .severity { font-size: 12px; font-weight: 500; }
  .type {
    font-size: 11px;
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .message { font-size: 13px; margin-bottom: 8px; line-height: 1.5; }
  .sources { font-size: 11px; margin-bottom: 8px; }
  .badge {
    display: inline-block;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 1px 6px;
    border-radius: 3px;
    margin-right: 4px;
    font-family: var(--vscode-editor-font-family);
  }
  .fix { margin-top: 10px; }
  .fix-label { font-size: 12px; font-weight: 500; margin-bottom: 6px; }
  pre {
    background: var(--vscode-textCodeBlock-background);
    border-radius: 4px;
    padding: 10px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    overflow-x: auto;
    margin: 0;
    white-space: pre-wrap;
  }
</style>
</head>
<body>
  <h2>♿ Problèmes d'accessibilité — ligne ${line + 1}</h2>
  <div class="file">${fileName}</div>
  ${issuesHtml}
</body>
</html>`;
}

export function deactivate() {
  console.log('[css-a11y] Extension deactivated');
}

function getDebounceMs(): number {
  return vscode.workspace
    .getConfiguration('cssA11y')
    .get<number>('debounceMs', 500);
}