import { useMutation, useQuery } from '@tanstack/react-query';
import {
  useHealthCheck,
  type AnalysisResult,
  type AnalyzeInput,
  type ConversationDetail,
  type ConversationUpdate,
  type PreferenceInput,
  type ReplySuggestion,
  type UserPreference,
} from '@workspace/api-client-react';
import {
  clearLocalData,
  createLocalConversation,
  deleteLocalConversation,
  ensureLocalUsageAvailable,
  getConversationScreenshot,
  getLocalConversation,
  getLocalPreferences,
  getLocalUsage,
  incrementUsage,
  listLocalConversations,
  removeLocalScreenshot,
  saveLocalAnalysis,
  saveLocalScreenshot,
  saveLocalSuggestion,
  updateLocalConversation,
  updateLocalPreferences,
} from './local-store';

export { useHealthCheck };

export function getListConversationsQueryKey() {
  return ['local', 'conversations'] as const;
}

export function getGetConversationQueryKey(id: string) {
  return ['local', 'conversation', id] as const;
}

export function getGetPreferencesQueryKey() {
  return ['local', 'preferences'] as const;
}

export function getGetUsageQueryKey() {
  return ['local', 'usage'] as const;
}

export function useListConversations() {
  return useQuery({
    queryKey: getListConversationsQueryKey(),
    queryFn: listLocalConversations,
  });
}

export function useGetConversation(
  id: string,
  options?: { query?: { queryKey?: readonly unknown[]; enabled?: boolean } },
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetConversationQueryKey(id),
    enabled: options?.query?.enabled ?? Boolean(id),
    queryFn: async () => {
      const conversation = await getLocalConversation(id);
      if (!conversation) throw new Error('This conversation is not saved in this browser.');
      return conversation;
    },
  });
}

export function useGetPreferences() {
  return useQuery({
    queryKey: getGetPreferencesQueryKey(),
    queryFn: getLocalPreferences,
  });
}

export function useGetUsage() {
  return useQuery({
    queryKey: getGetUsageQueryKey(),
    queryFn: getLocalUsage,
  });
}

export function useCreateConversation() {
  return useMutation({
    mutationFn: ({ data }: { data: { title: string } }) => createLocalConversation(data.title),
  });
}

type LocalAnalyzeInput = Omit<
  AnalyzeInput,
  'conversationId' | 'screenshotBase64' | 'screenshotContentType' | 'screenshotFileName'
> & {
  screenshotId?: string;
  retainScreenshot?: boolean;
};

export function useAnalyzeConversation() {
  return useMutation({
    mutationFn: async ({
      id,
      data,
      screenshotFile,
    }: {
      id: string;
      data: LocalAnalyzeInput;
      screenshotFile?: File;
    }): Promise<AnalysisResult> => {
      const conversation = await getLocalConversation(id);
      if (!conversation) throw new Error('This conversation is not saved in this browser.');

      const savedScreenshot = data.screenshotId
        ? await getConversationScreenshot(id)
        : screenshotFile
          ? undefined
          : await getConversationScreenshot(id);
      if (data.screenshotId && !savedScreenshot && !screenshotFile) {
        throw new Error('The saved screenshot is no longer available in this browser.');
      }
      if (data.screenshotId && savedScreenshot?.id !== data.screenshotId && !screenshotFile) {
        throw new Error('The saved screenshot is no longer available in this browser.');
      }

      const sourceImage = screenshotFile ?? savedScreenshot?.blob;
      await ensureLocalUsageAvailable(Boolean(sourceImage));
      const payload: AnalyzeInput = {
        conversationId: id,
        ...(data.conversationText && { conversationText: data.conversationText }),
        ...(data.latestMessage && { latestMessage: data.latestMessage }),
        ...(data.contextClarification && { contextClarification: data.contextClarification }),
        ...(data.instruction && { instruction: data.instruction }),
        ...(data.previousMessages && {
          previousMessages: data.previousMessages.map(({ speaker, content }) => ({ speaker, content })),
        }),
        ...(data.tone && { tone: data.tone }),
        ...(data.includeEmojis !== undefined && { includeEmojis: data.includeEmojis }),
        ...(sourceImage && {
          screenshotBase64: await blobToBase64(sourceImage),
          screenshotContentType: sourceImage.type as NonNullable<AnalyzeInput['screenshotContentType']>,
          screenshotFileName: screenshotFile?.name ?? savedScreenshot?.fileName ?? 'saved-screenshot',
        }),
      };
      const result = await apiRequest<AnalysisResult>('/api/analysis', payload);
      const localResult = data.contextClarification?.trim()
        ? {
            ...result,
            messages: [
              ...result.messages,
              {
                id: crypto.randomUUID(),
                speaker: 'me' as const,
                content: data.contextClarification.trim(),
                sequence: result.messages.length + 1,
                createdAt: result.createdAt,
              },
            ],
          }
        : result;
      await saveLocalAnalysis(id, localResult, Boolean(sourceImage));

      const shouldRetain = data.retainScreenshot ?? Boolean(savedScreenshot);
      if (shouldRetain && screenshotFile && !savedScreenshot) {
        await saveLocalScreenshot(
          id,
          screenshotFile,
          screenshotFile.name,
          screenshotFile.type as NonNullable<AnalyzeInput['screenshotContentType']>,
        );
      } else if (!shouldRetain && savedScreenshot) {
        await removeLocalScreenshot(savedScreenshot.id);
      }
      return localResult;
    },
  });
}

export function useUpdateConversation() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConversationUpdate }) =>
      updateLocalConversation(id, data),
  });
}

export function useDeleteConversation() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteLocalConversation(id),
  });
}

export function useDeleteUpload() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => removeLocalScreenshot(id),
  });
}

export function useRewriteReply() {
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { instruction: string; includeEmojis: boolean };
    }): Promise<ReplySuggestion> => {
      await ensureLocalUsageAvailable(false);
      const conversations = await listLocalConversations();
      let ownerConversation: ConversationDetail | undefined;
      let originalSuggestion: ReplySuggestion | undefined;
      for (const item of conversations) {
        const conversation = await getLocalConversation(item.id);
        const suggestion = conversation?.analysis?.suggestions.find((reply) => reply.id === id);
        if (conversation && suggestion) {
          ownerConversation = conversation;
          originalSuggestion = suggestion;
          break;
        }
      }
      if (!ownerConversation || !originalSuggestion) {
        throw new Error('This reply suggestion is not saved in this browser.');
      }

      const result = await apiRequest<ReplySuggestion>(`/api/replies/${encodeURIComponent(id)}/rewrite`, {
        originalText: originalSuggestion.text,
        conversationContext: ownerConversation.messages
          .map((message) => `${message.speaker === 'me' ? 'Me' : message.speaker === 'them' ? 'Them' : 'Message'}: ${message.content}`)
          .join('\n')
          .slice(-16000),
        tone: originalSuggestion.tone,
        instruction: data.instruction.slice(0, 200),
        includeEmojis: data.includeEmojis,
      });
      await saveLocalSuggestion(ownerConversation.id, originalSuggestion.id, result);
      await incrementUsage(false);
      return result;
    },
  });
}

export function useUpdatePreferences() {
  return useMutation({
    mutationFn: ({ data }: { data: PreferenceInput }): Promise<UserPreference> =>
      updateLocalPreferences(data),
  });
}

export function useClearLocalData() {
  return useMutation({ mutationFn: clearLocalData });
}

async function apiRequest<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('ReplyMind needs an internet connection to contact Groq. Your local data is still safe.');
  }
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || 'ReplyMind could not finish this request. Please try again.');
  }
  return payload as T;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}