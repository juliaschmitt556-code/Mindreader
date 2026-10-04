import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";
import { prisma } from "./prisma";

export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const objectStorage = new ObjectStorageService();

export async function deletePrivateScreenshot(
  screenshotId: string,
  ownerId: string,
): Promise<boolean> {
  const screenshot = await prisma.uploadedScreenshot.findFirst({
    where: { id: screenshotId, ownerId },
  });
  if (!screenshot) return false;

  try {
    const file = await objectStorage.getObjectEntityFile(screenshot.objectPath);
    await file.delete({ ignoreNotFound: true });
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) {
      throw error;
    }
  }

  await prisma.uploadedScreenshot.delete({ where: { id: screenshot.id } });
  return true;
}

export async function deletePendingObject(objectPath: string): Promise<void> {
  try {
    const file = await objectStorage.getObjectEntityFile(objectPath);
    await file.delete({ ignoreNotFound: true });
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) {
      throw error;
    }
  }
}

export async function cleanupExpiredPendingUploads(): Promise<number> {
  const expiresBefore = new Date(Date.now() - 30 * 60 * 1000);
  const pending = await prisma.uploadedScreenshot.findMany({
    where: { isRegistered: false, createdAt: { lt: expiresBefore } },
    select: { id: true, objectPath: true },
    take: 100,
  });
  let cleaned = 0;
  for (const item of pending) {
    await deletePendingObject(item.objectPath);
    await prisma.uploadedScreenshot.deleteMany({ where: { id: item.id } });
    cleaned += 1;
  }
  return cleaned;
}

export function startPendingUploadCleanup(): void {
  const run = () => {
    void cleanupExpiredPendingUploads().catch((error) => {
      logger.error({ err: error }, "Pending screenshot cleanup failed");
    });
  };
  run();
  const timer = setInterval(run, 15 * 60 * 1000);
  timer.unref();
}

export async function getScreenshotBytes(input: {
  screenshotId: string;
  ownerId: string;
}): Promise<{
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}> {
  const screenshot = await prisma.uploadedScreenshot.findFirst({
    where: {
      id: input.screenshotId,
      ownerId: input.ownerId,
      isRegistered: true,
    },
  });
  if (!screenshot) {
    throw new Error("SCREENSHOT_NOT_FOUND");
  }
  if (
    !ALLOWED_IMAGE_TYPES.has(screenshot.contentType) ||
    screenshot.size > MAX_SCREENSHOT_BYTES
  ) {
    throw new Error("SCREENSHOT_INVALID");
  }

  const file = await objectStorage.getObjectEntityFile(screenshot.objectPath);
  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size);
  const actualType = metadata.contentType;
  if (
    actualSize !== screenshot.size ||
    actualSize > MAX_SCREENSHOT_BYTES ||
    actualType !== screenshot.contentType
  ) {
    throw new Error("SCREENSHOT_INVALID");
  }

  const [bytes] = await file.download();
  if (!isExpectedImage(bytes, screenshot.contentType)) {
    throw new Error("SCREENSHOT_INVALID");
  }
  return {
    bytes,
    contentType: screenshot.contentType as
      | "image/jpeg"
      | "image/png"
      | "image/webp",
  };
}

export function isExpectedImage(
  bytes: Buffer,
  contentType: string,
): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    );
  }
  return false;
}