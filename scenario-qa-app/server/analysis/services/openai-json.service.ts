import OpenAI from "openai";
import { z, type ZodType } from "zod";
import { AppError } from "../../../shared/errors";

export async function requestStructuredJson<T>(options: { apiKey: string; model: string; system: string; input: unknown; schema: ZodType<T>; schemaName: string; failureCode: string; invalidCode: string }): Promise<T> {
  if (!options.apiKey) throw new AppError("AI_NOT_CONFIGURED", undefined, 503);
  const client = new OpenAI({ apiKey: options.apiKey });
  let response;
  try {
    response = await client.chat.completions.create({
      model: options.model,
      messages: [{ role: "system", content: options.system }, { role: "user", content: JSON.stringify(options.input) }],
      response_format: { type: "json_schema", json_schema: { name: options.schemaName, strict: true, schema: z.toJSONSchema(options.schema) as any } }
    });
  } catch (error) { throw new AppError(options.failureCode, undefined, 502, error instanceof Error ? error.message : String(error)); }
  const content = response.choices[0]?.message?.content;
  if (!content) throw new AppError(options.invalidCode, undefined, 502, "AI response was empty");
  try { return options.schema.parse(JSON.parse(content)); }
  catch (error) { throw new AppError(options.invalidCode, undefined, 502, error instanceof Error ? error.message : String(error)); }
}
