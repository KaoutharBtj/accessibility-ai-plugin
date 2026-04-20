import { A11yIssue, Severity } from './types';

/**
 * DeduplicationEngine - Merge et déduplique les issues de plusieurs moteurs
 *
 * Stratégie :
 * - Même fichier + ligne proche (±1) + même type normalisé = même issue
 * - On garde la severity la plus haute
 * - On accumule toutes les sources (RGAA + WCAG + TS + ESLint)
 */

// ============================================================
// TABLE DE NORMALISATION RGAA ↔ WCAG ↔ TS ↔ ESLint
// ============================================================
const RULE_NORMALIZATION_MAP: Record<string, string> = {
  // Image sans alt
  'rgaa-1.1':               'IMAGE_MISSING_ALT',
  'rgaa-1.2':               'IMAGE_MISSING_ALT',
  'image-alt':              'IMAGE_MISSING_ALT',
  'img-missing-alt':        'IMAGE_MISSING_ALT',
  'jsx-a11y/alt-text':      'IMAGE_MISSING_ALT',

  // Input sans label
  'rgaa-11.1':                      'INPUT_MISSING_LABEL',
  'input-missing-label':            'INPUT_MISSING_LABEL',
  'jsx-a11y/input-missing-label':   'INPUT_MISSING_LABEL',
  'label':                          'INPUT_MISSING_LABEL',

  // Clavier manquant
  'rgaa-7.3':                             'INTERACTIVE_NO_KEYBOARD',
  'interactive-no-keyboard':              'INTERACTIVE_NO_KEYBOARD',
  'jsx-a11y/interactive-no-keyboard':     'INTERACTIVE_NO_KEYBOARD',
  'wcag-2.1.1-mouse-enter':               'INTERACTIVE_NO_KEYBOARD',
  'wcag-2.1.1-mouse-leave':               'INTERACTIVE_NO_KEYBOARD',

  // iframe sans title
  'rgaa-2.1':               'IFRAME_MISSING_TITLE',
  'iframe-missing-title':   'IFRAME_MISSING_TITLE',
  'frame-title':            'IFRAME_MISSING_TITLE',

  // HTML sans lang
  'rgaa-8.3':               'HTML_MISSING_LANG',
  'html-missing-lang':      'HTML_MISSING_LANG',
  'html-has-lang':          'HTML_MISSING_LANG',

  // Lien non explicite
  'rgaa-6.1':               'LINK_VAGUE_TEXT',
  'rgaa-6.2':               'LINK_VAGUE_TEXT',
  'link-name':              'LINK_VAGUE_TEXT',
  'jsx-a11y/link-vague-text': 'LINK_VAGUE_TEXT',

  // Bouton sans type
  'rgaa-11.9':                  'BUTTON_MISSING_TYPE',
  'wcag-4.1.2-button-type':     'BUTTON_MISSING_TYPE',
  'jsx-a11y/button-has-type':   'BUTTON_MISSING_TYPE',

  // ARIA manquant
  'rgaa-7.1':               'ARIA_MISSING_LABEL',
  'wcag-4.1.2-aria-label':  'ARIA_MISSING_LABEL',
  'aria-label':             'ARIA_MISSING_LABEL',

  // Titre de page
  'rgaa-8.5':               'PAGE_MISSING_TITLE',
  'document-title':         'PAGE_MISSING_TITLE',

  // Contraste
  'color-contrast':         'COLOR_CONTRAST',
  'color-contrast-enhanced':'COLOR_CONTRAST',
  'css-outline-none':       'FOCUS_NOT_VISIBLE',

  // Tableau sans en-têtes
  'rgaa-5.4':               'TABLE_MISSING_HEADERS',
  'rgaa-5.6':               'TABLE_MISSING_HEADERS',
  'td-headers-attr':        'TABLE_MISSING_HEADERS',
  'th-has-data-cells':      'TABLE_MISSING_HEADERS',
  // Font size trop petite
  'css-font-size-too-small':  'CSS_FONT_TOO_SMALL',
  'css-font-too-small':       'CSS_FONT_TOO_SMALL',

  // Hover sans focus
  'css-hover-without-focus':  'CSS_HOVER_NO_FOCUS',

  // Animation infinie
  'css-infinite-animation':   'CSS_INFINITE_ANIMATION',
};

// ============================================================
// MESSAGES CONSOLIDÉS PAR TYPE
// ============================================================
const CONSOLIDATED_MESSAGES: Record<string, string> = {
  IMAGE_MISSING_ALT:      'Image sans texte alternatif (attribut alt manquant)',
  INPUT_MISSING_LABEL:    'Champ de formulaire sans étiquette associée',
  INTERACTIVE_NO_KEYBOARD:'Élément interactif sans gestionnaire clavier',
  IFRAME_MISSING_TITLE:   'iframe sans attribut title',
  HTML_MISSING_LANG:      'Élément <html> sans attribut lang',
  LINK_VAGUE_TEXT:        'Lien avec texte non descriptif',
  BUTTON_MISSING_TYPE:    'Bouton sans attribut type',
  ARIA_MISSING_LABEL:     'Élément interactif sans aria-label ou aria-labelledby',
  PAGE_MISSING_TITLE:     'Page sans titre (<title> manquant)',
  COLOR_CONTRAST:         'Contraste de couleurs insuffisant',
  FOCUS_NOT_VISIBLE:      'Indicateur de focus supprimé (outline:none)',
  TABLE_MISSING_HEADERS:  'Tableau sans en-têtes (<th> ou scope manquant)',
  CSS_FONT_TOO_SMALL:       'Taille de police trop petite (< 12px)',
  CSS_HOVER_NO_FOCUS:       ':hover sans équivalent :focus — inaccessible au clavier',
  CSS_INFINITE_ANIMATION:   'Animation infinie sans prefers-reduced-motion',
};

export interface MergedIssue extends A11yIssue {
  sources: string[];
  normalizedType: string;
  occurrences: number;
}

export class DeduplicationEngine {

  /**
   * Point d'entrée principal — merge et déduplique toutes les issues
   */
  static mergeIssues(issues: A11yIssue[]): MergedIssue[] {
    const map = new Map<string, MergedIssue>();

    for (const issue of issues) {
      const normalizedType = this.normalize(issue.id);
      const key = this.generateKey(issue, normalizedType);

      if (!map.has(key)) {
        // Première occurrence — créer l'issue mergée
        map.set(key, {
          ...issue,
          id: normalizedType,
          message: CONSOLIDATED_MESSAGES[normalizedType] || issue.message,
          sources: [this.formatSource(issue)],
          normalizedType,
          occurrences: 1,
        });
      } else {
        // Doublon détecté — merger avec l'existant
        const existing = map.get(key)!;

        const source = this.formatSource(issue);
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }

        // Garder la severity la plus haute
        if (this.severityPriority(issue.severity) > this.severityPriority(existing.severity)) {
          existing.severity = issue.severity;
        }

        existing.occurrences++;
      }
    }

    // Trier par sévérité décroissante
    return Array.from(map.values()).sort((a, b) =>
      this.severityPriority(b.severity) - this.severityPriority(a.severity)
    );
  }

  /**
   * Génère une clé unique pour identifier les doublons
   * Tolérance de ±1 ligne pour les issues qui pointent vers la même erreur
   */
  private static generateKey(issue: A11yIssue, normalizedType: string): string {
    // Arrondir la ligne à la dizaine la plus proche pour tolérance ±1
    const line = Math.floor((issue.line ?? 0) / 2) * 2;
    return `${issue.file}:${line}:${normalizedType}`;
  }

  /**
   * Normalise un id de règle vers un type canonique
   */
  private static normalize(ruleId: string): string {
    return RULE_NORMALIZATION_MAP[ruleId] || ruleId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  }

  /**
   * Formate la source pour l'affichage
   */
  private static formatSource(issue: A11yIssue): string {
    const rule = issue.rule || issue.id;
    const engine = issue.source;

    const engineLabels: Record<string, string> = {
      rgaa:       'RGAA',
      typescript: 'TS',
      eslint:     'ESLint',
      axe:        'axe-core',
    };

    const label = engineLabels[engine] || engine.toUpperCase();
    return `${label}:${rule}`;
  }

  /**
   * Priorité numérique de sévérité
   */
  private static severityPriority(severity: Severity | string): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high':     return 3;
      case 'medium':   return 2;
      case 'low':      return 1;
      default:         return 0;
    }
  }
}