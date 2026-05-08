// ============================================================
//  PATCH extension.ts — 2 lignes à ajouter (rien d'autre)
//  Le reste du fichier ne change PAS.
// ============================================================

// ── 1. Ajouter cet import en haut du fichier ─────────────────

import { ReportGenerator } from './reportGenerator/reportGenerator';

// ── 2. Dans la fonction runAnalysis, après orchestrator.run() ─
//
//  AVANT (code de ta collègue, ne pas toucher) :
//
//    const issues = await orchestrator.run(
//      document.getText(),
//      document.fileName,
//      document.languageId
//    );
//
//    diagnosticsManager.update(document.uri, issues);
//
//
//  APRÈS (ajouter UNE seule ligne entre les deux) :
//
//    const issues = await orchestrator.run(
//      document.getText(),
//      document.fileName,
//      document.languageId
//    );
//
//    await ReportGenerator.getInstance().generate(issues, document.fileName); // ← AJOUTER
//
//    diagnosticsManager.update(document.uri, issues);
//
//
// C'est tout. Le JSON est maintenant généré automatiquement
// à chaque analyse, dans un fichier "a11y-report.json"
// à la racine du workspace VS Code.
// ============================================================