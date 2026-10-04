import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { ensureUser } from "../lib/prisma";

export const requireAuth: RequestHandler = async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  try {
    await ensureUser(userId);
    res.locals.userId = userId;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Unable to provision authenticated user");
    res.status(503).json({ error: "Your account is temporarily unavailable." });
  }
};

export function authenticatedUserId(res: {
  locals: Record<string, unknown>;
}): string {
  const userId = res.locals.userId;
  if (typeof userId !== "string") {
    throw new Error("Authenticated request has no user id");
  }
  return userId;
}