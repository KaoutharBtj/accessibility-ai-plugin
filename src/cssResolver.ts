import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export async function resolveCssForHtml(
  document: vscode.TextDocument,
  htmlContent: string
): Promise<string> {
  const cssChunks: string[] = [];

  // Extract href values from <link rel="stylesheet" href="...">
  const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
  const hrefRegex = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["'][^>]*>/gi;

  const hrefs = new Set<string>();

  for (const regex of [linkRegex, hrefRegex]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(htmlContent)) !== null) {
      hrefs.add(match[1]);
    }
  }

  const docDir = path.dirname(document.uri.fsPath);

  for (const href of hrefs) {
    // Skip CDN / absolute URLs — can't resolve without network
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
      continue;
    }

    const cssPath = path.resolve(docDir, href);
    if (fs.existsSync(cssPath)) {
      try {
        cssChunks.push(fs.readFileSync(cssPath, 'utf-8'));
      } catch {
        // File unreadable — skip silently
      }
    } else {
      // Maybe it's open in another editor tab
      const openDoc = vscode.workspace.textDocuments.find(
        d => d.uri.fsPath === cssPath
      );
      if (openDoc) cssChunks.push(openDoc.getText());
    }
  }

  return cssChunks.join('\n');
}

export interface LinkedHtml {
  htmlContent: string;
  htmlUri: vscode.Uri;
}

export async function findLinkedCssFiles(
  cssDocument: vscode.TextDocument
): Promise<LinkedHtml | null> {
  const cssFileName = path.basename(cssDocument.uri.fsPath);

  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId !== 'html') continue;
    const content = doc.getText();
    if (content.includes(cssFileName)) {
      return { htmlContent: content, htmlUri: doc.uri };
    }
  }

  const htmlFiles = await vscode.workspace.findFiles(
    '**/*.html',
    '**/node_modules/**',
    20  
  );

  for (const uri of htmlFiles) {
    try {
      const bytes = fs.readFileSync(uri.fsPath, 'utf-8');
      if (bytes.includes(cssFileName)) {
        return { htmlContent: bytes, htmlUri: uri };
      }
    } catch {
      continue;
    }
  }

  return null;
}
