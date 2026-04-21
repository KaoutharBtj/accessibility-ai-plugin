import * as ts from 'typescript';
import { A11yIssue, Severity } from '../core/types';

export class RgaaEngine {
  public static async run(
    fileContent: string,
    filePath: string
  ): Promise<A11yIssue[]> {
    const issues: A11yIssue[] = [];

    if (!filePath.match(/\.(html|jsx|tsx|ts)$/i)) {
      console.log('[RgaaEngine] Skipping non-HTML/JSX/TSX/TS file:', filePath);
      return [];
    }

    // FIX 1 — cleanContent maintenant défini
    const cleanContent = RgaaEngine.removeComments(fileContent);

    issues.push(...RgaaEngine.checkImages(cleanContent, filePath));
    issues.push(...RgaaEngine.checkFrames(cleanContent, filePath));
    issues.push(...RgaaEngine.checkColors(cleanContent, filePath));
    issues.push(...RgaaEngine.checkMandatoryElements(cleanContent, filePath));
    issues.push(...RgaaEngine.checkInformationStructuring(cleanContent, filePath));
    issues.push(...RgaaEngine.checkLinks(cleanContent, filePath));
    issues.push(...RgaaEngine.checkForms(cleanContent, filePath));
    issues.push(...RgaaEngine.checkScripts(cleanContent, filePath));
    issues.push(...RgaaEngine.checkTables(cleanContent, filePath));
    issues.push(...RgaaEngine.checkHtmlSyntax(cleanContent, filePath));
    issues.push(...RgaaEngine.checkLandmarks(cleanContent, filePath));
    issues.push(...RgaaEngine.checkLinkTexts(cleanContent, filePath));
    issues.push(...RgaaEngine.checkButtonTypes(cleanContent, filePath));
    issues.push(...RgaaEngine.checkTableHeaders(cleanContent, filePath));
    issues.push(...RgaaEngine.checkAriaLabels(cleanContent, filePath));
    issues.push(...RgaaEngine.checkLandmarksComplete(cleanContent, filePath));

    console.log('[RgaaEngine] Found', issues.length, 'RGAA issues');
    return issues;
  }
  public static async runCss(
      fileContent: string,
      filePath: string
    ): Promise<A11yIssue[]> {
      if (!filePath.match(/\.css$/i)) {
        return [];
      }
      console.log('[RgaaEngine] Running CSS analysis on:', filePath);
  
      // Déléguer au moteur CSS dédié
      const { analyzeCSS } = require('./cssAnalyzer');
      const issues = analyzeCSS(fileContent, filePath);
  
      console.log('[RgaaEngine] CSS issues found:', issues.length);
      return issues;
    }
  

  private static removeComments(content: string): string {
    let clean = content.replace(/<!--[\s\S]*?-->/g, '');
    clean = clean.replace(/\/\/.*$/gm, '');
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');
    return clean;
  }

  private static checkImages(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Critère 1.1 — image sans alt
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
        rule: 'rgaa-1.1',
      });
    }

    // Critère 1.2 — image décorative sans role="presentation" ou aria-hidden
    const altEmptyWithoutRole = /<img[^>]*\balt=""\s*[^>]*>/gi;
    let match3;
    while ((match3 = altEmptyWithoutRole.exec(content)) !== null) {
      const hasRole = /role="presentation"/i.test(match3[0]);
      const hasAriaHidden = /aria-hidden="true"/i.test(match3[0]);
      if (!hasRole && !hasAriaHidden) {
        const lineInfo = RgaaEngine.getLineFromIndex(content, match3.index);
        issues.push({
          id: 'rgaa-1.2',
          message: '[RGAA 1.2] Image de décoration (alt="") sans attribut role="presentation" ou aria-hidden="true"',
          severity: 'low',
          file: filePath,
          line: lineInfo.line,
          column: lineInfo.column,
          rule: 'rgaa-1.2',
        });
      }
    }

    return issues;
  }

  private static checkFrames(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

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
        rule: 'rgaa-2.1',
      });
    }

    return issues;
  }

  private static checkColors(content: string, filePath: string): A11yIssue[] {
    return [];
  }

  private static checkMandatoryElements(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const htmlWithoutLang = /<html(?![^>]*\blang=)[^>]*>/i;
    let match;
    if ((match = htmlWithoutLang.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-8.3',
        message: '[RGAA 8.3] Élément <html> sans attribut lang',
        severity: 'critical',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        rule: 'rgaa-8.3',
      });
    }

    const hasTitle = /<title[\s>]/i.test(content);
    if (!hasTitle) {
      issues.push({
        id: 'rgaa-8.5',
        message: '[RGAA 8.5] Titre de page (<title>) manquant',
        severity: 'critical',
        file: filePath,
        line: 1,
        column: 1,
        rule: 'rgaa-8.5',
      });
    }

    const presentationOnlyTags = /<\/?(b|i|u|s|strike|center|font)\b[^>]*>/gi;
    let match2;
    while ((match2 = presentationOnlyTags.exec(content)) !== null) {
      const tagContent = match2[0];
      const tagName = tagContent.match(/<\/?([a-z]+)/i)?.[1] || 'unknown';
      if (tagContent.includes('/>') || (tagContent.startsWith('</') && tagContent.includes('>'))) {
        continue;
      }
      const lineInfo = RgaaEngine.getLineFromIndex(content, match2.index);
      issues.push({
        id: 'rgaa-8.9',
        message: `[RGAA 8.9] Balise utilisée uniquement à des fins de présentation: <${tagName}>`,
        severity: 'medium',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        rule: 'rgaa-8.9',
      });
    }

    return issues;
  }

  private static checkInformationStructuring(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const headings = content.match(/<h[1-6][^>]*>/gi) || [];
    const headingLevels = headings.map(h => {
      const match = h.match(/<h([1-6])/i);
      return match ? parseInt(match[1]) : 0;
    });

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

            rule: 'rgaa-9.1',
          });
        }
      }
      lastLevel = headingLevels[i];
    }

    if (!content.toLowerCase().includes('<h1') && content.includes('<body')) {
      issues.push({
        id: 'rgaa-9.1',
        message: '[RGAA 9.1] Titre de niveau 1 (h1) manquant',
        severity: 'high',
        file: filePath,
        line: 1,
        column: 1,
        rule: 'rgaa-9.1',
      });
    }

    return issues;
  }

  private static checkLinks(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const emptyLinks = /<a[^>]*>\s*<\/a>/gi;
    let match;
    while ((match = emptyLinks.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-6.2',
        message: '[RGAA 6.2] Lien sans intitulé (contenu vide)',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        rule: 'rgaa-6.2',
      });
    }

    return issues;
  }

  private static checkForms(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const inputWithoutLabel = /<input(?![^>]*\b(?:aria-label|aria-labelledby|id="[^"]*"))[^>]*>/gi;
    let match;
    while ((match = inputWithoutLabel.exec(content)) !== null) {
      if (/type=["']hidden["']/i.test(match[0]) ||
          /type=["']submit["']/i.test(match[0]) ||
          /type=["']reset["']/i.test(match[0]) ||
          /type=["']button["']/i.test(match[0])) {
        continue;
      }
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-11.1',
        message: '[RGAA 11.1] Champ de formulaire sans étiquette',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        rule: 'rgaa-11.1',
      });
    }

    return issues;
  }

  private static checkScripts(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const clickHandlersWithoutKeyboard = /<(?:div|span|a)(?![^>]*\b(?:onKeyDown|onKeyUp|onKeyPress|tabIndex|role=))[^{]*onClick[^{]*>/gi;
    let match;
    while ((match = clickHandlersWithoutKeyboard.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-7.3',
        message: '[RGAA 7.3] Élément avec gestionnaire onclick sans gestionnaire clavier',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        rule: 'rgaa-7.3',
      });
    }

    return issues;
  }

  private static checkTables(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

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
        rule: 'rgaa-5.4',
      });
    }

    return issues;
  }

  private static checkHtmlSyntax(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const tagStack: { tag: string; line: number; column: number }[] = [];
    const tagPattern = /<(\/?)([\w]+)[^>]*>/gi;
    let tagMatch;
    const voidElements = ['img','br','hr','input','meta','link','area','base','col','embed','param','track','wbr'];

    while ((tagMatch = tagPattern.exec(content)) !== null) {
      const isClosing = tagMatch[1] === '/';
      const tagName = tagMatch[2].toLowerCase();
      const lineInfo = RgaaEngine.getLineFromIndex(content, tagMatch.index);
      if (voidElements.includes(tagName)) continue;
      if (isClosing) {
        if (tagStack.length > 0 && tagStack[tagStack.length - 1].tag === tagName) {
          tagStack.pop();
        }
      } else if (!tagMatch[0].endsWith('/>')) {
        tagStack.push({ tag: tagName, line: lineInfo.line, column: lineInfo.column });
      }
    }

    if (tagStack.length > 0 && tagStack.length <= 5) {
      for (const unclosed of tagStack) {
        issues.push({
          id: 'html-syntax-2',
          message: `[Syntaxe HTML] Balise <${unclosed.tag}> non fermée`,
          severity: 'high',
          file: filePath,
          line: unclosed.line,
          column: unclosed.column,
          rule: 'html-syntax-2',
        });
      }
    }

    // FIX 2 — unquotedAttrs maintenant déclarée
    const unquotedAttrs = /\s[\w-]+=(?!["'{])[^\s>]+/gi;
    let match: RegExpExecArray | null;
    while ((match = unquotedAttrs.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'html-syntax-3',
        message: `[Syntaxe HTML] Attribut sans guillemets trouvé`,
        severity: 'low',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        rule: 'html-syntax-3',
      });
    }

    return issues;
  }

  private static checkLandmarks(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const mainCount = (content.match(/<main[^>]*>/gi) || []).length;
    if (mainCount === 0 && content.includes('<body')) {
      issues.push({
        id: 'landmark-1',
        message: '[Landmark] Élément <main> manquant',
        severity: 'high',
        file: filePath,
        line: 1,
        column: 1,
        rule: 'landmark-1',
      });
    }

    const divCount = (content.match(/<div[^>]*>/gi) || []).length;
    const semanticCount = (content.match(/<(?:nav|header|footer|aside|main|article|section)[^>]*>/gi) || []).length;

    if (divCount > 5 && semanticCount < 2 && content.includes('<body')) {
      issues.push({
        id: 'landmark-2',
        message: `[Landmark] ${divCount} éléments <div> avec peu de landmarks sémantiques`,
        severity: 'medium',
        file: filePath,
        line: 1,
        column: 1,
        rule: 'landmark-2',
      });
    }

    return issues;
  }

  private static getLineFromIndex(content: string, index: number): { line: number; column: number } {
    const lines = content.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  private static checkLinkTexts(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const vagueTexts = ['clique ici', 'cliquez ici', 'ici', 'lire plus', 'lire la suite',
      'en savoir plus', 'click here', 'here', 'read more', 'more', 'suite', 'voir'];

    const linkPattern = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkPattern.exec(content)) !== null) {
      const linkText = match[1]
        .replace(/<[^>]*>/g, '')
        .trim()
        .toLowerCase();

      if (vagueTexts.includes(linkText)) {
        const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
        issues.push({
          id: 'rgaa-6.1',
          message: `[RGAA 6.1] Lien non explicite : texte "${linkText}" n'est pas descriptif`,
          severity: 'high',
          file: filePath,
          line: lineInfo.line,
          column: lineInfo.column,
          rule: 'rgaa-6.1',
        });
      }
    }

    return issues;
  }

  // 2. Bouton sans type — RGAA 11.9
  private static checkButtonTypes(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const buttonWithoutType = /<button(?![^>]*\btype=)[^>]*>/gi;
    let match;

    while ((match = buttonWithoutType.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-11.9',
        message: '[RGAA 11.9] Bouton sans attribut type (type="button|submit|reset" manquant)',
        severity: 'medium',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        rule: 'rgaa-11.9',
      });
    }

    return issues;
  }

  // 3. Tableau sans en-têtes — RGAA 5.6 / 5.7
  private static checkTableHeaders(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let match;

    while ((match = tablePattern.exec(content)) !== null) {
      const tableContent = match[1];
      const hasTh = /<th[\s>]/i.test(tableContent);
      const hasScope = /\bscope=/i.test(tableContent);
      const hasHeaders = /\bheaders=/i.test(tableContent);

      if (!hasTh && !hasScope && !hasHeaders) {
        const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
        issues.push({
          id: 'rgaa-5.6',
          message: '[RGAA 5.6] Tableau sans en-têtes (<th> ou attribut scope manquant)',
          severity: 'high',
          file: filePath,
          line: lineInfo.line,
          column: lineInfo.column,
          rule: 'rgaa-5.6',
        });
      }
    }

    return issues;
  }

  // 4. ARIA manquant sur éléments interactifs — RGAA 7.1
  private static checkAriaLabels(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Éléments avec role interactif sans aria-label ni aria-labelledby
    const interactiveRoles = /<(?:div|span)[^>]*\brole=["'](?:button|link|checkbox|radio|tab|menuitem|option)[^"']*["'](?![^>]*\b(?:aria-label|aria-labelledby))[^>]*>/gi;
    let match;

    while ((match = interactiveRoles.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-7.1',
        message: '[RGAA 7.1] Élément interactif avec role ARIA sans aria-label ou aria-labelledby',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        rule: 'rgaa-7.1',
      });
    }

    // Bouton avec uniquement une image sans aria-label
    const buttonWithImgOnly = /<button(?![^>]*\b(?:aria-label|aria-labelledby))[^>]*>\s*<img[^>]*>\s*<\/button>/gi;
    while ((match = buttonWithImgOnly.exec(content)) !== null) {
      const lineInfo = RgaaEngine.getLineFromIndex(content, match.index);
      issues.push({
        id: 'rgaa-7.1',
        message: '[RGAA 7.1] Bouton contenant uniquement une image sans aria-label',
        severity: 'high',
        file: filePath,
        line: lineInfo.line,
        column: lineInfo.column,
        rule: 'rgaa-7.1',
      });
    }

    return issues;
  }

  // 5. Landmarks incomplets — RGAA 12.6
  private static checkLandmarksComplete(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    if (!content.includes('<body')) return issues;

    const hasHeader  = /<header[^>]*>/i.test(content) || /role=["']banner["']/i.test(content);
    const hasNav     = /<nav[^>]*>/i.test(content) || /role=["']navigation["']/i.test(content);
    const hasMain    = /<main[^>]*>/i.test(content) || /role=["']main["']/i.test(content);
    const hasFooter  = /<footer[^>]*>/i.test(content) || /role=["']contentinfo["']/i.test(content);

    if (!hasHeader) {
      issues.push({
        id: 'rgaa-12.6',
        message: '[RGAA 12.6] Landmark <header> (banner) manquant — obligatoire pour la navigation',
        severity: 'medium',
        file: filePath,
        line: 1,
        column: 1,
        rule: 'rgaa-12.6',
      });
    }

    if (!hasNav) {
      issues.push({
        id: 'rgaa-12.6',
        message: '[RGAA 12.6] Landmark <nav> (navigation) manquant — obligatoire pour la navigation',
        severity: 'medium',
        file: filePath,
        line: 1,
        column: 1,
        rule: 'rgaa-12.6',
      });
    }

    if (!hasMain) {
      issues.push({
        id: 'rgaa-12.6',
        message: '[RGAA 12.6] Landmark <main> manquant — obligatoire pour la structure',
        severity: 'high',
        file: filePath,
        line: 1,
        column: 1,
        rule: 'rgaa-12.6',
      });
    }

    if (!hasFooter) {
      issues.push({
        id: 'rgaa-12.6',
        message: '[RGAA 12.6] Landmark <footer> (contentinfo) manquant — recommandé',
        severity: 'low',
        file: filePath,
        line: 1,
        column: 1,
        rule: 'rgaa-12.6',
      });
    }
    return issues;
  }

}