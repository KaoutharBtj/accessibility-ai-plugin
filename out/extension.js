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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const orchestrator_1 = require("./core/orchestrator");
const diagnosticsManager_1 = require("./diagnosticsManager");
const utils_1 = require("./utils");
function activate(context) {
    console.log('[css-a11y] Extension activated');
    const diagnosticsManager = new diagnosticsManager_1.DiagnosticsManager();
    const orchestrator = orchestrator_1.Orchestrator.getInstance();
    const runAnalysis = (0, utils_1.debounce)(async (document) => {
        if (!['html', 'css', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact'].includes(document.languageId)) {
            return;
        }
        try {
            console.log('[css-a11y] Analyzing:', document.fileName, 'language:', document.languageId);
            const issues = await orchestrator.run(document.getText(), document.fileName, document.languageId);
            console.log('[css-a11y] Issues found:', issues.length);
            diagnosticsManager.update(document.uri, issues);
        }
        catch (err) {
            console.error('[css-a11y] Analysis error:', err);
        }
    }, getDebounceMs());
    const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
        runAnalysis(event.document);
    });
    const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
        runAnalysis(doc);
    });
    const saveListener = vscode.workspace.onDidSaveTextDocument(doc => {
        runAnalysis(doc);
    });
    vscode.workspace.textDocuments.forEach(doc => runAnalysis(doc));
    const commandDisposable = vscode.commands.registerCommand('cssA11y.runNow', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            console.log('[css-a11y] Manual trigger on:', editor.document.fileName);
            runAnalysis(editor.document);
        }
    });
    context.subscriptions.push(changeListener, openListener, saveListener, commandDisposable, diagnosticsManager, new vscode.Disposable(() => orchestrator.dispose()));
}
function deactivate() {
    console.log('[css-a11y] Extension deactivated');
}
function getDebounceMs() {
    return vscode.workspace
        .getConfiguration('cssA11y')
        .get('debounceMs', 500);
}
//# sourceMappingURL=extension.js.map