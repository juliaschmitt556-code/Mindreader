import { randomUUID } from "node:crypto";
import { AnalyzeConversationBody, AnalyzeConversationResponse } from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import { CONVERSATION_ANALYSIS_SYSTEM_PROMPT, createAnalysisPrompt } from "../lib/ai/prompts";
import { groqService } from "../lib/ai/groq";

const router: IRouter = Router();
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

router.post("/", async (req: Request, res: Response) => {
  const parsed = AnalyzeConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Conversation details are invalid." });
    return;
  }
  const input = parsed.data;
  const hasText = Boolean(
    input.conversationText?.trim() ||
      input.latestMessage?.trim() ||
      input.contextClarification?.trim() ||
      input.previousMessages?.length,
  );
  const hasImageData = Boolean(input.screenshotBase64);
  if (!hasText && !hasImageData) {
    res.status(400).json({ error: "Add conversation text or a screenshot first." });
    return;
  }

  let screenshot: { bytes: Buffer; contentType: "image/jpeg" | "image/png" | "image/webp" } | undefined;
  if (hasImageData) {
    const contentType = input.screenshotContentType;
    const encoded = input.screenshotBase64 ?? "";
    if (
      !contentType ||
      !acceptedTypes.has(contentType) ||
      !isBase64(encoded)
    ) {
      res.status(400).json({ error: "The screenshot is not a valid JPG, PNG, or WebP image." });
      return;
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.length > MAX_SCREENSHOT_BYTES || !matchesImageType(bytes, contentType)) {
      res.status(400).json({ error: "The screenshot is not a valid JPG, PNG, or WebP image under 10 MB." });
      return;
    }
    screenshot = { bytes, contentType };
  } else if (input.screenshotContentType || input.screenshotFileName) {
    res.status(400).json({ error: "Screenshot data is incomplete." });
    return;
  }

  try {
    const generated = await groqService.analyze(
      CONVERSATION_ANALYSIS_SYSTEM_PROMPT,
      createAnalysisPrompt({
        conversationText: input.conversationText,
        latestMessage: input.latestMessage,
        contextClarification: input.contextClarification,
        instruction: input.instruction,
        tone: input.tone,
        includeEmojis: input.includeEmojis ?? false,
        previousMessages: input.previousMessages ?? [],
      }),
      screenshot,
    );
    if (!generated.needsClarification && generated.suggestions.length === 0) {
      throw new Error("AI_RESPONSE_INVALID");
    }
    const createdAt = new Date().toISOString();
    const result = AnalyzeConversationResponse.parse({
      id: randomUUID(),
      conversationId: input.conversationId,
      summary: generated.summary,
      tone: generated.tone,
      relationshipContext: generated.relationshipContext,
      intent: generated.intent,
      needsClarification: generated.needsClarification,
      messages: generated.messages.map((message, sequence) => ({
        id: randomUUID(),
        speaker: message.speaker,
        content: message.content,
        sequence: sequence + 1,
        createdAt,
      })),
      suggestions: generated.suggestions.map((suggestion) => ({
        id: randomUUID(),
        tone: suggestion.tone,
        text: suggestion.text,
        createdAt,
      })),
      createdAt,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      res.status(503).json({ error: "Reply suggestions are temporarily unavailable." });
      return;
    }
    req.log.error({ stage: "analysis" }, "Unable to analyze conversation");
    res.status(502).json({ error: "ReplyMind could not analyze this conversation. Please try again." });
  }
});

function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function matchesImageType(
  bytes: Buffer,
  contentType: string,
): contentType is "image/jpeg" | "image/png" | "image/webp" {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return contentType === "image/webp" &&
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
}

export default router;