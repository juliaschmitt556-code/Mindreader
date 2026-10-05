import { Router, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, conversations } from "../lib/db";

const router = Router();
const VISITOR_COOKIE = "replymind_visitor";

function visitorId(req: Request, res: Response) {
  const existing = req.headers.cookie?.match(new RegExp(`${VISITOR_COOKIE}=([^;]+)`))?.[1];
  const value = existing ?? crypto.randomUUID();
  if (!existing) res.setHeader("Set-Cookie", `${VISITOR_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  return value;
}

router.get("/", async (req, res) => {
  const owner = visitorId(req, res);
  const rows = await db.select().from(conversations).where(eq(conversations.visitorId, owner)).orderBy(asc(conversations.updatedAt));
  res.json(rows.map((row) => row.payload));
});

router.get("/:id", async (req, res) => {
  const owner = visitorId(req, res);
  const row = await db.select().from(conversations).where(and(eq(conversations.visitorId, owner), eq(conversations.id, req.params.id))).limit(1);
  if (!row[0]) return res.status(404).json({ error: "Conversation not found." });
  return res.json(row[0].payload);
});

router.put("/:id", async (req, res) => {
  const owner = visitorId(req, res);
  const payload = req.body;
  if (!payload || payload.id !== req.params.id) return res.status(400).json({ error: "Conversation payload is invalid." });
  await db.insert(conversations).values({ visitorId: owner, id: req.params.id, payload, updatedAt: new Date() }).onConflictDoUpdate({ target: [conversations.visitorId, conversations.id], set: { payload, updatedAt: new Date() } });
  return res.json(payload);
});

router.delete("/:id", async (req, res) => {
  const owner = visitorId(req, res);
  await db.delete(conversations).where(and(eq(conversations.visitorId, owner), eq(conversations.id, req.params.id)));
  res.status(204).end();
});

export default router;
