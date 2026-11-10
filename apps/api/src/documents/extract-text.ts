import JSZip from "jszip";
import pdfParse from "pdf-parse";
import {
  MAX_EXTRACT_CHARS,
  MAX_PDF_PAGES,
} from "./extract-limits.js";

export type ExtractOk = {
  ok: true;
  text: string;
  pageCount: number | null;
  extractor: string;
};

export type ExtractFail = {
  ok: false;
  errorCode: string;
};

export type ExtractResult = ExtractOk | ExtractFail;

/**
 * Local text extract (Phase 4). No OCR (D-031). Caps D-030.
 */
export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractResult> {
  if (mimeType.startsWith("text/plain")) {
    const text = buffer.toString("utf8");
    if (text.trim().length === 0) {
      return { ok: false, errorCode: "EMPTY_TEXT" };
    }
    if (text.length > MAX_EXTRACT_CHARS) {
      return { ok: false, errorCode: "TEXT_TOO_LARGE" };
    }
    return { ok: true, text, pageCount: null, extractor: "txt-utf8" };
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocx(buffer);
  }

  if (mimeType === "application/pdf") {
    return extractPdf(buffer);
  }

  return { ok: false, errorCode: "UNSUPPORTED_MIME" };
}

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docXml = zip.file("word/document.xml");
    if (!docXml) {
      return { ok: false, errorCode: "DOCX_MISSING_DOCUMENT" };
    }
    const xml = await docXml.async("text");
    const text = xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (text.length === 0) {
      return { ok: false, errorCode: "EMPTY_TEXT" };
    }
    if (text.length > MAX_EXTRACT_CHARS) {
      return { ok: false, errorCode: "TEXT_TOO_LARGE" };
    }
    return { ok: true, text, pageCount: null, extractor: "docx-xml" };
  } catch {
    return { ok: false, errorCode: "DOCX_PARSE_FAILED" };
  }
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  try {
    const parsed = await pdfParse(buffer, { max: MAX_PDF_PAGES });
    const pageCount = parsed.numpages ?? null;
    if (pageCount !== null && pageCount > MAX_PDF_PAGES) {
      return { ok: false, errorCode: "TOO_MANY_PAGES" };
    }
    const text = (parsed.text ?? "").trim();
    if (text.length === 0) {
      // Scan / image-only PDF — D-031
      return { ok: false, errorCode: "NO_TEXT_LAYER" };
    }
    if (text.length > MAX_EXTRACT_CHARS) {
      return { ok: false, errorCode: "TEXT_TOO_LARGE" };
    }
    return { ok: true, text, pageCount, extractor: "pdf-parse" };
  } catch {
    return { ok: false, errorCode: "PDF_PARSE_FAILED" };
  }
}
