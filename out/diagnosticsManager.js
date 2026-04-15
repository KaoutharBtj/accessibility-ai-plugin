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
exports.DiagnosticsManager = void 0;
const vscode = __importStar(require("vscode"));
const IMPACT_SEVERITY = {
    critical: vscode.DiagnosticSeverity.Error,
    serious: vscode.DiagnosticSeverity.Error,
    moderate: vscode.DiagnosticSeverity.Warning,
    minor: vscode.DiagnosticSeverity.Information,
};
class DiagnosticsManager {
    constructor() {
        this.collection = vscode.languages.createDiagnosticCollection('css-a11y');
    }
    update(uri, issues) {
        const diagnostics = issues.map(issue => this.issueToDiagnostic(issue, uri));
        this.collection.set(uri, diagnostics);
    }
    clear(uri) {
        this.collection.delete(uri);
    }
    dispose() {
        this.collection.dispose();
    }
    issueToDiagnostic(issue, uri) {
        const range = this.resolveRange(uri, issue);
        const message = this.buildMessage(issue);
        const diagnostic = new vscode.Diagnostic(range, message, IMPACT_SEVERITY[issue.impact] ?? vscode.DiagnosticSeverity.Warning);
        diagnostic.source = 'css-a11y';
        diagnostic.code = {
            value: issue.ruleId,
            target: vscode.Uri.parse(issue.helpUrl),
        };
        if (issue.impact === 'minor') {
            diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
        }
        return diagnostic;
    }
    buildMessage(issue) {
        const wcag = issue.wcagCriteria.join(', ') || 'best-practice';
        let msg = `[${issue.impact.toUpperCase()}] ${issue.help} (${wcag})`;
        if (issue.contrastData) {
            const { fgColor, bgColor, contrastRatio, expectedRatio } = issue.contrastData;
            msg +=
                `\n  • Contrast ratio: ${contrastRatio.toFixed(2)}:1 ` +
                    `(required ≥ ${expectedRatio}:1)` +
                    `\n  • Foreground: ${fgColor}  Background: ${bgColor}`;
        }
        msg += `\n  • Selector: ${issue.target.join(' > ')}`;
        return msg;
    }
    resolveRange(uri, issue) {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
        if (!doc)
            return new vscode.Range(0, 0, 0, 1);
        const text = doc.getText();
        const lines = text.split('\n');
        const selector = issue.target[0] ?? '';
        const simplePart = selector.split(/\s*[>+~]\s*/).pop()?.trim() ?? '';
        if (!simplePart)
            return new vscode.Range(0, 0, 0, 1);
        const patterns = selectorToPatterns(simplePart);
        for (let i = 0; i < lines.length; i++) {
            if (patterns.some(p => lines[i].toLowerCase().includes(p.toLowerCase()))) {
                const col = lines[i].search(/\S/); // first non-whitespace col
                return new vscode.Range(i, col, i, lines[i].length);
            }
        }
        return new vscode.Range(0, 0, 0, 1);
    }
}
exports.DiagnosticsManager = DiagnosticsManager;
function selectorToPatterns(selector) {
    if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return [`id="${id}"`, `id='${id}'`];
    }
    if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return [`class="${cls}"`, `class='${cls}'`, `class="${cls} `, `class='${cls} `];
    }
    // Tag selector
    return [`<${selector.replace(/[:[.#].*/, '')}`];
}
//# sourceMappingURL=diagnosticsManager.js.map