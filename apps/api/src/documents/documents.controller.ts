import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
  UnprocessableEntityException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { mkdir, readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { diskStorage } from "multer";
import { randomUUID } from "node:crypto";
import { ACTOR_CONTEXT, type ActorContext } from "../auth/actor-context.js";
import { ActorGuard } from "../auth/actor.guard.js";
import { decodeCursor, encodeCursor, parseLimit } from "../http/cursor.js";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_PER_UPLOAD } from "./file-limits.js";
import { DocumentsService } from "./documents.service.js";

function toDocumentBody(document: {
  id: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  status: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  uploadedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document.id,
    organizationId: document.organizationId,
    workspaceId: document.workspaceId,
    title: document.title,
    status: document.status,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    byteSize: document.byteSize,
    checksumSha256: document.checksumSha256,
    uploadedByUserId: document.uploadedByUserId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

async function ensureUploadTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), "spectre-uploads");
  await mkdir(dir, { recursive: true });
  return dir;
}

@Controller()
@UseGuards(ActorGuard)
export class DocumentsController {
  constructor(
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  private requireActor(): ActorContext {
    if (!this.actor) {
      throw new UnauthorizedException();
    }
    return this.actor;
  }

  @Get("workspaces/:workspaceId/documents")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursorRaw?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const page = await this.documents.list(this.requireActor(), workspaceId, {
      limit: parseLimit(limitRaw),
      cursor: decodeCursor(cursorRaw),
    });
    return {
      items: page.items.map(toDocumentBody),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    };
  }

  @Post("workspaces/:workspaceId/documents")
  @UseInterceptors(
    FilesInterceptor("files", MAX_DOCUMENTS_PER_UPLOAD, {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          void ensureUploadTempDir()
            .then((dir) => cb(null, dir))
            .catch((err) => cb(err as Error, ""));
        },
        filename: (_req, _file, cb) => {
          cb(null, `${randomUUID()}.upload`);
        },
      }),
      limits: {
        files: MAX_DOCUMENTS_PER_UPLOAD,
        fileSize: MAX_DOCUMENT_BYTES,
      },
    }),
  )
  async upload(
    @Param("workspaceId") workspaceId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    if (!files || files.length === 0) {
      throw new UnprocessableEntityException();
    }

    try {
      const payloads = [];
      for (const file of files) {
        const buffer = await readFile(file.path);
        payloads.push({
          originalname: file.originalname,
          buffer,
          size: file.size,
        });
      }
      const rows = await this.documents.uploadMany(
        this.requireActor(),
        workspaceId,
        payloads,
      );
      return { items: rows.map(toDocumentBody) };
    } finally {
      await Promise.all(
        files.map((file) => unlink(file.path).catch(() => undefined)),
      );
    }
  }

  @Get("documents/:documentId")
  async get(@Param("documentId") documentId: string) {
    const document = await this.documents.read(this.requireActor(), documentId);
    return toDocumentBody(document);
  }

  @Get("documents/:documentId/download")
  async download(
    @Param("documentId") documentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { document, bytes } = await this.documents.download(
      this.requireActor(),
      documentId,
    );
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(document.originalFileName)}`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(bytes);
  }
}
