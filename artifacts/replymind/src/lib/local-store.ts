import type {
  AnalysisResult,
  ConversationDetail,
  ConversationSummary,
  ConversationUpdate,
  PreferenceInput,
  ReplySuggestion,
  UploadedScreenshot,
  UsageSummary,
  UserPreference,
} from '@workspace/api-client-react';

const DB_NAME = 'replymind-local';
const DB_VERSION = 1;
const CONVERSATIONS = 'conversations';
const SCREENSHOTS = 'screenshots';
const PREFERENCES = 'preferences';
const USAGE = 'usage';
const GENERATION_LIMIT = 100;
const IMAGE_ANALYSIS_LIMIT = 30;
const SCREENSHOT_STORAGE_LIMIT = 100 * 1024 * 1024;

type ScreenshotRecord = UploadedScreenshot & { blob: Blob };
type PreferenceRecord = { key: 'preferences'; value: UserPreference };
type MonthlyUsageRecord = { month: string; generations: number; imageAnalyses: number };

const defaultPreferences: UserPreference = {
  defaultTone: 'natural',
  includeEmojis: false,
  appearance: 'system',
};

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not support local conversation storage.'));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore(CONVERSATIONS, { keyPath: 'id' });
        const screenshotStore = database.createObjectStore(SCREENSHOTS, { keyPath: 'id' });
        screenshotStore.createIndex('conversationId', 'conversationId', { unique: false });
        database.createObjectStore(PREFERENCES, { keyPath: 'key' });
        database.createObjectStore(USAGE, { keyPath: 'month' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
      request.onblocked = () => reject(new Error('Close other ReplyMind tabs to update local storage.'));
    });
  }
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local storage request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Local storage update was interrupted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Local storage update failed.'));
  });
}

function id(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Secure ID generation is unavailable in this browser.');
  }
  return crypto.randomUUID();
}

function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export async function createLocalConversation(title: string): Promise<ConversationDetail> {
  const now = new Date().toISOString();
  const detail: ConversationDetail = {
    id: id(),
    title: title.trim().slice(0, 120) || 'A new conversation',
    preview: null,
    messageCount: 0,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
    analysis: null,
    screenshot: null,
  };
  const database = await openDatabase();
  const transaction = database.transaction(CONVERSATIONS, 'readwrite');
  transaction.objectStore(CONVERSATIONS).put(detail);
  await transactionDone(transaction);
  return detail;
}

export async function getLocalConversation(id: string): Promise<ConversationDetail | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(CONVERSATIONS, 'readonly');
  const result = await requestResult<ConversationDetail | undefined>(
    transaction.objectStore(CONVERSATIONS).get(id),
  );
  await transactionDone(transaction);
  return result;
}

export async function listLocalConversations(): Promise<ConversationSummary[]> {
  const database = await openDatabase();
  const transaction = database.transaction(CONVERSATIONS, 'readonly');
  const values = await requestResult<ConversationDetail[]>(
    transaction.objectStore(CONVERSATIONS).getAll(),
  );
  await transactionDone(transaction);
  return values
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .map(({ messages: _messages, analysis: _analysis, screenshot: _screenshot, ...summary }) => summary);
}

export async function updateLocalConversation(
  conversationId: string,
  changes: ConversationUpdate,
): Promise<ConversationSummary> {
  const database = await openDatabase();
  const transaction = database.transaction(CONVERSATIONS, 'readwrite');
  const store = transaction.objectStore(CONVERSATIONS);
  const conversation = await requestResult<ConversationDetail | undefined>(store.get(conversationId));
  if (!conversation) {
    throw new Error('Conversation not found on this device.');
  }
  const updated: ConversationDetail = {
    ...conversation,
    ...(changes.title !== undefined && { title: changes.title.trim().slice(0, 120) }),
    ...(changes.isArchived !== undefined && { isArchived: changes.isArchived }),
    updatedAt: new Date().toISOString(),
  };
  store.put(updated);
  await transactionDone(transaction);
  return toSummary(updated);
}

export async function saveLocalAnalysis(
  conversationId: string,
  analysis: AnalysisResult,
  hasImage: boolean,
): Promise<ConversationDetail> {
  const database = await openDatabase();
  const transaction = database.transaction(CONVERSATIONS, 'readwrite');
  const store = transaction.objectStore(CONVERSATIONS);
  const conversation = await requestResult<ConversationDetail | undefined>(store.get(conversationId));
  if (!conversation) {
    throw new Error('Conversation not found on this device.');
  }
  const updated: ConversationDetail = {
    ...conversation,
    preview: analysis.messages.at(-1)?.content ?? conversation.preview,
    messageCount: analysis.messages.length,
    messages: analysis.messages,
    analysis,
    updatedAt: analysis.createdAt,
  };
  store.put(updated);
  await transactionDone(transaction);
  await incrementUsage(hasImage);
  return updated;
}

export async function getLocalScreenshot(id: string): Promise<ScreenshotRecord | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(SCREENSHOTS, 'readonly');
  const result = await requestResult<ScreenshotRecord | undefined>(
    transaction.objectStore(SCREENSHOTS).get(id),
  );
  await transactionDone(transaction);
  return result;
}

export async function getConversationScreenshot(conversationId: string): Promise<ScreenshotRecord | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(SCREENSHOTS, 'readonly');
  const index = transaction.objectStore(SCREENSHOTS).index('conversationId');
  const result = await requestResult<ScreenshotRecord | undefined>(index.get(conversationId));
  await transactionDone(transaction);
  return result;
}

export async function saveLocalScreenshot(
  conversationId: string,
  file: Blob,
  fileName: string,
  contentType: UploadedScreenshot['contentType'],
): Promise<UploadedScreenshot> {
  const database = await openDatabase();
  const totalBytes = await getLocalScreenshotBytes();
  if (totalBytes + file.size > SCREENSHOT_STORAGE_LIMIT) {
    throw new Error('This browser has reached ReplyMind’s 100 MB screenshot storage limit. Remove saved screenshots to continue.');
  }
  const conversation = await getLocalConversation(conversationId);
  if (!conversation) throw new Error('Conversation not found on this device.');
  const screenshotId = id();
  const metadata: UploadedScreenshot = {
    id: screenshotId,
    conversationId,
    fileName,
    contentType,
    size: file.size,
    objectPath: `local:${screenshotId}`,
    createdAt: new Date().toISOString(),
  };
  const transaction = database.transaction([SCREENSHOTS, CONVERSATIONS], 'readwrite');
  transaction.objectStore(SCREENSHOTS).put({ ...metadata, blob: file } satisfies ScreenshotRecord);
  transaction.objectStore(CONVERSATIONS).put({
    ...conversation,
    screenshot: metadata,
    updatedAt: metadata.createdAt,
  });
  await transactionDone(transaction);
  return metadata;
}

export async function removeLocalScreenshot(screenshotId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([SCREENSHOTS, CONVERSATIONS], 'readwrite');
  const screenshots = transaction.objectStore(SCREENSHOTS);
  const screenshot = await requestResult<ScreenshotRecord | undefined>(screenshots.get(screenshotId));
  screenshots.delete(screenshotId);
  if (screenshot) {
    const conversations = transaction.objectStore(CONVERSATIONS);
    const conversation = await requestResult<ConversationDetail | undefined>(
      conversations.get(screenshot.conversationId),
    );
    if (conversation?.screenshot?.id === screenshotId) {
      conversations.put({
        ...conversation,
        screenshot: null,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  await transactionDone(transaction);
}

export async function deleteLocalConversation(conversationId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([CONVERSATIONS, SCREENSHOTS], 'readwrite');
  const index = transaction.objectStore(SCREENSHOTS).index('conversationId');
  const screenshots = await requestResult<ScreenshotRecord[]>(index.getAll(conversationId));
  for (const screenshot of screenshots) transaction.objectStore(SCREENSHOTS).delete(screenshot.id);
  transaction.objectStore(CONVERSATIONS).delete(conversationId);
  await transactionDone(transaction);
}

export async function getLocalPreferences(): Promise<UserPreference> {
  const database = await openDatabase();
  const transaction = database.transaction(PREFERENCES, 'readonly');
  const stored = await requestResult<PreferenceRecord | undefined>(
    transaction.objectStore(PREFERENCES).get('preferences'),
  );
  await transactionDone(transaction);
  return stored?.value ?? defaultPreferences;
}

export async function updateLocalPreferences(changes: PreferenceInput): Promise<UserPreference> {
  const current = await getLocalPreferences();
  const next = { ...current, ...changes };
  const database = await openDatabase();
  const transaction = database.transaction(PREFERENCES, 'readwrite');
  transaction.objectStore(PREFERENCES).put({ key: 'preferences', value: next } satisfies PreferenceRecord);
  await transactionDone(transaction);
  return next;
}

export async function getLocalUsage(): Promise<UsageSummary> {
  const month = monthKey();
  const database = await openDatabase();
  const transaction = database.transaction(USAGE, 'readonly');
  const usage = await requestResult<MonthlyUsageRecord | undefined>(
    transaction.objectStore(USAGE).get(month),
  );
  await transactionDone(transaction);
  return {
    month,
    generations: usage?.generations ?? 0,
    generationLimit: GENERATION_LIMIT,
    imageAnalyses: usage?.imageAnalyses ?? 0,
    imageAnalysisLimit: IMAGE_ANALYSIS_LIMIT,
    storageBytes: await getLocalScreenshotBytes(),
    storageLimitBytes: SCREENSHOT_STORAGE_LIMIT,
  };
}

export async function ensureLocalUsageAvailable(hasImage: boolean): Promise<void> {
  const usage = await getLocalUsage();
  if (usage.generations >= usage.generationLimit) {
    throw new Error('This browser has reached its monthly conversation-read limit.');
  }
  if (hasImage && usage.imageAnalyses >= usage.imageAnalysisLimit) {
    throw new Error('This browser has reached its monthly screenshot-analysis limit.');
  }
}

export async function incrementUsage(hasImage: boolean): Promise<void> {
  const month = monthKey();
  const database = await openDatabase();
  const transaction = database.transaction(USAGE, 'readwrite');
  const store = transaction.objectStore(USAGE);
  const current = await requestResult<MonthlyUsageRecord | undefined>(store.get(month));
  store.put({
    month,
    generations: (current?.generations ?? 0) + 1,
    imageAnalyses: (current?.imageAnalyses ?? 0) + (hasImage ? 1 : 0),
  } satisfies MonthlyUsageRecord);
  await transactionDone(transaction);
}

export async function saveLocalSuggestion(
  conversationId: string,
  suggestionId: string,
  updatedSuggestion: ReplySuggestion,
): Promise<void> {
  const conversation = await getLocalConversation(conversationId);
  if (!conversation?.analysis) throw new Error('Reply suggestion not found on this device.');
  const suggestions = conversation.analysis.suggestions.map((suggestion) =>
    suggestion.id === suggestionId ? updatedSuggestion : suggestion,
  );
  const updated: ConversationDetail = {
    ...conversation,
    analysis: { ...conversation.analysis, suggestions },
    updatedAt: updatedSuggestion.createdAt,
  };
  const database = await openDatabase();
  const transaction = database.transaction(CONVERSATIONS, 'readwrite');
  transaction.objectStore(CONVERSATIONS).put(updated);
  await transactionDone(transaction);
}

export async function clearLocalData(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [CONVERSATIONS, SCREENSHOTS, PREFERENCES, USAGE],
    'readwrite',
  );
  transaction.objectStore(CONVERSATIONS).clear();
  transaction.objectStore(SCREENSHOTS).clear();
  transaction.objectStore(PREFERENCES).clear();
  transaction.objectStore(USAGE).clear();
  await transactionDone(transaction);
}

export function toSummary(conversation: ConversationDetail): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    preview: conversation.preview,
    messageCount: conversation.messageCount,
    isArchived: conversation.isArchived,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export function screenshotStorageLimit(): number {
  return SCREENSHOT_STORAGE_LIMIT;
}

async function getLocalScreenshotBytes(): Promise<number> {
  const database = await openDatabase();
  const transaction = database.transaction(SCREENSHOTS, 'readonly');
  const records = await requestResult<ScreenshotRecord[]>(
    transaction.objectStore(SCREENSHOTS).getAll(),
  );
  await transactionDone(transaction);
  return records.reduce((total, record) => total + record.size, 0);
}