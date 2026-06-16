import * as vscode from 'vscode';
import { Orchestrator } from './core/orchestrator';
import { DiagnosticsManager } from './diagnosticsManager';
import { MergedIssue } from './core/deduplicationEngine';
import { debounce } from './utils';
import { HighlightDecorator } from './highlightDecorator';
import { A11yAgent } from './ai/a11yAgent';
import { readAIConfig } from './ai/aiConfigReader';
import { A11yCodeLensProvider, updateIssuesStore, clearIssuesStore, issuesStore } from './a11yCodeLens';
import { A11yPanelProvider } from './a11yPanel';

export function activate(context: vscode.ExtensionContext) {
  console.log('[css-a11y] Extension activated');

  const diagnosticsManager = new DiagnosticsManager();
  const orchestrator       = Orchestrator.getInstance();
  const highlightDecorator = new HighlightDecorator();
  const codeLensProvider   = new A11yCodeLensProvider();
  const panelProvider      = new A11yPanelProvider(context);

  const panelDisposable = vscode.window.registerWebviewViewProvider(
    A11yPanelProvider.viewType,
    panelProvider
  );

  const runAnalysis = debounce(async (document: vscode.TextDocument) => {
    if (!['html', 'css', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact']
      .includes(document.languageId)) {
      return;
    }

    try {
      console.log('[css-a11y] Analyzing:', document.fileName);
      const issues = await orchestrator.run(document);
      console.log('[css-a11y] Issues found:', issues.length);
      diagnosticsManager.update(document.uri, issues);

      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === document.uri.toString()
      );
      if (editor) {
        highlightDecorator.update(editor, issues);
      }

      updateIssuesStore(document.fileName, issues);
      codeLensProvider.refresh();
      panelProvider.update(issues, document.fileName);

    } catch (err) {
      console.error('[css-a11y] Analysis error:', err);
    }
  }, getDebounceMs());

  const showDetailCommand = vscode.commands.registerCommand(
    'cssA11y.showIssueDetail',
    (issues: MergedIssue[], fileName: string, line: number) => {
      const allIssues = issuesStore.get(
        vscode.window.activeTextEditor?.document.fileName || fileName
      ) || issues;
      const lineIssues = allIssues.filter(
        i => Math.abs((i.line ?? 1) - 1 - line) <= 1
      );
      showIssuePanel(
        lineIssues.length > 0 ? lineIssues : issues,
        fileName,
        line,
        context
      );
    }
  );

  const runNowCommand = vscode.commands.registerCommand(
    'cssA11y.runNow',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) runAnalysis.flush(editor.document);
    }
  );

  const fixWithAICommand = vscode.commands.registerCommand(
    'cssA11y.fixWithAI',
    async (document: vscode.TextDocument, line: number) => {
      const config = readAIConfig(document.uri);
      if (!config) {
        vscode.window.showErrorMessage('Configuration IA introuvable. Creez a11y.config.json.');
        return;
      }
      if (config.provider !== 'ollama' && !config.apiKey) {
        vscode.window.showErrorMessage(`Cle API manquante pour ${config.provider}.`);
        return;
      }

      const issues = issuesStore.get(document.fileName) || [];
      const issue  = issues.find((i: MergedIssue) => i.line === line);
      if (!issue) {
        vscode.window.showWarningMessage('Aucune violation trouvee sur cette ligne.');
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Correction IA en cours...`, cancellable: false },
        async () => {
          try {
            const codeContext = A11yAgent.extractContext(document.getText(), line);
            const agent       = new A11yAgent(config);
            const fix         = await agent.suggestFix(issue, codeContext, document.languageId);

            if (fix && fix.fixedCode) {
              const lineIndex = Math.max(0, line - 1);
              const editor = vscode.window.visibleTextEditors.find(
                e => e.document.uri.toString() === document.uri.toString()
              );

              if (editor) {
                const lineRange = editor.document.lineAt(lineIndex).range;
                await editor.edit(editBuilder => {
                  editBuilder.replace(lineRange, fix.fixedCode);
                });
                vscode.window.showInformationMessage(
                  `Correction appliquee ligne ${line} — ${fix.explanation}`
                );
              } else {
                vscode.window.showErrorMessage('Editeur non trouve — cliquez sur le fichier et reessayez.');
              }

            } else {
              vscode.window.showErrorMessage("L'IA n'a pas pu generer une correction.");
            }

          } catch (err) {
            vscode.window.showErrorMessage(`Erreur IA : ${err}`);
          }
        }
      );
    }
  );

  const fixWithAIFromHoverCommand = vscode.commands.registerCommand(
    'cssA11y.fixWithAIFromHover',
    async (fileName: string, line: number) => {
      const document = vscode.window.activeTextEditor?.document;
      if (!document) {
        vscode.window.showErrorMessage('Aucun fichier actif trouve.');
        return;
      }
      vscode.commands.executeCommand('cssA11y.fixWithAI', document, line);
    }
  );

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
    clearIssuesStore(doc.fileName);
    codeLensProvider.refresh();
    panelProvider.clear();
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === doc.uri.toString()
    );
    if (editor) highlightDecorator.clear(editor);
  });

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) runAnalysis(activeEditor.document);
  vscode.workspace.textDocuments.forEach(doc => runAnalysis(doc));

  const intervalListener = setInterval(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) runAnalysis.flush(editor.document);
  }, 500);

  context.subscriptions.push(
    panelDisposable,
    changeListener,
    openListener,
    saveListener,
    editorChangeListener,
    closeListener,
    showDetailCommand,
    runNowCommand,
    fixWithAICommand,
    fixWithAIFromHoverCommand,
    highlightDecorator,
    diagnosticsManager,
    new vscode.Disposable(() => {
      clearInterval(intervalListener);
      orchestrator.dispose();
    }),
  );
}

function showIssuePanel(
  issues: MergedIssue[],
  fileName: string,
  line: number,
  context: vscode.ExtensionContext
): void {
  const panel = vscode.window.createWebviewPanel(
    'a11yIssueDetail',
    `Accessibilite — ligne ${line + 1}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: false,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    }
  );

  const severityLabels: Record<string, string> = {
    critical: 'Critique',
    high:     'Eleve',
    medium:   'Moyen',
    low:      'Faible',
  };

  const fixes: Record<string, string> = {
    IMAGE_MISSING_ALT:       `&lt;img src="..." alt="Description de l'image" /&gt;`,
    INPUT_MISSING_LABEL:     `&lt;label htmlFor="field"&gt;Etiquette&lt;/label&gt;\n&lt;input id="field" type="text" /&gt;`,
    INTERACTIVE_NO_KEYBOARD: `&lt;div onClick={fn} onKeyDown={(e) =&gt; e.key==='Enter'&amp;&amp;fn()} role="button" tabIndex={0}&gt;`,
    IFRAME_MISSING_TITLE:    `&lt;iframe src="..." title="Description du contenu" /&gt;`,
    HTML_MISSING_LANG:       `&lt;html lang="fr"&gt;`,
    BUTTON_MISSING_TYPE:     `&lt;button type="button"&gt;Libelle&lt;/button&gt;`,
    ARIA_MISSING_LABEL:      `&lt;div role="button" aria-label="Description" tabIndex={0}&gt;`,
    CSS_HOVER_NO_FOCUS:      `a:hover, a:focus, a:focus-visible { /* styles */ }`,
    CSS_INFINITE_ANIMATION:  `@media (prefers-reduced-motion: no-preference) { .el { animation: spin 1s infinite; } }`,
    FOCUS_NOT_VISIBLE:       `:focus-visible { outline: 2px solid #005fcc; outline-offset: 2px; }`,
  };

  const issuesHtml = issues.map(issue => {
    const fix      = fixes[issue.normalizedType] || '';
    const fixBlock = fix
      ? `<div class="fix"><div class="fix-label">Correction suggeree</div><pre>${fix}</pre></div>`
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
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; margin: 0; }
    h2 { font-size: 15px; font-weight: 500; margin: 0 0 16px; }
    .file { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
    .issue { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; margin-bottom: 12px; }
    .issue.critical, .issue.high { border-left: 3px solid var(--vscode-errorForeground); }
    .issue.medium { border-left: 3px solid var(--vscode-editorWarning-foreground); }
    .issue.low { border-left: 3px solid var(--vscode-editorInfo-foreground); }
    .issue-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .severity { font-size: 12px; font-weight: 500; }
    .type { font-size: 11px; font-family: var(--vscode-editor-font-family); background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 6px; border-radius: 4px; }
    .message { font-size: 13px; margin-bottom: 8px; line-height: 1.5; }
    .fix { margin-top: 10px; }
    .fix-label { font-size: 12px; font-weight: 500; margin-bottom: 6px; }
    pre { background: var(--vscode-textCodeBlock-background); border-radius: 4px; padding: 10px; font-family: var(--vscode-editor-font-family); font-size: 12px; overflow-x: auto; margin: 0; white-space: pre-wrap; }
  </style>
  </head>
  <body>
    <h2>Problemes d'accessibilite — ligne ${line + 1}</h2>
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