import Groq from "groq-sdk";
import { z } from "zod/v4";
import { logger } from "../logger";

const speakerSchema = z.enum(["me", "them", "unknown"]);
const toneSchema = z.enum([
  "romantic",
  "reassuring",
  "sweet",
  "calm",
  "flirty",
  "playful",
  "natural",
  "apologetic",
  "confident",
  "short",
]);

export const groqAnalysisSchema = z.object({
  summary: z.string().min(1).max(500),
  tone: z.string().min(1).max(80),
  relationshipContext: z.string().max(500),
  intent: z.string().max(500),
  needsClarification: z.boolean(),
  messages: z
    .array(
      z.object({
        speaker: speakerSchema,
        content: z.string().min(1).max(4000),
      }),
    )
    .max(80),
  suggestions: z
    .array(
      z.object({
        tone: toneSchema,
        text: z.string().min(1).max(1000),
      }),
    )
    .max(10),
});

export type GroqAnalysis = z.infer<typeof groqAnalysisSchema>;

export type ScreenshotInput = {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

export class GroqService {
  private getClient(): Groq {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("AI_NOT_CONFIGURED");
    }
    return new Groq({ apiKey, timeout: 45_000, maxRetries: 1 });
  }

  async analyze(
    systemPrompt: string,
    userPrompt: string,
    screenshot?: ScreenshotInput,
  ): Promise<GroqAnalysis> {
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: userPrompt }];
    if (screenshot) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${screenshot.contentType};base64,${screenshot.bytes.toString("base64")}`,
        },
      });
    }

    try {
      const response = await this.getClient().chat.completions.create({
        model:
          process.env.GROQ_MODEL ??
          "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0.6,
        max_tokens: 2400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
      });
      const raw = response.choices[0]?.message.content;
      if (typeof raw !== "string") {
        throw new Error("AI_RESPONSE_EMPTY");
      }
      return groqAnalysisSchema.parse(JSON.parse(raw));
    } catch (error) {
      const safeError =
        error instanceof Error
          ? { name: error.name, message: error.message.slice(0, 160) }
          : { name: "UnknownError" };
      logger.error({ err: safeError }, "Groq conversation analysis failed");
      throw error;
    }
  }

  async rewrite(input: {
    conversation: string;
    originalText: string;
    tone: string;
    instruction: string;
    includeEmojis: boolean;
  }): Promise<string> {
    const response = await this.getClient().chat.completions.create({
      model:
        process.env.GROQ_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.75,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You rewrite one suggested chat reply. Preserve the user's intended meaning and conversation facts. Do not invent context or explain your changes. Return JSON only in the form {\"text\":\"...\"}.",
        },
        {
          role: "user",
          content: JSON.stringify({
            context: input.conversation,
            originalReply: input.originalText,
            tone: input.tone,
            requestedChange: input.instruction,
            emojiPreference: input.includeEmojis
              ? "emojis may be used sparingly"
              : "no emojis",
          }),
        },
      ],
    });
    const raw = response.choices[0]?.message.content;
    if (typeof raw !== "string") {
      throw new Error("AI_RESPONSE_EMPTY");
    }
    const result = z.object({ text: z.string().min(1).max(1000) }).parse(
      JSON.parse(raw),
    );
    return result.text;
  }
}

export const groqService = new GroqService();