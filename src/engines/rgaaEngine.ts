import * as ts from 'typescript';
import { A11yIssue, Severity } from '../core/types';

export class RgaaEngine {

  // ─────────────────────────────────────────────
  // PUBLIC ENTRY POINTS
  // ─────────────────────────────────────────────

  public static async run(
    fileContent: string,
    filePath: string
  ): Promise<A11yIssue[]> {
    const issues: A11yIssue[] = [];

    if (!filePath.match(/\.(html|jsx|tsx|ts)$/i)) {
      console.log('[RgaaEngine] Skipping non-HTML/JSX/TSX/TS file:', filePath);
      return [];
    }

    const cleanContent = RgaaEngine.removeComments(fileContent);

    issues.push(...RgaaEngine.checkMandatoryElements(cleanContent, filePath));
    issues.push(...RgaaEngine.checkImages(cleanContent, filePath));
    issues.push(...RgaaEngine.checkFrames(cleanContent, filePath));
    issues.push(...RgaaEngine.checkColors(cleanContent, filePath));
    issues.push(...RgaaEngine.checkMultimedia(cleanContent, filePath));       // NEW — RGAA 4.x
    issues.push(...RgaaEngine.checkTables(cleanContent, filePath));
    issues.push(...RgaaEngine.checkTableHeaders(cleanContent, filePath));
    issues.push(...RgaaEngine.checkLinks(cleanContent, filePath));
    issues.push(...RgaaEngine.checkLinkTexts(cleanContent, filePath));
    issues.push(...RgaaEngine.checkDownloadLinks(cleanContent, filePath));    // NEW — RGAA 13.3
    issues.push(...RgaaEngine.checkScripts(cleanContent, filePath));
    issues.push(...RgaaEngine.checkAriaLabels(cleanContent, filePath));
    issues.push(...RgaaEngine.checkInformationStructuring(cleanContent, filePath));
    issues.push(...RgaaEngine.checkForms(cleanContent, filePath));
    issues.push(...RgaaEngine.checkButtonTypes(cleanContent, filePath));
    issues.push(...RgaaEngine.checkLandmarks(cleanContent, filePath));
    issues.push(...RgaaEngine.checkLandmarksComplete(cleanContent, filePath));
    issues.push(...RgaaEngine.checkSkipLinks(cleanContent, filePath));        // NEW — RGAA 12.1
    issues.push(...RgaaEngine.checkFocusVisible(cleanContent, filePath));     // NEW — RGAA 10.7
    issues.push(...RgaaEngine.checkHtmlSyntax(cleanContent, filePath));

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
    const { analyzeCSS } = require('./cssAnalyzer');
    const issues = analyzeCSS(fileContent, filePath);
    console.log('[RgaaEngine] CSS issues found:', issues.length);
    return issues;
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private static removeComments(content: string): string {
    let clean = content.replace(/<!--[\s\S]*?-->/g, '');
    clean = clean.replace(/\/\/.*$/gm, '');
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');
    return clean;
  }

  private static getLineFromIndex(
    content: string,
    index: number
  ): { line: number; column: number } {
    const lines = content.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  /** Tiny factory to avoid repeating the same object shape everywhere */
  private static issue(
    id: string,
    message: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    filePath: string,
    line: number,
    column: number
  ): A11yIssue {
    return { id, message, severity, file: filePath, line, column, rule: id };
  }

  // ─────────────────────────────────────────────
  // THÈME 1 — IMAGES
  // ─────────────────────────────────────────────

  private static checkImages(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // RGAA 1.1 — <img> without alt
    const imgWithoutAlt = /<img(?![^>]*\balt=)[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = imgWithoutAlt.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-1.1',
        '[RGAA 1.1] Image porteuse d\'information sans alternative textuelle (attribut alt manquant)',
        'critical', filePath, line, column
      ));
    }

    // FIX — RGAA 1.1 — <input type="image"> without alt
    const inputImageWithoutAlt = /<input[^>]*type=["']image["'][^>]*>/gi;
    while ((m = inputImageWithoutAlt.exec(content)) !== null) {
      if (!/\balt=/i.test(m[0])) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-1.1',
          '[RGAA 1.1] <input type="image"> sans attribut alt',
          'critical', filePath, line, column
        ));
      }
    }

    // NEW — RGAA 1.2 — decorative image with non-empty alt
    const imgWithAlt = /<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi;
    while ((m = imgWithAlt.exec(content)) !== null) {
      const altValue = m[1].trim();
      const hasRole = /\brole=["']presentation["']/i.test(m[0]);
      const hasAriaHidden = /\baria-hidden=["']true["']/i.test(m[0]);
      // Decorative images should have alt="" + role="presentation" or aria-hidden
      if ((hasRole || hasAriaHidden) && altValue !== '') {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-1.2',
          '[RGAA 1.2] Image décorative avec attribut alt non vide — utilisez alt=""',
          'medium', filePath, line, column
        ));
      }
    }

    // NEW — RGAA 1.1 — <svg> with visible content but no role="img" and no accessible label
    const svgPattern = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi;
    while ((m = svgPattern.exec(content)) !== null) {
      const attrs = m[1];
      const inner = m[2];
      const hasRole   = /\brole=["']img["']/i.test(attrs);
      const hasTitle  = /<title[\s>]/i.test(inner);
      const hasAriaLabel = /\baria-label=/i.test(attrs);
      const hasAriaHidden = /\baria-hidden=["']true["']/i.test(attrs);
      // Only flag SVGs that seem informative (contain text or meaningful shapes)
      const seemsInformative = /<text[\s>]/i.test(inner) || /<use[\s>]/i.test(inner);
      if (!hasAriaHidden && seemsInformative && !hasRole && !hasTitle && !hasAriaLabel) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-1.1',
          '[RGAA 1.1] SVG porteur d\'information sans role="img", <title> ni aria-label',
          'high', filePath, line, column
        ));
      }
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 2 — CADRES
  // ─────────────────────────────────────────────

  private static checkFrames(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // RGAA 2.1 — iframe without title attribute
    const frameWithoutTitle = /<(?:iframe|frame)(?![^>]*\btitle=)[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = frameWithoutTitle.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-2.1',
        '[RGAA 2.1] Cadre (<iframe> ou <frame>) sans attribut title',
        'high', filePath, line, column
      ));
    }

    // FIX — RGAA 2.1 — iframe with empty title
    const frameWithEmptyTitle = /<(?:iframe|frame)[^>]*\btitle=["']\s*["'][^>]*>/gi;
    while ((m = frameWithEmptyTitle.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-2.1',
        '[RGAA 2.1] Cadre (<iframe>) avec attribut title vide',
        'high', filePath, line, column
      ));
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 3 — COULEURS (inline styles)
  // ─────────────────────────────────────────────

  private static checkColors(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // NEW — RGAA 3.2 — detect inline color + background-color and compute contrast
    const inlineStylePattern = /style=["'][^"']*color\s*:[^"']*["']/gi;
    let m: RegExpExecArray | null;
    while ((m = inlineStylePattern.exec(content)) !== null) {
      const styleAttr = m[0];
      const fgMatch = styleAttr.match(/(?<![a-z-])color\s*:\s*(#[0-9a-f]{3,6}|rgb\([^)]+\))/i);
      const bgMatch = styleAttr.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,6}|rgb\([^)]+\))/i);

      if (fgMatch && bgMatch) {
        const ratio = RgaaEngine.computeContrastRatio(fgMatch[1], bgMatch[1]);
        if (ratio !== null && ratio < 4.5) {
          const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
          issues.push(RgaaEngine.issue(
            'rgaa-3.2',
            `[RGAA 3.2] Contraste insuffisant détecté en style inline : ratio ~${ratio.toFixed(1)}:1 (minimum 4.5:1)`,
            'critical', filePath, line, column
          ));
        }
      }
    }

    // NEW — RGAA 3.3 — information given only by color
    const colorOnlyPattern = /style=["'][^"']*color\s*:[^"']*["']/gi;
    const colorOnlyContext = /<span[^>]*style=["'][^"']*color\s*:[^"']*["'][^>]*>[^<]{1,80}<\/span>/gi;
    while ((m = colorOnlyContext.exec(content)) !== null) {
      // Heuristic: span with only a color style and no other visual cue (no icon, no symbol)
      const inner = m[0];
      const hasAriaLabel = /\baria-label=/i.test(inner);
      const hasTitle = /\btitle=/i.test(inner);
      if (!hasAriaLabel && !hasTitle) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-3.3',
          '[RGAA 3.3] Information transmise uniquement par la couleur (span coloré sans alternative textuelle)',
          'medium', filePath, line, column
        ));
      }
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 4 — MULTIMÉDIA  (NEW)
  // ─────────────────────────────────────────────

  private static checkMultimedia(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // RGAA 4.1 — <video> without <track kind="subtitles|captions">
    const videoPattern = /<video\b[^>]*>([\s\S]*?)<\/video>/gi;
    let m: RegExpExecArray | null;
    while ((m = videoPattern.exec(content)) !== null) {
      const inner = m[1];
      const hasTrack = /<track[^>]*\bkind=["'](?:subtitles|captions)["'][^>]*>/i.test(inner);
      if (!hasTrack) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-4.1',
          '[RGAA 4.1] Vidéo sans sous-titres (<track kind="subtitles|captions"> manquant)',
          'high', filePath, line, column
        ));
      }
    }

    // RGAA 4.8 — <audio> without a transcript nearby
    // Heuristic: <audio> not followed within ~500 chars by a transcript link or <p>
    const audioPattern = /<audio\b[^>]*>[\s\S]*?<\/audio>/gi;
    while ((m = audioPattern.exec(content)) !== null) {
      const after = content.substring(m.index + m[0].length, m.index + m[0].length + 500);
      const hasTranscript =
        /transcri/i.test(after) ||
        /retranscri/i.test(after) ||
        /<a\b[^>]*>[^<]*(?:audio|transcri|texte)[^<]*<\/a>/i.test(after);
      if (!hasTranscript) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-4.8',
          '[RGAA 4.8] Contenu audio sans transcription textuelle à proximité',
          'high', filePath, line, column
        ));
      }
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 5 — TABLEAUX
  // ─────────────────────────────────────────────

  private static checkTables(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // RGAA 5.4 — data table without <caption>
    const tablePattern = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
    let m: RegExpExecArray | null;
    while ((m = tablePattern.exec(content)) !== null) {
      const inner = m[1];
      const hasCaption = /<caption[\s>]/i.test(inner);
      const hasAriaLabel = /\baria-label=/i.test(m[0]);
      const hasAriaLabelledby = /\baria-labelledby=/i.test(m[0]);
      if (!hasCaption && !hasAriaLabel && !hasAriaLabelledby) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-5.4',
          '[RGAA 5.4] Tableau de données sans titre (<caption> ou aria-label manquant)',
          'medium', filePath, line, column
        ));
      }
    }

    return issues;
  }

  private static checkTableHeaders(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // RGAA 5.6/5.7 — table without <th> or scope
    const tablePattern = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
    let m: RegExpExecArray | null;
    while ((m = tablePattern.exec(content)) !== null) {
      const inner = m[1];
      const hasTh      = /<th[\s>]/i.test(inner);
      const hasScope   = /\bscope=/i.test(inner);
      const hasHeaders = /\bheaders=/i.test(inner);
      if (!hasTh && !hasScope && !hasHeaders) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-5.6',
          '[RGAA 5.6] Tableau sans en-têtes (<th> ou attribut scope manquant)',
          'high', filePath, line, column
        ));
      }
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 6 — LIENS
  // ─────────────────────────────────────────────

  private static checkLinks(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // RGAA 6.2 — completely empty link
    const emptyLinks = /<a[^>]*>\s*<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = emptyLinks.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-6.2',
        '[RGAA 6.2] Lien sans intitulé (contenu vide)',
        'high', filePath, line, column
      ));
    }

    // FIX — RGAA 6.1 — link containing only an image with alt=""
    const linkImageEmptyAlt = /<a[^>]*>\s*<img[^>]*\balt=["']\s*["'][^>]*>\s*<\/a>/gi;
    while ((m = linkImageEmptyAlt.exec(content)) !== null) {
      const hasAriaLabel = /\baria-label=/i.test(m[0]);
      const hasAriaLabelledby = /\baria-labelledby=/i.test(m[0]);
      if (!hasAriaLabel && !hasAriaLabelledby) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-6.1',
          '[RGAA 6.1] Lien contenant uniquement une image avec alt vide — lien sans intitulé accessible',
          'high', filePath, line, column
        ));
      }
    }

    // NEW — RGAA 6.2 — title attribute identical to link text
    const linkWithTitle = /<a\b[^>]*\btitle=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = linkWithTitle.exec(content)) !== null) {
      const titleVal = m[1].trim().toLowerCase();
      const linkText = m[2].replace(/<[^>]*>/g, '').trim().toLowerCase();
      if (titleVal && linkText && titleVal === linkText) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-6.2',
          `[RGAA 6.2] Attribut title identique au texte du lien ("${m[1]}") — redondant et inutile`,
          'low', filePath, line, column
        ));
      }
    }

    return issues;
  }

  private static checkLinkTexts(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // FIX — extended vague text list
    const vagueTexts = [
      'clique ici', 'cliquez ici', 'ici', 'lire plus', 'lire la suite',
      'en savoir plus', 'click here', 'here', 'read more', 'more', 'suite',
      'voir', 'voir plus', 'voir tout', 'consulter', 'accéder', 'acceder',
      'télécharger', 'telecharger', 'download', 'continuer', 'suivant', 'next',
    ];

    const linkPattern = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkPattern.exec(content)) !== null) {
      const linkText = m[1].replace(/<[^>]*>/g, '').trim().toLowerCase();
      if (vagueTexts.includes(linkText)) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-6.1',
          `[RGAA 6.1] Lien non explicite : texte "${linkText}" n'est pas descriptif`,
          'high', filePath, line, column
        ));
      }
    }

    return issues;
  }

  // NEW — RGAA 13.3 — download links without format/size indication
  private static checkDownloadLinks(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const downloadExts = /\.(pdf|zip|docx?|xlsx?|pptx?|odt|ods|odp|csv|mp3|mp4|avi|mov)\b/i;
    const formatHint   = /\b(pdf|zip|doc|xls|ppt|odt|csv|mp3|mp4|ko|mo|go|kb|mb|gb|octets?|bytes?)\b/i;

    const linkPattern = /<a\b[^>]*href=["']([^"'#?]*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkPattern.exec(content)) !== null) {
      const href     = m[1];
      const linkText = m[2].replace(/<[^>]*>/g, '').trim();
      const titleVal = (m[0].match(/\btitle=["']([^"']*)["']/i) || [])[1] || '';

      if (downloadExts.test(href)) {
        const fullContext = linkText + ' ' + titleVal;
        if (!formatHint.test(fullContext)) {
          const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
          issues.push(RgaaEngine.issue(
            'rgaa-13.3',
            `[RGAA 13.3] Lien de téléchargement sans indication du format ou du poids (fichier : ${href.split('/').pop()})`,
            'medium', filePath, line, column
          ));
        }
      }
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 7 — SCRIPTS
  // ─────────────────────────────────────────────

  private static checkScripts(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // RGAA 7.3 — clickable element without keyboard handler
    const clickWithoutKeyboard = /<(?:div|span)(?![^>]*\b(?:onkeydown|onkeyup|onkeypress|tabindex|role=))[^>]*\bonclick\b[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = clickWithoutKeyboard.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-7.3',
        '[RGAA 7.3] Élément avec gestionnaire onclick sans gestionnaire clavier (onkeydown/onkeyup)',
        'high', filePath, line, column
      ));
    }

    // NEW — RGAA 7.3 — role="button" without tabindex
    const roleButtonNoTabindex = /<(?:div|span)[^>]*\brole=["']button["'](?![^>]*\btabindex=)[^>]*>/gi;
    while ((m = roleButtonNoTabindex.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-7.3',
        '[RGAA 7.3] Élément avec role="button" sans tabindex — non focusable au clavier',
        'high', filePath, line, column
      ));
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 8/9 — MANDATORY ELEMENTS & STRUCTURING
  // ─────────────────────────────────────────────

  private static checkMandatoryElements(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // RGAA 8.3 — <html> without lang
    const htmlWithoutLang = /<html(?![^>]*\blang=)[^>]*>/i;
    let m: RegExpExecArray | null;
    if ((m = htmlWithoutLang.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-8.3',
        '[RGAA 8.3] Élément <html> sans attribut lang',
        'critical', filePath, line, column
      ));
    }

    // RGAA 8.5 — missing <title>
    if (!/<title[\s>]/i.test(content) && content.includes('<head')) {
      issues.push(RgaaEngine.issue(
        'rgaa-8.5',
        '[RGAA 8.5] Titre de page (<title>) manquant',
        'critical', filePath, 1, 1
      ));
    }

    // RGAA 8.9 — presentational tags
    // FIX — now also catches <i> and <center>
    const presentationTags = /<(b|i|u|s|strike|center|font)\b[^>]*>/gi;
    while ((m = presentationTags.exec(content)) !== null) {
      const tagName = m[1].toLowerCase();
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-8.9',
        `[RGAA 8.9] Balise utilisée uniquement à des fins de présentation: <${tagName}>`,
        'medium', filePath, line, column
      ));
    }

    return issues;
  }

  private static checkInformationStructuring(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // RGAA 9.1 — heading level skipped
    const headingMatches = [...content.matchAll(/<h([1-6])\b[^>]*>/gi)];
    const levels = headingMatches.map(h => parseInt(h[1]));
    let lastLevel = 0;
    for (let i = 0; i < levels.length; i++) {
      if (lastLevel !== 0 && levels[i] > lastLevel + 1) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, headingMatches[i].index!);
        issues.push(RgaaEngine.issue(
          'rgaa-9.1',
          `[RGAA 9.1] Niveau de titre sauté: h${lastLevel} → h${levels[i]}`,
          'medium', filePath, line, column
        ));
      }
      lastLevel = levels[i];
    }

    // RGAA 9.1 — no h1 at all
    if (!content.toLowerCase().includes('<h1') && content.includes('<body')) {
      issues.push(RgaaEngine.issue(
        'rgaa-9.1',
        '[RGAA 9.1] Titre de niveau 1 (h1) manquant',
        'high', filePath, 1, 1
      ));
    }

    // NEW — RGAA 9.3 — simulated list using dashes/bullets in text
    const simulatedList = /(<p[^>]*>)([\s\S]*?(-\s+.+\n?){2,})([\s\S]*?)(<\/p>)/gi;
    let m: RegExpExecArray | null;
    while ((m = simulatedList.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-9.3',
        '[RGAA 9.3] Liste simulée avec des tirets dans un <p> — utilisez <ul> ou <ol>',
        'medium', filePath, line, column
      ));
    }

    // NEW — RGAA 9.4 — <li> outside <ul> or <ol>
    // Strip valid lists first, then check for orphan <li>
    const stripped = content.replace(/<(?:ul|ol)\b[^>]*>[\s\S]*?<\/(?:ul|ol)>/gi, '');
    const orphanLi = /<li\b[^>]*>/gi;
    while ((m = orphanLi.exec(stripped)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-9.4',
        '[RGAA 9.4] Élément <li> en dehors d\'une liste <ul> ou <ol>',
        'medium', filePath, line, column
      ));
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 10 — PRÉSENTATION
  // ─────────────────────────────────────────────

  // NEW — RGAA 10.7 — outline:none on focusable elements (inline style)
  private static checkFocusVisible(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const outlineNone = /<(?:a|button|input|select|textarea)\b[^>]*style=["'][^"']*outline\s*:\s*(?:none|0)\b[^"']*["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = outlineNone.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-10.7',
        '[RGAA 10.7] Focus supprimé via outline:none sur un élément interactif',
        'high', filePath, line, column
      ));
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 11 — FORMULAIRES
  // ─────────────────────────────────────────────

  private static checkForms(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];
    const skipTypes = /type=["'](?:hidden|submit|reset|button|image)["']/i;

    // RGAA 11.1 — input without any label association
    const inputPattern = /<input\b[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = inputPattern.exec(content)) !== null) {
      if (skipTypes.test(m[0])) continue;
      const hasId = /\bid=["']([^"']+)["']/i.exec(m[0]);
      const hasAriaLabel = /\baria-label=/i.test(m[0]);
      const hasAriaLabelledby = /\baria-labelledby=/i.test(m[0]);

      let labelLinked = false;
      if (hasId) {
        const idVal = hasId[1];
        labelLinked = new RegExp(`<label[^>]*\\bfor=["']${idVal}["']`, 'i').test(content);
      }

      if (!labelLinked && !hasAriaLabel && !hasAriaLabelledby) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-11.1',
          '[RGAA 11.1] Champ de formulaire sans étiquette associée (label for/id, aria-label ou aria-labelledby manquant)',
          'high', filePath, line, column
        ));
      }
    }

    // FIX — RGAA 11.1 — label present but not linked (no for/id pair)
    const labelNoFor = /<label(?![^>]*\bfor=)[^>]*>/gi;
    while ((m = labelNoFor.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-11.1',
        '[RGAA 11.1] Élément <label> sans attribut for — non lié à un champ',
        'high', filePath, line, column
      ));
    }

    // NEW — RGAA 11.2 — required field without required or aria-required
    const inputNoRequired = /<input\b[^>]*>/gi;
    while ((m = inputNoRequired.exec(content)) !== null) {
      if (skipTypes.test(m[0])) continue;
      // Heuristic: has an id linked to a label containing "obligatoire|required|*"
      const hasId = /\bid=["']([^"']+)["']/i.exec(m[0]);
      if (!hasId) continue;
      const idVal = hasId[1];
      const labelMatch = content.match(
        new RegExp(`<label[^>]*\\bfor=["']${idVal}["'][^>]*>[^<]*(?:\\*|obligatoire|required)[^<]*<\\/label>`, 'i')
      );
      const hasRequired = /\brequired\b/i.test(m[0]);
      const hasAriaRequired = /\baria-required=["']true["']/i.test(m[0]);
      if (labelMatch && !hasRequired && !hasAriaRequired) {
        const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
        issues.push(RgaaEngine.issue(
          'rgaa-11.2',
          '[RGAA 11.2] Champ obligatoire sans attribut required ni aria-required="true"',
          'high', filePath, line, column
        ));
      }
    }

    // NEW — RGAA 11.5 — radio/checkbox group without fieldset+legend
    const radioGroupPattern = /<input[^>]*type=["']radio["'][^>]*name=["']([^"']+)["'][^>]*>/gi;
    const radioNames = new Set<string>();
    while ((m = radioGroupPattern.exec(content)) !== null) {
      const name = m[1];
      if (!radioNames.has(name)) {
        radioNames.add(name);
        // Find where this radio group starts
        const groupStart = content.indexOf(`name="${name}"`);
        // Check if it's inside a <fieldset>
        const before = content.substring(0, groupStart);
        const lastFieldset = before.lastIndexOf('<fieldset');
        const lastFieldsetClose = before.lastIndexOf('</fieldset>');
        if (lastFieldset === -1 || lastFieldsetClose > lastFieldset) {
          const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
          issues.push(RgaaEngine.issue(
            'rgaa-11.5',
            `[RGAA 11.5] Groupe de boutons radio (name="${name}") sans <fieldset> et <legend>`,
            'high', filePath, line, column
          ));
        }
      }
    }

    // NEW — RGAA 11.4 — submit button with only an image and no accessible label
    const submitImgOnly = /<button[^>]*type=["']submit["'](?![^>]*\baria-label)[^>]*>\s*<img[^>]*\balt=["']\s*["'][^>]*>\s*<\/button>/gi;
    while ((m = submitImgOnly.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-11.4',
        '[RGAA 11.4] Bouton submit contenant uniquement une image sans texte accessible (alt vide, pas d\'aria-label)',
        'high', filePath, line, column
      ));
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 11 — BUTTON TYPES
  // ─────────────────────────────────────────────

  private static checkButtonTypes(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const buttonWithoutType = /<button(?![^>]*\btype=)[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = buttonWithoutType.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-11.9',
        '[RGAA 11.9] Bouton sans attribut type (type="button|submit|reset" manquant)',
        'medium', filePath, line, column
      ));
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 12 — NAVIGATION
  // ─────────────────────────────────────────────

  // NEW — RGAA 12.1 — no skip link
  private static checkSkipLinks(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    if (!content.includes('<body')) return issues;

    const hasSkipLink =
      /<a[^>]*href=["']#(?:main|content|contenu|skip|principal)[^"']*["'][^>]*>/i.test(content) ||
      /<a[^>]*href=["']#[^"']+["'][^>]*>[^<]*(?:passer|skip|aller au contenu|contenu principal)/i.test(content);

    if (!hasSkipLink) {
      issues.push(RgaaEngine.issue(
        'rgaa-12.1',
        '[RGAA 12.1] Lien d\'évitement (skip link) vers le contenu principal manquant',
        'high', filePath, 1, 1
      ));
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 12 — LANDMARKS
  // ─────────────────────────────────────────────

  private static checkLandmarks(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const mainCount = (content.match(/<main\b[^>]*>/gi) || []).length;
    if (mainCount === 0 && content.includes('<body')) {
      issues.push(RgaaEngine.issue(
        'landmark-1',
        '[Landmark] Élément <main> manquant',
        'high', filePath, 1, 1
      ));
    }

    const divCount      = (content.match(/<div\b[^>]*>/gi) || []).length;
    const semanticCount = (content.match(/<(?:nav|header|footer|aside|main|article|section)\b[^>]*>/gi) || []).length;
    if (divCount > 5 && semanticCount < 2 && content.includes('<body')) {
      issues.push(RgaaEngine.issue(
        'landmark-2',
        `[Landmark] ${divCount} éléments <div> avec peu de landmarks sémantiques`,
        'medium', filePath, 1, 1
      ));
    }

    return issues;
  }

  private static checkLandmarksComplete(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    if (!content.includes('<body')) return issues;

    const hasHeader = /<header\b[^>]*>/i.test(content) || /role=["']banner["']/i.test(content);
    const hasNav    = /<nav\b[^>]*>/i.test(content)    || /role=["']navigation["']/i.test(content);
    const hasMain   = /<main\b[^>]*>/i.test(content)   || /role=["']main["']/i.test(content);
    const hasFooter = /<footer\b[^>]*>/i.test(content) || /role=["']contentinfo["']/i.test(content);

    if (!hasHeader) {
      issues.push(RgaaEngine.issue(
        'rgaa-12.6', '[RGAA 12.6] Landmark <header> (banner) manquant', 'medium', filePath, 1, 1
      ));
    }
    if (!hasNav) {
      issues.push(RgaaEngine.issue(
        'rgaa-12.6', '[RGAA 12.6] Landmark <nav> (navigation) manquant', 'medium', filePath, 1, 1
      ));
    }
    if (!hasMain) {
      issues.push(RgaaEngine.issue(
        'rgaa-12.6', '[RGAA 12.6] Landmark <main> manquant — obligatoire pour la structure', 'high', filePath, 1, 1
      ));
    }
    if (!hasFooter) {
      issues.push(RgaaEngine.issue(
        'rgaa-12.6', '[RGAA 12.6] Landmark <footer> (contentinfo) manquant — recommandé', 'low', filePath, 1, 1
      ));
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // THÈME 7 — ARIA
  // ─────────────────────────────────────────────

  private static checkAriaLabels(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // RGAA 7.1 — interactive role without aria-label/labelledby
    const interactiveRoles = /<(?:div|span)\b[^>]*\brole=["'](?:button|link|checkbox|radio|tab|menuitem|option)["'](?![^>]*\b(?:aria-label|aria-labelledby))[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = interactiveRoles.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-7.1',
        '[RGAA 7.1] Élément interactif avec role ARIA sans aria-label ou aria-labelledby',
        'high', filePath, line, column
      ));
    }

    // RGAA 7.1 — button with only image and no aria-label
    const buttonImgOnly = /<button(?![^>]*\b(?:aria-label|aria-labelledby))[^>]*>\s*<img[^>]*>\s*<\/button>/gi;
    while ((m = buttonImgOnly.exec(content)) !== null) {
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      issues.push(RgaaEngine.issue(
        'rgaa-7.1',
        '[RGAA 7.1] Bouton contenant uniquement une image sans aria-label',
        'high', filePath, line, column
      ));
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // HTML SYNTAX
  // ─────────────────────────────────────────────

  private static checkHtmlSyntax(content: string, filePath: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    const voidElements = new Set([
      'img','br','hr','input','meta','link','area','base',
      'col','embed','param','track','wbr',
    ]);
    const tagStack: { tag: string; line: number; column: number }[] = [];
    const tagPattern = /<(\/?)([\w]+)[^>]*>/gi;
    let m: RegExpExecArray | null;

    while ((m = tagPattern.exec(content)) !== null) {
      const isClosing = m[1] === '/';
      const tagName   = m[2].toLowerCase();
      if (voidElements.has(tagName)) continue;
      const { line, column } = RgaaEngine.getLineFromIndex(content, m.index);
      if (isClosing) {
        if (tagStack.length > 0 && tagStack[tagStack.length - 1].tag === tagName) {
          tagStack.pop();
        }
      } else if (!m[0].endsWith('/>')) {
        tagStack.push({ tag: tagName, line, column });
      }
    }

    // Only report if a small number of unclosed tags to avoid false-positive floods
    if (tagStack.length > 0 && tagStack.length <= 5) {
      for (const unclosed of tagStack) {
        issues.push(RgaaEngine.issue(
          'html-syntax-2',
          `[Syntaxe HTML] Balise <${unclosed.tag}> non fermée`,
          'high', filePath, unclosed.line, unclosed.column
        ));
      }
    }

    return issues;
  }

  // ─────────────────────────────────────────────
  // CONTRAST UTILITY
  // ─────────────────────────────────────────────

  /** Returns WCAG contrast ratio or null if colors can't be parsed */
  private static computeContrastRatio(fg: string, bg: string): number | null {
    const fgLum = RgaaEngine.relativeLuminance(fg);
    const bgLum = RgaaEngine.relativeLuminance(bg);
    if (fgLum === null || bgLum === null) return null;
    const lighter = Math.max(fgLum, bgLum);
    const darker  = Math.min(fgLum, bgLum);
    return (lighter + 0.05) / (darker + 0.05);
  }

  private static relativeLuminance(color: string): number | null {
    const rgb = RgaaEngine.parseColor(color);
    if (!rgb) return null;
    const [r, g, b] = rgb.map(c => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  private static parseColor(color: string): [number, number, number] | null {
    color = color.trim();
    // #rgb
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      const r = parseInt(color[1] + color[1], 16);
      const g = parseInt(color[2] + color[2], 16);
      const b = parseInt(color[3] + color[3], 16);
      return [r, g, b];
    }
    // #rrggbb
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      return [
        parseInt(color.slice(1, 3), 16),
        parseInt(color.slice(3, 5), 16),
        parseInt(color.slice(5, 7), 16),
      ];
    }
    // rgb(r,g,b)
    const rgbMatch = color.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/i);
    if (rgbMatch) {
      return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
    }
    return null;
  }
}