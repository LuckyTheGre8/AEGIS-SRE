import { z } from "zod";
import { AgentDecisionSchema, AgentError, type AgentContext, type LLMProvider, type ToolGenerationContext } from "./provider";
import { GeneratedToolSchema } from "./schemas";
import { INVESTIGATION_INSTRUCTIONS, TOOL_INSTRUCTIONS } from "./prompts";

const ResponseSchema = z.object({
  candidates: z.array(z.object({
    finishReason: z.string(),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }),
  })).min(1),
});

export class GeminiLLMProvider implements LLMProvider {
  readonly name = "gemini";
  constructor(private readonly apiKey: string, readonly model: string, private readonly fetcher: typeof fetch = fetch) {}

  async nextAction(context: AgentContext): Promise<unknown> {
    return this.structured(INVESTIGATION_INSTRUCTIONS, context, AgentDecisionSchema);
  }

  async generateDiagnosticTool(context: ToolGenerationContext): Promise<unknown> {
    return this.structured(TOOL_INSTRUCTIONS, context, GeneratedToolSchema);
  }

  private async structured(instructions: string, context: unknown, schema: z.ZodType): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(context) }] }],
          generationConfig: {
            maxOutputTokens: 4000,
            thinkingConfig: { includeThoughts: false },
            responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: z.toJSONSchema(schema) } },
          },
        }),
      });
    } catch { throw new AgentError("LLM_CONNECTION", "The Gemini request failed or exceeded its 25-second deadline."); }
    // Never return/log an API error body or a key-bearing URL. The key is header-only.
    if (!response.ok) throw new AgentError(`LLM_HTTP_${response.status}`, `Gemini returned HTTP ${response.status}. Check the server-side key, model access and API quota.`);
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new AgentError("LLM_INVALID_RESPONSE", "Gemini returned an unreadable response."); }
    const parsed = ResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.candidates[0].finishReason !== "STOP") throw new AgentError("LLM_INCOMPLETE", "Gemini did not return a completed structured decision.");
    // Never consume thought parts, even if a provider unexpectedly includes them.
    const text = parsed.data.candidates[0].content.parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
    if (!text || text.length > 24_000) throw new AgentError("LLM_INVALID_OUTPUT", "Gemini returned no usable decision or exceeded the output limit.");
    try { return JSON.parse(text) as unknown; }
    catch { throw new AgentError("LLM_INVALID_JSON", "Gemini returned invalid JSON. No action was executed."); }
  }
}

export function llmFromEnvironment(): LLMProvider {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AgentError("MISSING_LLM_CONFIGURATION", "Set GEMINI_API_KEY on the server before investigating.");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new AgentError("INVALID_LLM_CONFIGURATION", "GEMINI_MODEL must be a model ID without a URL or path.");
  return new GeminiLLMProvider(key, model);
}
