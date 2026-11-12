import { apiRequest } from "@/shared/api";
import type { AiGeneration } from "../model/types";

/** GET /ai-generations/:id */
export function fetchAiGeneration(generationId: string): Promise<AiGeneration> {
  return apiRequest<AiGeneration>(
    `/ai-generations/${encodeURIComponent(generationId)}`,
    { method: "GET" },
  );
}
