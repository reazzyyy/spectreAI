/** Product data classes (docs/03). `synthetic_fixture` is a harness marker, not a client field. */
export const DATA_CLASSES = ["D0", "D1", "D2", "D3", "D4", "synthetic_fixture"] as const;

export type DataClass = (typeof DATA_CLASSES)[number];

export type ExecutionMode = "synthetic" | "external";

export class AiGatewayError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AiGatewayError";
    this.code = code;
  }
}

/**
 * Chat text, attachments, and OCR are correspondence and file content (D3).
 * The label is chosen on the server. A client `dataClass` field is not an input.
 */
export function classifyUntrustedText(): "D3" {
  return "D3";
}

/**
 * Env may ask for an external provider. That request is not permission to send
 * data. O-002 is still open, so the only mode that runs is synthetic.
 */
export function requestedExecutionMode(env: NodeJS.ProcessEnv = process.env): ExecutionMode {
  const values = [env.AI_EXECUTION_MODE, env.AI_PROVIDER]
    .map((value) => (value ?? "").trim().toLowerCase())
    .filter((value) => value !== "");
  if (values.length === 0 || values.every((value) => value === "synthetic")) {
    return "synthetic";
  }
  return "external";
}

export function isDataClass(value: string): value is DataClass {
  return (DATA_CLASSES as readonly string[]).includes(value);
}

/**
 * Blocks a network transfer. D3 and D4 are refused even if a later change
 * allows some other class to leave the process. The error text is a code.
 */
export function assertTransferAllowed(dataClass: DataClass, mode: ExecutionMode): void {
  if (mode === "synthetic") {
    return;
  }
  if (dataClass === "D3" || dataClass === "D4") {
    throw new AiGatewayError("AI_TRANSFER_BLOCKED", "AI_TRANSFER_BLOCKED");
  }
  throw new AiGatewayError("AI_TRANSFER_BLOCKED", "AI_TRANSFER_BLOCKED");
}
