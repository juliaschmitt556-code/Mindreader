import { RewriteReplyBody, RewriteReplyParams, RewriteReplyResponse } from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import { groqService } from "../lib/ai/groq";

const router: IRouter = Router();

router.post("/:id/rewrite", async (req: Request, res: Response) => {
  const params = RewriteReplyParams.safeParse(req.params);
  const body = RewriteReplyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a reply and a rewrite instruction." });
    return;
  }

  try {
    const text = await groqService.rewrite({
      conversation: body.data.conversationContext,
      originalText: body.data.originalText,
      tone: body.data.tone,
      instruction: body.data.instruction,
      includeEmojis: body.data.includeEmojis ?? false,
    });
    res.json(
      RewriteReplyResponse.parse({
        id: params.data.id,
        tone: body.data.tone,
        text,
        createdAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      res.status(503).json({ error: "Reply suggestions are temporarily unavailable." });
      return;
    }
    req.log.error({ stage: "rewrite" }, "Unable to rewrite reply");
    res.status(502).json({ error: "ReplyMind could not rewrite that reply. Try again." });
  }
});

export default router;