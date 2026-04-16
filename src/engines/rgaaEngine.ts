import * as ts from 'typescript';
import { A11yIssue, Severity } from '../core/types';

/**
 * RGAA Engine - Implementation of RGAA 4.1.2 criteria detection
 * 
 * This engine implements automatic detection of RGAA accessibility criteria
 * based on the official RGAA 4.1.2 reference:
 * https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests
 * 
 * RGAA has 13 thematic areas:
 * 1. Images, 2. Cadres, 3. Couleurs, 4. Multimédia, 5. Tableaux
 * 6. Liens, 7. Scripts, 8. Éléments obligatoires, 9. Structuration
 * 10. Présentation, 11. Formulaires, 12. Navigation, 13. Consultation
 */
export class RgaaEngine {
  
  /**
   * Run RGAA analysis on HTML/JSX content
   */
  public static async run(
    fileContent: string,
    filePath: string
  ): Promise<A11yIssue[]> {
    const issues: A11yIssue[] = [];

    // Only process HTML/JSX/TSX files
    if (!filePath.match(/\.(html|jsx|tsx)$/i)) {
      console.log('[RgaaEngine] Skipping non-HTML/JSX/TSX file:', filePath);
      return [];
    }

    // Run all RGAA checks
    issues.push(...RgaaEngine.checkImages(fileContent, filePath));
    issues.push(...RgaaEngine.checkFrames(fileContent, filePath));
    issues.push(...RgaaEngine.checkColors(fileContent, filePath));
    issues.push(...RgaaEngine.checkMandatoryElements(fileContent, filePath));
    issues.push(...RgaaEngine.checkInformationStructuring(fileContent, filePath));
    issues.push(...RgaaEngine.checkLinks(fileContent, filePath));
    issues.push(...RgaaEngine.checkForms(fileContent, filePath));
    issues.push(...RgaaEngine.checkScripts(fileContent, filePath));
    issues.push(...RgaaEngine.checkTables(fileContent, filePath));

    console.log('[RgaaEngine] Found', issues.length, 'RGAA issues');
    return issues;
  }

  // ============================================
  // 1. IMAGES - Critères 1.1 à 1.9
  // ============================================

  private static checkImages(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Critère 1.1: Chaque image porteuse d'information doit avoir une alternative textuelle
    const imgWithoutAlt = /<img(?![^>]*\balt=)[^>]*>/gi;
    let match;
    while ((match = imgWithoutAlt.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-1.1',
        message: '[RGAA 1.1] Image porteuse d\'information sans alternative textuelle (attribut alt manquant)',
        severity: 'critical',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-1.1',
      });
    }

    // Critère 1.2: Image de decoration doit être ignorée (alt="" ou role="presentation")
    const decorativeImgWithAlt = /<img[^>]*\balt="[^"]*"[^>]*>(?![^<]*<figcaption)/gi;
    while ((match = decorativeImgWithAlt.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-1.2',
        message: '[RGAA 1.2] Image de décoration sans attribut role="presentation" ou aria-hidden="true"',
        severity: 'low',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-1.2',
      });
    }

    // Critère 1.6: Image complexe doit avoir une description détaillée (longdesc ou aria-describedby)
    const complexImgPattern = /<img(?![^>]*(?:longdesc|aria-describedby))[^\/>]*\/>/gi;
    // Note: This is a simplified check - real detection would need context analysis

    return issues;
  }

  // ============================================
  // 2. CADRES (FRAMES) - Critères 2.1 à 2.2
  // ============================================

  private static checkFrames(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Critère 2.1: Chaque cadre doit avoir un titre de cadre (title attribute)
    const frameWithoutTitle = /<(?:iframe|frame)(?![^>]*\btitle=)[^>]*>/gi;
    let match;
    while ((match = frameWithoutTitle.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-2.1',
        message: '[RGAA 2.1] Cadre (<iframe> ou <frame>) sans attribut title',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-2.1',
      });
    }

    return issues;
  }

  // ============================================
  // 3. COULEURS - Critères 3.1 à 3.3
  // ============================================

  private static checkColors(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Critère 3.1: L'information ne doit pas être donnée uniquement par la couleur
    // This requires runtime analysis with axe-core for proper detection
    
    // Critère 3.2: Contraste suffisant - handled by axe-core color-contrast rules
    
    // Critère 3.3: Contraste des composants d'interface - handled by axe-core

    return issues;
  }

  // ============================================
  // 8. ÉLÉMENTS OBLIGATOIRES - Critères 8.1 à 8.10
  // ============================================

  private static checkMandatoryElements(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Critère 8.3: Langue par défaut présente (attribut lang sur html)
    const htmlWithoutLang = /<html(?![^>]*\blang=)[^>]*>/i;
    let match;
    if ((match = htmlWithoutLang.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-8.3',
        message: '[RGAA 8.3] Élément <html> sans attribut lang (langue par défaut manquante)',
        severity: 'critical',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-8.3',
      });
    }

    // Critère 8.5: Titre de page présent
    const hasTitle = /<title[^>]*>/i.test(content);
    if (!hasTitle) {
      issues.push({
        id: 'rgaa-8.5',
        message: '[RGAA 8.5] Titre de page (<title>) manquant',
        severity: 'critical',
        file: filePath,
        line: 1,
        column: 1,
        source: 'rgaa',
        rule: 'rgaa-8.5',
      });
    }

    // Critère 8.7: Changement de langue signalé (attribut lang ou xml:lang)
    const langChangesWithoutMarkup = /<(?![a-z]+(?:\s+lang=|\s+xml:lang))[a-z]+[^>]*>(?:(?!<\/?[a-z]+).)*?[éèêëàâäùûüôöîïç]/gi;
    // Simplified detection for obvious language changes without markup

    // Critère 8.9: Balises non utilisées à des fins de présentation
    const presentationOnlyTags = /<(?:b|i|u|s|strike|center|font)[^>]*>/gi;
    while ((match = presentationOnlyTags.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-8.9',
        message: '[RGAA 8.9] Balise utilisée uniquement à des fins de présentation: <' + match[1] + '>',
        severity: 'medium',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-8.9',
      });
    }

    return issues;
  }

  // ============================================
  // 9. STRUCTURATION DE L'INFORMATION - Critères 9.1 à 9.4
  // ============================================

  private static checkInformationStructuring(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Critère 9.1: Structure par titres (h1-h6)
    const headings = content.match(/<h[1-6][^>]*>/gi) || [];
    const headingLevels = headings.map(h => {
      const match = h.match(/<h([1-6])/i);
      return match ? parseInt(match[1]) : 0;
    });

    // Check for skipped heading levels
    let lastLevel = 0;
    for (let i = 0; i < headingLevels.length; i++) {
      if (headingLevels[i] > lastLevel + 1 && lastLevel !== 0) {
        const headingMatch = headings[i].match(/<h[1-6][^>]*>/i);
        if (headingMatch) {
          const lineInfo = RgaaEngine.getLineFromIndex(content, content.indexOf(headingMatch[0]));
          issues.push({
            id: 'rgaa-9.1',
            message: `[RGAA 9.1] Niveau de titre sauté: h${lastLevel} → h${headingLevels[i]}`,
            severity: 'medium',
            file: filePath,
            line: lineInfo.line,
            column: lineInfo.column,
            source: 'rgaa',
            rule: 'rgaa-9.1',
          });
        }
      }
      lastLevel = headingLevels[i];
    }

    // Check for h1 presence
    if (!content.toLowerCase().includes('<h1') && content.includes('<body')) {
      issues.push({
        id: 'rgaa-9.1',
        message: '[RGAA 9.1] Titre de niveau 1 (h1) manquant',
        severity: 'high',
        file: filePath,
        line: 1,
        column: 1,
        source: 'rgaa',
        rule: 'rgaa-9.1',
      });
    }

    // Critère 9.3: Listes correctement structurées
    const listItemsWithoutList = /<li>(?:(?!<\/?(?:ul|ol|li)>).)*?(?=<\/li>)/gi;
    // This would need more complex parsing

    return issues;
  }

  // ============================================
  // 6. LIENS - Critères 6.1 à 6.2
  // ============================================

  private static checkLinks(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Critère 6.2: Chaque lien doit avoir un intitulé
    const emptyLinks = /<a[^>]*>\s*<\/a>/gi;
    let match;
    while ((match = emptyLinks.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-6.2',
        message: '[RGAA 6.2] Lien sans intitulé (contenu vide ou uniquement des espaces)',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-6.2',
      });
    }

    // Check for links with only images
    const linkWithImgOnly = /<a[^>]*><img[^>]*><\/a>/gi;
    while ((match = linkWithImgOnly.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-6.2',
        message: '[RGAA 6.2] Lien contenant uniquement une image sans attribut alt',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-6.2',
      });
    }

    return issues;
  }

  // ============================================
  // 11. FORMULAIRES - Critères 11.1 à 11.13
  // ============================================

  private static checkForms(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Critère 11.1: Chaque champ de formulaire doit avoir une étiquette
    const inputWithoutLabel = /<input(?![^>]*\b(?:aria-label|aria-labelledby|id="[^"]*"))[^>]*>/gi;
    let match;
    while ((match = inputWithoutLabel.exec(content)) !== null) {
      // Skip hidden inputs, submit buttons, reset buttons, buttons
      if (/type=["']hidden["']/i.test(match[0]) || 
          /type=["']submit["']/i.test(match[0]) ||
          /type=["']reset["']/i.test(match[0]) ||
          /type=["']button["']/i.test(match[0])) {
        continue;
      }
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-11.1',
        message: '[RGAA 11.1] Champ de formulaire sans étiquette (label ou aria-label/aria-labelledby)',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-11.1',
      });
    }

    // Check for select without label
    const selectWithoutLabel = /<select(?![^>]*\b(?:aria-label|aria-labelledby|id="[^"]*"))[^>]*>/gi;
    while ((match = selectWithoutLabel.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-11.1',
        message: '[RGAA 11.1] Liste déroulante (<select>) sans étiquette',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-11.1',
      });
    }

    // Check for textarea without label
    const textareaWithoutLabel = /<textarea(?![^>]*\b(?:aria-label|aria-labelledby|id="[^"]*"))[^>]*>/gi;
    while ((match = textareaWithoutLabel.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-11.1',
        message: '[RGAA 11.1] Zone de texte (<textarea>) sans étiquette',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-11.1',
      });
    }

    // Critère 11.5: Regroupement de champs de même nature (fieldset)
    const radioGroupsWithoutFieldset = /<input[^>]*type=["']radio["'][^>]*name=["'][^"']*["']/gi;
    // This would need more complex analysis

    return issues;
  }

  // ============================================
  // 7. SCRIPTS - Critères 7.1 à 7.5
  // ============================================

  private static checkScripts(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Critère 7.3: Contrôlable par le clavier
    const clickHandlersWithoutKeyboard = /<(?:div|span|button|a)(?![^>]*\b(?:onkeydown|onkeyup|onkeypress|tabindex))[^\/>]*onclick[^\/>]*>/gi;
    let match;
    while ((match = clickHandlersWithoutKeyboard.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-7.3',
        message: '[RGAA 7.3] Élément avec gestionnaire onclick sans gestionnaire clavier (onkeydown/onkeyup/onkeypress)',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-7.3',
      });
    }

    // Critère 7.4: Changement de contexte sans avertissement
    const autoRedirectWithoutWarning = /<meta[^>]*http-equiv=["']refresh["'][^>]*>/gi;
    while ((match = autoRedirectWithoutWarning.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-7.4',
        message: '[RGAA 7.4] Redirection automatique (<meta http-equiv="refresh">) sans avertissement',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-7.4',
      });
    }

    return issues;
  }

  // ============================================
  // 5. TABLEAUX - Critères 5.1 à 5.8
  // ============================================

  private static checkTables(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Critère 5.4: Tableau de données avec titre (caption)
    const dataTableWithoutCaption = /<table(?![^>]*>[\s\S]*?<caption)[^>]*>(?:(?!<\/?table>).)*?<tr/gi;
    let match;
    while ((match = dataTableWithoutCaption.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-5.4',
        message: '[RGAA 5.4] Tableau de données sans titre (caption)',
        severity: 'medium',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        source: 'rgaa',
        rule: 'rgaa-5.4',
      });
    }

    // Critère 5.6: En-têtes de colonne/ligne (th)
    const tableWithOnlyTd = /<table[^>]*>(?:(?!<\/?table>).)*?<tr>(?:(?!<\/?tr>).)*?<td[^>]*>/gi;
    // This would need more complex analysis

    return issues;
  }

  // ============================================
  // Helper methods
  // ============================================

  private static getLineFromIndex(content: string, index: number): { line: number; column: number } {
    const lines = content.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }
}

/**
 * RGAA Criteria Reference (for documentation):
 * 
 * 1. Images: 1.1-1.9 (alt text, decoration, complex images, text images, captions)
 * 2. Cadres: 2.1-2.2 (iframe/frame titles)
 * 3. Couleurs: 3.1-3.3 (color info, contrast, interface contrast)
 * 4. Multimédia: 4.1-4.13 (transcripts, captions, audio description, controls)
 * 5. Tableaux: 5.1-5.8 (summary, headers, structure)
 * 6. Liens: 6.1-6.2 (explicit links, link text)
 * 7. Scripts: 7.1-7.5 (compatibility, keyboard, context changes, status)
 * 8. Éléments obligatoires: 8.1-8.10 (DOCTYPE, language, title, lang changes, tags)
 * 9. Structuration: 9.1-9.4 (headings, structure, lists, quotes)
 * 10. Présentation: 10.1-10.14 (CSS, readable, focus, hidden content)
 * 11. Formulaires: 11.1-11.13 (labels, grouping, validation, autocomplete)
 * 12. Navigation: 12.1-12.11 (navigation, skip links, tab order, keyboard traps)
 * 13. Consultation: 13.1-13.12 (time limits, new windows, documents, motion)
 */