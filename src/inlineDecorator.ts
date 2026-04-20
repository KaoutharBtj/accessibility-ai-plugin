import * as vscode from 'vscode';
import { MergedIssue } from './core/deduplicationEngine';

// ============================================================
// STYLES DES DÉCORATIONS PAR SÉVÉRITÉ
// ============================================================

const decorationTypes = {
  critical: vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 16px',
      fontStyle: 'italic',
      color: new vscode.ThemeColor('errorForeground'),
    },
    backgroundColor: new vscode.ThemeColor('inputValidation.errorBackground'),
    borderRadius: '3px',
    isWholeLine: false,
  }),

  high: vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 16px',
      fontStyle: 'italic',
      color: new vscode.ThemeColor('errorForeground'),
    },
    isWholeLine: false,
  }),

  medium: vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 16px',
      fontStyle: 'italic',
      color: new vscode.ThemeColor('editorWarning.foreground'),
    },
    isWholeLine: false,
  }),

  low: vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 16px',
      fontStyle: 'italic',
      color: new vscode.ThemeColor('editorHint.foreground'),
    },
    isWholeLine: false,
  }),
};

// ============================================================
// ICÔNES PAR SÉVÉRITÉ
// ============================================================

const SEVERITY_ICONS: Record<string, string> = {
  critical: '🔴',
  high:     '🔴',
  medium:   '🟡',
  low:      '🔵',
};

// ============================================================
// CLASSE PRINCIPALE — InlineDecorator
// ============================================================

export class InlineDecorator implements vscode.Disposable {
  private decorations = new Map<string, vscode.DecorationOptions[][]>();

  /**
   * Mettre à jour les décorations pour un éditeur donné
   */
  update(editor: vscode.TextEditor, issues: MergedIssue[]): void {
    const uri = editor.document.uri.toString();

    // Grouper les issues par sévérité
    const bySeverity: Record<string, vscode.DecorationOptions[]> = {
      critical: [],
      high:     [],
      medium:   [],
      low:      [],
    };

    for (const issue of issues) {
      if (issue.file !== editor.document.fileName) continue;

      const line   = Math.max(0, (issue.line ?? 1) - 1);
      const column = Math.max(0, (issue.column ?? 1) - 1);

      // S'assurer que la ligne existe dans le document
      if (line >= editor.document.lineCount) continue;

      const lineText  = editor.document.lineAt(line).text;
      const endColumn = lineText.length;

      const range = new vscode.Range(line, column, line, endColumn);

      // Message court pour l'affichage inline
      const icon    = SEVERITY_ICONS[issue.severity] || '⚠️';
      const sources = issue.sources?.length > 1
        ? ` [${issue.sources.length} moteurs]`
        : '';
      const shortMessage = `  ${icon} ${issue.message}${sources}`;

      const severity = issue.severity as keyof typeof decorationTypes;
      if (bySeverity[severity]) {
        bySeverity[severity].push({
          range,
          renderOptions: {
            after: {
              contentText: shortMessage,
            },
          },
          hoverMessage: new vscode.MarkdownString(
            formatHoverMessage(issue)
          ),
        });
      }
    }

    // Appliquer les décorations
    editor.setDecorations(decorationTypes.critical, bySeverity.critical);
    editor.setDecorations(decorationTypes.high,     bySeverity.high);
    editor.setDecorations(decorationTypes.medium,   bySeverity.medium);
    editor.setDecorations(decorationTypes.low,      bySeverity.low);
  }

  /**
   * Effacer toutes les décorations pour un éditeur
   */
  clear(editor: vscode.TextEditor): void {
    editor.setDecorations(decorationTypes.critical, []);
    editor.setDecorations(decorationTypes.high,     []);
    editor.setDecorations(decorationTypes.medium,   []);
    editor.setDecorations(decorationTypes.low,      []);
  }

  dispose(): void {
    decorationTypes.critical.dispose();
    decorationTypes.high.dispose();
    decorationTypes.medium.dispose();
    decorationTypes.low.dispose();
  }
}

// ============================================================
// MESSAGE AU SURVOL (hover tooltip)
// ============================================================

function formatHoverMessage(issue: MergedIssue): string {
  const severityLabels: Record<string, string> = {
    critical: '🔴 Critique',
    high:     '🔴 Élevé',
    medium:   '🟡 Moyen',
    low:      '🔵 Faible',
  };

  const lines: string[] = [
    `### ♿ ${issue.normalizedType || issue.id}`,
    ``,
    `**${issue.message}**`,
    ``,
    `| | |`,
    `|---|---|`,
    `| Sévérité | ${severityLabels[issue.severity] || issue.severity} |`,
    `| Ligne | ${issue.line} |`,
  ];

  if (issue.sources?.length) {
    lines.push(`| Détecté par | ${issue.sources.join(', ')} |`);
  }

  if (issue.occurrences > 1) {
    lines.push(`| Occurrences | ${issue.occurrences} moteurs ont détecté ce problème |`);
  }

  // Suggestion de correction selon le type
  const fix = getFix(issue.normalizedType || issue.id);
  if (fix) {
    lines.push(``, `**💡 Correction suggérée :**`, ``, `\`\`\``, fix, `\`\`\``);
  }

  return lines.join('\n');
}

// ============================================================
// SUGGESTIONS DE CORRECTION PAR TYPE
// ============================================================

function getFix(type: string): string | null {
  const fixes: Record<string, string> = {
    IMAGE_MISSING_ALT:      `<img src="..." alt="Description de l'image" />`,
    INPUT_MISSING_LABEL:    `<label htmlFor="field">Étiquette</label>\n<input id="field" type="text" />`,
    INTERACTIVE_NO_KEYBOARD:`<div\n  onClick={fn}\n  onKeyDown={(e) => e.key === 'Enter' && fn()}\n  role="button"\n  tabIndex={0}\n>`,
    IFRAME_MISSING_TITLE:   `<iframe src="..." title="Description du contenu" />`,
    HTML_MISSING_LANG:      `<html lang="fr">`,
    BUTTON_MISSING_TYPE:    `<button type="button">Libellé</button>`,
    ARIA_MISSING_LABEL:     `<div role="button" aria-label="Description" tabIndex={0}>`,
    CSS_HOVER_NO_FOCUS:     `a:hover,\na:focus,\na:focus-visible {\n  /* styles */\n}`,
    CSS_INFINITE_ANIMATION: `@media (prefers-reduced-motion: no-preference) {\n  .element { animation: spin 1s infinite; }\n}`,
    FOCUS_NOT_VISIBLE:      `/* Remplacer outline:none par un style visible */\n:focus-visible {\n  outline: 2px solid #005fcc;\n  outline-offset: 2px;\n}`,
  };

  return fixes[type] || null;
}