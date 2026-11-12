import { queryOptions } from "@tanstack/react-query";
import { fetchAiGeneration } from "./ai-generation-api";

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "timed_out"]);

/** Poll generation until terminal status (Synthetic chat path). */
export function aiGenerationQueryOptions(generationId: string | null) {
  return queryOptions({
    queryKey: ["ai-generations", "detail", generationId] as const,
    queryFn: () => fetchAiGeneration(generationId!),
    enabled: Boolean(generationId && generationId.length > 0),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || TERMINAL.has(status)) {
        return false;
      }
      return 800;
    },
  });
}
