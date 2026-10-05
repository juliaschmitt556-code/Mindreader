import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const requests = new Map<string, { count: number; expiresAt: number }>();

export function limitAiRequests(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const current = requests.get(key);
  if (!current || current.expiresAt <= now) {
    requests.set(key, { count: 1, expiresAt: now + WINDOW_MS });
  } else if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    res.setHeader("Retry-After", Math.max(1, Math.ceil((current.expiresAt - now) / 1000)));
    res.status(429).json({ error: "Too many AI requests. Please wait a minute and try again." });
    return;
  } else {
    current.count += 1;
  }

  if (requests.size > 5000) {
    for (const [address, limit] of requests) {
      if (limit.expiresAt <= now) requests.delete(address);
    }
  }
  next();
}