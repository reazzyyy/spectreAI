import {
  AiGatewayError,
  assertTransferAllowed,
  isDataClass,
  requestedExecutionMode,
  type DataClass,
  type ExecutionMode,
} from "./transfer-policy.js";

export const AI_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
] as const;

export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export {
  AiGatewayError,
  assertTransferAllowed,
  classifyUntrustedText,
  DATA_CLASSES,
  isDataClass,
  requestedExecutionMode,
  type DataClass,
  type ExecutionMode,
} from "./transfer-policy.js";

export interface GenerateTextMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateTextRequest {
  operationId: string;
  dataClass: DataClass;
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
 * It does not read the network and does not decide whether the text may leave
 * the process. That decision is `assertTransferAllowed`.
 */
export class SyntheticAIProvider {
  readonly providerId = "synthetic" as const;

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResult> {
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
  private readonly provider: TextGenerator;

  constructor(provider: TextGenerator = new SyntheticAIProvider()) {
    this.provider = provider;
  }

  get providerId(): "synthetic" {
    return "synthetic";
  }

  async generateText(
    request: GenerateTextRequest,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<GenerateTextResult> {
    if (!isDataClass(request.dataClass)) {
      throw new AiGatewayError("AI_DATA_POLICY_BLOCKED", "AI_DATA_POLICY_BLOCKED");
    }
    const mode: ExecutionMode =
      this.provider.providerId === "synthetic" ? requestedExecutionMode(env) : "external";
    assertTransferAllowed(request.dataClass, mode);
    return this.provider.generateText(request);
  }
}

interface TextGenerator {
  readonly providerId: string;
  generateText(request: GenerateTextRequest): Promise<GenerateTextResult>;
}
