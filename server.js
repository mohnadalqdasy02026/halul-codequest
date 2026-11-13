// CODE QUEST — zero-dependency HTTP server + JSON API + static SPA.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import db, { all, get, nowIso, run, setting, setSetting, todayKey, tx } from './src/db.js';
import {
  createSession, destroySession, hashPassword, pruneExpiredSessions, randomToken,
  userFromToken, verifyPassword,
} from './src/auth.js';
import {
  ACHIEVEMENTS, GAME_MODES, MAX_LEVEL, RANKS, STARTER_COINS, WORLDS,
  levelFromXp, rankForLevel, xpForLevel,
} from './src/content.js';
import {
  COINS_BY_MODE, XP_BY_MODE, achievementSnapshot, addCoins, addXp, checkAchievements,
  completeStage, ensureDailyChallenge, ensureProgressRow, getProfile, leaderboard, loadQuestion,
  logActivity, pickQuestions, publicQuestion, recordTermResult, reviewCount, reviewQueue,
  spendCoins, stageState, touchStreak,
} from './src/game.js';
import { isVerifiedArabic, normKey, refreshTranslationStatus, regenerateTermQuestions } from './src/questions.js';
import { buildXlsx, parseXlsx } from './src/xlsx.js';
import {
  adminSubscriptionQueue, approveRequest, ensureSubscriptionPlans, grantSubscription, listPlans,
  pendingRequest, rejectRequest, requestSubscription, subscriptionHistory, subscriptionState,
} from './src/subscriptions.js';
import {
  createRoom, currentRoom, joinRoom, leaveRoom, roomInfo, submitAnswer,
} from './src/multiplayer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 5173;
// Render (and most PaaS) require binding to 0.0.0.0; local dev can set HOST=127.0.0.1.
const HOST = process.env.HOST || '0.0.0.0';

ensureSubscriptionPlans();

// ---------------------------------------------------------------- helpers
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function fail(res, status, message, extra = {}) {
  json(res, status, { error: message, ...extra });
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('حجم الطلب كبير جدًا'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function authUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.cq_session || req.headers['x-session-token'];
  if (!token) return null;
  const user = userFromToken(String(token));
  return user ? { ...user, _token: token } : null;
}

function cookieHeader(token, maxAge) {
  return `cq_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

const nowMs = () => Date.now();

function hashDateKey(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

// ---------------------------------------------------------------- routing
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:[A-Za-z_]+/g, m => {
    keys.push(m.slice(1));
    return '([^/]+)';
  }) + '$');
  routes.push({ method, regex, keys, handler, ...opts });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return null;
}

// ---------------------------------------------------------------- auth routes
function publicUser(userId) {
  const p = getProfile(userId);
  if (!p) return null;
  return p;
}

function createPlayer({ username, email, password, displayName }) {
  return tx(() => {
    const info = run(
      'INSERT INTO users(username, email, password_hash, xp, coins, created_at) VALUES(?,?,?,?,?,?)',
      username, email, hashPassword(password), 0, STARTER_COINS, nowIso()
    );
    const id = Number(info.lastInsertRowid);
    run(
      'INSERT INTO user_profiles(user_id, display_name, lang) VALUES(?,?,?)',
      id, displayName || username, 'ar'
    );
    run(
      `INSERT OR IGNORE INTO user_rewards(user_id, reward_id, equipped)
       SELECT ?, id, 1 FROM rewards WHERE code IN ('avatar-nova','bg-default','frame-none')`, id
    );
    // unlock starter stage
    const first = get('SELECT id FROM stages ORDER BY id LIMIT 1');
    if (first) ensureProgressRow(id, first.id);
    logActivity(id, 'account_created');
    return id;
  });
}

route('POST', '/api/auth/register', async ctx => {
  const { username, email, password, displayName } = ctx.body || {};
  const name = String(username || '').trim();
  const mail = String(email || '').trim().toLowerCase();
  const pass = String(password || '');
  if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(name)) {
    return fail(ctx.res, 400, 'اسم المستخدم يجب أن يكون 3-24 حرفًا بدون مسافات.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return fail(ctx.res, 400, 'البريد الإلكتروني غير صالح.');
  if (pass.length < 8) return fail(ctx.res, 400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  if (get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', name)) {
    return fail(ctx.res, 409, 'اسم المستخدم مستخدم بالفعل.');
  }
  if (get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', mail)) {
    return fail(ctx.res, 409, 'البريد الإلكتروني مسجل بالفعل.');
  }
  const id = createPlayer({ username: name, email: mail, password: pass, displayName });
  const sess = createSession(id);
  ctx.res.setHeader('Set-Cookie', cookieHeader(sess.token, 30 * 86400));
  return json(ctx.res, 201, { user: publicUser(id), csrf: sess.csrf });
});

route('POST', '/api/auth/login', async ctx => {
  const { login, password } = ctx.body || {};
  const key = String(login || '').trim();
  if (!key || !password) return fail(ctx.res, 400, 'أدخل اسم المستخدم وكلمة المرور.');
  const user = get(
    'SELECT * FROM users WHERE (username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE) LIMIT 1',
    key, key.toLowerCase()
  );
  if (!user || user.is_npc || !verifyPassword(password, user.password_hash)) {
    return fail(ctx.res, 401, 'بيانات الدخول غير صحيحة.');
  }
  if (user.status !== 'active') return fail(ctx.res, 403, 'هذا الحساب موقوف.');
  run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), user.id);
  const sess = createSession(user.id);
  logActivity(user.id, 'login');
  ctx.res.setHeader('Set-Cookie', cookieHeader(sess.token, 30 * 86400));
  return json(ctx.res, 200, { user: publicUser(user.id), csrf: sess.csrf });
});

route('POST', '/api/auth/logout', async ctx => {
  destroySession(ctx.user?._token);
  ctx.res.setHeader('Set-Cookie', 'cq_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  return json(ctx.res, 200, { ok: true });
}, { auth: true });

route('GET', '/api/auth/me', async ctx => {
  if (!ctx.user) return json(ctx.res, 200, { user: null, csrf: null });
  return json(ctx.res, 200, { user: publicUser(ctx.user.id), csrf: ctx.user.csrf });
});

// ---------------------------------------------------------------- content routes
function worldSummaries(userId) {
  const worlds = all('SELECT * FROM worlds ORDER BY sort');
  const stageRows = all(
    `SELECT s.*, c.name_ar AS category_ar, c.name_en AS category_en
       FROM stages s JOIN categories c ON c.id = s.category_id ORDER BY s.world_id, s.sort`
  );
  const progress = new Map(
    all('SELECT * FROM user_progress WHERE user_id = ?', userId).map(p => [p.stage_id, p])
  );
  const user = get('SELECT xp FROM users WHERE id = ?', userId);
  const level = levelFromXp(user?.xp || 0);
  const byWorld = new Map();
  for (const s of stageRows) {
    if (!byWorld.has(s.world_id)) byWorld.set(s.world_id, []);
    byWorld.get(s.world_id).push(s);
  }
  return worlds.map(w => {
    const stages = byWorld.get(w.id) || [];
    let prevCompleted = true;
    let completed = 0;
    let unlocked = 0;
    const mapped = stages.map(s => {
      const p = progress.get(s.id);
      const levelOk = level >= s.required_level;
      const isUnlocked = prevCompleted && levelOk;
      const isCompleted = p?.status === 'completed';
      if (isCompleted) completed++;
      if (isUnlocked) unlocked++;
      if (!isCompleted) prevCompleted = false;
      return {
        id: s.id, sort: s.sort, name_ar: s.category_ar, name_en: s.category_en,
        requiredLevel: s.required_level, stars: p?.stars || 0,
        status: isCompleted ? 'completed' : isUnlocked ? 'unlocked' : 'locked',
      };
    });
    return {
      id: w.id, code: w.code, name_en: w.name_en, name_ar: w.name_ar,
      subtitle_ar: w.subtitle_ar, description_ar: w.description_ar,
      color: w.color, icon: w.icon,
      totalStages: stages.length,
      completedStages: completed,
      unlockedStages: unlocked,
      progress: stages.length ? Math.round((completed / stages.length) * 100) : 0,
      firstStageId: mapped.find(s => s.status === 'unlocked')?.id || mapped[0]?.id || null,
      firstUnlockedIndex: mapped.findIndex(s => s.status === 'unlocked'),
      stages: mapped,
    };
  });
}

route('GET', '/api/worlds', async ctx => {
  return json(ctx.res, 200, { worlds: worldSummaries(ctx.user.id) });
}, { auth: true });

route('GET', '/api/stages/:id', async ctx => {
  const state = stageState(ctx.user.id, Number(ctx.params.id));
  if (!state) return fail(ctx.res, 404, 'المرحلة غير موجودة.');
  const terms = all(
    'SELECT id, english, arabic, difficulty FROM terms WHERE category_id = ? AND active = 1 ORDER BY id LIMIT 12',
    state.category_id
  );
  const counts = all(
    'SELECT mode, COUNT(*) AS c FROM questions WHERE category_id = ? AND active = 1 GROUP BY mode',
    state.category_id
  );
  return json(ctx.res, 200, { stage: state, terms, questionCounts: counts });
}, { auth: true });

route('GET', '/api/modes', async ctx => {
  const p = getProfile(ctx.user.id);
  const modes = all('SELECT * FROM game_modes ORDER BY id').map(m => ({
    ...m,
    unlocked: p.level >= m.unlocked_level,
    config: m.config ? JSON.parse(m.config) : null,
  }));
  return json(ctx.res, 200, { modes });
}, { auth: true });

function wordOfDay(userId) {
  const key = todayKey();
  const rows = all(
    "SELECT id, english, arabic, definition_ar, example, difficulty FROM terms WHERE active = 1 AND translation_status = 'verified' ORDER BY id"
  );
  if (!rows.length) return null;
  const row = rows[hashDateKey('word:' + key) % rows.length];
  const progress = get('SELECT status, mastery FROM user_terms WHERE user_id = ? AND term_id = ?', userId, row.id);
  return { ...row, date: key, progress: progress || { status: 'new', mastery: 0 } };
}

// ---------------------------------------------------------------- play routes
function createPlaySession(userId, { mode, questions, stageId = null, bossId = null, dailyKey = null, hearts = 0 }) {
  const id = 'ps_' + randomToken(9);
  const ids = questions.map(q => q.id);
  run(
    `INSERT INTO play_sessions(id, user_id, mode, stage_id, boss_id, daily_key, question_ids,
                               total, hearts, status, created_at)
     VALUES(?,?,?,?,?,?,?,?,?,'active',?)`,
    id, userId, mode, stageId, bossId, dailyKey, JSON.stringify(ids), ids.length, hearts, nowIso()
  );
  return id;
}

function sessionQuestions(session) {
  const ids = JSON.parse(session.question_ids || '[]');
  const out = [];
  for (const qid of ids) {
    const loaded = loadQuestion(qid);
    if (!loaded) continue;
    out.push(publicQuestion(loaded.q, loaded.options));
  }
  return out;
}

function sessionMeta(session) {
  if (session.mode === 'speed') return { timeLimit: 60, hearts: session.hearts };
  if (session.mode === 'boss') return { timeLimit: 0, hearts: session.hearts };
  if (session.mode === 'match') return { timeLimit: 0, hearts: 0, pairs: 5 };
  return { timeLimit: 0, hearts: 0 };
}

function buildMatchPairs(session) {
  if (session.mode !== 'match') return null;
  const ids = JSON.parse(session.question_ids || '[]');
  const pairs = [];
  for (const qid of ids) {
    const loaded = loadQuestion(qid);
    if (!loaded) continue;
    const correct = loaded.options.find(o => o.is_correct);
    pairs.push({
      questionId: loaded.q.id,
      termId: loaded.q.term_id,
      english: loaded.q.english || loaded.q.prompt,
      arabic: correct?.text || '',
      optionId: correct?.id || null,
    });
  }
  return pairs;
}

function bossRow(bossId) {
  const b = get('SELECT * FROM bosses WHERE id = ?', bossId);
  if (!b) return null;
  return { ...b, category_names: JSON.parse(b.category_names || '[]') };
}

route('POST', '/api/play/start', async ctx => {
  const body = ctx.body || {};
  const mode = String(body.mode || '');
  if (!GAME_MODES.some(m => m.code === mode)) return fail(ctx.res, 400, 'نمط لعب غير معروف.');
  const profile = getProfile(ctx.user.id);
  const modeRow = get('SELECT * FROM game_modes WHERE code = ?', mode);
  if (modeRow && profile.level < modeRow.unlocked_level) {
    return fail(ctx.res, 403, `يُفتح هذا النمط في المستوى ${modeRow.unlocked_level}.`);
  }
  const stageId = body.stageId ? Number(body.stageId) : null;
  const bossId = body.bossId ? Number(body.bossId) : null;
  const access = subscriptionState(ctx.user.id);
  if (!access.active && access.remaining <= 0) {
    return fail(ctx.res, 402, 'انتهت تجربتك المجانية لهذا اليوم. فعّل الاشتراك لمتابعة اللعب.', {
      code: 'SUBSCRIPTION_REQUIRED', subscription: access,
    });
  }
  const allowed = access.active ? Number.POSITIVE_INFINITY : access.remaining;
  let categoryIds = [];
  let stage = null;
  let boss = null;

  if (mode === 'review') {
    const due = reviewQueue(ctx.user.id, Math.min(12, allowed));
    if (!due.length) return fail(ctx.res, 400, 'لا توجد مصطلحات مستحقة للمراجعة الآن. العب مرحلة جديدة أولًا.');
    const id = createPlaySession(ctx.user.id, { mode: 'review', questions: due });
    return json(ctx.res, 201, {
      session: { id, mode, meta: sessionMeta({ mode, hearts: 0 }), questions: sessionQuestions({ question_ids: JSON.stringify(due.map(q => q.id)) }) },
    });
  }

  if (mode === 'boss') {
    if (!bossId) return fail(ctx.res, 400, 'اختر زعيمًا أولًا.');
    boss = bossRow(bossId);
    if (!boss) return fail(ctx.res, 404, 'الزعيم غير موجود.');
    if (profile.level < boss.required_level) {
      return fail(ctx.res, 403, `يتطلب هذا الزعيم المستوى ${boss.required_level}.`);
    }
    categoryIds = all(
      `SELECT id FROM categories WHERE name_ar IN (${boss.category_names.map(() => '?').join(',')})`,
      ...boss.category_names
    ).map(r => r.id);
  } else if (mode === 'similar') {
    // handled as fixed similar questions, no category filter
  } else if (mode === 'speed' && !stageId) {
    // mixed pool
  } else {
    if (!stageId) return fail(ctx.res, 400, 'اختر مرحلة أولًا.');
    stage = stageState(ctx.user.id, stageId);
    if (!stage) return fail(ctx.res, 404, 'المرحلة غير موجودة.');
    if (stage.locked) return fail(ctx.res, 403, 'هذه المرحلة مقفلة. أكمل المرحلة السابقة أو ارفع مستواك.');
    categoryIds = [stage.category_id];
  }

  let limit = mode === 'match' ? 5 : mode === 'speed' ? 25 : mode === 'boss' ? 10 : mode === 'similar' ? 11 : 8;
  if (allowed < limit) limit = allowed;
  let questions;
  if (mode === 'similar') {
    questions = all(
      `SELECT q.*, t.english, t.arabic, t.definition_ar, t.example FROM questions q
        LEFT JOIN terms t ON t.id = q.term_id WHERE q.mode = 'similar' AND q.active = 1
        ORDER BY q.id LIMIT ?`, limit
    );
  } else {
    questions = pickQuestions({ mode, categoryIds, limit });
  }
  if (!questions.length) {
    return fail(ctx.res, 400, 'لا توجد أسئلة كافية لهذا الاختيار بعد. جرّب مرحلة أخرى أو أضف أسئلة من لوحة الإدارة.');
  }
  const hearts = (mode === 'speed' || mode === 'boss') ? 3 : 0;
  const id = createPlaySession(ctx.user.id, {
    mode, questions, stageId: stage?.id || null, bossId: boss?.id || null, hearts,
  });
  if (stage) ensureProgressRow(ctx.user.id, stage.id);
  let matchPairs = null;
  if (mode === 'match') {
    matchPairs = questions.map(q => {
      const loaded = loadQuestion(q.id);
      const correct = loaded?.options.find(o => o.is_correct);
      return {
        questionId: q.id, termId: q.term_id, english: q.english,
        arabic: correct?.text || '', optionId: correct?.id || null,
      };
    });
  }
  return json(ctx.res, 201, {
    session: {
      id, mode, stageId: stage?.id || null, bossId: boss?.id || null,
      score: 0, total: questions.length,
      meta: sessionMeta({ mode, hearts }),
      matchPairs,
      questions: sessionQuestions({ question_ids: JSON.stringify(questions.map(q => q.id)) }),
    },
  });
});

route('POST', '/api/daily/start', async ctx => {
  const access = subscriptionState(ctx.user.id);
  if (!access.active && access.remaining <= 0) {
    return fail(ctx.res, 402, 'انتهت تجربتك المجانية لهذا اليوم. فعّل الاشتراك لمتابعة اللعب.', {
      code: 'SUBSCRIPTION_REQUIRED', subscription: access,
    });
  }
  const challenge = ensureDailyChallenge();
  const existing = get(
    'SELECT * FROM user_daily WHERE user_id = ? AND challenge_date = ?', ctx.user.id, challenge.challenge_date
  );
  if (existing?.completed_at) return fail(ctx.res, 409, 'أكملت تحدي اليوم بالفعل. عد غدًا!');
  let ids = JSON.parse(challenge.question_ids || '[]');
  if (!access.active) ids = ids.slice(0, Math.max(1, access.remaining));
  const questions = ids.map(id => loadQuestion(id)).filter(Boolean);
  if (!questions.length) return fail(ctx.res, 500, 'تعذر تجهيز تحدي اليوم.');
  const id = createPlaySession(ctx.user.id, {
    mode: 'meaning', questions: questions.map(x => x.q), dailyKey: challenge.challenge_date,
  });
  run(
    `INSERT INTO user_daily(user_id, challenge_date, session_id) VALUES(?,?,?)
     ON CONFLICT(user_id, challenge_date) DO UPDATE SET session_id = excluded.session_id`,
    ctx.user.id, challenge.challenge_date, id
  );
  return json(ctx.res, 201, {
    session: {
      id, mode: 'daily', dailyKey: challenge.challenge_date, stageId: null, bossId: null,
      score: 0, total: questions.length, meta: { timeLimit: 0, hearts: 0, daily: true },
      questions: sessionQuestions({ question_ids: JSON.stringify(questions.map(x => x.q.id)) }),
    },
  });
}, { auth: true });

route('POST', '/api/review/start', async ctx => {
  const access = subscriptionState(ctx.user.id);
  if (!access.active && access.remaining <= 0) {
    return fail(ctx.res, 402, 'انتهت تجربتك المجانية لهذا اليوم. فعّل الاشتراك لمتابعة اللعب.', {
      code: 'SUBSCRIPTION_REQUIRED', subscription: access,
    });
  }
  const due = reviewQueue(ctx.user.id, access.active ? 12 : Math.min(12, access.remaining));
  if (!due.length) return fail(ctx.res, 400, 'لا توجد مصطلحات مستحقة للمراجعة الآن.');
  const id = createPlaySession(ctx.user.id, { mode: 'review', questions: due });
  return json(ctx.res, 201, {
    session: {
      id, mode: 'review', stageId: null, bossId: null, score: 0, total: due.length,
      meta: { timeLimit: 0, hearts: 0 },
      questions: sessionQuestions({ question_ids: JSON.stringify(due.map(q => q.id)) }),
    },
  });
}, { auth: true });

route('GET', '/api/play/session/:id', async ctx => {
  const session = get('SELECT * FROM play_sessions WHERE id = ? AND user_id = ?', ctx.params.id, ctx.user.id);
  if (!session) return fail(ctx.res, 404, 'الجلسة غير موجودة.');
  const answers = all(
    `SELECT pa.question_id, pa.is_correct, pa.option_id, q.answer, q.explanation,
            (SELECT text FROM question_options o WHERE o.id = pa.option_id) AS option_text,
            (SELECT text FROM question_options o WHERE o.question_id = q.id AND o.is_correct = 1 LIMIT 1) AS correct_text
       FROM play_answers pa JOIN questions q ON q.id = pa.question_id
      WHERE pa.session_id = ? ORDER BY pa.created_at`, session.id
  );
  return json(ctx.res, 200, {
    session: {
      id: session.id, mode: session.mode, score: session.score, total: session.total,
      hearts: session.hearts, status: session.status, stageId: session.stage_id,
      bossId: session.boss_id, dailyKey: session.daily_key,
      meta: sessionMeta(session),
      matchPairs: buildMatchPairs(session),
      questions: sessionQuestions(session),
    },
    answers,
  });
}, { auth: true });

route('POST', '/api/play/answer', async ctx => {
  const { sessionId, questionId, optionId, answerText, timeMs } = ctx.body || {};
  const session = get('SELECT * FROM play_sessions WHERE id = ? AND user_id = ?', String(sessionId || ''), ctx.user.id);
  if (!session) return fail(ctx.res, 404, 'الجلسة غير موجودة.');
  if (session.status !== 'active') return fail(ctx.res, 409, 'انتهت هذه الجلسة.');
  const access = subscriptionState(ctx.user.id);
  if (!access.active && access.remaining <= 0) {
    return fail(ctx.res, 402, 'انتهت تجربتك المجانية لهذا اليوم. فعّل الاشتراك لمتابعة اللعب.', {
      code: 'SUBSCRIPTION_REQUIRED', subscription: access,
    });
  }
  const ids = JSON.parse(session.question_ids || '[]');
  const qid = Number(questionId);
  if (!ids.includes(qid)) return fail(ctx.res, 400, 'السؤال ليس ضمن هذه الجلسة.');
  if (get('SELECT 1 FROM play_answers WHERE session_id = ? AND question_id = ?', session.id, qid)) {
    return fail(ctx.res, 409, 'تمت الإجابة عن هذا السؤال.');
  }
  const loaded = loadQuestion(qid);
  if (!loaded) return fail(ctx.res, 404, 'السؤال غير موجود.');
  const { q, options } = loaded;

  let isCorrect = false;
  let chosenOptionId = optionId ? Number(optionId) : null;
  if (q.mode === 'puzzle' || (!options.length && q.answer)) {
    const normalize = s => String(s || '').replace(/\s+/g, '').toLowerCase();
    isCorrect = normalize(answerText) === normalize(q.answer);
    chosenOptionId = null;
  } else {
    const chosen = options.find(o => o.id === chosenOptionId);
    if (!chosen) return fail(ctx.res, 400, 'خيار غير صالح.');
    isCorrect = !!chosen.is_correct;
  }
  const correctOption = options.find(o => o.is_correct) || null;
  const correctAnswer = correctOption?.text || q.answer;

  const prev = all(
    'SELECT is_correct FROM play_answers WHERE session_id = ? ORDER BY created_at, rowid', session.id
  );
  let combo = 0;
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].is_correct) combo++; else break;
  }
  if (isCorrect) combo += 1; else combo = 0;
  const multiplier = isCorrect ? 1 + Math.min(Math.max(combo - 1, 0), 5) * 0.2 : 0;
  const baseMode = q.mode === 'similar' ? 'similar' : session.mode === 'daily' ? 'meaning' : session.mode;
  const baseXp = XP_BY_MODE[baseMode] ?? 10;
  const baseCoins = COINS_BY_MODE[baseMode] ?? 1;
  const xpEarned = isCorrect ? Math.round(baseXp * multiplier) : 0;
  const coinsEarned = isCorrect ? baseCoins : 0;

  run(
    'INSERT INTO play_answers(session_id, question_id, option_id, is_correct, time_ms, created_at) VALUES(?,?,?,?,?,?)',
    session.id, qid, chosenOptionId, isCorrect ? 1 : 0, Math.max(0, Number(timeMs) || 0), nowIso()
  );
  run(
    `INSERT INTO user_answers(user_id, question_id, term_id, mode, is_correct, time_ms, answer_text, session_id, created_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    ctx.user.id, qid, q.term_id, session.mode, isCorrect ? 1 : 0,
    Math.max(0, Number(timeMs) || 0), answerText != null ? String(answerText) : null, session.id, nowIso()
  );
  if (!isCorrect) {
    run(
      `INSERT INTO user_mistakes(user_id, question_id, term_id, count, last_mistake_at)
       VALUES(?,?,?,1,?)
       ON CONFLICT(user_id, question_id) DO UPDATE SET
         count = count + 1, last_mistake_at = excluded.last_mistake_at, resolved = 0`,
      ctx.user.id, qid, q.term_id, nowIso()
    );
  }
  recordTermResult(ctx.user.id, q.term_id, isCorrect);
  run(
    'UPDATE user_profiles SET total_answered = total_answered + 1, total_correct = total_correct + ?, total_time_ms = total_time_ms + ? WHERE user_id = ?',
    isCorrect ? 1 : 0, Math.max(0, Number(timeMs) || 0), ctx.user.id
  );
  if (xpEarned) addXp(ctx.user.id, xpEarned, 'answer', session.id);
  if (coinsEarned) addCoins(ctx.user.id, coinsEarned);

  let hearts = session.hearts;
  let failed = false;
  if (!isCorrect && hearts > 0) {
    hearts -= 1;
    if (hearts <= 0) failed = true;
  }
  run(
    'UPDATE play_sessions SET score = score + ?, hearts = ?, status = ? WHERE id = ?',
    isCorrect ? 1 : 0, hearts, failed ? 'failed' : 'active', session.id
  );

  const achievements = checkAchievements(ctx.user.id);
  if (achievements.length) touchStreak(ctx.user.id);
  const profile = getProfile(ctx.user.id);

  return json(ctx.res, 200, {
    correct: isCorrect,
    selectedOptionId: chosenOptionId,
    correctOptionId: correctOption?.id || null,
    correctAnswer,
    explanation: q.explanation,
    term: { id: q.term_id, english: q.english, arabic: q.arabic },
    xpEarned, coinsEarned, combo, multiplier,
    hearts, failed,
    score: session.score + (isCorrect ? 1 : 0), total: session.total,
    newAchievements: achievements,
    profile: { xp: profile.xp, coins: profile.coins, level: profile.level, rank: profile.rank },
    reviewDue: reviewCount(ctx.user.id),
  });
}, { auth: true });

route('POST', '/api/play/complete', async ctx => {
  const { sessionId, timeMs } = ctx.body || {};
  const session = get('SELECT * FROM play_sessions WHERE id = ? AND user_id = ?', String(sessionId || ''), ctx.user.id);
  if (!session) return fail(ctx.res, 404, 'الجلسة غير موجودة.');
  if (session.status === 'completed') {
    return json(ctx.res, 200, { alreadyCompleted: true, summary: buildSummary(ctx.user.id, session) });
  }
  const answered = get('SELECT COUNT(*) AS c FROM play_answers WHERE session_id = ?', session.id).c;
  const correct = get('SELECT COUNT(*) AS c FROM play_answers WHERE session_id = ? AND is_correct = 1', session.id).c;
  const elapsed = Math.max(
    Number(timeMs) || 0,
    get('SELECT COALESCE(SUM(time_ms),0) AS t FROM play_answers WHERE session_id = ?', session.id).t
  );
  const wasFailed = session.status === 'failed';
  run(
    'UPDATE play_sessions SET status = ?, score = ?, time_ms = ?, completed_at = ? WHERE id = ?',
    wasFailed ? 'failed' : 'completed', correct, elapsed, nowIso(), session.id
  );
  const fresh = get('SELECT * FROM play_sessions WHERE id = ?', session.id);
  const totals = session.mode === 'speed'
    ? { score: correct, total: answered || 1 }
    : { score: correct, total: session.total || 1 };
  const summary = { pct: Math.round((totals.score / totals.total) * 100) };

  if (fresh.stage_id) {
    summary.stage = completeStage(ctx.user.id, fresh.stage_id, totals.score, totals.total);
  }
  if (fresh.boss_id) {
    const boss = bossRow(fresh.boss_id);
    const pct = totals.score / totals.total;
    summary.boss = { id: boss.id, name_ar: boss.name_ar, defeated: pct >= 0.8, pct: Math.round(pct * 100) };
    if (pct >= 0.8) {
      const prior = get('SELECT * FROM user_bosses WHERE user_id = ? AND boss_id = ?', ctx.user.id, boss.id);
      run(
        `INSERT INTO user_bosses(user_id, boss_id, best_score, defeated_at) VALUES(?,?,?,?)
         ON CONFLICT(user_id, boss_id) DO UPDATE SET
           best_score = MAX(user_bosses.best_score, excluded.best_score),
           defeated_at = COALESCE(user_bosses.defeated_at, excluded.defeated_at)`,
        ctx.user.id, boss.id, totals.score, nowIso()
      );
      if (!prior?.defeated_at) {
        addXp(ctx.user.id, boss.xp_reward, 'boss', boss.code);
        addCoins(ctx.user.id, boss.coin_reward);
        summary.boss.bonusXp = boss.xp_reward;
        summary.boss.bonusCoins = boss.coin_reward;
        logActivity(ctx.user.id, 'boss_defeated', boss.code);
      }
    }
  }
  if (fresh.daily_key) {
    const challenge = get('SELECT * FROM daily_challenges WHERE challenge_date = ?', fresh.daily_key);
    const pct = totals.score / totals.total;
    const won = totals.score >= Math.ceil(totals.total * 0.75);
    run(
      `INSERT INTO user_daily(user_id, challenge_date, session_id, score, total, completed_at)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(user_id, challenge_date) DO UPDATE SET
         session_id = excluded.session_id, score = excluded.score,
         total = excluded.total, completed_at = COALESCE(user_daily.completed_at, excluded.completed_at)`,
      ctx.user.id, fresh.daily_key, fresh.id, totals.score, totals.total, nowIso()
    );
    summary.daily = { won, xp: 0, coins: 0 };
    if (won) {
      const already = get('SELECT completed_at FROM user_daily WHERE user_id = ? AND challenge_date = ?', ctx.user.id, fresh.daily_key);
      // award only once — completed_at is always set now; use xp_events to detect
      const priorAward = get(
        "SELECT 1 FROM xp_events WHERE user_id = ? AND source = 'daily' AND ref = ?",
        ctx.user.id, fresh.daily_key
      );
      if (!priorAward && challenge) {
        addXp(ctx.user.id, challenge.xp_reward, 'daily', fresh.daily_key);
        addCoins(ctx.user.id, challenge.coin_reward);
        summary.daily.xp = challenge.xp_reward;
        summary.daily.coins = challenge.coin_reward;
      }
    }
  }
  if (session.mode === 'speed' && totals.score > 0) {
    logActivity(ctx.user.id, 'speed_completed', String(totals.score));
  }
  touchStreak(ctx.user.id);
  logActivity(ctx.user.id, 'session_completed', session.id);
  const newAchievements = checkAchievements(ctx.user.id);
  const xpEarned = get(
    "SELECT COALESCE(SUM(amount),0) AS s FROM xp_events WHERE user_id = ? AND source = 'answer' AND ref = ?",
    ctx.user.id, session.id
  ).s;
  return json(ctx.res, 200, {
    summary: {
      ...summary, ...totals, mode: session.mode, answered,
      stageId: fresh.stage_id, bossId: fresh.boss_id, dailyKey: fresh.daily_key,
      xpFromAnswers: xpEarned,
      newAchievements,
      profile: getProfile(ctx.user.id),
      reviewDue: reviewCount(ctx.user.id),
    },
  });
}, { auth: true });

function buildSummary(userId, session) {
  const correct = get('SELECT COUNT(*) AS c FROM play_answers WHERE session_id = ? AND is_correct = 1', session.id).c;
  const answered = get('SELECT COUNT(*) AS c FROM play_answers WHERE session_id = ?', session.id).c;
  const total = session.mode === 'speed' ? (answered || 1) : (session.total || 1);
  return {
    score: correct, total, answered, pct: Math.round((correct / total) * 100),
    mode: session.mode, stageId: session.stage_id, bossId: session.boss_id,
    dailyKey: session.daily_key,
    xpFromAnswers: get(
      "SELECT COALESCE(SUM(amount),0) AS s FROM xp_events WHERE user_id = ? AND source = 'answer' AND ref = ?",
      userId, session.id
    ).s,
    profile: getProfile(userId),
    reviewDue: reviewCount(userId),
  };
}

// ---------------------------------------------------------------- daily & review
route('GET', '/api/daily', async ctx => {
  const challenge = ensureDailyChallenge();
  const status = get(
    'SELECT * FROM user_daily WHERE user_id = ? AND challenge_date = ?', ctx.user.id, challenge.challenge_date
  );
  return json(ctx.res, 200, {
    date: challenge.challenge_date,
    questionCount: JSON.parse(challenge.question_ids || '[]').length,
    xpReward: challenge.xp_reward,
    coinReward: challenge.coin_reward,
    completed: !!status?.completed_at,
    score: status?.score || 0,
    total: status?.total || 0,
  });
}, { auth: true });

route('GET', '/api/review', async ctx => {
  const count = reviewCount(ctx.user.id);
  const queue = reviewQueue(ctx.user.id, 6).map(q => ({
    id: q.term_id, english: q.english, arabic: q.arabic, mode: q.mode,
  }));
  return json(ctx.res, 200, { count, queue });
}, { auth: true });

// ---------------------------------------------------------------- dictionary
route('GET', '/api/dictionary', async ctx => {
  const q = String(ctx.query.q || '').trim();
  const category = String(ctx.query.category || '').trim();
  const difficulty = String(ctx.query.difficulty || '').trim();
  const status = String(ctx.query.status || '').trim();
  const world = String(ctx.query.world || '').trim();
  const favorites = ctx.query.favorites === '1';
  const page = Math.max(1, Number(ctx.query.page) || 1);
  const pageSize = Math.min(60, Math.max(6, Number(ctx.query.pageSize) || 24));
  const where = ['t.active = 1'];
  const params = [ctx.user.id];
  if (q) {
    where.push('(t.english LIKE ? OR t.arabic LIKE ? OR t.abbreviation LIKE ? OR t.full_form LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (category) { where.push('c.name_ar = ?'); params.push(category); }
  if (world) { where.push('w.code = ?'); params.push(world); }
  if (difficulty) { where.push('t.difficulty = ?'); params.push(difficulty); }
  if (status) {
    if (status === 'verified' || status === 'needs_review') {
      where.push('t.translation_status = ?');
    } else {
      where.push("COALESCE(ut.status,'new') = ?");
    }
    params.push(status);
  }
  if (favorites) {
    where.push('EXISTS(SELECT 1 FROM favorites f WHERE f.user_id = ? AND f.term_id = t.id)');
    params.push(ctx.user.id);
  }

  const base = `
    FROM terms t JOIN categories c ON c.id = t.category_id
    JOIN worlds w ON w.id = c.world_id
    LEFT JOIN user_terms ut ON ut.term_id = t.id AND ut.user_id = ?
    WHERE ${where.join(' AND ')}`;
  const totalRow = get(`SELECT COUNT(*) AS c ${base}`, ...params);
  const rows = all(
    `SELECT t.id, t.english, t.arabic, t.abbreviation, t.full_form, t.definition_ar,
            t.difficulty, t.translation_status, c.name_ar AS category, w.code AS world_code,
            w.color AS world_color, COALESCE(ut.status,'new') AS progress,
            COALESCE(ut.mastery,0) AS mastery,
            (SELECT COUNT(*) FROM favorites f WHERE f.user_id = ? AND f.term_id = t.id) AS favorite
     ${base} ORDER BY t.english COLLATE NOCASE LIMIT ? OFFSET ?`,
    ctx.user.id, ...params, pageSize, (page - 1) * pageSize
  );
  const cats = all(
    `SELECT c.name_ar, COUNT(t.id) AS c FROM categories c
       LEFT JOIN terms t ON t.category_id = c.id AND t.active = 1
      GROUP BY c.id ORDER BY c.name_ar`
  );
  return json(ctx.res, 200, {
    terms: rows.map(r => ({ ...r, favorite: !!r.favorite })),
    total: totalRow.c, page, pageSize, categories: cats,
  });
}, { auth: true });

route('GET', '/api/dictionary/:id', async ctx => {
  const t = get(
    `SELECT t.*, c.name_ar AS category, c.name_en AS category_en,
            w.code AS world_code, w.name_ar AS world_ar, w.color AS world_color
       FROM terms t JOIN categories c ON c.id = t.category_id
       JOIN worlds w ON w.id = c.world_id WHERE t.id = ?`, Number(ctx.params.id)
  );
  if (!t) return fail(ctx.res, 404, 'المصطلح غير موجود.');
  const progress = get('SELECT * FROM user_terms WHERE user_id = ? AND term_id = ?', ctx.user.id, t.id);
  const review = get('SELECT * FROM learning_reviews WHERE user_id = ? AND term_id = ?', ctx.user.id, t.id);
  const related = all(
    `SELECT t2.id, t2.english, t2.arabic FROM related_terms rt
       JOIN terms t2 ON t2.id = rt.related_term_id WHERE rt.term_id = ? LIMIT 12`, t.id
  );
  const examples = all('SELECT * FROM examples WHERE term_id = ?', t.id);
  const favorite = !!get('SELECT 1 FROM favorites WHERE user_id = ? AND term_id = ?', ctx.user.id, t.id);
  const abbr = t.abbreviation
    ? get('SELECT * FROM abbreviations WHERE abbreviation = ?', t.abbreviation) : null;
  return json(ctx.res, 200, {
    term: {
      ...t,
      related_terms: t.related_terms ? String(t.related_terms).split(';').map(s => s.trim()).filter(Boolean) : [],
    },
    progress: progress || { status: 'new', mastery: 0, correct_count: 0, wrong_count: 0 },
    review: review || null,
    related, examples, favorite, abbreviation: abbr,
  });
}, { auth: true });

route('POST', '/api/dictionary/:id/favorite', async ctx => {
  const termId = Number(ctx.params.id);
  if (!get('SELECT id FROM terms WHERE id = ?', termId)) return fail(ctx.res, 404, 'المصطلح غير موجود.');
  const exists = get('SELECT 1 FROM favorites WHERE user_id = ? AND term_id = ?', ctx.user.id, termId);
  if (exists) run('DELETE FROM favorites WHERE user_id = ? AND term_id = ?', ctx.user.id, termId);
  else run('INSERT INTO favorites(user_id, term_id) VALUES(?,?)', ctx.user.id, termId);
  return json(ctx.res, 200, { favorite: !exists });
}, { auth: true });

route('POST', '/api/dictionary/:id/learn', async ctx => {
  const termId = Number(ctx.params.id);
  const term = get('SELECT * FROM terms WHERE id = ? AND active = 1', termId);
  if (!term) return fail(ctx.res, 404, 'المصطلح غير موجود.');
  let questions = all(
    `SELECT q.*, t.english, t.arabic, t.definition_ar, t.example FROM questions q
       LEFT JOIN terms t ON t.id = q.term_id
      WHERE q.term_id = ? AND q.active = 1 ORDER BY q.mode LIMIT 5`, termId
  );
  if (!questions.length) {
    return fail(ctx.res, 400, 'لا توجد أسئلة لهذا المصطلح بعد. أضف ترجمة موثقة أو ولّد الأسئلة من لوحة الإدارة.');
  }
  const id = createPlaySession(ctx.user.id, { mode: 'meaning', questions });
  return json(ctx.res, 201, {
    session: {
      id, mode: 'meaning', stageId: null, bossId: null, score: 0, total: questions.length,
      meta: { timeLimit: 0, hearts: 0 },
      questions: sessionQuestions({ question_ids: JSON.stringify(questions.map(q => q.id)) }),
    },
  });
}, { auth: true });

// ---------------------------------------------------------------- profile & stats
route('GET', '/api/profile', async ctx => {
  const profile = getProfile(ctx.user.id);
  const achievements = all('SELECT * FROM achievements ORDER BY sort').map(a => {
    const owned = get(
      'SELECT unlocked_at FROM user_achievements WHERE user_id = ? AND achievement_id = ?', ctx.user.id, a.id
    );
    return {
      ...a, condition_json: undefined,
      unlocked: !!owned, unlocked_at: owned?.unlocked_at || null,
    };
  });
  const activity = all(
    'SELECT * FROM user_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 15', ctx.user.id
  );
  const xpRows = all(
    `SELECT substr(created_at, 1, 10) AS day, SUM(amount) AS xp FROM xp_events
      WHERE user_id = ? AND created_at >= ? GROUP BY day ORDER BY day`,
    ctx.user.id, new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10)
  );
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ day: key, xp: Number(xpRows.find(r => r.day === key)?.xp || 0) });
  }
  const categoryProgress = all(
    `SELECT c.name_ar AS category, w.name_ar AS world, w.color,
            COUNT(t.id) AS total,
            SUM(CASE WHEN ut.status = 'mastered' THEN 1 ELSE 0 END) AS mastered,
            SUM(CASE WHEN ut.status IS NOT NULL AND ut.status <> 'new' THEN 1 ELSE 0 END) AS touched
       FROM categories c JOIN worlds w ON w.id = c.world_id
       LEFT JOIN terms t ON t.category_id = c.id AND t.active = 1
       LEFT JOIN user_terms ut ON ut.term_id = t.id AND ut.user_id = ?
      GROUP BY c.id ORDER BY mastered DESC, touched DESC`,
    ctx.user.id
  );
  const favorites = get('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?', ctx.user.id).c;
  return json(ctx.res, 200, {
    profile, achievements, activity, chart: days, categoryProgress, favorites,
    reviewDue: reviewCount(ctx.user.id),
    levels: { max: MAX_LEVEL, xpForLevel },
  });
}, { auth: true });

route('PUT', '/api/profile/settings', async ctx => {
  const b = ctx.body || {};
  const current = get('SELECT * FROM user_profiles WHERE user_id = ?', ctx.user.id);
  if (!current) return fail(ctx.res, 404, 'الملف غير موجود.');
  const lang = ['ar', 'en'].includes(b.lang) ? b.lang : current.lang;
  const theme = ['dark', 'light'].includes(b.theme) ? b.theme : current.theme;
  const sound = b.sound === undefined ? current.sound : (b.sound ? 1 : 0);
  const music = b.music === undefined ? current.music : (b.music ? 1 : 0);
  const dailyGoal = Math.min(200, Math.max(5, Number(b.dailyGoal) || current.daily_goal));
  const displayName = b.displayName === undefined
    ? current.display_name : String(b.displayName).trim().slice(0, 40) || current.display_name;
  const bio = b.bio === undefined ? current.bio : String(b.bio).slice(0, 280);
  run(
    `UPDATE user_profiles SET lang = ?, theme = ?, sound = ?, music = ?, daily_goal = ?,
            display_name = ?, bio = ? WHERE user_id = ?`,
    lang, theme, sound, music, dailyGoal, displayName, bio, ctx.user.id
  );
  return json(ctx.res, 200, { profile: getProfile(ctx.user.id) });
}, { auth: true });

route('GET', '/api/achievements', async ctx => {
  const rows = all('SELECT * FROM achievements ORDER BY sort').map(a => {
    const owned = get(
      'SELECT unlocked_at FROM user_achievements WHERE user_id = ? AND achievement_id = ?', ctx.user.id, a.id
    );
    return { ...a, unlocked: !!owned, unlocked_at: owned?.unlocked_at || null, condition_json: undefined };
  });
  return json(ctx.res, 200, { achievements: rows });
}, { auth: true });

route('GET', '/api/leaderboard', async ctx => {
  const period = ['daily', 'weekly', 'monthly', 'all'].includes(ctx.query.period) ? ctx.query.period : 'all';
  const rows = leaderboard(period, 30);
  const me = rows.find(r => r.id === ctx.user.id);
  return json(ctx.res, 200, {
    period, entries: rows,
    me: me ? { position: me.position, xp: me.periodXp } : null,
  });
}, { auth: true });

route('GET', '/api/bosses', async ctx => {
  const profile = getProfile(ctx.user.id);
  const rows = all('SELECT * FROM bosses ORDER BY sort').map(b => {
    const u = get('SELECT * FROM user_bosses WHERE user_id = ? AND boss_id = ?', ctx.user.id, b.id);
    const cats = JSON.parse(b.category_names || '[]');
    return {
      ...b, category_names: cats,
      defeated: !!u?.defeated_at, bestScore: u?.best_score || 0,
      unlocked: profile.level >= b.required_level,
      questionCount: get(
        `SELECT COUNT(*) AS c FROM questions q JOIN categories c2 ON c2.id = q.category_id
          WHERE q.active = 1 AND c2.name_ar IN (${cats.map(() => '?').join(',') || "''"})`,
        ...cats
      ).c,
    };
  });
  return json(ctx.res, 200, { bosses: rows });
}, { auth: true });

// ---------------------------------------------------------------- shop
route('GET', '/api/shop', async ctx => {
  const user = get('SELECT coins FROM users WHERE id = ?', ctx.user.id);
  const profile = get('SELECT * FROM user_profiles WHERE user_id = ?', ctx.user.id);
  const rows = all('SELECT * FROM rewards ORDER BY sort').map(r => {
    const owned = get('SELECT * FROM user_rewards WHERE user_id = ? AND reward_id = ?', ctx.user.id, r.id);
    const equipped = (r.type === 'avatar' && profile.avatar === r.asset)
      || (r.type === 'frame' && profile.frame === r.code)
      || (r.type === 'background' && profile.background === r.code);
    return { ...r, owned: !!owned, equipped };
  });
  return json(ctx.res, 200, { coins: user.coins, rewards: rows });
}, { auth: true });

route('POST', '/api/shop/buy', async ctx => {
  const code = String(ctx.body?.code || '');
  const reward = get('SELECT * FROM rewards WHERE code = ?', code);
  if (!reward) return fail(ctx.res, 404, 'العنصر غير موجود.');
  if (get('SELECT 1 FROM user_rewards WHERE user_id = ? AND reward_id = ?', ctx.user.id, reward.id)) {
    return fail(ctx.res, 409, 'تملك هذا العنصر بالفعل.');
  }
  const user = get('SELECT coins FROM users WHERE id = ?', ctx.user.id);
  if (user.coins < reward.cost) return fail(ctx.res, 400, 'لا تملك عملات كافية.');
  tx(() => {
    spendCoins(ctx.user.id, reward.cost);
    run('INSERT INTO user_rewards(user_id, reward_id) VALUES(?,?)', ctx.user.id, reward.id);
    logActivity(ctx.user.id, 'reward_bought', reward.code);
  });
  return json(ctx.res, 200, { ok: true, reward, coins: get('SELECT coins FROM users WHERE id = ?', ctx.user.id).coins });
}, { auth: true });

route('POST', '/api/shop/equip', async ctx => {
  const code = String(ctx.body?.code || '');
  const reward = get('SELECT * FROM rewards WHERE code = ?', code);
  if (!reward) return fail(ctx.res, 404, 'العنصر غير موجود.');
  if (!get('SELECT 1 FROM user_rewards WHERE user_id = ? AND reward_id = ?', ctx.user.id, reward.id)
      && reward.cost > 0) {
    return fail(ctx.res, 403, 'يجب شراء العنصر أولًا.');
  }
  if (reward.type === 'avatar') {
    run('UPDATE user_profiles SET avatar = ? WHERE user_id = ?', reward.asset, ctx.user.id);
  } else if (reward.type === 'frame') {
    run('UPDATE user_profiles SET frame = ? WHERE user_id = ?', reward.code, ctx.user.id);
  } else {
    run('UPDATE user_profiles SET background = ? WHERE user_id = ?', reward.code, ctx.user.id);
  }
  return json(ctx.res, 200, { ok: true, profile: getProfile(ctx.user.id) });
}, { auth: true });

// ---------------------------------------------------------------- subscriptions / multiplayer
route('GET', '/api/subscription', async ctx => {
  const state = subscriptionState(ctx.user.id);
  return json(ctx.res, 200, {
    plans: listPlans(),
    state,
    pending: pendingRequest(ctx.user.id) || null,
    history: subscriptionHistory(ctx.user.id, 12),
    freeDailyAnswers: state.dailyLimit,
  });
}, { auth: true });

route('POST', '/api/subscription/request', async ctx => {
  const body = ctx.body || {};
  const result = requestSubscription(ctx.user.id, String(body.planId || ''), {
    method: body.method, reference: body.reference, note: body.note,
  });
  if (result.error === 'plan_not_found') return fail(ctx.res, 400, 'خطة الاشتراك غير معروفة.');
  if (result.error === 'already_pending') {
    return fail(ctx.res, 409, 'لديك طلب اشتراك قيد المراجعة بالفعل.', { pending: result.pending });
  }
  logActivity(ctx.user.id, 'subscription_requested', result.subscription.plan_id);
  return json(ctx.res, 201, {
    ok: true,
    subscription: result.subscription,
    state: subscriptionState(ctx.user.id),
    pending: result.subscription,
  });
}, { auth: true });

const MP_ERRORS = {
  already_in_room: 'أنت في غرفة بالفعل. أكمل مباراتك أو اخرج منها أولًا.',
  not_enough_questions: 'لا توجد أسئلة كافية لتجهيز مباراة الآن.',
  invalid_code: 'كود الغرفة غير صالح.',
  not_found: 'لا توجد غرفة بهذا الكود. تأكد من الكود وحاول مجددًا.',
  own_room: 'لا يمكنك الانضمام إلى غرفتك — شارك الكود مع صديقك.',
  not_joinable: 'هذه الغرفة بدأت بالفعل أو أُغلقت.',
  room_full: 'الغرفة ممتلئة بالفعل.',
  no_room: 'لم تعد داخل أي غرفة.',
  not_started: 'لم يبدأ الخصم المباراة بعد.',
  not_active: 'انتهت هذه المباراة.',
  already_finished: 'أجبت عن كل الأسئلة — بانتظار خصمك.',
  invalid_choice: 'خيار غير صالح.',
  question_missing: 'تعذر تحميل السؤال التالي.',
};

function mpFail(res, code, status = 400) {
  return fail(res, status, MP_ERRORS[code] || 'تعذر إكمال العملية.', { code });
}

function requireMultiplayerAccess(ctx) {
  const access = subscriptionState(ctx.user.id);
  if (!access.active) {
    fail(ctx.res, 402, 'اللعب الجماعي متاح للمشتركين. فعّل اشتراكك للعب 1 ضد 1.', {
      code: 'SUBSCRIPTION_REQUIRED', subscription: access,
    });
    return null;
  }
  return access;
}

route('GET', '/api/mp/room', async ctx => {
  return json(ctx.res, 200, { room: currentRoom(ctx.user.id) });
}, { auth: true });

route('POST', '/api/mp/create', async ctx => {
  if (!requireMultiplayerAccess(ctx)) return;
  const result = createRoom(ctx.user.id);
  if (result.error) return mpFail(ctx.res, result.error, result.error === 'already_in_room' ? 409 : 400);
  logActivity(ctx.user.id, 'mp_created', result.room.code);
  return json(ctx.res, 201, { room: roomInfo(result.room, ctx.user.id) });
}, { auth: true });

route('POST', '/api/mp/join', async ctx => {
  if (!requireMultiplayerAccess(ctx)) return;
  const result = joinRoom(ctx.user.id, ctx.body?.code);
  if (result.error) return mpFail(ctx.res, result.error, result.error === 'already_in_room' ? 409 : 404);
  logActivity(ctx.user.id, 'mp_joined', result.room.code);
  return json(ctx.res, 201, { room: roomInfo(result.room, ctx.user.id) });
}, { auth: true });

route('POST', '/api/mp/answer', async ctx => {
  const body = ctx.body || {};
  const result = submitAnswer(ctx.user.id, body.optionId ?? body.choice);
  if (result.error) return mpFail(ctx.res, result.error, result.error === 'not_active' ? 409 : 400);
  return json(ctx.res, 200, {
    ok: true, correct: result.correct, correctOptionId: result.correctOptionId,
    questionId: result.questionId, room: result.room,
  });
}, { auth: true });

route('POST', '/api/mp/leave', async ctx => {
  const result = leaveRoom(ctx.user.id);
  logActivity(ctx.user.id, 'mp_left', result.room?.code || null);
  return json(ctx.res, 200, {
    ok: true,
    room: result.room ? roomInfo(result.room, ctx.user.id) : null,
  });
}, { auth: true });

// ---------------------------------------------------------------- bootstrap
route('GET', '/api/bootstrap', async ctx => {
  const profile = getProfile(ctx.user.id);
  const worlds = worldSummaries(ctx.user.id);
  const modes = all('SELECT * FROM game_modes ORDER BY id').map(m => ({
    ...m, unlocked: profile.level >= m.unlocked_level,
  }));
  const recent = all(
    `SELECT a.code, a.title_ar, a.title_en, a.icon, a.tier, ua.unlocked_at
       FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC LIMIT 3`, ctx.user.id
  );
  const daily = ensureDailyChallenge();
  const dailyStatus = get(
    'SELECT * FROM user_daily WHERE user_id = ? AND challenge_date = ?', ctx.user.id, daily.challenge_date
  );
  const user = get('SELECT xp FROM users WHERE id = ?', ctx.user.id);
  const pos = leaderboard('all', 1000).findIndex(r => r.id === ctx.user.id) + 1;
  return json(ctx.res, 200, {
    profile,
    worlds,
    modes,
    subscription: subscriptionState(ctx.user.id),
    wordOfDay: wordOfDay(ctx.user.id),
    daily: {
      date: daily.challenge_date,
      questionCount: JSON.parse(daily.question_ids || '[]').length,
      xpReward: daily.xp_reward, coinReward: daily.coin_reward,
      completed: !!dailyStatus?.completed_at,
    },
    recentAchievements: recent,
    reviewDue: reviewCount(ctx.user.id),
    leaderboardPosition: pos || null,
    totals: {
      terms: get('SELECT COUNT(*) AS c FROM terms WHERE active = 1').c,
      questions: get('SELECT COUNT(*) AS c FROM questions WHERE active = 1').c,
      worlds: worlds.length,
      players: get('SELECT COUNT(*) AS c FROM users WHERE status = ?', 'active').c,
    },
    xpTable: { 2: xpForLevel(2), 5: xpForLevel(5), maxLevel: MAX_LEVEL },
  });
}, { auth: true });

// ---------------------------------------------------------------- admin
route('GET', '/api/admin/overview', async ctx => {
  const counts = {
    users: get("SELECT COUNT(*) AS c FROM users WHERE role = 'player' AND is_npc = 0").c,
    terms: get('SELECT COUNT(*) AS c FROM terms WHERE active = 1').c,
    needsReview: get("SELECT COUNT(*) AS c FROM terms WHERE translation_status = 'needs_review'").c,
    questions: get('SELECT COUNT(*) AS c FROM questions WHERE active = 1').c,
    sessions: get('SELECT COUNT(*) AS c FROM play_sessions').c,
    answers: get('SELECT COUNT(*) AS c FROM user_answers').c,
    accuracy: (() => {
      const r = get('SELECT COUNT(*) AS t, SUM(is_correct) AS c FROM user_answers');
      return r?.t ? Math.round((r.c / r.t) * 1000) / 10 : 0;
    })(),
    activeToday: get(
      'SELECT COUNT(DISTINCT user_id) AS c FROM user_activity WHERE created_at >= ?',
      new Date(Date.now() - 864e5).toISOString()
    ).c,
  };
  const hardTerms = all(
    `SELECT t.id, t.english, t.arabic, c.name_ar AS category,
            SUM(ut.wrong_count) AS wrongs, COUNT(ut.user_id) AS learners
       FROM user_terms ut JOIN terms t ON t.id = ut.term_id
       JOIN categories c ON c.id = t.category_id
      GROUP BY t.id HAVING wrongs > 0 ORDER BY wrongs DESC LIMIT 10`
  );
  const hardQuestions = all(
    `SELECT q.id, q.mode, q.prompt, q.answer, COUNT(um.id) AS mistakes
       FROM user_mistakes um JOIN questions q ON q.id = um.question_id
      GROUP BY q.id ORDER BY mistakes DESC LIMIT 10`
  );
  const recentUsers = all(
    `SELECT u.id, u.username, u.xp, u.created_at, p.display_name,
            (SELECT COUNT(*) FROM user_answers a WHERE a.user_id = u.id) AS answers
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.is_npc = 0 ORDER BY u.created_at DESC LIMIT 8`
  );
  const importJobs = all('SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT 8');
  const modes = all(
    `SELECT mode, COUNT(*) AS c, SUM(is_correct) AS correct FROM user_answers GROUP BY mode ORDER BY c DESC`
  );
  return json(ctx.res, 200, { counts, hardTerms, hardQuestions, recentUsers, importJobs, modes });
}, { auth: true, admin: true });

route('GET', '/api/admin/terms', async ctx => {
  const q = String(ctx.query.q || '').trim();
  const status = String(ctx.query.status || '').trim();
  const category = String(ctx.query.category || '').trim();
  const page = Math.max(1, Number(ctx.query.page) || 1);
  const pageSize = 25;
  const where = ['1=1'];
  const params = [];
  if (q) {
    where.push('(t.english LIKE ? OR t.arabic LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status) { where.push('t.translation_status = ?'); params.push(status); }
  if (category) { where.push('c.name_ar = ?'); params.push(category); }
  const base = `FROM terms t JOIN categories c ON c.id = t.category_id WHERE ${where.join(' AND ')}`;
  const total = get(`SELECT COUNT(*) AS c ${base}`, ...params).c;
  const rows = all(
    `SELECT t.id, t.english, t.arabic, t.abbreviation, t.full_form, t.definition_ar,
            t.difficulty, t.translation_status, t.active, t.example, t.category_id,
            c.name_ar AS category
     ${base} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize
  );
  const categories = all('SELECT id, name_ar, name_en FROM categories ORDER BY name_ar');
  return json(ctx.res, 200, { terms: rows, total, page, pageSize, categories });
}, { auth: true, admin: true });

route('POST', '/api/admin/terms', async ctx => {
  const b = ctx.body || {};
  const english = String(b.english || '').trim();
  const arabic = String(b.arabic || '').trim();
  const definition = String(b.definition || '').trim();
  const categoryId = Number(b.categoryId);
  const difficulty = ['Beginner', 'Intermediate', 'Advanced'].includes(b.difficulty) ? b.difficulty : 'Beginner';
  if (!english || !arabic || !definition) return fail(ctx.res, 400, 'المصطلح الإنجليزي والترجمة والتعريف مطلوبة.');
  const category = get('SELECT * FROM categories WHERE id = ?', categoryId);
  if (!category) return fail(ctx.res, 400, 'اختر تخصصًا صالحًا.');
  if (get('SELECT id FROM terms WHERE english_key = ?', normKey(english))) {
    return fail(ctx.res, 409, 'هذا المصطلح موجود بالفعل.');
  }
  let termId;
  tx(() => {
    const stage = get('SELECT id FROM stages WHERE category_id = ?', category.id);
    const info = run(
      `INSERT INTO terms(english, english_key, abbreviation, full_form, arabic, definition_ar,
                          category_id, subcategory_id, subcategory, difficulty, example,
                          stage_id, translation_status, active)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
      english, normKey(english), String(b.abbreviation || '').trim() || null,
      String(b.fullForm || '').trim() || null, arabic, definition, category.id,
      get('SELECT id FROM subcategories WHERE category_id = ?', category.id)?.id || null,
      category.name_en, difficulty, String(b.example || '').trim() || null,
      stage?.id || null, isVerifiedArabic(arabic) ? 'verified' : 'needs_review'
    );
    termId = Number(info.lastInsertRowid);
    regenerateTermQuestions(termId);
    logActivity(ctx.user.id, 'admin_term_added', english);
  });
  return json(ctx.res, 201, { ok: true, id: termId, term: get('SELECT * FROM terms WHERE id = ?', termId) });
}, { auth: true, admin: true });

route('PUT', '/api/admin/terms/:id', async ctx => {
  const id = Number(ctx.params.id);
  const term = get('SELECT * FROM terms WHERE id = ?', id);
  if (!term) return fail(ctx.res, 404, 'المصطلح غير موجود.');
  const b = ctx.body || {};
  const english = b.english !== undefined ? String(b.english).trim() : term.english;
  const arabic = b.arabic !== undefined ? String(b.arabic).trim() : term.arabic;
  const definition = b.definition !== undefined ? String(b.definition).trim() : term.definition_ar;
  const difficulty = ['Beginner', 'Intermediate', 'Advanced'].includes(b.difficulty) ? b.difficulty : term.difficulty;
  const categoryId = b.categoryId ? Number(b.categoryId) : term.category_id;
  if (!english || !arabic || !definition) return fail(ctx.res, 400, 'الحقول الأساسية لا يمكن أن تكون فارغة.');
  const duplicate = get('SELECT id FROM terms WHERE english_key = ? AND id <> ?', normKey(english), id);
  if (duplicate) return fail(ctx.res, 409, 'يوجد مصطلح آخر بنفس الاسم الإنجليزي.');
  const category = get('SELECT * FROM categories WHERE id = ?', categoryId);
  if (!category) return fail(ctx.res, 400, 'تخصص غير صالح.');
  const stage = get('SELECT id FROM stages WHERE category_id = ?', category.id);
  tx(() => {
    run(
      `UPDATE terms SET english = ?, english_key = ?, abbreviation = ?, full_form = ?, arabic = ?,
              definition_ar = ?, category_id = ?, subcategory = ?, difficulty = ?, example = ?,
              related_terms = ?, stage_id = ?, translation_status = ?, updated_at = ?
        WHERE id = ?`,
      english, normKey(english),
      b.abbreviation !== undefined ? String(b.abbreviation).trim() || null : term.abbreviation,
      b.fullForm !== undefined ? String(b.fullForm).trim() || null : term.full_form,
      arabic, definition, category.id, category.name_en, difficulty,
      b.example !== undefined ? String(b.example).trim() || null : term.example,
      b.relatedTerms !== undefined ? String(b.relatedTerms).trim() || null : term.related_terms,
      stage?.id || term.stage_id,
      isVerifiedArabic(arabic) ? 'verified' : 'needs_review', nowIso(), id
    );
    regenerateTermQuestions(id);
    logActivity(ctx.user.id, 'admin_term_updated', String(id));
  });
  return json(ctx.res, 200, { ok: true, term: get('SELECT * FROM terms WHERE id = ?', id) });
}, { auth: true, admin: true });

route('DELETE', '/api/admin/terms/:id', async ctx => {
  const id = Number(ctx.params.id);
  const term = get('SELECT * FROM terms WHERE id = ?', id);
  if (!term) return fail(ctx.res, 404, 'المصطلح غير موجود.');
  run('UPDATE terms SET active = 0, updated_at = ? WHERE id = ?', nowIso(), id);
  run('UPDATE questions SET active = 0 WHERE term_id = ?', id);
  logActivity(ctx.user.id, 'admin_term_deleted', String(id));
  return json(ctx.res, 200, { ok: true });
}, { auth: true, admin: true });

route('POST', '/api/admin/terms/:id/restore', async ctx => {
  const id = Number(ctx.params.id);
  if (!get('SELECT id FROM terms WHERE id = ?', id)) return fail(ctx.res, 404, 'المصطلح غير موجود.');
  run('UPDATE terms SET active = 1 WHERE id = ?', id);
  // Only restore canonical questions; retired ones (replaced after an edit)
  // must stay inactive or the term would be served twice in gameplay.
  run("UPDATE questions SET active = 1 WHERE term_id = ? AND instr(qkey, ':retired:') = 0", id);
  return json(ctx.res, 200, { ok: true });
}, { auth: true, admin: true });

route('GET', '/api/admin/questions', async ctx => {
  const mode = String(ctx.query.mode || '').trim();
  const q = String(ctx.query.q || '').trim();
  const page = Math.max(1, Number(ctx.query.page) || 1);
  const pageSize = 20;
  const where = ['1=1'];
  const params = [];
  if (mode) { where.push('q.mode = ?'); params.push(mode); }
  if (q) { where.push('(q.prompt LIKE ? OR q.answer LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const base = `FROM questions q LEFT JOIN terms t ON t.id = q.term_id WHERE ${where.join(' AND ')}`;
  const total = get(`SELECT COUNT(*) AS c ${base}`, ...params).c;
  const rows = all(
    `SELECT q.id, q.mode, q.prompt, q.prompt_ar, q.answer, q.explanation, q.difficulty,
            q.active, t.english AS term, t.arabic AS term_ar
     ${base} ORDER BY q.id DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize
  ).map(r => ({
    ...r,
    options: all('SELECT id, text, is_correct FROM question_options WHERE question_id = ? ORDER BY sort', r.id),
  }));
  const modes = all('SELECT mode, COUNT(*) AS c FROM questions GROUP BY mode');
  return json(ctx.res, 200, { questions: rows, total, page, pageSize, modes });
}, { auth: true, admin: true });

route('PUT', '/api/admin/questions/:id', async ctx => {
  const id = Number(ctx.params.id);
  const q = get('SELECT * FROM questions WHERE id = ?', id);
  if (!q) return fail(ctx.res, 404, 'السؤال غير موجود.');
  const b = ctx.body || {};
  const prompt = b.prompt !== undefined ? String(b.prompt) : q.prompt;
  const promptAr = b.promptAr !== undefined ? String(b.promptAr) : q.prompt_ar;
  const explanation = b.explanation !== undefined ? String(b.explanation) : q.explanation;
  const difficulty = ['Beginner', 'Intermediate', 'Advanced'].includes(b.difficulty) ? b.difficulty : q.difficulty;
  const options = Array.isArray(b.options) ? b.options : null;
  let answer = b.answer !== undefined ? String(b.answer) : q.answer;
  tx(() => {
    if (options && options.length) {
      if (options.length < 2) throw Object.assign(new Error('يجب أن يحتوي السؤال على خيارين على الأقل.'), { status: 400 });
      const correct = options.filter(o => o.isCorrect);
      if (correct.length !== 1) throw Object.assign(new Error('يجب تحديد إجابة صحيحة واحدة فقط.'), { status: 400 });
      run('DELETE FROM question_options WHERE question_id = ?', id);
      options.forEach((o, i) => {
        run(
          'INSERT INTO question_options(question_id, text, is_correct, sort) VALUES(?,?,?,?)',
          id, String(o.text), o.isCorrect ? 1 : 0, i + 1
        );
      });
      answer = String(correct[0].text);
    }
    run(
      'UPDATE questions SET prompt = ?, prompt_ar = ?, answer = ?, explanation = ?, difficulty = ?, active = ? WHERE id = ?',
      prompt, promptAr, answer, explanation, difficulty, b.active === false ? 0 : 1, id
    );
    logActivity(ctx.user.id, 'admin_question_updated', String(id));
  });
  return json(ctx.res, 200, { ok: true });
}, { auth: true, admin: true });

route('GET', '/api/admin/users', async ctx => {
  const q = String(ctx.query.q || '').trim();
  const where = ['u.is_npc = 0'];
  const params = [];
  if (q) { where.push('(u.username LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const rows = all(
    `SELECT u.id, u.username, u.email, u.role, u.status, u.xp, u.coins, u.created_at, u.last_login_at,
            p.display_name, p.current_streak,
            (SELECT COUNT(*) FROM user_answers a WHERE a.user_id = u.id) AS answers
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT 100`, ...params
  ).map(r => {
    const level = levelFromXp(r.xp);
    return { ...r, level, rank: rankForLevel(level) };
  });
  return json(ctx.res, 200, { users: rows });
}, { auth: true, admin: true });

route('PUT', '/api/admin/users/:id', async ctx => {
  const id = Number(ctx.params.id);
  const user = get('SELECT * FROM users WHERE id = ?', id);
  if (!user) return fail(ctx.res, 404, 'المستخدم غير موجود.');
  if (user.id === ctx.user.id) return fail(ctx.res, 400, 'لا يمكنك تعديل حسابك من هنا.');
  const b = ctx.body || {};
  const status = ['active', 'banned'].includes(b.status) ? b.status : user.status;
  const role = ['player', 'admin'].includes(b.role) ? b.role : user.role;
  run('UPDATE users SET status = ?, role = ? WHERE id = ?', status, role, id);
  logActivity(ctx.user.id, 'admin_user_updated', `${id}:${status}:${role}`);
  return json(ctx.res, 200, { ok: true });
}, { auth: true, admin: true });

// ---- subscriptions
route('GET', '/api/admin/subscriptions', async ctx => {
  return json(ctx.res, 200, {
    ...adminSubscriptionQueue(100),
    plans: listPlans(),
  });
}, { auth: true, admin: true });

route('POST', '/api/admin/subscriptions/:id/approve', async ctx => {
  const note = String(ctx.body?.note || '');
  const row = approveRequest(ctx.params.id, ctx.user.id, note);
  if (!row) return fail(ctx.res, 404, 'الطلب غير موجود أو تمت معالجته بالفعل.');
  logActivity(row.user_id, 'subscription_approved', `${row.plan_id}:${row.ends_at}`);
  return json(ctx.res, 200, { ok: true, subscription: row });
}, { auth: true, admin: true });

route('POST', '/api/admin/subscriptions/:id/reject', async ctx => {
  const note = String(ctx.body?.note || '');
  const row = rejectRequest(ctx.params.id, ctx.user.id, note);
  if (!row) return fail(ctx.res, 404, 'الطلب غير موجود أو تمت معالجته بالفعل.');
  logActivity(row.user_id, 'subscription_rejected', row.plan_id);
  return json(ctx.res, 200, { ok: true, subscription: row });
}, { auth: true, admin: true });

route('POST', '/api/admin/subscriptions/grant', async ctx => {
  const body = ctx.body || {};
  const user = body.userId
    ? get('SELECT * FROM users WHERE id = ?', Number(body.userId))
    : get('SELECT * FROM users WHERE username = ?', String(body.username || '').trim());
  if (!user) return fail(ctx.res, 404, 'المستخدم غير موجود.');
  const row = grantSubscription(user.id, String(body.planId || ''), {
    adminId: ctx.user.id, method: 'admin', note: body.note,
  });
  if (!row) return fail(ctx.res, 400, 'خطة الاشتراك غير معروفة.');
  logActivity(user.id, 'subscription_granted', `${row.plan_id}:${row.ends_at}`);
  return json(ctx.res, 201, { ok: true, subscription: row, state: subscriptionState(user.id) });
}, { auth: true, admin: true });

route('GET', '/api/admin/settings', async ctx => {
  const rows = all('SELECT * FROM game_settings ORDER BY key');
  return json(ctx.res, 200, { settings: rows });
}, { auth: true, admin: true });

route('PUT', '/api/admin/settings', async ctx => {
  const allowed = new Set(['xp_correct', 'speed_seconds', 'daily_question_count', 'game_version']);
  const b = ctx.body || {};
  tx(() => {
    for (const [k, v] of Object.entries(b)) {
      if (allowed.has(k)) setSetting(k, String(v));
    }
  });
  return json(ctx.res, 200, { ok: true, settings: all('SELECT * FROM game_settings ORDER BY key') });
}, { auth: true, admin: true });

// ---- import / export
route('POST', '/api/admin/import', async ctx => {
  if (!ctx.raw || !ctx.raw.length) return fail(ctx.res, 400, 'لم يُرفع أي ملف.');
  let sheets;
  try {
    sheets = parseXlsx(ctx.raw);
  } catch (err) {
    return fail(ctx.res, 400, 'تعذر قراءة ملف Excel: ' + err.message);
  }
  const rows = sheets.Programming_Glossary || sheets.Glossary || [];
  if (!rows.length) return fail(ctx.res, 400, 'الملف لا يحتوي ورقة Programming_Glossary أو أنها فارغة.');
  const dry = ctx.query.dry === '1';
  const result = { inserted: 0, updated: 0, skipped: 0, errors: [], createdCategories: 0 };
  const header = Object.keys(rows[0] || {});
  const pick = (r, ...names) => {
    for (const n of names) if (r[n] !== undefined) return r[n];
    return '';
  };
  if (!header.some(h => /English_Term|English|Term/.test(h))) {
    return fail(ctx.res, 400, 'الملف لا يحتوي عمود English_Term.');
  }

  const work = () => {
    for (const r of rows) {
      try {
        const english = String(pick(r, 'English_Term', 'English', 'Term')).trim();
        const arabic = String(pick(r, 'Arabic_Term', 'Arabic', 'Translation')).trim();
        const definition = String(pick(r, 'Definition_AR', 'Definition')).trim();
        const categoryAr = String(pick(r, 'Category_AR', 'Category')).trim();
        const categoryEn = String(pick(r, 'Subcategory', 'Category_EN')).trim();
        if (!english || !arabic || !definition || !categoryAr) {
          result.skipped++;
          if (result.errors.length < 20) result.errors.push(`صف ناقص: ${english || '(بدون اسم)'}`);
          continue;
        }
        let category = get('SELECT * FROM categories WHERE name_ar = ?', categoryAr);
        if (!category) {
          result.createdCategories++;
          if (dry) {
            // Never mutate on a dry run — only report what would happen.
            category = { id: 0, name_en: categoryEn || categoryAr, name_ar: categoryAr };
          } else {
            const world = get('SELECT * FROM worlds ORDER BY sort DESC LIMIT 1');
            const sort = (get('SELECT MAX(sort) AS s FROM categories')?.s || 0) + 1;
            const catInfo = run(
              'INSERT INTO categories(name_en, name_ar, world_id, sort) VALUES(?,?,?,?)',
              categoryEn || categoryAr, categoryAr, world.id, sort
            );
            const catId = Number(catInfo.lastInsertRowid);
            const subInfo = run(
              'INSERT INTO subcategories(category_id, name_en, name_ar) VALUES(?,?,?)',
              catId, categoryEn || categoryAr, categoryAr
            );
            const stInfo = run(
              `INSERT INTO stages(world_id, category_id, name_ar, name_en, sort, required_level, xp_reward, coin_reward)
               VALUES(?,?,?,?,?,?,?,?)`,
              world.id, catId, categoryAr, categoryEn || categoryAr, sort, 1, 70, 18
            );
            category = get('SELECT * FROM categories WHERE id = ?', catId);
            category._subId = Number(subInfo.lastInsertRowid);
            category._stageId = Number(stInfo.lastInsertRowid);
          }
        }
        const difficulty = ['Beginner', 'Intermediate', 'Advanced'].includes(String(pick(r, 'Difficulty')).trim())
          ? String(pick(r, 'Difficulty')).trim() : 'Beginner';
        const stage = category.id ? get('SELECT id FROM stages WHERE category_id = ?', category.id) : null;
        const sub = category.id ? get('SELECT id FROM subcategories WHERE category_id = ?', category.id) : null;
        const existing = get('SELECT * FROM terms WHERE english_key = ?', normKey(english));
        if (existing) {
          if (!dry) {
            run(
              `UPDATE terms SET arabic = ?, definition_ar = ?, category_id = ?, subcategory_id = ?,
                      subcategory = ?, difficulty = ?, example = ?, abbreviation = ?, full_form = ?,
                      related_terms = ?, stage_id = ?, translation_status = ?, updated_at = ?
                WHERE id = ?`,
              arabic, definition, category.id, sub?.id || null, categoryEn || category.name_en,
              difficulty, String(pick(r, 'Example')).trim() || existing.example,
              String(pick(r, 'Abbreviation')).trim() || existing.abbreviation,
              String(pick(r, 'Full_Form')).trim() || existing.full_form,
              String(pick(r, 'Related_Terms')).trim() || existing.related_terms,
              stage?.id || existing.stage_id,
              isVerifiedArabic(arabic) ? 'verified' : 'needs_review', nowIso(), existing.id
            );
            regenerateTermQuestions(existing.id);
          }
          result.updated++;
        } else {
          if (!dry) {
            const info = run(
              `INSERT INTO terms(english, english_key, abbreviation, full_form, arabic, definition_ar,
                                  category_id, subcategory_id, subcategory, difficulty, example,
                                  related_terms, stage_id, translation_status, active)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
              english, normKey(english), String(pick(r, 'Abbreviation')).trim() || null,
              String(pick(r, 'Full_Form')).trim() || null, arabic, definition, category.id,
              sub?.id || null, categoryEn || category.name_en, difficulty,
              String(pick(r, 'Example')).trim() || null,
              String(pick(r, 'Related_Terms')).trim() || null,
              stage?.id || null, isVerifiedArabic(arabic) ? 'verified' : 'needs_review'
            );
            regenerateTermQuestions(Number(info.lastInsertRowid));
          }
          result.inserted++;
        }
      } catch (err) {
        result.skipped++;
        if (result.errors.length < 20) result.errors.push(err.message);
      }
    }
    if (!dry) {
      run(
        'INSERT INTO import_jobs(filename, status, message, inserted, updated, skipped, created_at) VALUES(?,?,?,?,?,?,?)',
        String(ctx.bodyFilename || 'upload.xlsx'),
        result.skipped ? 'partial' : 'ok',
        result.createdCategories ? `تخصصات جديدة: ${result.createdCategories}` : 'تم الاستيراد',
        result.inserted, result.updated, result.skipped, nowIso()
      );
      logActivity(ctx.user.id, 'admin_import', `${result.inserted}/${result.updated}/${result.skipped}`);
    }
  };
  try {
    if (dry) work(); else tx(work);
  } catch (err) {
    return fail(ctx.res, 400, 'فشل الاستيراد: ' + err.message);
  }
  return json(ctx.res, 200, { dryRun: dry, ...result });
}, { auth: true, admin: true, raw: true });

route('GET', '/api/admin/export', async ctx => {
  const type = String(ctx.query.type || 'terms');
  let sheets;
  if (type === 'questions') {
    const rows = all(
      `SELECT q.id, q.mode, q.prompt, q.prompt_ar, q.answer, q.explanation, q.difficulty,
              q.active, t.english AS term
         FROM questions q LEFT JOIN terms t ON t.id = q.term_id ORDER BY q.id`
    ).map(q => {
      const opts = all('SELECT text, is_correct FROM question_options WHERE question_id = ? ORDER BY sort', q.id);
      return [
        q.id, q.mode, q.term || '', q.prompt, q.prompt_ar || '', q.answer,
        opts.map(o => o.text).join(' | '),
        opts.filter(o => o.is_correct).map(o => o.text).join(' | '),
        q.difficulty || '', q.explanation || '', q.active,
      ];
    });
    sheets = [{
      name: 'Questions',
      rows: [['ID', 'Mode', 'Term', 'Prompt', 'Prompt_AR', 'Answer', 'Options', 'Correct_Option', 'Difficulty', 'Explanation', 'Active'], ...rows],
    }];
  } else {
    const rows = all(
      `SELECT t.id, t.english, t.abbreviation, t.full_form, t.arabic, t.definition_ar,
              c.name_ar AS category, t.subcategory, t.difficulty, t.example, t.related_terms,
              t.translation_status
         FROM terms t JOIN categories c ON c.id = t.category_id
        WHERE t.active = 1 ORDER BY t.id`
    ).map(t => [
      t.id, t.english, t.abbreviation || '', t.full_form || '', t.arabic, t.definition_ar,
      t.category, t.subcategory || '', t.difficulty, t.example || '', t.related_terms || '',
      t.translation_status,
    ]);
    sheets = [{
      name: 'Programming_Glossary',
      rows: [['ID', 'English_Term', 'Abbreviation', 'Full_Form', 'Arabic_Term', 'Definition_AR', 'Category', 'Subcategory', 'Difficulty', 'Example', 'Related_Terms', 'Translation_Status'], ...rows],
    }];
  }
  const buf = buildXlsx(sheets);
  ctx.res.writeHead(200, {
    'Content-Type': MIME['.xlsx'],
    'Content-Disposition': `attachment; filename="codequest-${type}-${todayKey()}.xlsx"`,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  ctx.res.end(buf);
}, { auth: true, admin: true, rawResponse: true });

route('GET', '/api/admin/categories', async ctx => {
  const rows = all(
    `SELECT c.id, c.name_ar, c.name_en, w.code AS world_code, w.name_ar AS world_ar,
            (SELECT COUNT(*) FROM terms t WHERE t.category_id = c.id AND t.active = 1) AS terms
       FROM categories c JOIN worlds w ON w.id = c.world_id ORDER BY c.sort`
  );
  return json(ctx.res, 200, { categories: rows });
}, { auth: true, admin: true });

// ---------------------------------------------------------------- static files
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
  if (!path.extname(rel) && !rel.startsWith('/assets/')) rel = '/index.html';
  const filePath = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT' && rel !== '/index.html') {
        return serveStatic(req, res, '/index.html');
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': path.extname(filePath) === '.html' ? 'no-store' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------- server
pruneExpiredSessions();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  // security headers
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!pathname.startsWith('/api/')) {
    return serveStatic(req, res, pathname);
  }

  const matched = matchRoute(req.method, pathname);
  if (!matched) return fail(res, 404, 'المسار غير موجود.');
  const { route: r, params } = matched;

  try {
    const user = authUser(req);
    if (r.auth && !user) return fail(res, 401, 'يجب تسجيل الدخول أولًا.');
    if (r.admin && user?.role !== 'admin') return fail(res, 403, 'هذه الصفحة للمدير فقط.');

    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const isPublicAuth = pathname === '/api/auth/login' || pathname === '/api/auth/register';
    if (mutating && !isPublicAuth && user) {
      const token = req.headers['x-csrf-token'];
      if (!token || token !== user.csrf) return fail(res, 403, 'رمز الحماية CSRF غير صالح. أعد تحميل الصفحة.');
    }

    let body = null;
    let raw = null;
    if (mutating) {
      const buf = await readBody(req, r.raw ? 15 * 1024 * 1024 : 2 * 1024 * 1024);
      if (r.raw) {
        raw = buf;
      } else if (buf.length) {
        const type = String(req.headers['content-type'] || '');
        if (type.includes('application/json')) {
          try { body = JSON.parse(buf.toString('utf8')); }
          catch { return fail(res, 400, 'صيغة JSON غير صالحة.'); }
        } else {
          body = Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
        }
      }
    }

    const ctx = {
      req, res, user, params, body, raw,
      bodyFilename: String(req.headers['x-filename'] || 'upload.xlsx'),
      query: Object.fromEntries(url.searchParams.entries()),
    };
    await r.handler(ctx);
  } catch (err) {
    if (!res.headersSent) {
      console.error('[API]', req.method, pathname, err);
      fail(res, err.status || 500, err.status ? err.message : 'حدث خطأ غير متوقع في الخادم.');
    } else {
      try { res.end(); } catch { /* noop */ }
    }
  }
});

server.listen(PORT, HOST, () => {
  const terms = get('SELECT COUNT(*) AS c FROM terms').c;
  const questions = get('SELECT COUNT(*) AS c FROM questions').c;
  console.log('┌──────────────────────────────────────────────┐');
  console.log('│  CODE QUEST — Learn the language of coders   │');
  console.log('└──────────────────────────────────────────────┘');
  console.log(`  http://${HOST}:${PORT}`);
  console.log(`  المصطلحات: ${terms} | الأسئلة: ${questions}`);
  if (!terms) console.log('  ⚠ قاعدة البيانات فارغة — شغّل: npm run seed -- --force');
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('unhandledRejection', err => console.error('unhandledRejection', err));
