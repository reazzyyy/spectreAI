declare module "pdf-parse" {
  interface PdfParseResult {
    numpages: number;
    text: string;
  }

  interface PdfParseOptions {
    max?: number;
  }

  export default function pdfParse(
    data: Buffer,
    options?: PdfParseOptions,
  ): Promise<PdfParseResult>;
}
