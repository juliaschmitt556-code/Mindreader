import { UsageKind } from "@prisma/client";
import {
  RewriteReplyBody,
  RewriteReplyParams,
  RewriteReplyResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import { groqService } from "../lib/ai/groq";
import { prisma } from "../lib/prisma";
import { UsageLimitError, usageService } from "../lib/usageService";

const router: IRouter = Router();

router.post("/:id/rewrite", async (req: Request, res: Response) => {
  const params = RewriteReplyParams.safeParse(req.params);
  const body = RewriteReplyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a reply and a rewrite instruction." });
    return;
  }

  const ownerId = res.locals.userId as string;
  const original = await prisma.replySuggestion.findFirst({
    where: {
      id: params.data.id,
      analysis: { conversation: { ownerId } },
    },
    include: {
      analysis: {
        include: {
          conversation: {
            include: {
              messages: {
                orderBy: { sequence: "desc" },
                take: 30,
              },
            },
          },
        },
      },
    },
  });
  if (!original) {
    res.status(404).json({ error: "Reply suggestion not found." });
    return;
  }

  let reservation: bigint | undefined;
  try {
    reservation = await usageService.reserve(ownerId, UsageKind.generation);
    const preference = await prisma.userPreference.findUnique({
      where: { userId: ownerId },
      select: { includeEmojis: true },
    });
    const messages = original.analysis.conversation.messages
      .slice()
      .reverse()
      .map((message) => `${message.speaker}: ${message.content}`)
      .join("\n");
    const text = await groqService.rewrite({
      conversation: messages,
      originalText: original.text,
      tone: original.tone,
      instruction: body.data.instruction,
      includeEmojis: body.data.includeEmojis ?? preference?.includeEmojis ?? true,
    });
    const rewritten = await prisma.replySuggestion.create({
      data: {
        analysisId: original.analysisId,
        tone: original.tone,
        text,
      },
    });
    await usageService.complete(reservation);
    res.json(
      RewriteReplyResponse.parse({
        id: rewritten.id,
        tone: rewritten.tone,
        text: rewritten.text,
        createdAt: rewritten.createdAt.toISOString(),
      }),
    );
  } catch (error) {
    if (reservation !== undefined) {
      await usageService.release(reservation).catch(() => undefined);
    }
    if (error instanceof UsageLimitError) {
      res.status(429).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      res.status(503).json({ error: "Reply suggestions are temporarily unavailable." });
      return;
    }
    req.log.error({ stage: "rewrite" }, "Unable to rewrite reply");
    res.status(502).json({ error: "ReplyMind could not rewrite that reply. Try again." });
  }
});

export default router;