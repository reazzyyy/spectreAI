export const AI_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
] as const;

export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export class AiGatewayError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AiGatewayError";
    this.code = code;
  }
}

export interface GenerateTextMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateTextRequest {
  operationId: string;
  dataClass: string;
  messages: readonly GenerateTextMessage[];
}

export interface GenerateTextResult {
  text: string;
  providerId: "synthetic";
  modelId: "synthetic-echo";
  synthetic: true;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * In-process adapter used until external transfer is approved (D-012 / O-002).
 * It never calls a network provider and refuses anything except synthetic data.
 */
export class SyntheticAIProvider {
  readonly providerId = "synthetic" as const;

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResult> {
    if (request.dataClass !== "synthetic") {
      throw new AiGatewayError(
        "AI_DATA_POLICY_BLOCKED",
        "Only synthetic data is allowed",
      );
    }

    const operationId = request.operationId.trim();
    if (operationId === "" || request.messages.length === 0) {
      throw new AiGatewayError("VALIDATION_ERROR", "Synthetic request is incomplete");
    }

    const inputTokens = request.messages.reduce(
      (sum, message) => sum + message.content.length,
      0,
    );
    const text = `synthetic:${operationId}:${inputTokens}`;

    return {
      text,
      providerId: "synthetic",
      modelId: "synthetic-echo",
      synthetic: true,
      usage: {
        inputTokens,
        outputTokens: text.length,
      },
    };
  }
}

export class AiGateway {
  private readonly provider = new SyntheticAIProvider();

  get providerId(): "synthetic" {
    return this.provider.providerId;
  }

  generateText(request: GenerateTextRequest): Promise<GenerateTextResult> {
    return this.provider.generateText(request);
  }
}
