import * as vscode from 'vscode';
import { MergedIssue } from './core/deduplicationEngine';

export class A11yPanelProvider implements vscode.WebviewViewProvider {

  public static readonly viewType = 'cssA11y.panel';
  private _view?: vscode.WebviewView;
  private _issues: MergedIssue[] = [];
  private _fileName: string = '';

  constructor(private readonly context: vscode.ExtensionContext) {}

  // ============================================================
  // INITIALISATION DU WEBVIEW
  // ============================================================
  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };

    webviewView.webview.html = this.getHtml([]);

    // Écouter les messages du panel (clic sur "Appliquer correction")
    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg.command === 'applyFix') {
        await this.applyFix(msg.fixedCode, msg.line);
      }
      if (msg.command === 'askAI') {
        await this.askAIFix(msg.issueId);
      }
    });
  }

  // ============================================================
  // MISE À JOUR EN TEMPS RÉEL
  // ============================================================
  update(issues: MergedIssue[], fileName: string) {
    this._issues   = issues;
    this._fileName = fileName;

    if (this._view) {
      this._view.webview.html = this.getHtml(issues);
    }
  }

  clear() {
    if (this._view) {
      this._view.webview.html = this.getHtml([]);
    }
  }

  // ============================================================
  // APPLIQUER LA CORRECTION DANS L'ÉDITEUR
  // ============================================================
  private async applyFix(fixedCode: string, line: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const lineIndex = Math.max(0, line - 1);
    const lineRange = editor.document.lineAt(lineIndex).range;

    await editor.edit(editBuilder => {
      editBuilder.replace(lineRange, fixedCode);
    });

    vscode.window.showInformationMessage('✅ Correction appliquée !');
  }

  // ============================================================
  // DEMANDER CORRECTION À L'IA
  // ============================================================
  private async askAIFix(issueId: string) {
    const issue = this._issues.find(i => i.id === issueId || i.normalizedType === issueId);
    if (!issue) return;

    vscode.commands.executeCommand(
      'cssA11y.fixWithAI',
      vscode.window.activeTextEditor?.document,
      issue.line
    );
  }

  // ============================================================
  // HTML DU PANEL
  // ============================================================
  private getHtml(issues: MergedIssue[]): string {

    const severityIcon: Record<string, string> = {
      critical: '🔴', high: '🔴', medium: '🟡', low: '🔵',
    };

    const severityLabel: Record<string, string> = {
      critical: 'Critique', high: 'Élevé', medium: 'Moyen', low: 'Faible',
    };

    const fixes: Record<string, string> = {
      IMAGE_MISSING_ALT:       '&lt;img src="..." alt="Description" /&gt;',
      INPUT_MISSING_LABEL:     '&lt;label htmlFor="id"&gt;Label&lt;/label&gt;\n&lt;input id="id" /&gt;',
      INTERACTIVE_NO_KEYBOARD: '&lt;div role="button" tabIndex={0}\n  onClick={fn}\n  onKeyDown={(e) =&gt; e.key===\'Enter\'&amp;&amp;fn()}&gt;',
      IFRAME_MISSING_TITLE:    '&lt;iframe title="Description" /&gt;',
      HTML_MISSING_LANG:       '&lt;html lang="fr"&gt;',
      BUTTON_MISSING_TYPE:     '&lt;button type="button"&gt;Label&lt;/button&gt;',
      ARIA_MISSING_LABEL:      '&lt;div role="button" aria-label="Description"&gt;',
      CSS_HOVER_NO_FOCUS:      'a:hover, a:focus { /* styles */ }',
      CSS_INFINITE_ANIMATION:  '@media (prefers-reduced-motion: no-preference) {\n  .el { animation: spin 1s infinite; }\n}',
      FOCUS_NOT_VISIBLE:       ':focus-visible { outline: 2px solid #005fcc; }',
      LINK_VAGUE_TEXT:         '&lt;a href="/page"&gt;Voir tous les produits&lt;/a&gt;',
      BUTTON_MISSING_TYPE2:    '&lt;button type="submit"&gt;Envoyer&lt;/button&gt;',
    };

    const counts = {
      critical: issues.filter(i => i.severity === 'critical').length,
      high:     issues.filter(i => i.severity === 'high').length,
      medium:   issues.filter(i => i.severity === 'medium').length,
      low:      issues.filter(i => i.severity === 'low').length,
    };

    const total = issues.length;

    const score = total === 0
      ? 100
      : Math.max(0, Math.round(100 - (counts.critical * 20 + counts.high * 10 + counts.medium * 5 + counts.low * 2)));

    const scoreColor = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

    const issuesHtml = issues.length === 0
      ? `<div class="empty">✅ Aucune violation détectée</div>`
      : issues.map(issue => {
          const icon  = severityIcon[issue.severity] || '⚠️';
          const type  = issue.normalizedType || issue.id;
          const fix   = fixes[type] || null;
          const fixBtn = fix
            ? `<button class="btn-fix" onclick="applyFix('${fix.replace(/'/g, "\\'")}', ${issue.line || 1})">
                Appliquer correction
               </button>`
            : '';

          const aiBtn = `<button class="btn-ai" onclick="askAI('${type}')">
            ✨ Corriger avec IA
          </button>`;

          const fixBlock = fix
            ? `<div class="fix-block"><pre>${fix}</pre></div>`
            : '';

          const sources = issue.sources?.length
            ? `<div class="sources">${issue.sources.slice(0, 2).join(' · ')}</div>`
            : '';

          return `
            <div class="issue issue-${issue.severity}">
              <div class="issue-header">
                <span class="icon">${icon}</span>
                <div class="issue-info">
                  <div class="issue-type">${type}</div>
                  <div class="issue-line">Ligne ${issue.line || '?'}</div>
                </div>
                <span class="sev-badge sev-${issue.severity}">${severityLabel[issue.severity]}</span>
              </div>
              <div class="issue-msg">${issue.message}</div>
              ${sources}
              ${fixBlock}
              <div class="btns">
                ${fixBtn}
                ${aiBtn}
              </div>
            </div>
          `;
        }).join('');

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
    background: var(--vscode-sideBar-background);
    padding: 0;
  }

  /* HEADER */
  .header {
    padding: 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBarSectionHeader-background);
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .header-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--vscode-sideBarSectionHeader-foreground);
  }

  .score {
    font-size: 18px;
    font-weight: 700;
    color: ${scoreColor};
  }

  .score-label {
    font-size: 9px;
    color: var(--vscode-descriptionForeground);
    text-align: right;
  }

  /* COMPTEURS */
  .counters {
    display: flex;
    gap: 6px;
  }

  .counter {
    flex: 1;
    text-align: center;
    padding: 4px;
    border-radius: 4px;
    background: var(--vscode-input-background);
  }

  .counter-num { font-size: 14px; font-weight: 700; }
  .counter-lbl { font-size: 9px; color: var(--vscode-descriptionForeground); }
  .c-red   .counter-num { color: #ef4444; }
  .c-yel   .counter-num { color: #f59e0b; }
  .c-blue  .counter-num { color: #60a5fa; }

  /* FICHIER */
  .filename {
    padding: 6px 12px;
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* LISTE */
  .issues-list {
    padding: 8px;
    overflow-y: auto;
  }

  .empty {
    padding: 24px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }

  /* ISSUE CARD */
  .issue {
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 8px;
    background: var(--vscode-input-background);
    border-left: 3px solid transparent;
  }

  .issue-critical, .issue-high { border-left-color: #ef4444; }
  .issue-medium               { border-left-color: #f59e0b; }
  .issue-low                  { border-left-color: #60a5fa; }

  .issue-header {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 6px;
  }

  .icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }

  .issue-info { flex: 1; min-width: 0; }

  .issue-type {
    font-size: 11px;
    font-weight: 600;
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .issue-line {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
  }

  .sev-badge {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 3px;
    flex-shrink: 0;
    font-weight: 500;
  }

  .sev-critical, .sev-high { background: rgba(239,68,68,0.15); color: #ef4444; }
  .sev-medium              { background: rgba(245,158,11,0.15); color: #f59e0b; }
  .sev-low                 { background: rgba(96,165,250,0.15); color: #60a5fa; }

  .issue-msg {
    font-size: 11px;
    line-height: 1.4;
    color: var(--vscode-foreground);
    margin-bottom: 6px;
  }

  .sources {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
  }

  .fix-block {
    background: var(--vscode-textCodeBlock-background);
    border-radius: 4px;
    padding: 6px 8px;
    margin-bottom: 8px;
  }

  .fix-block pre {
    font-family: var(--vscode-editor-font-family);
    font-size: 10px;
    color: var(--vscode-foreground);
    white-space: pre-wrap;
    word-break: break-all;
  }

  /* BOUTONS */
  .btns {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .btn-fix {
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 3px;
    border: none;
    cursor: pointer;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-family: var(--vscode-font-family);
  }

  .btn-fix:hover { background: var(--vscode-button-hoverBackground); }

  .btn-ai {
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid var(--vscode-button-background);
    cursor: pointer;
    background: transparent;
    color: var(--vscode-button-background);
    font-family: var(--vscode-font-family);
  }

  .btn-ai:hover {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
</style>
</head>
<body>

  <div class="header">
    <div class="header-top">
      <span class="header-title">♿ Accessibilité</span>
      <div>
        <div class="score">${score}/100</div>
        <div class="score-label">Score RGAA</div>
      </div>
    </div>
    <div class="counters">
      <div class="counter c-red">
        <div class="counter-num">${counts.critical + counts.high}</div>
        <div class="counter-lbl">Erreurs</div>
      </div>
      <div class="counter c-yel">
        <div class="counter-num">${counts.medium}</div>
        <div class="counter-lbl">Warnings</div>
      </div>
      <div class="counter c-blue">
        <div class="counter-num">${counts.low}</div>
        <div class="counter-lbl">Infos</div>
      </div>
    </div>
  </div>

  ${this._fileName
    ? `<div class="filename">📄 ${this._fileName.split(/[\\/]/).pop()}</div>`
    : ''}

  <div class="issues-list">
    ${issuesHtml}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function applyFix(fixedCode, line) {
      vscode.postMessage({ command: 'applyFix', fixedCode, line });
    }

    function askAI(issueId) {
      vscode.postMessage({ command: 'askAI', issueId });
    }
  </script>

</body>
</html>`;
  }
}