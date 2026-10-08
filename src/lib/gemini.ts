import { z } from 'zod';
import { env } from '../env.js';

/**
 * Google Gemini, over the REST `generateContent` endpoint.
 *
 * Three uses: a tool-calling loop (the campus assistant chooses which
 * read-only lookups to run and writes the answer from their results),
 * structured JSON output checked against a zod schema (counselling briefs,
 * study plans), and transcription of a short voice clip.
 *
 * Nothing here decides anything. Every figure the model sees comes from a
 * lookup the caller supplies, scoped to what the asker may read, and every
 * caller has a built-in answer to fall back to when the model is not
 * configured, is rate-limited or fails.
 */

export const geminiEnabled = Boolean(env.GEMINI_API_KEY);
export const geminiModel = env.GEMINI_MODEL;

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** A read-only lookup the model may call. `run` returns plain data. */
export interface GeminiTool {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  run: (input: Record<string, unknown>) => Promise<unknown>;
}

type Part =
  | { text: string; thought?: boolean; thoughtSignature?: string }
  | { functionCall: { name: string; args?: Record<string, unknown>; id?: string }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown>; id?: string } }
  | { inlineData: { mimeType: string; data: string } };

interface Content { role: 'user' | 'model'; parts: Part[] }

interface Response {
  candidates?: Array<{ content?: Content; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

type JsonSchema = { type?: string | string[]; description?: string; enum?: unknown[]; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; minimum?: number; maximum?: number; anyOf?: JsonSchema[] };

/**
 * Gemini takes an OpenAPI-style subset of JSON Schema: upper-case types and
 * no `$schema` or `additionalProperties`. Zod writes full JSON Schema, so this
 * keeps only what Gemini reads.
 */
function toGeminiSchema(s: JsonSchema): Record<string, unknown> {
  const nullable = Array.isArray(s.type) && s.type.includes('null');
  const anyOf = s.anyOf?.filter((a) => a.type !== 'null');
  if (anyOf?.length === 1) return { ...toGeminiSchema(anyOf[0]!), nullable: true, ...(s.description ? { description: s.description } : {}) };
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
  const out: Record<string, unknown> = {};
  if (type) out.type = type.toUpperCase();
  if (nullable || s.anyOf?.some((a) => a.type === 'null')) out.nullable = true;
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum.map(String);
  if (typeof s.minimum === 'number') out.minimum = s.minimum;
  if (typeof s.maximum === 'number') out.maximum = s.maximum;
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    if (s.required?.length) out.required = s.required;
  }
  if (s.items) out.items = toGeminiSchema(s.items);
  return out;
}

export const schemaFor = (schema: z.ZodType) => toGeminiSchema(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema);

// ─── Transport ────────────────────────────────────────────────────────────────

async function generate(body: Record<string, unknown>, model = geminiModel): Promise<Response> {
  if (!env.GEMINI_API_KEY) throw new GeminiError('Gemini is not configured');
  let res: globalThis.Response;
  try {
    res = await fetch(`${env.GEMINI_BASE_URL.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new GeminiError(err instanceof Error && err.name === 'TimeoutError' ? 'Gemini did not answer in time' : 'Gemini could not be reached');
  }
  const text = await res.text();
  if (!res.ok) {
    let message = `Gemini answered ${res.status}`;
    try { message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message; } catch { /* not JSON */ }
    throw new GeminiError(res.status === 429 ? 'Gemini is rate-limited right now' : message, res.status);
  }
  const json = JSON.parse(text) as Response;
  if (json.promptFeedback?.blockReason) throw new GeminiError(`Gemini declined the request (${json.promptFeedback.blockReason})`);
  return json;
}

const textOf = (c: Content | undefined) =>
  (c?.parts ?? []).flatMap((p) => ('text' in p && !p.thought ? [p.text] : [])).join('').trim();

const config = (maxOutputTokens: number, temperature: number) => ({ maxOutputTokens, temperature });

// ─── Tool-calling conversation ────────────────────────────────────────────────

/**
 * Runs a conversation in which the model may call the given tools, until it
 * answers in text or the iteration cap is reached. The model's own turns are
 * returned to it exactly as received, which carries any thought signatures
 * the API attached to its function calls.
 */
export async function geminiConverse(opts: {
  system: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: GeminiTool[];
  used: string[];
  maxIterations?: number;
}): Promise<string> {
  const contents: Content[] = opts.history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const tools = [{ functionDeclarations: opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: schemaFor(t.schema) })) }];

  for (let i = 0; i < (opts.maxIterations ?? 8); i++) {
    const res = await generate({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents,
      tools,
      generationConfig: config(4096, 0.3),
    });
    const content = res.candidates?.[0]?.content;
    if (!content) throw new GeminiError(`Gemini returned no answer (${res.candidates?.[0]?.finishReason ?? 'empty'})`);
    const calls = content.parts.flatMap((p) => ('functionCall' in p ? [p.functionCall] : []));
    if (calls.length === 0) return textOf(content) || 'I could not form an answer from the records.';

    contents.push({ role: 'model', parts: content.parts });
    const responses: Part[] = [];
    for (const call of calls) {
      const tool = byName.get(call.name);
      let response: Record<string, unknown>;
      if (!tool) {
        response = { error: `No tool called ${call.name}` };
      } else {
        const parsed = tool.schema.safeParse(call.args ?? {});
        if (!parsed.success) {
          response = { error: `Invalid arguments: ${parsed.error.issues.map((x) => x.message).join('; ')}` };
        } else {
          opts.used.push(tool.name);
          try {
            response = { result: await tool.run(parsed.data as Record<string, unknown>) };
          } catch (err) {
            response = { error: err instanceof Error ? err.message : 'The lookup failed' };
          }
        }
      }
      responses.push({ functionResponse: { name: call.name, response, ...(call.id ? { id: call.id } : {}) } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  throw new GeminiError('Gemini kept looking things up without answering');
}

// ─── Structured output ────────────────────────────────────────────────────────

/** Asks for JSON matching the zod schema, and checks the answer against it. */
export async function geminiJson<T>(opts: { system: string; prompt: string; schema: z.ZodType<T>; maxOutputTokens?: number }): Promise<T> {
  const res = await generate({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: { ...config(opts.maxOutputTokens ?? 4096, 0.4), responseMimeType: 'application/json', responseSchema: schemaFor(opts.schema) },
  });
  const raw = textOf(res.candidates?.[0]?.content);
  if (!raw) throw new GeminiError('Gemini returned an empty answer');
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new GeminiError('Gemini returned malformed JSON');
  }
  const parsed = opts.schema.safeParse(data);
  if (!parsed.success) throw new GeminiError(`Gemini's answer did not match the expected shape: ${parsed.error.issues[0]?.message ?? ''}`);
  return parsed.data;
}

// ─── Transcription ────────────────────────────────────────────────────────────

/** Writes down what was said in a short clip, in the language spoken. */
export async function geminiTranscribe(audioBase64: string, mimeType: string, lang: 'en' | 'hi'): Promise<string> {
  const res = await generate({
    contents: [{
      role: 'user',
      parts: [
        { text: `Transcribe this voice question exactly as spoken. It is most likely in ${lang === 'hi' ? 'Hindi (write it in Devanagari) or Hinglish' : 'Indian English'}. Return only the words spoken, with no commentary, quotes or labels. If nothing intelligible is said, return an empty string.` },
        { inlineData: { mimeType, data: audioBase64 } },
      ],
    }],
    generationConfig: config(512, 0),
  }, env.GEMINI_TRANSCRIBE_MODEL ?? geminiModel);
  return textOf(res.candidates?.[0]?.content).replace(/^["“]|["”]$/g, '').trim();
}
