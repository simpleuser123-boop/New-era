#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";

import JSZip from "jszip";

import {
  assert,
  configureSmokeDatabaseEnv,
  ensureSmokeOwnerAndLogin,
  expectNumber,
  expectObject,
  expectOkEnvelope,
  expectString,
  installSmokeSignalHandlers,
  newEraDbPathEnvName,
  resolveBaseUrl,
  rootDir,
  smokeUseRealDbEnvName,
  stopSpawnedServer,
} from "./smoke-support.mjs";

const smokeDbPath = path.join(
  rootDir,
  "data",
  "smoke-resume-upload",
  "new-era-smoke.db",
);
const uploadTimeoutMs = 120_000;
const baseResumeText = [
  "姓名：李雷",
  "目标岗位：AI 应用工程师",
  "核心技能：LangChain、RAG、Python、TypeScript、向量数据库、Prompt Engineering",
  "项目经历：负责企业知识库 RAG 系统，完成检索链路、评测集和上线监控。",
  "工作经历：在 AI 产品团队交付 Agent 工作流，降低人工整理简历时间 40%。",
].join("\n");
const pdfResumeText = [
  "Name: Li Lei",
  "Target Role: AI Application Engineer",
  "Core Skills: LangChain, RAG, Python, TypeScript, vector database, Prompt Engineering",
  "Project: Delivered an enterprise RAG knowledge base with retrieval evaluation and monitoring.",
  "Experience: Built Agent workflows and reduced manual resume review work by 40 percent.",
].join("\n");

installSmokeSignalHandlers();

try {
  if (process.env.SMOKE_BASE_URL) {
    throw new Error(
      "smoke:resume-upload must spawn its own server so NEW_ERA_DB_PATH can point to an isolated DB. Unset SMOKE_BASE_URL.",
    );
  }

  if (process.env[smokeUseRealDbEnvName] === "1") {
    throw new Error("smoke:resume-upload refuses SMOKE_USE_REAL_DB=1.");
  }

  if (!existsSync(path.join(rootDir, ".next"))) {
    throw new Error("No .next build found. Run npm run build before smoke:resume-upload.");
  }

  process.env[newEraDbPathEnvName] = smokeDbPath;
  const smokeDatabase = configureSmokeDatabaseEnv();
  const { baseUrl, mode } = await resolveBaseUrl();

  console.log(`New Era resume upload smoke against ${baseUrl} (${mode})`);
  console.log(
    `Smoke database: ${smokeDatabase.description}${
      smokeDatabase.path ? ` (${smokeDatabase.path})` : ""
    }`,
  );

  const { jar, ownerWasCreated } = await ensureSmokeOwnerAndLogin(baseUrl);

  console.log(
    `[ok] smoke authenticated as local owner (${ownerWasCreated ? "created" : "existing"})`,
  );

  const fixtures = [
    {
      buffer: Buffer.from(baseResumeText, "utf8"),
      expectedParser: "text",
      name: "resume-upload-smoke.txt",
      type: "text/plain",
    },
    {
      buffer: await createDocxBuffer(baseResumeText),
      expectedParser: "docx",
      name: "resume-upload-smoke.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    {
      buffer: createPdfBuffer(pdfResumeText),
      expectedParser: "pdf",
      name: "resume-upload-smoke.pdf",
      type: "application/pdf",
    },
  ];

  for (const fixture of fixtures) {
    await assertUploadParse(baseUrl, jar, fixture);
  }

  console.log("[ok] resume upload smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopSpawnedServer();
}

async function assertUploadParse(baseUrl, jar, fixture) {
  const formData = new FormData();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), uploadTimeoutMs);

  formData.set("direction", "llm_application");
  formData.set(
    "file",
    new File([fixture.buffer], fixture.name, { type: fixture.type }),
  );

  let response;

  try {
    response = await fetch(`${baseUrl}/api/resume/parse`, {
      body: formData,
      headers: {
        Accept: "application/json",
        Cookie: jar.header(),
      },
      method: "POST",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  let body;

  try {
    body = await response.json();
  } catch (error) {
    throw new Error(
      `${fixture.name} expected JSON, got HTTP ${response.status}: ${error.message}`,
    );
  }

  assert(
    response.status === 200,
    `${fixture.name} expected HTTP 200, got ${response.status}: ${JSON.stringify(body)}`,
  );
  expectOkEnvelope(body, `${fixture.name} upload`);
  expectNumber(body.resumeId, `${fixture.name}.resumeId`);
  expectObject(body.resume, `${fixture.name}.resume`);
  expectObject(body.uploadedFile, `${fixture.name}.uploadedFile`);
  expectString(body.structuredResume.rawText, `${fixture.name}.structuredResume.rawText`);
  assert(
    body.uploadedFile.name === fixture.name,
    `${fixture.name} should preserve uploaded file name.`,
  );
  assert(
    body.uploadedFile.parser === fixture.expectedParser,
    `${fixture.name} expected parser ${fixture.expectedParser}, got ${body.uploadedFile.parser}.`,
  );
  assert(
    body.structuredResume.rawText.includes("LangChain") ||
      body.structuredResume.rawText.includes("RAG"),
    `${fixture.name} should preserve resume text keywords.`,
  );

  console.log(`[ok] uploaded and parsed ${fixture.name}`);
}

async function createDocxBuffer(text) {
  const zip = new JSZip();
  const paragraphs = text
    .split("\n")
    .map(
      (line) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
    )
    .join("");

  zip.file(
    "[Content_Types].xml",
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      "</Types>",
    ].join(""),
  );
  zip.file(
    "_rels/.rels",
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
      "</Relationships>",
    ].join(""),
  );
  zip.file(
    "word/document.xml",
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      `<w:body>${paragraphs}<w:sectPr/></w:body>`,
      "</w:document>",
    ].join(""),
  );

  return zip.generateAsync({ compression: "DEFLATE", type: "nodebuffer" });
}

function createPdfBuffer(text) {
  const lines = text
    .replace(/[^\x20-\x7e\n]/g, " ")
    .split("\n")
    .filter(Boolean);
  const stream = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    ...lines.flatMap((line, index) =>
      index === 0
        ? [`(${escapePdfString(line)}) Tj`]
        : ["0 -18 Td", `(${escapePdfString(line)}) Tj`],
    ),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += [
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ].join("\n");

  return Buffer.from(pdf, "latin1");
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapePdfString(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
