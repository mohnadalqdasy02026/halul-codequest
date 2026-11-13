// CODE QUEST — database access layer (node:sqlite, no external deps)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const DB_PATH = process.env.CODEQUEST_DB || path.join(DATA_DIR, 'codequest.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const isProd = process.env.NODE_ENV === 'production';
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
if (!isProd) db.exec('PRAGMA synchronous = NORMAL');

const schemaPath = path.join(__dirname, 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf8'));

export default db;

export function nowIso() {
  return new Date().toISOString();
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Prepare-and-run helper. */
export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

let txDepth = 0;
/** Execute a function inside a transaction. Nested calls join the outer one. */
export function tx(fn) {
  if (txDepth > 0) return fn();
  txDepth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  } finally {
    txDepth--;
  }
}

export function setting(key, fallback = null) {
  const row = get('SELECT value FROM game_settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  run(
    `INSERT INTO game_settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    String(value)
  );
}

export function isSeeded() {
  const row = get('SELECT COUNT(*) AS c FROM terms');
  return row && row.c > 0;
}
