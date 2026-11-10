/** Confirmed MVP limits (D-010 / D-017). */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_UPLOAD = 10;

export const ALLOWED_DOCUMENT_EXTENSIONS = new Set([".pdf", ".docx", ".txt"]);

export type DetectedDocumentKind = "pdf" | "docx" | "txt";

export interface ValidatedDocumentBytes {
  kind: DetectedDocumentKind;
  mimeType: string;
}

/**
 * Validates magic bytes + extension for PDF / DOCX / TXT.
 * DOCX is ZIP-based: requires PK signature and openxml markers; bare archives fail.
 */
export function validateDocumentBytes(
  buffer: Buffer,
  originalFileName: string,
): ValidatedDocumentBytes | null {
  const ext = extensionOf(originalFileName);
  if (!ext || !ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
    return null;
  }

  if (buffer.byteLength === 0 || buffer.byteLength > MAX_DOCUMENT_BYTES) {
    return null;
  }

  if (ext === ".pdf") {
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return null;
    }
    return { kind: "pdf", mimeType: "application/pdf" };
  }

  if (ext === ".txt") {
    if (!looksLikePlainText(buffer)) {
      return null;
    }
    return { kind: "txt", mimeType: "text/plain; charset=utf-8" };
  }

  if (ext === ".docx") {
    if (!looksLikeDocx(buffer)) {
      return null;
    }
    return {
      kind: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }

  return null;
}

function extensionOf(fileName: string): string | null {
  const base = fileName.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) {
    return null;
  }
  return base.slice(dot);
}

function looksLikePlainText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.byteLength, 8192));
  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
  }
  return true;
}

function looksLikeDocx(buffer: Buffer): boolean {
  // Local file header signature PK\x03\x04
  if (
    buffer.byteLength < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return false;
  }
  const asLatin1 = buffer.toString("latin1");
  return (
    asLatin1.includes("[Content_Types].xml") &&
    (asLatin1.includes("word/") || asLatin1.includes("word\\"))
  );
}
