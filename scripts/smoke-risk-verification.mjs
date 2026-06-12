#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

import { rootDir } from "./smoke-support.mjs";

const checks = [
  {
    label: "benchmark API readonly contract",
    script: "smoke-risk-benchmark-api.mjs",
  },
  {
    label: "risk comparison dual scan and fallback contract",
    script: "smoke-risk-comparison.mjs",
  },
  {
    label: "risk verification questions readonly contract",
    script: "smoke-risk-verification-questions.mjs",
  },
];

try {
  console.log("New Era v3.2 risk verification aggregate smoke");

  for (const check of checks) {
    await runCheck(check);
  }

  console.log("[ok] risk verification aggregate smoke passed");
} catch (error) {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

function runCheck({ label, script }) {
  const scriptPath = path.join(rootDir, "scripts", script);

  console.log(`\n[run] ${label}`);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${script} failed${signal ? ` with signal ${signal}` : ` with exit code ${code ?? "unknown"}`}.`,
        ),
      );
    });
  });
}
