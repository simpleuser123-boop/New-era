#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function compileLibModules() {
  const tempDir = await fs.mkdtemp(
    path.join(projectRoot, "tmp", "new-era-agent-routing-"),
  );
  const sourceRoot = path.join(projectRoot, "src", "lib");
  const files = await listTypeScriptFiles(sourceRoot);

  for (const sourcePath of files) {
    const source = await fs.readFile(sourcePath, "utf8");
    const output = ts.transpileModule(source, {
      fileName: sourcePath,
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    });
    const relativePath = path.relative(projectRoot, sourcePath);
    const outputPath = path.join(tempDir, relativePath).replace(/\.ts$/, ".js");

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output.outputText, "utf8");
  }

  const requireFromTemp = createRequire(path.join(tempDir, "package.json"));

  return {
    requireModule: (relativePath) =>
      requireFromTemp(path.join(tempDir, relativePath)),
    tempDir,
  };
}

async function listTypeScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

function runAgentDefinitionSmoke(registryModule) {
  const {
    AGENT_IDS,
    agentToolNames,
    agentDefinitions,
    buildSystemPromptForAgent,
  } = registryModule;
  const validToolNames = new Set(agentToolNames);

  assert.deepEqual(
    agentDefinitions.map((agent) => agent.id).sort(),
    [...AGENT_IDS].sort(),
    "six agent definitions should be registered",
  );

  for (const agent of agentDefinitions) {
    assert.ok(agent.responsibility.length > 0, `${agent.id} has responsibility`);
    assert.ok(
      agent.triggerConditions.length > 0,
      `${agent.id} has trigger conditions`,
    );
    assert.ok(agent.toolNames.length > 0, `${agent.id} has toolNames`);
    assert.ok(
      agent.systemPromptFragment.includes("不") ||
        agent.systemPromptFragment.includes("只能"),
      `${agent.id} has boundary-aware prompt fragment`,
    );

    for (const toolName of agent.toolNames) {
      assert.ok(
        validToolNames.has(toolName),
        `${agent.id} tool ${toolName} must be registered`,
      );
    }

    const systemPrompt = buildSystemPromptForAgent(agent);

    assert.ok(systemPrompt.includes(agent.id), `${agent.id} prompt includes id`);
    assert.ok(
      systemPrompt.includes("工具白名单"),
      `${agent.id} prompt includes whitelist`,
    );
    assert.ok(
      systemPrompt.includes("Query 只能只读") &&
        systemPrompt.includes("允许的外部搜索结果"),
      `${agent.id} prompt includes Query boundary`,
    );
    assert.ok(
      systemPrompt.includes("requiresConfirmation=true"),
      `${agent.id} prompt includes Action confirmation boundary`,
    );
    assert.ok(
      systemPrompt.includes("不得自动投递"),
      `${agent.id} prompt includes no auto apply boundary`,
    );
  }

  console.log(`[ok] agent definition smoke passed (${agentDefinitions.length} agents)`);
}

function runRoutingSmoke(registryModule) {
  const { classifyAgentIntent, getAgentForRequest } = registryModule;
  const checks = [
    {
      expectedAgentId: "tracker-agent",
      name: "follow-up",
      request: {
        message: "哪些岗位今天最该跟进？有没有逾期投递记录？",
      },
    },
    {
      expectedAgentId: "evaluate-agent",
      name: "report-risk",
      request: {
        context: { reportId: 12 },
        message: "这份报告为什么判断为高风险？主要风险信号是什么？",
      },
    },
    {
      expectedAgentId: "resume-agent",
      name: "resume-gap",
      request: {
        context: { resumeId: 3 },
        message: "我的默认简历对这个岗位有哪些技能缺口？",
      },
    },
    {
      expectedAgentId: "interview-agent",
      name: "interview-prep",
      request: {
        context: { reportId: 12, resumeId: 3 },
        message: "请基于这份报告和简历帮我做面试准备，生成 STAR 追问。",
      },
    },
    {
      expectedAgentId: "career-agent",
      name: "career-dna",
      request: {
        message: "这个机会是否符合我的 Career DNA 和目标方向？",
      },
    },
    {
      expectedAgentId: "general-agent",
      name: "fallback",
      request: {
        message: "今天我应该先做什么？",
      },
    },
  ];

  for (const check of checks) {
    const classification = classifyAgentIntent(check.request);
    const agent = getAgentForRequest(check.request, classification);

    assert.equal(
      classification.agentId,
      check.expectedAgentId,
      `${check.name} should route to ${check.expectedAgentId}`,
    );
    assert.equal(agent.id, check.expectedAgentId);
    assert.equal(typeof classification.reason, "string");
    assert.ok(classification.confidence > 0);
  }

  console.log(`[ok] agent routing smoke passed (${checks.length} routes)`);
}

async function main() {
  const { requireModule, tempDir } = await compileLibModules();

  try {
    const registryModule = requireModule("src/lib/agent/index.js");

    runAgentDefinitionSmoke(registryModule);
    runRoutingSmoke(registryModule);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
