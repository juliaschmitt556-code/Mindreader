import { ReplyTone as PrismaReplyTone, UsageKind } from "@prisma/client";
import { getAuth } from "@clerk/express";
import {
  AnalyzeConversationBody,
  AnalyzeConversationParams,
  AnalyzeConversationResponse,
  CreateConversationBody,
  CreateConversationResponse,
  DeleteConversationParams,
  GetConversationParams,
  GetConversationResponse,
  ListConversationsResponse,
  UpdateConversationBody,
  UpdateConversationParams,
  UpdateConversationResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import { CONVERSATION_ANALYSIS_SYSTEM_PROMPT, createAnalysisPrompt } from "../lib/ai/prompts";
import { groqService } from "../lib/ai/groq";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import {
  deletePrivateScreenshot,
  getScreenshotBytes,
} from "../lib/uploads";
import { UsageLimitError, usageService } from "../lib/usageService";

const router: IRouter = Router();

function userIdFrom(res: Response): string {
  return res.locals.userId as string;
}

function toMessage(message: {
  id: string;
  speaker: string;
  content: string;
  sequence: number;
  createdAt: Date;
}) {
  return {
    id: message.id,
    speaker: message.speaker as "me" | "them" | "unknown",
    content: message.content,
    sequence: message.sequence,
    createdAt: message.createdAt.toISOString(),
  };
}

function toSuggestion(suggestion: {
  id: string;
  tone: string;
  text: string;
  createdAt: Date;
}) {
  return {
    id: suggestion.id,
    tone: suggestion.tone as PrismaReplyTone,
    text: suggestion.text,
    createdAt: suggestion.createdAt.toISOString(),
  };
}

function toSummary(conversation: {
  id: string;
  title: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { messages: number };
  messages: Array<{ content: string }>;
}) {
  return {
    id: conversation.id,
    title: conversation.title,
    preview: conversation.messages[0]?.content ?? null,
    messageCount: conversation._count.messages,
    isArchived: conversation.isArchived,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

async function readConversationDetail(id: string, ownerId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, ownerId },
    include: {
      messages: { orderBy: { sequence: "asc" } },
      analyses: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          suggestions: { orderBy: { createdAt: "asc" } },
        },
      },
      screenshots: {
        where: { isRegistered: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!conversation) return null;

  const messageDtos = conversation.messages.map(toMessage);
  const savedAnalysis = conversation.analyses[0];
  const latestAnalysis = savedAnalysis
    ? {
        id: savedAnalysis.id,
        conversationId: conversation.id,
        summary: savedAnalysis.summary,
        tone: savedAnalysis.tone,
        relationshipContext: savedAnalysis.relationshipContext,
        intent: savedAnalysis.intent,
        needsClarification: savedAnalysis.needsClarification,
        messages: messageDtos,
        suggestions: savedAnalysis.suggestions.map(toSuggestion),
        createdAt: savedAnalysis.createdAt.toISOString(),
      }
    : null;
  const screenshot = conversation.screenshots[0];
  const summary = {
    id: conversation.id,
    title: conversation.title,
    preview: conversation.messages.at(-1)?.content ?? null,
    messageCount: conversation.messages.length,
    isArchived: conversation.isArchived,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };

  return {
    ...summary,
    messages: messageDtos,
    analysis: latestAnalysis,
    screenshot: screenshot
      ? {
          id: screenshot.id,
          conversationId: screenshot.conversationId,
          fileName: screenshot.fileName,
          contentType: screenshot.contentType,
          size: screenshot.size,
          objectPath: screenshot.objectPath,
          createdAt: screenshot.createdAt.toISOString(),
        }
      : null,
  };
}

router.get("/", async (_req: Request, res: Response) => {
  const userId = userIdFrom(res);
  const conversations = await prisma.conversation.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { sequence: "desc" },
        take: 1,
        select: { content: true },
      },
    },
  });
  res.json(ListConversationsResponse.parse(conversations.map(toSummary)));
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a conversation title." });
    return;
  }

  const conversation = await prisma.conversation.create({
    data: { ownerId: userIdFrom(res), title: parsed.data.title.trim() },
  });
  const detail = await readConversationDetail(
    conversation.id,
    userIdFrom(res),
  );
  res.status(201).json(CreateConversationResponse.parse(detail));
});

router.get("/:id", async (req: Request, res: Response) => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const detail = await readConversationDetail(
    params.data.id,
    userIdFrom(res),
  );
  if (!detail) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  res.json(GetConversationResponse.parse(detail));
});

router.patch("/:id", async (req: Request, res: Response) => {
  const params = UpdateConversationParams.safeParse(req.params);
  const body = UpdateConversationBody.safeParse(req.body);
  if (
    !params.success ||
    !body.success ||
    (body.data.title === undefined && body.data.isArchived === undefined)
  ) {
    res.status(400).json({ error: "Enter a title or choose an archive setting." });
    return;
  }

  const ownerId = userIdFrom(res);
  const exists = await prisma.conversation.findFirst({
    where: { id: params.data.id, ownerId },
    select: { id: true },
  });
  if (!exists) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const conversation = await prisma.conversation.update({
    where: { id: params.data.id },
    data: {
      ...(body.data.title !== undefined && { title: body.data.title.trim() }),
      ...(body.data.isArchived !== undefined && {
        isArchived: body.data.isArchived,
      }),
    },
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { sequence: "desc" },
        take: 1,
        select: { content: true },
      },
    },
  });
  res.json(UpdateConversationResponse.parse(toSummary(conversation)));
});

router.delete("/:id", async (req: Request, res: Response) => {
  const params = DeleteConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const ownerId = userIdFrom(res);
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.data.id, ownerId },
    include: { screenshots: { where: { isRegistered: true } } },
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }

  try {
    for (const screenshot of conversation.screenshots) {
      await deletePrivateScreenshot(screenshot.id, ownerId);
    }
    await prisma.conversation.delete({ where: { id: conversation.id } });
    res.status(204).end();
  } catch (error) {
    req.log.error({ err: error }, "Unable to delete conversation data");
    res.status(500).json({ error: "Unable to delete this conversation." });
  }
});

router.post("/:id/analyze", async (req: Request, res: Response) => {
  const params = AnalyzeConversationParams.safeParse(req.params);
  const body = AnalyzeConversationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Conversation details are invalid." });
    return;
  }
  const ownerId = userIdFrom(res);
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.data.id, ownerId },
    include: {
      messages: { orderBy: { sequence: "asc" } },
      owner: { include: { preference: true } },
    },
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const input = body.data;
  const screenshotId = input.screenshotId ?? undefined;
  const screenshotRecord = screenshotId
    ? await prisma.uploadedScreenshot.findFirst({
        where: {
          id: screenshotId,
          ownerId,
          isRegistered: true,
        },
      })
    : null;
  if (screenshotId && !screenshotRecord) {
    res.status(404).json({ error: "Screenshot not found." });
    return;
  }
  if (
    screenshotRecord?.conversationId &&
    screenshotRecord.conversationId !== conversation.id
  ) {
    res.status(404).json({ error: "Screenshot not found." });
    return;
  }
  const hasText =
    Boolean(input.conversationText?.trim()) ||
    Boolean(input.latestMessage?.trim());
  if (!hasText && !screenshotRecord && conversation.messages.length === 0) {
    res.status(400).json({
      error: "Paste a conversation, add the latest message, or upload a screenshot.",
    });
    return;
  }

  const preference = conversation.owner.preference;
  const retainScreenshot = input.retainScreenshot === true;
  let generationReservation: bigint | undefined;
  let imageReservation: bigint | undefined;
  let imageBytes: Awaited<ReturnType<typeof getScreenshotBytes>> | undefined;
  let analysisSaved = false;

  try {
    generationReservation = await usageService.reserve(
      ownerId,
      UsageKind.generation,
    );
    if (screenshotRecord) {
      imageReservation = await usageService.reserve(
        ownerId,
        UsageKind.imageAnalysis,
      );
      imageBytes = await getScreenshotBytes({
        screenshotId: screenshotRecord.id,
        ownerId,
      });
    }

    const generated = await groqService.analyze(
      CONVERSATION_ANALYSIS_SYSTEM_PROMPT,
      createAnalysisPrompt({
        conversationText: input.conversationText,
        latestMessage: input.latestMessage,
        instruction: input.instruction,
        tone: input.tone ?? preference?.defaultTone,
        includeEmojis: input.includeEmojis ?? preference?.includeEmojis ?? true,
        previousMessages: conversation.messages.map((message) => ({
          speaker: message.speaker,
          content: message.content,
        })),
      }),
      imageBytes,
    );
    if (!generated.needsClarification && generated.suggestions.length === 0) {
      throw new Error("AI_RESPONSE_INVALID");
    }

    const stored = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "conversations" WHERE "id" = ${conversation.id}::uuid FOR UPDATE`;
      const maxSequence = await tx.conversationMessage.aggregate({
        where: { conversationId: conversation.id },
        _max: { sequence: true },
      });
      const firstSequence = (maxSequence._max.sequence ?? 0) + 1;
      await tx.conversationMessage.createMany({
        data: generated.messages.map((message, index) => ({
          conversationId: conversation.id,
          speaker: message.speaker,
          content: message.content,
          sequence: firstSequence + index,
        })),
      });
      const messages = await tx.conversationMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { sequence: "asc" },
      });

      const latestAnalysis = await tx.aIAnalysis.create({
        data: {
          conversationId: conversation.id,
          summary: generated.summary,
          tone: generated.tone,
          relationshipContext: generated.relationshipContext,
          intent: generated.intent,
          needsClarification: generated.needsClarification,
          suggestions: {
            create: generated.suggestions.map((suggestion) => ({
              tone: suggestion.tone as PrismaReplyTone,
              text: suggestion.text,
            })),
          },
        },
        include: { suggestions: { orderBy: { createdAt: "asc" } } },
      });
      const proposedTitle =
        input.latestMessage?.trim() ||
        generated.messages.filter((message) => message.speaker === "them").at(-1)
          ?.content ||
        input.conversationText?.trim() ||
        "";
      const title =
        conversation.title === "New conversation" && proposedTitle
          ? proposedTitle.slice(0, 116).trim() +
            (proposedTitle.length > 116 ? "…" : "")
          : conversation.title;
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { title, updatedAt: new Date() },
      });
      if (screenshotRecord && retainScreenshot) {
        await tx.uploadedScreenshot.update({
          where: { id: screenshotRecord.id },
          data: { conversationId: conversation.id },
        });
      }
      return { latestAnalysis, messages, title };
    });
    analysisSaved = true;

    await usageService.complete(generationReservation);
    if (imageReservation !== undefined) {
      await usageService.complete(imageReservation);
    }

    if (screenshotRecord && !retainScreenshot) {
      await deletePrivateScreenshot(screenshotRecord.id, ownerId);
    }

    const result = {
      id: stored.latestAnalysis.id,
      conversationId: conversation.id,
      summary: stored.latestAnalysis.summary,
      tone: stored.latestAnalysis.tone,
      relationshipContext: stored.latestAnalysis.relationshipContext,
      intent: stored.latestAnalysis.intent,
      needsClarification: stored.latestAnalysis.needsClarification,
      messages: stored.messages.map(toMessage),
      suggestions: stored.latestAnalysis.suggestions.map(toSuggestion),
      createdAt: stored.latestAnalysis.createdAt.toISOString(),
    };
    res.json(AnalyzeConversationResponse.parse(result));
  } catch (error) {
    if (generationReservation !== undefined && !analysisSaved) {
      await usageService.release(generationReservation).catch(() => undefined);
    }
    if (imageReservation !== undefined && !analysisSaved) {
      await usageService.release(imageReservation).catch(() => undefined);
    }
    if (screenshotRecord && !retainScreenshot) {
      await deletePrivateScreenshot(screenshotRecord.id, ownerId).catch(
        (cleanupError) => {
          logger.error(
            { err: cleanupError },
            "Temporary screenshot cleanup failed",
          );
        },
      );
    }

    if (error instanceof UsageLimitError) {
      res.status(429).json({ error: error.message });
      return;
    }
    if (
      error instanceof Error &&
      ["SCREENSHOT_NOT_FOUND", "SCREENSHOT_INVALID"].includes(error.message)
    ) {
      res.status(error.message === "SCREENSHOT_NOT_FOUND" ? 404 : 400).json({
        error:
          error.message === "SCREENSHOT_NOT_FOUND"
            ? "Screenshot not found."
            : "This screenshot is not a valid JPG, PNG, or WebP image.",
      });
      return;
    }
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      res.status(503).json({ error: "Reply suggestions are temporarily unavailable." });
      return;
    }

    const status = analysisSaved ? 500 : 502;
    req.log.error(
      { stage: analysisSaved ? "cleanup-or-usage" : "analysis", status },
      "Unable to finish conversation analysis",
    );
    res.status(status).json({
      error: analysisSaved
        ? "Analysis was saved, but screenshot cleanup did not finish. Reload and delete the screenshot."
        : "ReplyMind could not analyze this conversation. Please try again.",
    });
  }
});

export default router;