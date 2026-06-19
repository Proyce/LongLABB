#!/usr/bin/env node
/**
 * Source Syntax Check
 *
 * Walks JavaScript and MJS files under src/ and runs `node --check` with a bounded
 * worker pool. JSX files are validated by the Vite production build.
 */

import { readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { cpus } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const SKIP_DIRS = new Set(["archive", "node_modules", "dist", ".git"]);
const CONCURRENCY = Math.max(2, Math.min(8, cpus().length || 2));

function walkJs(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkJs(full, results);
    else if ([".js", ".mjs"].includes(extname(entry))) results.push(full);
  }
  return results;
}

function checkFile(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--check", file], {
      cwd: ROOT,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ file, stderr: error.message, ok: false }));
    child.on("close", (code) => resolve({ file, stderr: stderr.trim(), ok: code === 0 }));
  });
}

async function runPool(files) {
  const errors = [];
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++];
      const result = await checkFile(file);
      if (!result.ok) errors.push(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  return errors;
}

const files = walkJs(SRC);
const errors = await runPool(files);

if (errors.length === 0) {
  console.log(`✓ Syntax OK — ${files.length} files checked (${CONCURRENCY} workers)`);
  process.exit(0);
}

console.error(`\n✗ ${errors.length} file(s) failed syntax check:\n`);
for (const { file, stderr } of errors) {
  console.error(`  ${relative(ROOT, file)}\n  ${stderr.replace(/\n/g, "\n  ")}\n`);
}
process.exit(1);
