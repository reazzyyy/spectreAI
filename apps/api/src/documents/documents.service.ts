import {
  Inject,
  Injectable,
  NotFoundException,
  Scope,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  DocumentAccess,
  WorkspaceAccess,
  type DocumentRecord,
  type WorkspaceActor,
} from "@spectre/access";
import type { ActorContext } from "../auth/actor-context.js";
import {
  MAX_DOCUMENTS_PER_UPLOAD,
  validateDocumentBytes,
} from "./file-limits.js";
import {
  buildDocumentStorageKey,
  LocalObjectStorage,
  newDocumentId,
  sha256Hex,
} from "./local-object-storage.js";

export interface UploadedDocumentFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

function toWorkspaceActor(actor: ActorContext): WorkspaceActor {
  return {
    userId: actor.userId,
    organizationId: actor.organizationId,
    orgRole: actor.orgRole,
  };
}

function titleFromFileName(fileName: string): string {
  const base = fileName.trim() || "document";
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).slice(0, 200) || "document";
}

@Injectable({ scope: Scope.REQUEST })
export class DocumentsService {
  constructor(
    @Inject(DocumentAccess) private readonly documents: DocumentAccess,
    @Inject(WorkspaceAccess) private readonly workspaces: WorkspaceAccess,
    @Inject(LocalObjectStorage) private readonly storage: LocalObjectStorage,
  ) {}

  async list(actor: ActorContext, workspaceId: string): Promise<DocumentRecord[]> {
    const wsActor = toWorkspaceActor(actor);
    if (!(await this.workspaces.canReadContent(wsActor, workspaceId))) {
      throw new NotFoundException();
    }
    return this.documents.listForWorkspace(actor.organizationId, workspaceId);
  }

  async read(actor: ActorContext, documentId: string): Promise<DocumentRecord> {
    const document = await this.documents.readForOrganization(
      actor.organizationId,
      documentId,
    );
    if (!document) {
      throw new NotFoundException();
    }
    const wsActor = toWorkspaceActor(actor);
    if (!(await this.workspaces.canReadContent(wsActor, document.workspaceId))) {
      throw new NotFoundException();
    }
    return document;
  }

  async download(
    actor: ActorContext,
    documentId: string,
  ): Promise<{ document: DocumentRecord; bytes: Buffer }> {
    const document = await this.read(actor, documentId);
    const bytes = await this.storage.get(document.storageKey);
    return { document, bytes };
  }

  async uploadMany(
    actor: ActorContext,
    workspaceId: string,
    files: UploadedDocumentFile[],
  ): Promise<DocumentRecord[]> {
    if (files.length === 0 || files.length > MAX_DOCUMENTS_PER_UPLOAD) {
      throw new UnprocessableEntityException();
    }

    const wsActor = toWorkspaceActor(actor);
    if (!(await this.workspaces.canMutateContent(wsActor, workspaceId))) {
      throw new NotFoundException();
    }

    const created: DocumentRecord[] = [];
    for (const file of files) {
      created.push(await this.uploadOne(actor, workspaceId, file));
    }
    return created;
  }

  private async uploadOne(
    actor: ActorContext,
    workspaceId: string,
    file: UploadedDocumentFile,
  ): Promise<DocumentRecord> {
    const originalFileName = (file.originalname || "").trim() || "upload.bin";
    const validated = validateDocumentBytes(file.buffer, originalFileName);
    if (!validated || file.size !== file.buffer.byteLength) {
      throw new UnprocessableEntityException();
    }

    const documentId = newDocumentId();
    const storageKey = buildDocumentStorageKey({
      organizationId: actor.organizationId,
      workspaceId,
      documentId,
    });
    const checksumSha256 = sha256Hex(file.buffer);

    await this.storage.put(storageKey, file.buffer);

    const record = await this.documents.createForWorkspace(
      actor.organizationId,
      workspaceId,
      {
        id: documentId,
        title: titleFromFileName(originalFileName),
        originalFileName,
        mimeType: validated.mimeType,
        byteSize: file.buffer.byteLength,
        checksumSha256,
        storageKey,
        uploadedByUserId: actor.userId,
        status: "uploaded",
      },
    );
    if (!record) {
      throw new NotFoundException();
    }
    return record;
  }
}
