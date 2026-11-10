import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Private local disk adapter (Phase 3 scaffold).
 * Not a production hoster choice (O-003). storageKey is never a public URL.
 */
export class LocalObjectStorage {
  constructor(private readonly rootDir: string) {}

  /** Absolute path under root; rejects path traversal via resolved prefix check. */
  resolvePath(storageKey: string): string {
    const normalized = storageKey.replace(/\\/g, "/").replace(/^\/+/, "");
    if (
      normalized.length === 0 ||
      normalized.includes("..") ||
      path.isAbsolute(normalized)
    ) {
      throw new Error("Invalid storage key");
    }
    const full = path.resolve(this.rootDir, ...normalized.split("/"));
    const root = path.resolve(this.rootDir);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error("Storage key escapes root");
    }
    return full;
  }

  async put(storageKey: string, bytes: Buffer): Promise<void> {
    const full = this.resolvePath(storageKey);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes, { flag: "wx" });
  }

  async get(storageKey: string): Promise<Buffer> {
    return readFile(this.resolvePath(storageKey));
  }
}

export function createLocalObjectStorageFromEnv(): LocalObjectStorage {
  const root =
    process.env.DOCUMENT_STORAGE_ROOT?.trim() ||
    path.resolve(process.cwd(), ".data", "documents");
  return new LocalObjectStorage(root);
}

export function buildDocumentStorageKey(input: {
  organizationId: string;
  workspaceId: string;
  documentId: string;
}): string {
  return [
    "organizations",
    input.organizationId,
    "workspaces",
    input.workspaceId,
    "documents",
    input.documentId,
    "original",
  ].join("/");
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function newDocumentId(): string {
  return randomUUID();
}
