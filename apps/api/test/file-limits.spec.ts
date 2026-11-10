import { describe, expect, it } from "vitest";
import {
  MAX_DOCUMENT_BYTES,
  validateDocumentBytes,
} from "../src/documents/file-limits.js";

describe("validateDocumentBytes", () => {
  it("accepts PDF magic + .pdf", () => {
    const buf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("synthetic")]);
    expect(validateDocumentBytes(buf, "brief.pdf")).toEqual({
      kind: "pdf",
      mimeType: "application/pdf",
    });
  });

  it("accepts plain text .txt", () => {
    const buf = Buffer.from("hello counsel\n", "utf8");
    expect(validateDocumentBytes(buf, "notes.txt")?.kind).toBe("txt");
  });

  it("rejects .txt with null bytes", () => {
    const buf = Buffer.from([0x68, 0x00, 0x69]);
    expect(validateDocumentBytes(buf, "bad.txt")).toBeNull();
  });

  it("rejects bare zip posing as docx", () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(validateDocumentBytes(buf, "archive.docx")).toBeNull();
  });

  it("accepts minimal openxml-like docx bytes", () => {
    const payload = Buffer.from(
      "PK\u0003\u0004....[Content_Types].xml....word/document.xml",
      "latin1",
    );
    expect(validateDocumentBytes(payload, "memo.docx")?.kind).toBe("docx");
  });

  it("rejects oversize", () => {
    const buf = Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x61);
    expect(validateDocumentBytes(buf, "huge.txt")).toBeNull();
  });

  it("rejects extension spoof", () => {
    const buf = Buffer.from("%PDF-1.4\n");
    expect(validateDocumentBytes(buf, "brief.exe")).toBeNull();
  });
});
