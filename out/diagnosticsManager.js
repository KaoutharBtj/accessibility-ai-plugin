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
const SEVERITY_TO_VSCODE = {
    critical: vscode.DiagnosticSeverity.Error,
    high: vscode.DiagnosticSeverity.Error,
    medium: vscode.DiagnosticSeverity.Warning,
    low: vscode.DiagnosticSeverity.Information,
};
class DiagnosticsManager {
    constructor() {
        this.collection = vscode.languages.createDiagnosticCollection('css-a11y');
    }
    /**
     * Update diagnostics for a given URI with the unified A11yIssue array
     */
    update(uri, issues) {
        const diagnostics = issues.map(issue => this.issueToDiagnostic(issue, uri));
        this.collection.set(uri, diagnostics);
        console.log('[DiagnosticsManager] Updated', diagnostics.length, 'diagnostics for', uri.toString());
    }
    /**
     * Clear diagnostics for a given URI
     */
    clear(uri) {
        this.collection.delete(uri);
    }
    dispose() {
        this.collection.dispose();
    }
    /**
     * Convert unified A11yIssue to VSCode Diagnostic
     */
    issueToDiagnostic(issue, uri) {
        const range = this.resolveRange(uri, issue);
        const diagnostic = new vscode.Diagnostic(range, issue.message, SEVERITY_TO_VSCODE[issue.severity] ?? vscode.DiagnosticSeverity.Warning);
        diagnostic.source = `a11y-${issue.source}`;
        diagnostic.code = issue.rule;
        // Add tags for low severity
        if (issue.severity === 'low') {
            diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
        }
        return diagnostic;
    }
    /**
     * Resolve the range for a diagnostic based on line/column or file content
     */
    resolveRange(uri, issue) {
        // If line is provided, use it directly
        if (issue.line !== undefined) {
            const column = issue.column ?? 0;
            return new vscode.Range(issue.line - 1, column, issue.line - 1, column + 1);
        }
        // Otherwise, try to find the selector in the file
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
        if (!doc)
            return new vscode.Range(0, 0, 0, 1);
        const text = doc.getText();
        const lines = text.split('\n');
        // Try to find a relevant line based on the rule or message
        const searchTerms = issue.rule ? [issue.rule] : [];
        for (let i = 0; i < lines.length; i++) {
            const lowerLine = lines[i].toLowerCase();
            for (const term of searchTerms) {
                if (lowerLine.includes(term.toLowerCase())) {
                    const col = lines[i].search(/\S/);
                    return new vscode.Range(i, col, i, lines[i].length);
                }
            }
        }
        return new vscode.Range(0, 0, 0, 1);
    }
}
exports.DiagnosticsManager = DiagnosticsManager;
//# sourceMappingURL=diagnosticsManager.js.map