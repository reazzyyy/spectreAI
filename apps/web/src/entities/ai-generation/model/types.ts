/** AI generation DTO from Nest Phase 5A/5B. */
export interface GenerationSource {
  citationKey: string;
  rank: number;
  sourceType: string;
  contextSnapshotItemId: string;
  sourceEntityId: string | null;
  itemCitationKey: string | null;
}

export interface AiGeneration {
  id: string;
  conversationId: string;
  status: string;
  aiJobId: string | null;
  providerId: string | null;
  modelId: string | null;
  assistantMessageId: string | null;
  contextSnapshotId: string | null;
  contextMode: string | null;
  contextHash: string | null;
  promptVersion: string | null;
  sources: GenerationSource[];
  createdAt: string;
  completedAt: string | null;
  synthetic: boolean;
}
