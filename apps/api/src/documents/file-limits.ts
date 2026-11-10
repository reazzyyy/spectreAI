/** Confirmed MVP limits (D-010 / D-017). */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_UPLOAD = 10;

/** ZIP bomb / DOCX structure caps (scaffold harden). */
export const MAX_DOCX_ENTRIES = 4_000;
export const MAX_DOCX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

export const ALLOWED_DOCUMENT_EXTENSIONS = new Set([".pdf", ".docx", ".txt"]);

export type DetectedDocumentKind = "pdf" | "docx" | "txt";

export interface ValidatedDocumentBytes {
  kind: DetectedDocumentKind;
  mimeType: string;
}

/**
 * Validates magic bytes + extension for PDF / DOCX / TXT.
 * DOCX: ZIP local-header walk (entry caps, encryption bit, required OpenXML names).
 * PDF: reject `/Encrypt` dictionaries until O-004 (D-031 / D-017 password policy).
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
    if (pdfLooksEncrypted(buffer)) {
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

/** Password-protected PDFs usually declare an Encrypt dictionary (D-017). */
function pdfLooksEncrypted(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.byteLength, 512 * 1024));
  return sample.includes(Buffer.from("/Encrypt"));
}

/**
 * Walk ZIP local file headers (not full inflate). Requires OpenXML markers and
 * rejects encrypted entries / extreme entry counts (zip-bomb scaffold).
 */
function looksLikeDocx(buffer: Buffer): boolean {
  if (
    buffer.byteLength < 30 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return false;
  }

  let offset = 0;
  let entries = 0;
  let uncompressedTotal = 0;
  let sawContentTypes = false;
  let sawWord = false;

  while (offset + 30 <= buffer.byteLength) {
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x03 ||
      buffer[offset + 3] !== 0x04
    ) {
      break;
    }

    const flags = buffer.readUInt16LE(offset + 6);
    if (flags & 0x0001) {
      return false; // encrypted
    }

    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const headerEnd = offset + 30 + fileNameLength + extraLength;
    if (headerEnd > buffer.byteLength) {
      return false;
    }

    const name = buffer.subarray(offset + 30, offset + 30 + fileNameLength).toString("utf8");
    if (name === "[Content_Types].xml") {
      sawContentTypes = true;
    }
    if (name.startsWith("word/")) {
      sawWord = true;
    }

    entries += 1;
    if (entries > MAX_DOCX_ENTRIES) {
      return false;
    }

    if (uncompressedSize !== 0xffffffff) {
      uncompressedTotal += uncompressedSize;
      if (uncompressedTotal > MAX_DOCX_UNCOMPRESSED_BYTES) {
        return false;
      }
    }

    if (compressedSize === 0xffffffff) {
      // Data descriptor / zip64 — stop structural walk; fall back to name markers only if we already saw them.
      break;
    }

    offset = headerEnd + compressedSize;
  }

  return sawContentTypes && sawWord;
}
