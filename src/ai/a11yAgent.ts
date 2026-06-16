import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { MergedIssue } from '../core/deduplicationEngine';

export interface AIFix {
  explanation: string;
  fixedCode: string;
  reason: string;
}

export type AIProvider = 'openai' | 'anthropic' | 'ollama';

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  model?: string;
}

export class A11yAgent {

  private chain: any;

  constructor(config: AIConfig) {
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
      model = new ChatOllama({
        baseUrl: 'http://localhost:11434',
        model: config.model || 'codellama',
        temperature: 0.1,
      });
    }

    const prompt = ChatPromptTemplate.fromTemplate(`
Tu es un expert en accessibilite web (RGAA 4.1 et WCAG 2.1).
Un developpeur a une erreur d'accessibilite dans son code.

ERREUR DETECTEE :
- Type     : {issueType}
- Message  : {message}
- Regle    : {rule}
- Severite : {severity}
- Ligne    : {line}

CODE AUTOUR DE L'ERREUR :
\`\`\`{language}
{code}
\`\`\`

Ta mission :
1. Expliquer le probleme en 1 phrase simple
2. Fournir UNIQUEMENT le code corrige pour remplacer la ligne {line}
3. Expliquer pourquoi cette correction respecte le RGAA/WCAG

IMPORTANT : Reponds UNIQUEMENT en JSON valide, sans texte autour, sans balises markdown.
Format exact :
{{"explanation":"...","fixedCode":"...","reason":"..."}}
`);

    this.chain = prompt.pipe(model).pipe(new StringOutputParser());
  }

  async suggestFix(
      issue: MergedIssue,
      codeContext: string,
      language: string
    ): Promise<AIFix | null> {
     try {
        const raw = await this.chain.invoke({
          issueType: issue.normalizedType || issue.id,
          message:   issue.message,
          rule:      issue.sources?.join(', ') || issue.rule || '',
          severity:  issue.severity,
          code:      codeContext,
          language,
          line:      issue.line?.toString() || '?',
        });

        console.log('[A11yAgent] Raw response:', raw);

        // Extraire le JSON de la réponse
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error('[A11yAgent] No JSON found in response');
          return null;
        }

        // Décoder les caractères Unicode échappés
        const decoded = jsonMatch[0]
          .replace(/\\u003c/g, '<')
          .replace(/\\u003e/g, '>')
          .replace(/\\u0026/g, '&');

        const parsed = JSON.parse(decoded) as AIFix;

        // ✅ Nettoyer les numéros de ligne du fixedCode
        // ex: "line 3: outline: auto;" => "outline: auto;"
        if (parsed.fixedCode) {
          parsed.fixedCode = parsed.fixedCode
            .split('\n')
            .map((l: string) => l.replace(/^\s*(line\s+)?\d+:\s*/i, ''))
            .join('\n')
            .trim();
        }

        if (!parsed.explanation) parsed.explanation = issue.message;
        if (!parsed.fixedCode)   parsed.fixedCode   = '';
        if (!parsed.reason)      parsed.reason      = 'Correction WCAG/RGAA';

        return parsed;

      } catch (err) {
        console.error('[A11yAgent] Error:', err);
        return null;
      }
    }

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
        const marker  = lineNum === line ? '  <- ERREUR ICI' : '';
        return `line ${lineNum}: ${l}${marker}`;
      })
      .join('\n');
  }
}