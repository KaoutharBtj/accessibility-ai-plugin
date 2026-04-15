"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCssForHtml = resolveCssForHtml;
exports.findLinkedCssFiles = findLinkedCssFiles;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
async function resolveCssForHtml(document, htmlContent) {
    const cssChunks = [];
    // Extract href values from <link rel="stylesheet" href="...">
    const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    const hrefRegex = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["'][^>]*>/gi;
    const hrefs = new Set();
    for (const regex of [linkRegex, hrefRegex]) {
        let match;
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
            }
            catch {
                // File unreadable — skip silently
            }
        }
        else {
            // Maybe it's open in another editor tab
            const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === cssPath);
            if (openDoc)
                cssChunks.push(openDoc.getText());
        }
    }
    return cssChunks.join('\n');
}
async function findLinkedCssFiles(cssDocument) {
    const cssFileName = path.basename(cssDocument.uri.fsPath);
    for (const doc of vscode.workspace.textDocuments) {
        if (doc.languageId !== 'html')
            continue;
        const content = doc.getText();
        if (content.includes(cssFileName)) {
            return { htmlContent: content, htmlUri: doc.uri };
        }
    }
    const htmlFiles = await vscode.workspace.findFiles('**/*.html', '**/node_modules/**', 20);
    for (const uri of htmlFiles) {
        try {
            const bytes = fs.readFileSync(uri.fsPath, 'utf-8');
            if (bytes.includes(cssFileName)) {
                return { htmlContent: bytes, htmlUri: uri };
            }
        }
        catch {
            continue;
        }
    }
    return null;
}
//# sourceMappingURL=cssResolver.js.map