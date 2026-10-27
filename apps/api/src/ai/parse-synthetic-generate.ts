const MAX_CONTENT_LENGTH = 2_000;
const MAX_OPERATION_ID_LENGTH = 128;

export interface SyntheticGenerateInput {
  operationId: string;
  dataClass: string;
  content: string;
}

export function parseSyntheticGenerate(body: unknown): SyntheticGenerateInput | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const { operationId, dataClass, content } = record;
  if (
    typeof operationId !== "string" ||
    typeof dataClass !== "string" ||
    typeof content !== "string"
  ) {
    return null;
  }
  if (
    operationId.trim() === "" ||
    operationId.length > MAX_OPERATION_ID_LENGTH ||
    content.length === 0 ||
    content.length > MAX_CONTENT_LENGTH ||
    dataClass.trim() === ""
  ) {
    return null;
  }

  return { operationId: operationId.trim(), dataClass, content };
}
