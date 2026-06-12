#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const datasetPath = path.join(projectRoot, "demo-data", "risk-benchmark-jds.jsonl");
const reportPath = path.join(projectRoot, "tmp", "risk-benchmark-result.json");

function parseCliOptions() {
  return {
    semantic: process.argv.includes("--semantic"),
    strict: process.argv.includes("--strict"),
  };
}

async function compileLibModules() {
  const tmpRoot = path.join(projectRoot, "tmp");
  await fs.mkdir(tmpRoot, { recursive: true });

  const tempDir = await fs.mkdtemp(path.join(tmpRoot, "new-era-risk-benchmark-"));
  const sourceRoot = path.join(projectRoot, "src", "lib");
  const files = await listTypeScriptFiles(sourceRoot);

  for (const sourcePath of files) {
    const source = await fs.readFile(sourcePath, "utf8");
    const output = ts.transpileModule(source, {
      fileName: sourcePath,
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2020,
      },
    });
    const relativePath = path.relative(projectRoot, sourcePath);
    const outputPath = path.join(tempDir, relativePath).replace(/\.ts$/, ".mjs");
    const outputText = rewriteRelativeImports(output.outputText);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, outputText, "utf8");
  }

  const riskBenchmarkUrl = pathToFileURL(
    path.join(tempDir, "src", "lib", "risk-benchmark.mjs"),
  ).href;

  return {
    riskBenchmark: await import(riskBenchmarkUrl),
    tempDir,
  };
}

async function removeTempDir(tempDir) {
  if (!tempDir) {
    return;
  }

  try {
    await fs.rm(tempDir, { force: true, recursive: true });
  } catch (error) {
    console.warn(`[warn] 临时编译目录清理失败：${error.message}`);
  }
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

function rewriteRelativeImports(source) {
  return source
    .replace(
      /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
      (_match, prefix, specifier, suffix) =>
        `${prefix}${withMjsExtension(specifier)}${suffix}`,
    )
    .replace(
      /(import\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g,
      (_match, prefix, specifier, suffix) =>
        `${prefix}${withMjsExtension(specifier)}${suffix}`,
    );
}

function withMjsExtension(specifier) {
  if (/\.(mjs|js|json|node|css)$/.test(specifier)) {
    return specifier;
  }

  return `${specifier}.mjs`;
}

async function writeReport(report) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(`${reportPath}.tmp`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.rename(`${reportPath}.tmp`, reportPath);
}

function printReport(report, riskBenchmark) {
  console.log("New Era risk-engine 真假 AI 岗位识别率 benchmark");
  console.log(`模式：${report.mode}`);
  console.log(`样本文件：${report.datasetPath}`);
  console.log(`总样本数：${report.totalSamples}`);
  console.log(`label 分布：${JSON.stringify(report.distributions.labels)}`);
  console.log(
    `expectedRiskLevel 分布：${JSON.stringify(report.distributions.expectedRiskLevels)}`,
  );
  console.log(`actualRiskLevel 分布：${JSON.stringify(report.distributions.actualRiskLevels)}`);
  console.log(`decision confusion：${JSON.stringify(report.decisionConfusionMatrix)}`);
  console.log(`risk level accuracy：${report.metrics.riskLevelAccuracy.percent}`);
  console.log(`decision accuracy：${report.metrics.decisionAccuracy.percent}`);
  console.log(`fake_ai recall：${report.metrics.fakeAiRecall.percent}`);
  console.log(`fake_ai precision：${report.metrics.fakeAiPrecision.percent}`);
  console.log(
    `real_ai false positive rate：${report.metrics.realAiFalsePositiveRate.percent}`,
  );
  console.log(`borderline precision：${report.metrics.borderlinePrecision.percent}`);
  console.log(
    `borderline reasonable-hit rate：${report.metrics.borderlineReasonableHitRate.percent}`,
  );
  console.log(
    `expectedRiskSignals 平均命中率：${report.metrics.expectedRiskSignalsAverageHitRate.percent}`,
  );
  console.log(`rule versions：${JSON.stringify(report.ruleVersions)}`);
  console.log(`quality issue counts：${JSON.stringify(report.qualityIssueCounts)}`);
  console.log(`issue breakdown：${JSON.stringify(report.issues)}`);
  console.log("");

  printTopSamples(
    "最容易漏掉的 fake_ai 样本 Top 10",
    report.topMissedFakeAi,
    riskBenchmark,
  );
  printTopSamples(
    "最容易误报的 real_ai 样本 Top 10",
    report.topFalsePositiveRealAi,
    riskBenchmark,
  );
  printTopSamples(
    "边界样本异常 Top 10",
    report.topBorderlineAnomalies,
    riskBenchmark,
  );

  console.log("每类风险信号命中数量：");
  for (const [category, count] of Object.entries(report.signalCategoryCounts)) {
    console.log(`- ${category}: ${count}`);
  }

  if (Object.keys(report.signalCategoryCounts).length === 0) {
    console.log("- 无");
  }

  if (report.warnings.length > 0) {
    console.log("");
    console.log("Warnings：");

    for (const warning of report.warnings) {
      console.log(`[warn] ${warning}`);
    }
  }

  console.log("");
  console.log(`机器可读报告：${path.relative(projectRoot, reportPath)}`);
}

function printTopSamples(title, samples, riskBenchmark) {
  console.log(`${title}：`);

  if (samples.length === 0) {
    console.log("- 无");
    console.log("");
    return;
  }

  samples.forEach((sample, index) => {
    const hitRate = riskBenchmark.formatRiskBenchmarkPercent(
      sample.expectedRiskSignalHitRate,
    );
    const signalSummary =
      sample.signals.length === 0
        ? "无信号"
        : sample.signals
            .slice(0, 3)
            .map((signal) => `${signal.category}/${signal.signal}`)
            .join("；");

    console.log(
      `${index + 1}. ${sample.id} | ${sample.company} | ${sample.role} | decision=${sample.actualDecision} expected=${sample.expectedRiskLevel} actual=${sample.actualRiskLevel} issue=${sample.qualityIssue} weight=${sample.totalWeight} signalHit=${hitRate}`,
    );
    console.log(`   signals: ${signalSummary}`);
  });

  console.log("");
}

async function main() {
  const options = parseCliOptions();
  let tempDir = null;

  if (options.semantic) {
    console.warn("[warn] --semantic 已跳过：Step 45 benchmark 只运行本地规则，不调用模型。");
  }

  try {
    const modules = await compileLibModules();
    const { riskBenchmark, tempDir: compiledTempDir } = modules;
    tempDir = compiledTempDir;

    if (typeof riskBenchmark.createRiskBenchmarkReport !== "function") {
      throw new Error("临时编译后的 risk-benchmark 未导出 createRiskBenchmarkReport()。");
    }

    const report = await riskBenchmark.createRiskBenchmarkReport({
      datasetPath,
      strict: options.strict,
    });

    await writeReport(report);
    printReport(report, riskBenchmark);

    if (riskBenchmark.shouldFailRiskBenchmarkStrict(report)) {
      process.exitCode = 1;
    }
  } finally {
    await removeTempDir(tempDir);
  }
}

main().catch((error) => {
  console.error("[error] risk benchmark smoke failed");
  console.error(error.message);
  process.exitCode = 1;
});
