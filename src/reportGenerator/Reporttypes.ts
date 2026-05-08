// ============================================================
//  TYPES — Rapport JSON accessibilité (Détecteur → Correcteur)
// ============================================================

export type ReportSeverity   = 'critical' | 'serious' | 'moderate' | 'minor';
export type ReportLanguage   = 'html' | 'css' | 'typescript' | 'javascript' | 'unknown';
export type CorrectionStatus = 'pending' | 'applied' | 'skipped' | 'failed';
export type ReportStatus     = 'clean' | 'errors' | 'partial' | 'corrected';

// Mapping severity du détecteur → severity du rapport
export const SEVERITY_MAP: Record<string, ReportSeverity> = {
  critical: 'critical',
  high:     'serious',
  medium:   'moderate',
  low:      'minor',
};

// Mapping normalizedType → critère WCAG
export const WCAG_MAP: Record<string, string> = {
  IMAGE_MISSING_ALT:       '1.1.1',
  INPUT_MISSING_LABEL:     '1.3.1',
  INTERACTIVE_NO_KEYBOARD: '2.1.1',
  IFRAME_MISSING_TITLE:    '2.4.2',
  HTML_MISSING_LANG:       '3.1.1',
  LINK_VAGUE_TEXT:         '2.4.4',
  BUTTON_MISSING_TYPE:     '4.1.2',
  ARIA_MISSING_LABEL:      '4.1.2',
  PAGE_MISSING_TITLE:      '2.4.2',
  FOCUS_NOT_VISIBLE:       '2.4.7',
  TABLE_MISSING_HEADERS:   '1.3.1',
  COLOR_CONTRAST:          '1.4.3',
  CSS_FONT_TOO_SMALL:      '1.4.4',
  CSS_HOVER_NO_FOCUS:      '2.4.7',
  CSS_INFINITE_ANIMATION:  '2.3.3',
};

// Mapping normalizedType → suggestion de correction
export const FIX_SUGGESTIONS: Record<string, string> = {
  IMAGE_MISSING_ALT:       'Ajouter alt="description" sur la balise <img>',
  INPUT_MISSING_LABEL:     'Associer un <label for="id"> ou aria-label à l\'input',
  INTERACTIVE_NO_KEYBOARD: 'Ajouter onKeyDown + role="button" + tabIndex={0}',
  IFRAME_MISSING_TITLE:    'Ajouter title="description" sur la balise <iframe>',
  HTML_MISSING_LANG:       'Ajouter lang="fr" sur la balise <html>',
  LINK_VAGUE_TEXT:         'Remplacer "cliquez ici" par un texte descriptif',
  BUTTON_MISSING_TYPE:     'Ajouter type="button" sur la balise <button>',
  ARIA_MISSING_LABEL:      'Ajouter aria-label ou aria-labelledby sur l\'élément',
  PAGE_MISSING_TITLE:      'Ajouter une balise <title> dans le <head>',
  FOCUS_NOT_VISIBLE:       'Retirer outline:none, utiliser :focus-visible',
  TABLE_MISSING_HEADERS:   'Ajouter <th scope="col|row"> aux en-têtes du tableau',
  COLOR_CONTRAST:          'Augmenter le contraste (ratio min 4.5:1 pour texte normal)',
  CSS_FONT_TOO_SMALL:      'Utiliser une taille de police >= 12px',
  CSS_HOVER_NO_FOCUS:      'Dupliquer les styles :hover sur :focus et :focus-visible',
  CSS_INFINITE_ANIMATION:  'Entourer l\'animation d\'un @media (prefers-reduced-motion)',
};

// ── Structures du rapport ─────────────────────────────────────

export interface ReportMetadata {
  version:        string;
  timestamp:      string;
  source_file:    string;
  plugin_version: string;
  wcag_level:     string;
}

export interface ReportSummary {
  total_issues:        number;
  errors_by_severity:  Record<ReportSeverity, number>;
  errors_by_language:  Record<ReportLanguage, number>;
}

export interface ReportError {
  id:                string;
  normalized_type:   string;
  wcag_criterion:    string;
  severity:          ReportSeverity;
  language:          ReportLanguage;
  file:              string;
  line:              number;
  column:            number;
  message:           string;
  fix_suggestion:    string;
  occurrences:       number;
  correction_status: CorrectionStatus;
  correction:        string | null;
}

export interface ReportCorrection {
  error_id:         string;
  corrected_snippet:string;
  applied_by:       string;
  applied_at:       string;
  confidence:       number;
  status:           'applied' | 'failed';
  notes?:           string;
}

export interface AccessibilityReport {
  metadata:    ReportMetadata;
  summary:     ReportSummary;
  errors:      ReportError[];
  corrections: ReportCorrection[];
  status:      ReportStatus;
  last_updated:string;
}