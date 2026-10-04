import { getAuth } from "@clerk/express";
import {
  DeleteUploadParams,
  RegisterUploadBody,
  RegisterUploadResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectStorageService } from "../lib/objectStorage";
import { ensureUser, prisma } from "../lib/prisma";
import {
  deletePrivateScreenshot,
  isExpectedImage,
  MAX_SCREENSHOT_BYTES,
} from "../lib/uploads";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

function screenshotDto(screenshot: {
  id: string;
  conversationId: string | null;
  fileName: string;
  contentType: string;
  size: number;
  objectPath: string;
  createdAt: Date;
}) {
  return RegisterUploadResponse.parse({
    ...screenshot,
    createdAt: screenshot.createdAt.toISOString(),
  });
}

router.post("/uploads", async (req: Request, res: Response) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  const parsed = RegisterUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid upload details." });
    return;
  }

  const input = parsed.data;
  let pending:
    | Awaited<ReturnType<typeof prisma.uploadedScreenshot.findFirst>>
    | null = null;
  try {
    await ensureUser(userId);
    const objectPath = objectStorage.normalizeObjectEntityPath(input.objectPath);
    if (
      objectPath !== input.objectPath ||
      !objectPath.startsWith("/objects/")
    ) {
      res.status(400).json({ error: "Invalid private object path." });
      return;
    }

    const existing = await prisma.uploadedScreenshot.findFirst({
      where: { ownerId: userId, objectPath },
    });
    if (existing?.isRegistered) {
      res.status(200).json(screenshotDto(existing));
      return;
    }
    pending = existing;
    if (!pending || pending.isRegistered) {
      res.status(404).json({ error: "Upload request not found or expired." });
      return;
    }

    if (
      input.fileName !== pending.fileName ||
      input.size !== pending.size ||
      input.contentType !== pending.contentType ||
      input.size > MAX_SCREENSHOT_BYTES
    ) {
      res.status(400).json({ error: "Upload details do not match the request." });
      return;
    }

    if (input.conversationId) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: input.conversationId, ownerId: userId },
        select: { id: true },
      });
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found." });
        return;
      }
    }

    const file = await objectStorage.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    const actualSize = Number(metadata.size);
    if (
      actualSize !== pending.size ||
      actualSize > MAX_SCREENSHOT_BYTES ||
      metadata.contentType !== pending.contentType
    ) {
      res.status(400).json({
        error: "The uploaded file did not match its image details.",
      });
      return;
    }
    const [bytes] = await file.download();
    if (!isExpectedImage(bytes, pending.contentType)) {
      res.status(400).json({ error: "The uploaded file is not a supported image." });
      return;
    }

    await objectStorage.trySetObjectEntityAclPolicy(objectPath, {
      owner: userId,
      visibility: "private",
    });
    const screenshot = await prisma.uploadedScreenshot.update({
      where: { id: pending.id },
      data: {
        isRegistered: true,
        conversationId: input.conversationId ?? null,
        fileName: input.fileName,
        contentType: input.contentType,
        size: input.size,
      },
    });
    res.status(201).json(screenshotDto(screenshot));
  } catch (error) {
    if (pending) {
      try {
        await deletePrivateScreenshot(pending.id, userId);
      } catch (cleanupError) {
        logger.error(
          { err: cleanupError },
          "Failed to clean up invalid private screenshot upload",
        );
      }
    }
    req.log.error({ err: error }, "Unable to register private screenshot");
    res.status(500).json({ error: "Unable to save this screenshot." });
  }
});

router.delete("/uploads/:id", async (req: Request, res: Response) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  const parsed = DeleteUploadParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(404).json({ error: "Screenshot not found." });
    return;
  }

  try {
    const deleted = await deletePrivateScreenshot(parsed.data.id, userId);
    if (!deleted) {
      res.status(404).json({ error: "Screenshot not found." });
      return;
    }
    res.status(204).end();
  } catch (error) {
    req.log.error({ err: error }, "Unable to delete private screenshot");
    res.status(500).json({ error: "Unable to delete this screenshot." });
  }
});

export default router;