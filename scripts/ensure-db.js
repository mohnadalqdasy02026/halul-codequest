#!/usr/bin/env node
/**
 * Build the SQLite database from the Excel source if it is missing.
 *
 * Needed on fresh platforms (Render, containers): the disk mount may not
 * exist at build time, and `data/*.db` is intentionally not committed.
 * Safe to run every start — it exits immediately when a database exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.CODEQUEST_DB
  ? path.resolve(ROOT, process.env.CODEQUEST_DB)
  : path.join(ROOT, 'data', 'codequest.db');

if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
  console.log(`[ensure-db] قاعدة البيانات موجودة: ${dbPath}`);
  process.exit(0);
}

const source = process.env.CODEQUEST_SOURCE || path.join(ROOT, 'data', 'source', 'Programming_Glossary_En_Ar.xlsx');
if (!fs.existsSync(source)) {
  console.error(`[ensure-db] ملف Excel المصدر غير موجود: ${source}`);
  process.exit(1);
}

// Ensure the target directory exists (e.g. a Render disk mount).
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (process.env.CODEQUEST_DB === undefined) {
  console.log(`[ensure-db] CODEQUEST_DB غير مضبوط — سيُبنى ${dbPath}`);
}

// Seed without --force: src/seed.js refuses to wipe a populated DB.
const res = spawnSync(process.execPath, [path.join(ROOT, 'src', 'seed.js')], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
  timeout: 300000,
});
process.exit(res.status ?? 1);
