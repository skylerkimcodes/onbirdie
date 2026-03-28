import * as vscode from "vscode";

const MAX_CHARS = 100_000;

type PdfParseFn = (data: Buffer) => Promise<{ text?: string }>;

/**
 * pdf-parse@1.x default export. v2+ pulls in pdf.js which expects DOMMatrix and
 * breaks in the VS Code extension host; v1 stays Node-safe.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as PdfParseFn;

function isPdfMagic(buf: Uint8Array): boolean {
  if (buf.length < 4) {
    return false;
  }
  return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

/**
 * Plain text for onboarding storage: UTF-8 for text files, extracted text for PDFs.
 */
export async function extractResumePlainText(
  uri: vscode.Uri,
  raw: Uint8Array
): Promise<string> {
  const pathLower = uri.fsPath.toLowerCase();
  const asPdf = pathLower.endsWith(".pdf") || isPdfMagic(raw);

  if (asPdf) {
    const data = await pdfParse(Buffer.from(raw));
    const text = (data.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) {
      throw new Error(
        "No text could be extracted from this PDF (scanned or image-only PDFs are not supported)."
      );
    }
    return text.slice(0, MAX_CHARS);
  }

  return Buffer.from(raw).toString("utf8").slice(0, MAX_CHARS);
}
