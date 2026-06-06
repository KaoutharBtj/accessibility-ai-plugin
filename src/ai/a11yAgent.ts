import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { MergedIssue } from '../core/deduplicationEngine';

// ============================================================
// TYPE DE RETOUR DE L'AGENT
// ============================================================
export interface AIFix {
  explanation: string;  // explication du problème en 1 phrase
  fixedCode: string;    // code corrigé prêt à être inséré
  reason: string;       // pourquoi cette correction est correcte
}

// ============================================================
// CONFIGURATION DU PROVIDER
// ============================================================
export type AIProvider = 'openai' | 'anthropic' | 'ollama';

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;       // non requis pour ollama
  model?: string;
}

// ============================================================
// AGENT PRINCIPAL
// ============================================================
export class A11yAgent {

  private chain: any;

  constructor(config: AIConfig) {

    // 1. Choisir le modèle selon le provider
    let model: any;

    if (config.provider === 'openai') {
      model = new ChatOpenAI({
        apiKey: config.apiKey,
        modelName: config.model || 'gpt-4o-mini',
        temperature: 0.1,
      });

    } else if (config.provider === 'anthropic') {
      model = new ChatAnthropic({
        apiKey: config.apiKey,
        modelName: config.model || 'claude-3-haiku-20240307',
        temperature: 0.1,
      });

    } else {
      // Ollama — local, gratuit, recommandé pour Orange Business
      model = new ChatOllama({
        baseUrl: 'http://localhost:11434',
        model: config.model || 'codellama',
        temperature: 0.1,
      });
    }

    // 2. Construire le prompt
    const prompt = ChatPromptTemplate.fromTemplate(`
Tu es un expert en accessibilité web (RGAA 4.1 et WCAG 2.1).
Un développeur a une erreur d'accessibilité dans son code.

ERREUR DÉTECTÉE :
- Type     : {issueType}
- Message  : {message}
- Règle    : {rule}
- Sévérité : {severity}
- Ligne    : {line}

CODE AUTOUR DE L'ERREUR :
\`\`\`{language}
{code}
\`\`\`

Ta mission :
1. Expliquer le problème en 1 phrase simple
2. Fournir UNIQUEMENT le code corrigé pour remplacer la ligne {line}
3. Expliquer pourquoi cette correction respecte le RGAA/WCAG

IMPORTANT : Réponds UNIQUEMENT en JSON valide, sans texte autour, sans balises markdown.
Format exact :
{{"explanation":"...","fixedCode":"...","reason":"..."}}
`);

    // 3. Construire la chaîne LangChain
    this.chain = prompt.pipe(model).pipe(new StringOutputParser());
  }

  // ============================================================
  // MÉTHODE PRINCIPALE — envoyer une violation au LLM
  // ============================================================
  async suggestFix(
    issue: MergedIssue,
    codeContext: string,
    language: string
  ): Promise<AIFix | null> {
    try {
      // Appel au LLM
      const raw = await this.chain.invoke({
        issueType: issue.normalizedType || issue.id,
        message:   issue.message,
        rule:      issue.sources?.join(', ') || issue.rule || '',
        severity:  issue.severity,
        code:      codeContext,
        language,
        line:      issue.line?.toString() || '?',
      });

      // Nettoyer la réponse et parser le JSON
      const clean = raw
        .replace(/```json|```/g, '')
        .replace(/^\s*|\s*$/g, '')
        .trim();

      return JSON.parse(clean) as AIFix;

    } catch (err) {
      console.error('[A11yAgent] Error:', err);
      return null;
    }
  }

  // ============================================================
  // UTILITAIRE — extraire le code autour de la ligne erreur
  // ============================================================
  static extractContext(
    fileContent: string,
    line: number,
    radius: number = 5
  ): string {
    const lines = fileContent.split('\n');
    const start = Math.max(0, line - radius - 1);
    const end   = Math.min(lines.length, line + radius);

    return lines
      .slice(start, end)
      .map((l, i) => {
        const lineNum = start + i + 1;
        const marker  = lineNum === line ? '  ← ERREUR ICI' : '';
        return `line ${lineNum}: ${l}${marker}`;
      })
      .join('\n');
  }
}