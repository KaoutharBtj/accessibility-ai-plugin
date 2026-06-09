import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIConfig } from './a11yAgent';

export function readAIConfig(documentUri: vscode.Uri): AIConfig | null {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  if (!workspaceFolder) return null;

  const configPath = path.join(workspaceFolder.uri.fsPath, 'a11y.config.json');

  if (!fs.existsSync(configPath)) {
    return getVSCodeConfig();
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

function getVSCodeConfig(): AIConfig {
  const cfg = vscode.workspace.getConfiguration('cssA11y');
  return {
    provider: cfg.get<string>('ai.provider', 'ollama') as any,
    apiKey:   cfg.get<string>('ai.apiKey', ''),
    model:    cfg.get<string>('ai.model', 'codellama'),
  };
}