import { UsageKind, UsageStatus } from "@prisma/client";
import { prisma } from "./prisma";

type PlanLimits = {
  generations: number;
  imageAnalyses: number;
  storageBytes: number;
};

export class UsageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageLimitError";
  }
}

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function limitsFor(plan: string): PlanLimits {
  if (plan.toLowerCase() === "premium") {
    return {
      generations: envLimit("PREMIUM_MONTHLY_GENERATION_LIMIT", 1000),
      imageAnalyses: envLimit("PREMIUM_MONTHLY_IMAGE_ANALYSIS_LIMIT", 250),
      storageBytes: envLimit("PREMIUM_STORAGE_LIMIT_BYTES", 524288000),
    };
  }
  return {
    generations: envLimit("FREE_MONTHLY_GENERATION_LIMIT", 100),
    imageAnalyses: envLimit("FREE_MONTHLY_IMAGE_ANALYSIS_LIMIT", 30),
    storageBytes: envLimit("FREE_STORAGE_LIMIT_BYTES", 104857600),
  };
}

function utcMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export class UsageService {
  async reserve(userId: string, kind: UsageKind): Promise<bigint> {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { plan: true },
      });
      const limits = limitsFor(user.plan);
      const now = new Date();
      const monthStart = utcMonthStart(now);
      const monthlyCount = await tx.usageRecord.count({
        where: {
          ownerId: userId,
          kind,
          status: { in: [UsageStatus.reserved, UsageStatus.completed] },
          createdAt: { gte: monthStart },
        },
      });
      const maxForKind =
        kind === UsageKind.imageAnalysis
          ? limits.imageAnalyses
          : limits.generations;

      if (monthlyCount >= maxForKind) {
        throw new UsageLimitError(
          kind === UsageKind.imageAnalysis
            ? "Your monthly screenshot analysis limit has been reached."
            : "Your monthly reply generation limit has been reached.",
        );
      }

      if (kind === UsageKind.generation) {
        const recentCount = await tx.usageRecord.count({
          where: {
            ownerId: userId,
            kind,
            status: { in: [UsageStatus.reserved, UsageStatus.completed] },
            createdAt: { gte: new Date(now.getTime() - 60_000) },
          },
        });
        if (recentCount >= 8) {
          throw new UsageLimitError(
            "You’re making requests too quickly. Please wait a moment and try again.",
          );
        }
      }

      const record = await tx.usageRecord.create({
        data: { ownerId: userId, kind, status: UsageStatus.reserved },
        select: { id: true },
      });
      return record.id;
    });
  }

  async complete(reservationId: bigint): Promise<void> {
    await prisma.usageRecord.update({
      where: { id: reservationId },
      data: { status: UsageStatus.completed },
    });
  }

  async release(reservationId: bigint): Promise<void> {
    await prisma.usageRecord.deleteMany({
      where: { id: reservationId, status: UsageStatus.reserved },
    });
  }

  async getSummary(userId: string) {
    const [user, generations, imageAnalyses, storage] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { plan: true },
      }),
      prisma.usageRecord.count({
        where: {
          ownerId: userId,
          kind: UsageKind.generation,
          status: { in: [UsageStatus.reserved, UsageStatus.completed] },
          createdAt: { gte: utcMonthStart() },
        },
      }),
      prisma.usageRecord.count({
        where: {
          ownerId: userId,
          kind: UsageKind.imageAnalysis,
          status: { in: [UsageStatus.reserved, UsageStatus.completed] },
          createdAt: { gte: utcMonthStart() },
        },
      }),
      prisma.uploadedScreenshot.aggregate({
        where: { ownerId: userId, isRegistered: true },
        _sum: { size: true },
      }),
    ]);
    const limits = limitsFor(user.plan);
    return {
      plan: user.plan,
      month: utcMonthStart().toISOString().slice(0, 10),
      generations,
      imageAnalyses,
      storageBytes: storage._sum.size ?? 0,
      generationLimit: limits.generations,
      imageAnalysisLimit: limits.imageAnalyses,
      storageLimitBytes: limits.storageBytes,
    };
  }

  async assertStorageAvailable(userId: string, incomingBytes: number) {
    const summary = await this.getSummary(userId);
    if (summary.storageBytes + incomingBytes > summary.storageLimitBytes) {
      throw new UsageLimitError(
        "Your private screenshot storage is full. Delete a saved screenshot or try a smaller image.",
      );
    }
  }
}

export const usageService = new UsageService();