import { describe, expect, it } from "vitest";
import { uploadDocumentSchema } from "./upload-document-schema";

const WS = "00000000-0000-4000-8000-0000000000d1";

function fakeFile(name: string, size: number): File {
  const blob = new Blob([new Uint8Array(Math.min(size, 16))]);
  const file = new File([blob], name, { type: "application/octet-stream" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("uploadDocumentSchema", () => {
  it("accepts txt under limits", () => {
    const parsed = uploadDocumentSchema.safeParse({
      workspaceId: WS,
      files: [fakeFile("a.txt", 10)],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects exe", () => {
    const parsed = uploadDocumentSchema.safeParse({
      workspaceId: WS,
      files: [fakeFile("a.exe", 10)],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects oversize", () => {
    const parsed = uploadDocumentSchema.safeParse({
      workspaceId: WS,
      files: [fakeFile("a.txt", 26 * 1024 * 1024)],
    });
    expect(parsed.success).toBe(false);
  });
});
