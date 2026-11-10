import { z } from "zod";

const ALLOWED = new Set([".pdf", ".docx", ".txt"]);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;

function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

/** Client-side preflight for DOC-02/04/05 thin (server re-validates magic bytes). */
export const uploadDocumentSchema = z.object({
  workspaceId: z.string().uuid("Выберите проект"),
  files: z
    .custom<FileList | File[]>((value) => {
      if (!value) return false;
      const list = Array.from(value as FileList | File[]);
      return list.length > 0;
    }, "Выберите хотя бы один файл")
    .refine((value) => Array.from(value as FileList | File[]).length <= MAX_FILES, {
      message: `Не больше ${MAX_FILES} файлов за раз`,
    })
    .refine(
      (value) =>
        Array.from(value as FileList | File[]).every((file) =>
          ALLOWED.has(extensionOf(file.name)),
        ),
      { message: "Допустимы только PDF, DOCX и TXT" },
    )
    .refine(
      (value) =>
        Array.from(value as FileList | File[]).every((file) => file.size <= MAX_BYTES),
      { message: "Каждый файл не больше 25 МБ" },
    ),
});

export type UploadDocumentFormValues = z.infer<typeof uploadDocumentSchema>;
