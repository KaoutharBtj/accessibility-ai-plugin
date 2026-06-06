import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIConfig } from './a11yAgent';

// ============================================================
// LIT LE FICHIER a11y.config.json À LA RACINE DU PROJET
// ============================================================
export function readAIConfig(documentUri: vscode.Uri): AIConfig | null {

  // Chercher la racine du workspace
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  if (!workspaceFolder) return null;

  const configPath = path.join(workspaceFolder.uri.fsPath, 'a11y.config.json');

  // Vérifier si le fichier existe
  if (!fs.existsSync(configPath)) {
    return getVSCodeConfig(); // fallback sur les settings VS Code
  }

  try {
    const raw    = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);

    return {
      provider: config.ai?.provider || 'ollama',
      apiKey:   config.ai?.apiKey,
      model:    config.ai?.model,
    };
  } catch {
    return getVSCodeConfig();
  }
}

// ============================================================
// FALLBACK — lire depuis les settings VS Code
// ============================================================
function getVSCodeConfig(): AIConfig {
  const cfg = vscode.workspace.getConfiguration('cssA11y');
  return {
    provider: cfg.get<string>('ai.provider', 'ollama') as any,
    apiKey:   cfg.get<string>('ai.apiKey', ''),
    model:    cfg.get<string>('ai.model', 'codellama'),
  };
}