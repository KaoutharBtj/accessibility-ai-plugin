import * as vscode from 'vscode';
import { AIFix } from './a11yAgent';
import { MergedIssue } from '../core/deduplicationEngine';

// ============================================================
// AFFICHE LE PANEL AVEC LA CORRECTION DE L'IA
// ============================================================
export function showFixPanel(
  fix: AIFix,
  issue: MergedIssue,
  document: vscode.TextDocument,
  line: number
): void {
  // Sauvegarder l'éditeur AVANT d'ouvrir le panel
  const targetEditor = vscode.window.activeTextEditor;

  const panel = vscode.window.createWebviewPanel(
    'a11yAIFix',
    `✨ Correction IA — ligne ${line}`,
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    }
  );

  panel.webview.html = getHtml(fix, issue, line);

  panel.webview.onDidReceiveMessage(async msg => {
    if (msg.command === 'apply') {
      // Utiliser l'éditeur sauvegardé
      if (targetEditor) {
        await applyFix(fix.fixedCode, line, targetEditor);
        panel.dispose();
        vscode.window.showInformationMessage('✅ Correction appliquée !');
      } else {
        vscode.window.showErrorMessage('Éditeur non trouvé — cliquez sur le fichier et réessayez.');
      }
    }
    if (msg.command === 'close') {
      panel.dispose();
    }
  });
}

// Modifier applyFix pour accepter l'éditeur directement
async function applyFix(
  fixedCode: string,
  line: number,
  editor: vscode.TextEditor  // ← passer l'éditeur directement
): Promise<void> {
  const lineIndex = Math.max(0, line - 1);
  if (lineIndex >= editor.document.lineCount) return;

  const lineText  = editor.document.lineAt(lineIndex).text;
  const indent    = lineText.match(/^(\s*)/)?.[1] || '';
  const lineRange = editor.document.lineAt(lineIndex).range;

  await editor.edit(editBuilder => {
    editBuilder.replace(lineRange, indent + fixedCode.trim());
  });
}

// ============================================================
// HTML DU PANEL
// ============================================================
function getHtml(fix: AIFix, issue: MergedIssue, line: number): string {

  const severityColors: Record<string, string> = {
    critical: '#ef4444',
    high:     '#ef4444',
    medium:   '#f59e0b',
    low:      '#60a5fa',
  };

  const color = severityColors[issue.severity] || '#888';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 20px;
    line-height: 1.6;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .badge {
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: ${color}22;
    color: ${color};
    border: 1px solid ${color}44;
  }
  .title { font-size: 15px; font-weight: 500; flex: 1; }
  .line-ref { font-size: 11px; color: var(--vscode-descriptionForeground); }

  .section { margin-bottom: 18px; }
  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
  }
  .explanation {
    padding: 10px 14px;
    background: var(--vscode-input-background);
    border-radius: 6px;
    font-size: 13px;
    border-left: 3px solid ${color};
  }
  .reason {
    padding: 10px 14px;
    background: var(--vscode-input-background);
    border-radius: 6px;
    font-size: 13px;
  }
  .code-block {
    background: var(--vscode-textCodeBlock-background);
    border-radius: 6px;
    padding: 14px;
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    border: 1px solid var(--vscode-panel-border);
  }
  .btns {
    display: flex;
    gap: 10px;
    margin-top: 24px;
  }
  .btn-apply {
    flex: 1;
    padding: 9px 0;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    font-weight: 500;
  }
  .btn-apply:hover { background: var(--vscode-button-hoverBackground); }
  .btn-close {
    padding: 9px 20px;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    font-family: var(--vscode-font-family);
  }
  .sources {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
  }
</style>
</head>
<body>

  <div class="header">
    <div>
      <div class="title">✨ Correction suggérée par l'IA</div>
      <div class="sources">
        ${issue.sources?.join(' · ') || ''}
        <span class="line-ref"> — ligne ${line}</span>
      </div>
    </div>
    <span class="badge">${issue.normalizedType || issue.id}</span>
  </div>

  <div class="section">
    <div class="section-label">Problème détecté</div>
    <div class="explanation">${fix.explanation}</div>
  </div>

  <div class="section">
    <div class="section-label">Code corrigé</div>
    <div class="code-block">${escapeHtml(fix.fixedCode)}</div>
  </div>

  <div class="section">
    <div class="section-label">Pourquoi cette correction</div>
    <div class="reason">${fix.reason}</div>
  </div>

  <div class="btns">
    <button class="btn-apply" onclick="apply()">✅ Appliquer la correction</button>
    <button class="btn-close" onclick="close()">Ignorer</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function apply() { vscode.postMessage({ command: 'apply' }); }
    function close() { vscode.postMessage({ command: 'close' }); }
  </script>

</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}