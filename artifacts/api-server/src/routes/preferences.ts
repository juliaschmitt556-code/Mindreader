import {
  GetPreferencesResponse,
  GetUsageResponse,
  UpdatePreferencesBody,
  UpdatePreferencesResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { usageService } from "../lib/usageService";

const router: IRouter = Router();

router.get("/preferences", async (_req: Request, res: Response) => {
  const userId = res.locals.userId as string;
  const preference = await prisma.userPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  res.json(
    GetPreferencesResponse.parse({
      defaultTone: preference.defaultTone,
      includeEmojis: preference.includeEmojis,
      appearance: preference.appearance,
    }),
  );
});

router.patch("/preferences", async (req: Request, res: Response) => {
  const parsed = UpdatePreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Preference values are invalid." });
    return;
  }
  const userId = res.locals.userId as string;
  const preference = await prisma.userPreference.upsert({
    where: { userId },
    create: {
      userId,
      ...parsed.data,
    },
    update: parsed.data,
  });
  res.json(
    UpdatePreferencesResponse.parse({
      defaultTone: preference.defaultTone,
      includeEmojis: preference.includeEmojis,
      appearance: preference.appearance,
    }),
  );
});

router.get("/usage", async (_req: Request, res: Response) => {
  const userId = res.locals.userId as string;
  const summary = await usageService.getSummary(userId);
  res.json(GetUsageResponse.parse(summary));
});

export default router;