import type { z } from 'zod';
import type { GeminiTool } from '../../lib/gemini.js';

/** Declares a lookup with its arguments typed from the schema. */
export function tool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: z.ZodObject<S>,
  run: (input: z.infer<z.ZodObject<S>>) => Promise<unknown>,
): GeminiTool {
  return { name, description, schema: schema as unknown as z.ZodObject<z.ZodRawShape>, run: (input) => run(input as z.infer<z.ZodObject<S>>) };
}
