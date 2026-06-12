import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";

import * as cheerio from "cheerio";
import JSZip from "jszip";

const MAX_RESUME_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_LENGTH = 100_000;
const MIN_EXTRACTED_TEXT_LENGTH = 20;

const TEXT_EXTENSIONS = new Set([
  "csv",
  "json",
  "log",
  "markdown",
  "md",
  "text",
  "tsv",
  "txt",
  "yaml",
  "yml",
]);
const HTML_EXTENSIONS = new Set(["htm", "html", "xhtml"]);
const RTF_EXTENSIONS = new Set(["rtf"]);
const DOCX_EXTENSIONS = new Set(["docx"]);
const DOC_EXTENSIONS = new Set(["doc"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const ZIP_XML_EXTENSIONS = new Set([
  "fodt",
  "odp",
  "ods",
  "odt",
  "pptx",
  "xlsx",
  "zip",
]);

type ResumeFileErrorDetails = Record<string, number | string | null>;

export type ResumeUploadFileMeta = {
  extension: string | null;
  name: string;
  parser: string;
  size: number;
  type: string;
};

export type ExtractedResumeUpload = {
  file: ResumeUploadFileMeta;
  resumeText: string;
};

export class ResumeFileExtractError extends Error {
  readonly code: string;
  readonly details?: ResumeFileErrorDetails;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: ResumeFileErrorDetails,
  ) {
    super(message);
    this.name = "ResumeFileExtractError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export async function extractResumeTextFromUpload(
  file: File,
): Promise<ExtractedResumeUpload> {
  const name = normalizeFileName(file.name);
  const type = normalizeMimeType(file.type);
  const extension = getFileExtension(name);
  const size = file.size;

  if (size <= 0) {
    throw new ResumeFileExtractError(
      "RESUME_FILE_EMPTY",
      "上传文件为空，请选择包含简历内容的文件。",
      400,
      { fileName: name, fileSize: size },
    );
  }

  if (size > MAX_RESUME_FILE_BYTES) {
    throw new ResumeFileExtractError(
      "RESUME_FILE_TOO_LARGE",
      "上传文件不能超过 20MB。请压缩文件或导出为文本版简历后重试。",
      413,
      { fileName: name, fileSize: size, maxBytes: MAX_RESUME_FILE_BYTES },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extraction = await extractTextFromBuffer(buffer, {
    extension,
    fileName: name,
    mimeType: type,
  });
  const resumeText = normalizeExtractedText(extraction.text);

  if (!isReadableResumeText(resumeText)) {
    throw new ResumeFileExtractError(
      "RESUME_FILE_TEXT_UNAVAILABLE",
      "文件已上传，但没有提取到可解析的简历正文。PDF、DOC、DOCX、RTF、HTML、Markdown、TXT 会自动解析；扫描图或纯图片请先 OCR 后再上传或粘贴文本。",
      422,
      {
        extension,
        fileName: name,
        fileSize: size,
        parser: extraction.parser,
        textLength: resumeText.length,
      },
    );
  }

  return {
    file: {
      extension,
      name,
      parser: extraction.parser,
      size,
      type,
    },
    resumeText,
  };
}

async function extractTextFromBuffer(
  buffer: Buffer,
  file: {
    extension: string | null;
    fileName: string;
    mimeType: string;
  },
): Promise<{ parser: string; text: string }> {
  if (isPdfFile(file, buffer)) {
    return { parser: "pdf", text: await extractPdfText(buffer) };
  }

  if (isDocxFile(file, buffer)) {
    return { parser: "docx", text: await extractDocxText(buffer) };
  }

  if (isDocFile(file)) {
    return { parser: "doc", text: await extractDocText(buffer) };
  }

  if (isRtfFile(file)) {
    return { parser: "rtf", text: extractRtfText(buffer) };
  }

  if (isHtmlFile(file)) {
    return { parser: "html", text: extractHtmlText(decodeTextBuffer(buffer)) };
  }

  if (isZipXmlFile(file, buffer)) {
    return { parser: "zip-xml", text: await extractZipXmlText(buffer) };
  }

  const decodedText = decodeTextBuffer(buffer);

  if (isPlainTextFile(file) || isLikelyPlainText(decodedText)) {
    return { parser: "text", text: decodedText };
  }

  return { parser: "unknown", text: decodedText };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText();

    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer });

  return result.value;
}

async function extractDocText(buffer: Buffer): Promise<string> {
  const WordExtractor = (await import("word-extractor")).default;
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);

  return [
    document.getBody(),
    document.getHeaders(),
    document.getFooters(),
    document.getFootnotes(),
    document.getEndnotes(),
    document.getTextboxes(),
    document.getAnnotations(),
  ]
    .filter(Boolean)
    .join("\n");
}

async function extractZipXmlText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xmlFileNames = Object.keys(zip.files)
    .filter((name) => shouldReadZipXmlEntry(name))
    .sort()
    .slice(0, 80);
  const chunks: string[] = [];

  for (const name of xmlFileNames) {
    const entry = zip.files[name];

    if (!entry || entry.dir) {
      continue;
    }

    const xml = await entry.async("text");
    chunks.push(extractXmlText(xml));
  }

  return chunks.join("\n");
}

function shouldReadZipXmlEntry(name: string): boolean {
  const normalized = name.replace(/\\/g, "/").toLowerCase();

  return (
    normalized === "content.xml" ||
    normalized === "word/document.xml" ||
    /^word\/(header|footer)\d*\.xml$/.test(normalized) ||
    /^ppt\/slides\/slide\d+\.xml$/.test(normalized) ||
    normalized === "xl/sharedstrings.xml" ||
    /^xl\/worksheets\/sheet\d+\.xml$/.test(normalized)
  );
}

function extractHtmlText(html: string): string {
  const $ = cheerio.load(html);

  $("script, style, noscript").remove();

  return $("body").text() || $.root().text();
}

function extractXmlText(xml: string): string {
  const $ = cheerio.load(xml, { xmlMode: true });

  return $.root().text();
}

function extractRtfText(buffer: Buffer): string {
  const rtf = decodeTextBuffer(buffer);

  return rtf
    .replace(/\\u(-?\d+)\??/g, (_match, value: string) => {
      const codePoint = Number.parseInt(value, 10);
      const normalized = codePoint < 0 ? codePoint + 65536 : codePoint;

      return Number.isFinite(normalized) ? String.fromCharCode(normalized) : "";
    })
    .replace(/\\'([0-9a-f]{2})/gi, (_match, value: string) =>
      Buffer.from([Number.parseInt(value, 16)]).toString("latin1"),
    )
    .replace(/\\par[d]?/gi, "\n")
    .replace(/\\line/gi, "\n")
    .replace(/\\tab/gi, "\t")
    .replace(/[{}]/g, "")
    .replace(/\\[a-z]+\d* ?/gi, "")
    .replace(/\\[^a-z0-9]/gi, "");
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT_LENGTH);
}

function decodeTextBuffer(buffer: Buffer): string {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return decodeWith("utf-16le", buffer.subarray(2));
    }

    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return decodeWith("utf-16be", buffer.subarray(2));
    }
  }

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return decodeWith("utf-8", buffer.subarray(3));
  }

  const utf16Encoding = detectUtf16Encoding(buffer);

  if (utf16Encoding) {
    return decodeWith(utf16Encoding, buffer);
  }

  return decodeWith("utf-8", buffer);
}

function decodeWith(encoding: string, buffer: Buffer): string {
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return buffer.toString("utf8");
  }
}

function detectUtf16Encoding(buffer: Buffer): "utf-16be" | "utf-16le" | null {
  const sampleLength = Math.min(buffer.length, 2048);
  let evenNulls = 0;
  let oddNulls = 0;

  for (let index = 0; index + 1 < sampleLength; index += 2) {
    if (buffer[index] === 0) {
      evenNulls += 1;
    }

    if (buffer[index + 1] === 0) {
      oddNulls += 1;
    }
  }

  const pairs = Math.max(1, Math.floor(sampleLength / 2));

  if (oddNulls / pairs > 0.35) {
    return "utf-16le";
  }

  if (evenNulls / pairs > 0.35) {
    return "utf-16be";
  }

  return null;
}

function isReadableResumeText(text: string): boolean {
  const compact = text.replace(/\s/g, "");

  if (compact.length < MIN_EXTRACTED_TEXT_LENGTH) {
    return false;
  }

  const replacementCount = countMatches(compact, /\uFFFD/g);
  const readableCount = countMatches(
    compact,
    /[0-9A-Za-z\u3400-\u9fff]/g,
  );

  return (
    replacementCount / compact.length < 0.08 &&
    readableCount >= Math.min(12, Math.ceil(compact.length * 0.2))
  );
}

function isLikelyPlainText(text: string): boolean {
  const compact = text.replace(/\s/g, "");

  if (compact.length < MIN_EXTRACTED_TEXT_LENGTH) {
    return false;
  }

  const controlCount = countMatches(
    text,
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
  );
  const replacementCount = countMatches(text, /\uFFFD/g);

  return (
    controlCount / text.length < 0.02 &&
    replacementCount / text.length < 0.05
  );
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function normalizeFileName(value: string): string {
  const trimmed = value.trim().replace(/[\\/]+/g, "-");

  return trimmed.length > 0 ? trimmed.slice(0, 240) : "uploaded-resume";
}

function normalizeMimeType(value: string): string {
  return value.trim().toLowerCase() || "application/octet-stream";
}

function getFileExtension(fileName: string): string | null {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);

  return match ? match[1] : null;
}

function isPdfFile(
  file: { extension: string | null; mimeType: string },
  buffer: Buffer,
): boolean {
  return (
    PDF_EXTENSIONS.has(file.extension ?? "") ||
    file.mimeType === "application/pdf" ||
    buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  );
}

function isDocxFile(
  file: { extension: string | null; mimeType: string },
  buffer: Buffer,
): boolean {
  return (
    DOCX_EXTENSIONS.has(file.extension ?? "") ||
    file.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    (startsWithZipMagic(buffer) && file.extension === "docx")
  );
}

function isDocFile(file: { extension: string | null; mimeType: string }): boolean {
  return (
    DOC_EXTENSIONS.has(file.extension ?? "") ||
    file.mimeType === "application/msword"
  );
}

function isRtfFile(file: { extension: string | null; mimeType: string }): boolean {
  return (
    RTF_EXTENSIONS.has(file.extension ?? "") ||
    file.mimeType === "application/rtf" ||
    file.mimeType === "text/rtf"
  );
}

function isHtmlFile(file: { extension: string | null; mimeType: string }): boolean {
  return (
    HTML_EXTENSIONS.has(file.extension ?? "") ||
    file.mimeType === "text/html" ||
    file.mimeType === "application/xhtml+xml"
  );
}

function isZipXmlFile(
  file: { extension: string | null; mimeType: string },
  buffer: Buffer,
): boolean {
  return (
    startsWithZipMagic(buffer) &&
    (ZIP_XML_EXTENSIONS.has(file.extension ?? "") ||
      file.mimeType.includes("officedocument") ||
      file.mimeType.includes("opendocument") ||
      file.mimeType === "application/zip")
  );
}

function isPlainTextFile(file: { extension: string | null; mimeType: string }): boolean {
  return (
    TEXT_EXTENSIONS.has(file.extension ?? "") ||
    file.mimeType.startsWith("text/") ||
    file.mimeType === "application/json" ||
    file.mimeType === "application/x-yaml"
  );
}

function startsWithZipMagic(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}
