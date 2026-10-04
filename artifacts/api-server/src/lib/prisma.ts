import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  replyMindPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.replyMindPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.replyMindPrisma = prisma;
}

export async function ensureUser(userId: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, preference: { create: {} } },
    update: {},
  });
}