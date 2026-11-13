// CODE QUEST — password hashing and session helpers
import crypto from 'node:crypto';
import { all, get, run } from './db.js';

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_DAYS = 30;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const calc = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hash, 'hex');
    return expected.length === calc.length && crypto.timingSafeEqual(expected, calc);
  } catch {
    return false;
  }
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function createSession(userId) {
  const id = 'ses_' + randomToken(12);
  const token = randomToken(32);
  const csrf = randomToken(18);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 864e5).toISOString();
  run(
    'INSERT INTO sessions(id, user_id, token_hash, csrf, expires_at, last_seen_at) VALUES(?,?,?,?,?,?)',
    id, userId, sha256(token), csrf, expires, new Date().toISOString()
  );
  return { id, token, csrf, expires };
}

export function userFromToken(token) {
  if (!token) return null;
  const row = get(
    `SELECT s.id AS session_id, s.csrf, s.expires_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? LIMIT 1`,
    sha256(token)
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run('DELETE FROM sessions WHERE id = ?', row.session_id);
    return null;
  }
  run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', new Date().toISOString(), row.session_id);
  return row;
}

export function destroySession(token) {
  if (!token) return;
  run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export function pruneExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString());
}

export function userCount() {
  return get('SELECT COUNT(*) AS c FROM users').c;
}

export function cleanupOrphanSessions() {
  const rows = all('SELECT id FROM sessions WHERE user_id NOT IN (SELECT id FROM users)');
  for (const r of rows) run('DELETE FROM sessions WHERE id = ?', r.id);
}
