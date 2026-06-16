import * as vscode from 'vscode';
import { AIFix } from './a11yAgent';
import { MergedIssue } from '../core/deduplicationEngine';

// ============================================================
// NETTOIE LE CODE CORRIGE (supprime les numeros de ligne)
// ex: "3: outline: auto;" => "outline: auto;"
// ============================================================
function cleanFixedCode(code: string): string {
  return code
    .split('\n')
    .map((line: string) => line.replace(/^\s*\d+:\s*/, ''))
    .join('\n')
    .trim();
}

// ============================================================
// AFFICHE LE PANEL AVEC LA CORRECTION DE L'IA
// ============================================================
export function showFixPanel(
  fix: AIFix,
  issue: MergedIssue,
  document: vscode.TextDocument,
  line: number
): void {
  const targetEditor = vscode.window.activeTextEditor;

  // Nettoyer le code avant affichage et application
  fix.fixedCode = cleanFixedCode(fix.fixedCode);

  const panel = vscode.window.createWebviewPanel(
    'a11yAIFix',
    `Correction IA - ligne ${line}`,
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
      if (targetEditor) {
        await applyFix(fix.fixedCode, line, targetEditor);
        panel.dispose();
        vscode.window.showInformationMessage('Correction appliquee !');
      } else {
        vscode.window.showErrorMessage('Editeur non trouve - cliquez sur le fichier et reessayez.');
      }
    }
    if (msg.command === 'close') {
      panel.dispose();
    }
  });
}

// ============================================================
// APPLIQUE LA CORRECTION DANS L'EDITEUR
// ============================================================
async function applyFix(
  fixedCode: string,
  line: number,
  editor: vscode.TextEditor
): Promise<void> {
  const document = editor.document;
  const lineIndex = Math.max(0, line - 1);

  if (lineIndex >= document.lineCount) {
    vscode.window.showErrorMessage(`Ligne ${line} introuvable dans le fichier.`);
    return;
  }

  const lineRange = document.lineAt(lineIndex).range;

  await editor.edit(editBuilder => {
    editBuilder.replace(lineRange, fixedCode);
  });
}

// ============================================================
// GENERE LE HTML DU PANEL
// ============================================================
function getHtml(fix: AIFix, issue: MergedIssue, line: number): string {
  const severityColor: Record<string, string> = {
    critical: '#f14c4c',
    high:     '#f14c4c',
    medium:   '#cca700',
    low:      '#3794ff',
  };

  const color = severityColor[issue.severity] || '#3794ff';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    h2 { font-size: 15px; margin-bottom: 16px; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      background: ${color}22;
      color: ${color};
      border: 1px solid ${color};
      margin-bottom: 12px;
    }
    .section { margin-bottom: 16px; }
    .label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .explanation {
      font-size: 13px;
      line-height: 1.6;
      padding: 10px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid ${color};
      border-radius: 4px;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      padding: 12px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
      margin: 0;
    }
    .reason {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    button {
      padding: 8px 16px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-family: var(--vscode-font-family);
    }
    .btn-apply {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-apply:hover { background: var(--vscode-button-hoverBackground); }
    .btn-close {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
  </style>
</head>
<body>
  <h2>Correction IA - Ligne ${line}</h2>
  <div class="badge">${issue.normalizedType || issue.id} - ${issue.severity}</div>

  <div class="section">
    <div class="label">Explication</div>
    <div class="explanation">${fix.explanation}</div>
  </div>

  <div class="section">
    <div class="label">Code corrige</div>
    <pre>${escapeHtml(fix.fixedCode)}</pre>
  </div>

  <div class="section">
    <div class="label">Pourquoi cette correction ?</div>
    <div class="reason">${fix.reason}</div>
  </div>

  <div class="actions">
    <button class="btn-apply" onclick="apply()">Appliquer la correction</button>
    <button class="btn-close" onclick="close()">Fermer</button>
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