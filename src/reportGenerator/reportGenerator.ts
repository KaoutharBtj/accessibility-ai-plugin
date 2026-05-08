// ============================================================
//  REPORT GENERATOR
//  Module autonome — NE PAS modifier extension.ts
//
//  Usage dans extension.ts (une seule ligne à ajouter) :
//
//    import { ReportGenerator } from './reportGenerator/reportGenerator';
//
//    // Après orchestrator.run() :
//    await ReportGenerator.getInstance().generate(issues, document.fileName);
// ============================================================

import * as fs   from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MergedIssue } from '../core/deduplicationEngine';
import {
  AccessibilityReport,
  ReportError,
  ReportSummary,
  ReportMetadata,
  ReportSeverity,
  ReportLanguage,
  ReportStatus,
  SEVERITY_MAP,
  WCAG_MAP,
  FIX_SUGGESTIONS,
} from './reportTypes';

// ── Constantes ────────────────────────────────────────────────
const PLUGIN_VERSION  = '0.1.0';
const REPORT_VERSION  = '1.0.0';
const REPORT_FILENAME = 'a11y-report.json';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Convertit la sévérité du détecteur (critical/high/medium/low)
 * vers la sévérité normalisée du rapport (critical/serious/moderate/minor)
 */
function toReportSeverity(severity: string): ReportSeverity {
  return SEVERITY_MAP[severity] ?? 'minor';
}

/**
 * Déduit le langage de l'issue à partir du chemin du fichier
 * ou du type normalisé
 */
function toReportLanguage(file: string, normalizedType: string): ReportLanguage {
  const ext = path.extname(file).toLowerCase();

  if (ext === '.css' || normalizedType.startsWith('CSS_') || normalizedType === 'COLOR_CONTRAST') {
    return 'css';
  }
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.js' || ext === '.jsx') return 'javascript';
  if (ext === '.html')                  return 'html';

  // Fallback : déduction depuis le type
  if (['IMAGE_MISSING_ALT', 'INPUT_MISSING_LABEL', 'HTML_MISSING_LANG',
       'IFRAME_MISSING_TITLE', 'LINK_VAGUE_TEXT', 'BUTTON_MISSING_TYPE',
       'PAGE_MISSING_TITLE', 'TABLE_MISSING_HEADERS'].includes(normalizedType)) {
    return 'html';
  }
  if (['INTERACTIVE_NO_KEYBOARD', 'ARIA_MISSING_LABEL',
       'FOCUS_NOT_VISIBLE'].includes(normalizedType)) {
    return 'typescript';
  }

  return 'unknown';
}

/**
 * Convertit une MergedIssue → ReportError
 */
function toReportError(issue: MergedIssue, index: number): ReportError {
  const severity = toReportSeverity(issue.severity);
  const language = toReportLanguage(issue.file ?? '', issue.normalizedType);

  return {
    id:                `ERR-${String(index + 1).padStart(3, '0')}`,
    normalized_type:   issue.normalizedType,
    wcag_criterion:    WCAG_MAP[issue.normalizedType] ?? 'N/A',
    severity,
    language,
    file:              issue.file ?? 'unknown',
    line:              issue.line   ?? 0,
    column:            issue.column ?? 0,
    message:           issue.message,
    fix_suggestion:    FIX_SUGGESTIONS[issue.normalizedType] ?? 'Consulter les critères WCAG',
    occurrences:       issue.occurrences,
    correction_status: 'pending',
    correction:        null,
  };
}

/**
 * Calcule le résumé à partir de la liste d'erreurs
 */
function buildSummary(errors: ReportError[]): ReportSummary {
  const bySeverity: Record<ReportSeverity, number> = {
    critical: 0, serious: 0, moderate: 0, minor: 0,
  };
  const byLanguage: Record<ReportLanguage, number> = {
    html: 0, css: 0, typescript: 0, javascript: 0, unknown: 0,
  };

  for (const err of errors) {
    bySeverity[err.severity]++;
    byLanguage[err.language]++;
  }

  return {
    total_issues:       errors.length,
    errors_by_severity: bySeverity,
    errors_by_language: byLanguage,
  };
}

/**
 * Détermine le statut global du rapport
 */
function computeStatus(errors: ReportError[]): ReportStatus {
  if (errors.length === 0)                                       return 'clean';
  if (errors.every(e => e.correction_status === 'applied'))     return 'corrected';
  if (errors.some(e  => e.correction_status === 'applied'))     return 'partial';
  return 'errors';
}

// ============================================================
//  CLASSE PRINCIPALE
// ============================================================
export class ReportGenerator {

  private static instance: ReportGenerator;

  // Dernier rapport généré (accessible par le correcteur)
  private lastReport: AccessibilityReport | null = null;

  private constructor() {}

  static getInstance(): ReportGenerator {
    if (!ReportGenerator.instance) {
      ReportGenerator.instance = new ReportGenerator();
    }
    return ReportGenerator.instance;
  }

  // ──────────────────────────────────────────────────────────
  //  MÉTHODE PRINCIPALE — appelée après orchestrator.run()
  // ──────────────────────────────────────────────────────────

  /**
   * Génère et écrit le rapport JSON automatiquement.
   *
   * @param issues   - Résultat de orchestrator.run() (MergedIssue[])
   * @param fileName - Chemin absolu du fichier analysé (document.fileName)
   */
  async generate(issues: MergedIssue[], fileName: string): Promise<void> {
    try {
      const errors   = issues.map((issue, i) => toReportError(issue, i));
      const now      = new Date().toISOString();
      const wcagLevel = vscode.workspace
        .getConfiguration('cssA11y')
        .get<string>('wcagLevel', 'wcag2aa');

      const metadata: ReportMetadata = {
        version:        REPORT_VERSION,
        timestamp:      now,
        source_file:    fileName,
        plugin_version: PLUGIN_VERSION,
        wcag_level:     wcagLevel,
      };

      const report: AccessibilityReport = {
        metadata,
        summary:     buildSummary(errors),
        errors,
        corrections: this.lastReport?.corrections ?? [],   // préserve les corrections existantes
        status:      computeStatus(errors),
        last_updated: now,
      };

      this.lastReport = report;
      await this.writeReport(report, fileName);

    } catch (err) {
      console.error('[ReportGenerator] Erreur lors de la génération du rapport:', err);
    }
  }

  // ──────────────────────────────────────────────────────────
  //  LECTURE / ÉCRITURE
  // ──────────────────────────────────────────────────────────

  /**
   * Écrit le rapport JSON dans le même dossier que le fichier analysé.
   * Ex : src/index.html → src/a11y-report.json
   */
  private async writeReport(report: AccessibilityReport, sourceFile: string): Promise<void> {
    const outputPath = this.resolveOutputPath(sourceFile);
    const json       = JSON.stringify(report, null, 2);

    await fs.promises.writeFile(outputPath, json, 'utf-8');
    console.log(`[ReportGenerator] Rapport écrit → ${outputPath}`);
  }

  /**
   * Retourne le dernier rapport généré (pour le correcteur)
   */
  getLastReport(): AccessibilityReport | null {
    return this.lastReport;
  }

  /**
   * Charge un rapport existant depuis le disque (utile au démarrage)
   */
  async loadReport(sourceFile: string): Promise<AccessibilityReport | null> {
    const outputPath = this.resolveOutputPath(sourceFile);
    try {
      const raw = await fs.promises.readFile(outputPath, 'utf-8');
      this.lastReport = JSON.parse(raw) as AccessibilityReport;
      return this.lastReport;
    } catch {
      return null; // fichier inexistant, c'est normal au premier lancement
    }
  }

  /**
   * Résout le chemin de sortie du rapport JSON.
   * Utilise le workspace VS Code si disponible, sinon le dossier du fichier.
   */
  private resolveOutputPath(sourceFile: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const outputDir = workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(sourceFile);
    return path.join(outputDir, REPORT_FILENAME);
  }

  dispose(): void {
    this.lastReport = null;
  }
}