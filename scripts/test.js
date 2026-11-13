#!/usr/bin/env node
/**
 * CODE QUEST — end-to-end smoke + integrity test.
 *
 * Boots an isolated, freshly-seeded database (data/test-runtime.db), starts the
 * real HTTP server on a random port, then exercises every public route, all
 * eight game modes, progression, daily/review, dictionary, shop, profile,
 * leaderboard, achievements and the admin console (including XLSX import/export).
 *
 * Usage:  npm test            (cleans up afterwards)
 *         CQ_TEST_KEEP=1 npm test   (keeps the test DB + prints the port)
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { buildXlsx, parseXlsx } from '../src/xlsx.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'test-runtime.db');
const KEEP = process.env.CQ_TEST_KEEP === '1';
const PORT = 5100 + Math.floor(Math.random() * 700);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PASS = 'CodeQuest!2026';

let passed = 0;
let failed = 0;
const failures = [];
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n\x1b[36m── ${name} ${'─'.repeat(Math.max(3, 58 - name.length))}\x1b[0m`);
}

function check(cond, message, extra) {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
  } else {
    failed++;
    failures.push(`[${currentSection}] ${message}${extra ? ` — ${extra}` : ''}`);
    console.log(`  \x1b[31m✗ ${message}${extra ? ` — ${extra}` : ''}\x1b[0m`);
  }
  return !!cond;
}

const eq = (actual, expected, message) =>
  check(Object.is(actual, expected), message, actual === expected ? '' : `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

const gte = (actual, min, message) =>
  check(Number(actual) >= min, message, `got ${JSON.stringify(actual)}, want >= ${min}`);

const includes = (haystack, needle, message) =>
  check(String(haystack).includes(needle), message, `missing ${JSON.stringify(needle)}`);

const hasKeys = (obj, keys, message) =>
  check(obj && keys.every(k => obj[k] !== undefined), message,
    obj ? `missing ${keys.filter(k => obj[k] === undefined)}` : 'no object');

const isArray = (v, message, min = 0) =>
  check(Array.isArray(v) && v.length >= min, message, `got ${Array.isArray(v) ? v.length : typeof v}`);

/* ------------------------------------------------------------------ HTTP client */
class Client {
  constructor(base = BASE) {
    this.base = base;
    this.cookies = new Map();
    this.csrf = null;
  }

  async req(method, url, { body, buf, filename, headers = {}, noCsrf = false, timeout = 30000 } = {}) {
    const h = { ...headers };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (this.csrf && !noCsrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      h['x-csrf-token'] = this.csrf;
    }
    let payload;
    if (buf) {
      payload = buf;
      h['content-type'] = h['content-type'] || 'application/octet-stream';
      if (filename) h['x-filename'] = filename;
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      h['content-type'] = 'application/json';
    }
    const res = await fetch(this.base + url, {
      method, headers: h, body: payload, signal: AbortSignal.timeout(timeout),
    });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const pair = raw.split(';')[0];
      const idx = pair.indexOf('=');
      if (idx < 0) continue;
      const key = pair.slice(0, idx);
      const val = pair.slice(idx + 1);
      if (val === '') this.cookies.delete(key);
      else this.cookies.set(key, val);
    }
    const type = res.headers.get('content-type') || '';
    let data = null;
    let buffer = null;
    if (type.includes('application/json')) data = await res.json();
    else buffer = Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, buffer, headers: res.headers };
  }

  get(url, opts) { return this.req('GET', url, opts); }
  post(url, body, opts = {}) { return this.req('POST', url, { ...opts, body }); }
  put(url, body, opts = {}) { return this.req('PUT', url, { ...opts, body }); }
  del(url, opts = {}) { return this.req('DELETE', url, { ...opts, body: {} }); }

  async login(login, password) {
    const res = await this.post('/api/auth/login', { login, password });
    if (res.status === 200) this.csrf = res.data.csrf;
    return res;
  }
}

/* ------------------------------------------------------------------ child process helpers */
function removeDbFiles(file) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { fs.rmSync(file + suffix, { force: true }); } catch { /* noop */ }
  }
}

function runSeed() {
  const seed = spawnSync(process.execPath, ['src/seed.js'], {
    cwd: ROOT,
    env: { ...process.env, CODEQUEST_DB: DB_PATH },
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (seed.status !== 0) {
    console.error('\n✗ فشل تجهيز قاعدة بيانات الاختبار');
    console.error(seed.stdout || '');
    console.error(seed.stderr || '');
    process.exit(1);
  }
  return seed.stdout || '';
}

function waitForReady() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 45000;
    const attempt = async () => {
      try {
        const res = await fetch(`${BASE}/api/auth/me`, { signal: AbortSignal.timeout(2000) });
        if (res.status === 200) return resolve();
      } catch { /* not up yet */ }
      if (Date.now() > deadline) return reject(new Error('انتهت مهلة تشغيل الخادم'));
      setTimeout(attempt, 180);
    };
    attempt();
  });
}

function stopServer(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      resolve();
    }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    try { child.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
  });
}

/* ------------------------------------------------------------------ DB helpers */
let tdb;
const q1 = (sql, ...p) => tdb.prepare(sql).get(...p);
const qa = (sql, ...p) => tdb.prepare(sql).all(...p);
const qrun = (sql, ...p) => tdb.prepare(sql).run(...p);

function correctOption(questionId) {
  return q1('SELECT id, text FROM question_options WHERE question_id = ? AND is_correct = 1', questionId);
}
function wrongOption(questionId) {
  return q1('SELECT id, text FROM question_options WHERE question_id = ? AND is_correct = 0 ORDER BY sort LIMIT 1', questionId);
}
function questionRow(questionId) {
  return q1('SELECT * FROM questions WHERE id = ?', questionId);
}

async function sendAnswer(client, sessionId, question, { correct = true, normalize = false } = {}) {
  const row = questionRow(question.id);
  const opts = qa('SELECT id, text, is_correct FROM question_options WHERE question_id = ? ORDER BY sort', question.id);
  if (!opts.length) {
    let text = row?.answer || '';
    if (!correct) text = 'definitely-wrong-answer';
    else if (normalize) text = `  ${String(text).toUpperCase()}  `;
    return client.post('/api/play/answer', {
      sessionId, questionId: question.id, answerText: text, timeMs: 1200,
    });
  }
  const good = opts.find(o => o.is_correct);
  const bad = opts.find(o => !o.is_correct);
  return client.post('/api/play/answer', {
    sessionId,
    questionId: question.id,
    optionId: (correct ? good : bad)?.id,
    timeMs: 1200,
  });
}

async function answerAll(client, session, { correct = true, max = Infinity } = {}) {
  const out = [];
  for (const q of session.questions.slice(0, max)) {
    const res = await sendAnswer(client, session.id, q, { correct });
    out.push(res);
    if (res.data?.failed) break;
  }
  return out;
}

/* ------------------------------------------------------------------ boot */
let server;
let seedOut = '';
const startedAt = Date.now();

async function main() {
  removeDbFiles(DB_PATH);

  section('تجهيز بيئة الاختبار');
  console.log('  … بناء قاعدة بيانات معزولة من ملف Excel الأصلي');
  seedOut = runSeed();
  check(fs.existsSync(DB_PATH), 'أُنشئت قاعدة بيانات الاختبار');
  const seedCounts = (seedOut.match(/المصطلحات:\s*(\d+)/) || [])[1];
  check(!!seedCounts, 'انتهى الاستيراد الأولي بنجاح', seedOut.split('\n').slice(-4).join(' '));

  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, CODEQUEST_DB: DB_PATH, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let serverLog = '';
  server.stdout.on('data', d => { serverLog += d.toString(); });
  server.stderr.on('data', d => { serverLog += d.toString(); });
  server.on('exit', code => { if (code && code !== 0) console.error('[server exited]', code, serverLog.slice(-2000)); });
  await waitForReady();
  console.log(`  … الخادم يعمل على ${BASE}`);
  check(true, 'الخادم يستجيب للطلبات');

  tdb = new DatabaseSync(DB_PATH);

  const anon = new Client();
  const player = new Client();
  const admin = new Client();
  const rival = new Client();

  const suffix = Date.now().toString(36).slice(-6);
  // Term names used for import/create probes must be letters-only so a word-puzzle
  // question can be generated for them (the puzzle supports 4-20 Latin letters).
  const suffixLetters = 'zeta';
  const username = `TestHero_${suffix}`;
  const email = `test_${suffix}@codequest.test`;

  /* ---------------------------------------------------------------- A. static */
  section('A. الملفات الثابتة والواجهة');
  {
    const home = await anon.get('/');
    eq(home.status, 200, 'GET / يعيد 200');
    includes(home.buffer?.toString(), 'CODE QUEST', 'صفحة اللعبة تحتوي اسم اللعبة');
    includes(home.buffer?.toString(), '/js/app.js', 'صفحة اللعبة تحمّل app.js');

    const adminPage = await anon.get('/admin');
    eq(adminPage.status, 200, 'GET /admin يعيد 200');
    includes(adminPage.buffer?.toString(), 'admin.js', 'لوحة الإدارة تحمّل admin.js');
    includes(adminPage.buffer?.toString(), '/css/admin.css', 'لوحة الإدارة تحمّل admin.css');

    const css = await anon.get('/css/app.css');
    eq(css.status, 200, 'GET /css/app.css يعيد 200');
    includes(css.buffer?.toString(), '--bg:', 'CSS يحتوي متغيرات التصميم');

    const logo = await anon.get('/assets/logo.svg');
    eq(logo.status, 200, 'GET /assets/logo.svg يعيد 200');
    includes(logo.buffer?.toString(), '<svg', 'الشعار SVG صالح');

    const adminCss = await anon.get('/css/admin.css');
    eq(adminCss.status, 200, 'GET /css/admin.css يعيد 200');

    const playJs = await anon.get('/js/views/play.js');
    eq(playJs.status, 200, 'GET /js/views/play.js يعيد 200');

    // every frontend module must parse
    const files = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) files.push(full);
      }
    })(path.join(ROOT, 'public', 'js'));
    const bad = [];
    for (const file of files) {
      const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
      if (r.status !== 0) bad.push(`${path.relative(ROOT, file)}: ${r.stderr.split('\n')[0]}`);
    }
    check(bad.length === 0, `كل ملفات الواجهة (${files.length}) صالحة نحويًا`, bad.join(' | '));

    // router targets exist
    const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
    const imports = [...appSrc.matchAll(/import\('\.\/([^']+)'\)/g)].map(m => m[1]);
    const missing = imports.filter(rel => !fs.existsSync(path.join(ROOT, 'public', 'js', rel)));
    const uniqueViews = new Set(imports.filter(rel => rel.startsWith('views/')));
    check(missing.length === 0, `كل مسارات الراوتر (${imports.length}) لها ملفات`, missing.join(', '));
    eq(uniqueViews.size, 14, 'الراوتر يغطي 14 ملف عرض ديناميكيًا');
    const viewFiles = fs.readdirSync(path.join(ROOT, 'public', 'js', 'views'))
      .filter(name => name.endsWith('.js'));
    eq(viewFiles.length, 15, 'مجلد العروض يحتوي 15 ملفًا (14 راوتر + المصادقة)');

    // Every static string wired to data-i18n must exist in both dictionaries,
    // otherwise the English UI silently keeps Arabic labels.
    const ui = await import(pathToFileURL(path.join(ROOT, 'public', 'js', 'ui.js')).href);
    const indexSrc = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    const staticKeys = [...new Set([...indexSrc.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)].map(m => m[1]))];
    gte(staticKeys.length, 10, 'الواجهة الثابتة تستخدم مفاتيح تعريب');
    const missingAr = staticKeys.filter(k => ui.L.ar[k] === undefined);
    const missingEn = staticKeys.filter(k => ui.L.en[k] === undefined);
    eq(missingAr.length, 0, 'كل مفاتيح الواجهة الثابتة موجودة في القاموس العربي', missingAr.join(', '));
    eq(missingEn.length, 0, 'كل مفاتيح الواجهة الثابتة موجودة في القاموس الإنجليزي', missingEn.join(', '));
    eq(Object.keys(ui.L.ar).length, Object.keys(ui.L.en).length, 'القاموسان العربي والإنجليزي متطابقان في المفاتيح');

    includes(indexSrc, 'data-i18n="multiplayer"', 'رابط اللعب الجماعي مفهرس للترجمة');
    includes(indexSrc, 'data-i18n="subscription"', 'رابط الاشتراك مفهرس للترجمة');
    const adminSrc = fs.readFileSync(path.join(ROOT, 'public', 'js', 'admin.js'), 'utf8');
    includes(adminPage.buffer?.toString(), 'data-tab="subscriptions"', 'لوحة الإدارة تعرض تبويب الاشتراكات');
    includes(adminSrc, 'renderSubscriptions', 'تبويب الاشتراكات موصول بمنطق العرض');
  }

  /* ---------------------------------------------------------------- B. auth & security */
  section('B. التسجيل والدخول والحماية');
  {
    const me = await anon.get('/api/auth/me');
    eq(me.status, 200, 'GET /api/auth/me يعمل');
    eq(me.data.user, null, 'زائر بلا جلسة');

    const shortName = await anon.post('/api/auth/register', {
      username: 'ab', email: 'x@y.dev', password: '12345678',
    });
    eq(shortName.status, 400, 'رفض اسم مستخدم قصير');

    const badMail = await anon.post('/api/auth/register', {
      username: `BadMail_${suffix}`, email: 'not-an-email', password: '12345678',
    });
    eq(badMail.status, 400, 'رفض بريد إلكتروني غير صالح');

    const shortPass = await anon.post('/api/auth/register', {
      username: `ShortPass_${suffix}`, email: `sp_${suffix}@test.dev`, password: '123',
    });
    eq(shortPass.status, 400, 'رفض كلمة مرور قصيرة');

    const reg = await player.post('/api/auth/register', {
      username, email, password: 'TestPass!2026', displayName: 'بطل الاختبار',
    });
    eq(reg.status, 201, 'تسجيل لاعب جديد');
    hasKeys(reg.data, ['user', 'csrf'], 'استجابة التسجيل تحتوي user و csrf');
    player.csrf = reg.data.csrf;
    hasKeys(reg.data.user, ['id', 'username', 'profile', 'level', 'rank', 'coins'], 'ملف اللاعب يعود كاملًا');
    const playerId = reg.data.user.id;
    eq(reg.data.user.username, username, 'اسم المستخدم صحيح');
    gte(reg.data.user.level, 1, 'المستوى الابتدائي صالح');

    const me2 = await player.get('/api/auth/me');
    eq(me2.data.user.id, playerId, 'الجلسة محفوظة عبر الكوكي');
    eq(me2.data.csrf, player.csrf, 'رمز CSRF يطابق');

    const dupName = await anon.post('/api/auth/register', {
      username, email: `other_${suffix}@test.dev`, password: 'TestPass!2026',
    });
    eq(dupName.status, 409, 'رفض تكرار اسم المستخدم');

    const dupMail = await anon.post('/api/auth/register', {
      username: `Other_${suffix}`, email: email, password: 'TestPass!2026',
    });
    eq(dupMail.status, 409, 'رفض تكرار البريد');

    const wrongPass = await new Client().login(username, 'wrong-password');
    eq(wrongPass.status, 401, 'رفض كلمة مرور خاطئة');

    const temp = new Client();
    const loginOk = await temp.login(username, 'TestPass!2026');
    eq(loginOk.status, 200, 'الدخول بكلمة المرور الصحيحة');
    const loggedOut = await temp.post('/api/auth/logout', {});
    eq(loggedOut.status, 200, 'تسجيل الخروج');
    const afterOut = await temp.get('/api/auth/me');
    eq(afterOut.data.user, null, 'انتهت الجلسة بعد الخروج');

    const noCsrf = await player.req('POST', '/api/dictionary/1/favorite', { body: {}, noCsrf: true });
    eq(noCsrf.status, 403, 'منع الطلب بدون رمز CSRF');

    const unauth = await new Client().get('/api/worlds');
    eq(unauth.status, 401, 'منع الوصول بدون جلسة');
  }

  /* ---------------------------------------------------------------- C. content */
  section('C. المحتوى والعوالم والقاموس');
  {
    const boot = await player.get('/api/bootstrap');
    eq(boot.status, 200, 'GET /api/bootstrap يعمل');
    hasKeys(boot.data, ['profile', 'worlds', 'modes', 'wordOfDay', 'daily', 'reviewDue', 'totals'], 'حزمة bootstrap كاملة');
    eq(boot.data.worlds.length, 15, 'عدد العوالم 15');
    eq(boot.data.modes.length, 8, 'عدد أنماط اللعب 8');
    eq(boot.data.totals.terms, 1000, 'عدد المصطلحات 1000');
    gte(boot.data.totals.questions, 1400, 'عدد الأسئلة أكثر من 1400');
    check(!!boot.data.wordOfDay, 'كلمة اليوم موجودة للمصطلحات الموثقة');
    eq(boot.data.daily.questionCount, 8, 'تحدي اليوم 8 أسئلة');

    const worlds = await player.get('/api/worlds');
    eq(worlds.status, 200, 'GET /api/worlds يعمل');
    eq(worlds.data.worlds.length, 15, '15 عالمًا في القائمة');
    const stageTotal = worlds.data.worlds.reduce((s, w) => s + w.stages.length, 0);
    eq(stageTotal, 50, 'مجموع المراحل 50');
    check(worlds.data.worlds.every(w => w.stages.length > 0 && w.totalStages === w.stages.length), 'كل عالم يملك مراحل');
    const firstWorld = worlds.data.worlds[0];
    eq(firstWorld.stages[0].status, 'unlocked', 'أول مرحلة مفتوحة للاعب جديد');
    const lockedStages = worlds.data.worlds.flatMap(w => w.stages).filter(s => s.status === 'locked');
    gte(lockedStages.length, 1, 'توجد مراحل مقفلة تتدرج');

    const firstStage = await player.get(`/api/stages/${firstWorld.stages[0].id}`);
    eq(firstStage.status, 200, 'GET /api/stages/:id يعمل');
    hasKeys(firstStage.data.stage, ['id', 'name_ar', 'termCount', 'questionCount', 'locked', 'stars'], 'بيانات المرحلة كاملة');
    eq(firstStage.data.stage.locked, false, 'المرحلة الأولى غير مقفلة');
    gte(firstStage.data.stage.termCount, 20, 'المرحلة تحتوي مصطلحات');
    isArray(firstStage.data.terms, 'المرحلة تعرض عينة مصطلحات', 5);
    isArray(firstStage.data.questionCounts, 'المرحلة تعرض توزيع الأسئلة', 1);

    const lockedStage = await player.get(`/api/stages/${lockedStages[0].id}`);
    eq(lockedStage.data.stage.locked, true, 'المرحلة المتقدمة مقفلة فعلًا');

    const modes = await player.get('/api/modes');
    eq(modes.status, 200, 'GET /api/modes يعمل');
    const modeCodes = modes.data.modes.map(m => m.code).sort();
    eq(modeCodes.join(','), ['boss', 'code', 'english', 'match', 'meaning', 'puzzle', 'similar', 'speed'].join(','), 'كل الأنماط الثمانية موجودة');
    const meaningMode = modes.data.modes.find(m => m.code === 'meaning');
    eq(meaningMode.unlocked, true, 'نمط المعنى مفتوح للاعب جديد');
    eq(modes.data.modes.filter(m => m.unlocked).length, 2, 'نمطان مفتوحان في المستوى الأول');

    const dict = await player.get('/api/dictionary');
    eq(dict.status, 200, 'GET /api/dictionary يعمل');
    eq(dict.data.total, 1000, 'القاموس يعرض 1000 مصطلح');
    eq(dict.data.terms.length, 24, 'حجم صفحة القاموس 24');
    check(dict.data.terms.every(t => t.english && t.arabic && t.definition_ar), 'كل مصطلحات الصفحة مكتملة');

    const search = await player.get('/api/dictionary?q=function');
    gte(search.data.total, 1, 'البحث النصي يعمل');
    check(search.data.terms.some(t => /function/i.test(t.english)), 'نتائج البحث مطابقة');

    const needs = await player.get('/api/dictionary?status=needs_review');
    eq(needs.data.total, 790, 'فلتر الترجمات قيد المراجعة يعمل');
    const verified = await player.get('/api/dictionary?status=new');
    eq(verified.data.total, 1000, 'فلتر حالة التعلم يعمل');

    const cats = await player.get('/api/dictionary?category=' + encodeURIComponent('أساسيات البرمجة'));
    gte(cats.data.total, 20, 'فلتر التخصص يعمل');

    const diff = await player.get('/api/dictionary?difficulty=Advanced');
    gte(diff.data.total, 1, 'فلتر الصعوبة يعمل');

    const target = dict.data.terms.find(t => t.translation_status === 'verified');
    const detail = await player.get(`/api/dictionary/${target.id}`);
    eq(detail.status, 200, 'GET /api/dictionary/:id يعمل');
    hasKeys(detail.data, ['term', 'progress', 'related', 'examples', 'favorite'], 'تفاصيل المصطلح كاملة');
    check(Array.isArray(detail.data.term.related_terms), 'المصطلحات ذات الصلة مصفوفة');

    const fav = await player.post(`/api/dictionary/${target.id}/favorite`, {});
    eq(fav.status, 200, 'إضافة مصطلح للمفضلة');
    eq(fav.data.favorite, true, 'حالة المفضلة صحيحة');
    const favList = await player.get('/api/dictionary?favorites=1');
    eq(favList.data.total, 1, 'فلتر المفضلة يعمل');
    // Combining filters exercises the parameter order of the shared FROM clause
    // (the favorite subquery, the user_terms join and the WHERE params).
    const combo = await player.get('/api/dictionary?favorites=1&status=new&difficulty='
      + encodeURIComponent(target.difficulty || 'Beginner') + '&q=' + encodeURIComponent(target.english));
    eq(combo.status, 200, 'القاموس يدعم دمج الفلاتر بلا خطأ استعلام');
    check(combo.data.terms.some(t => t.id === target.id), 'نتائج دمج الفلاتر صحيحة');
    const deepPage = await player.get('/api/dictionary?page=99&pageSize=60');
    eq(deepPage.status, 200, 'صفحة تتجاوز عدد النتائج لا تخطئ');
    eq(deepPage.data.terms.length, 0, 'الصفحة البعيدة فارغة');
    const unfav = await player.post(`/api/dictionary/${target.id}/favorite`, {});
    eq(unfav.data.favorite, false, 'إزالة المصطلح من المفضلة');

    const abbrTerm = dict.data.terms.find(t => t.abbreviation);
    if (abbrTerm) {
      const abbrDetail = await player.get(`/api/dictionary/${abbrTerm.id}`);
      check(abbrDetail.data.term.abbreviation === abbrTerm.abbreviation, 'تفاصيل الاختصار تعود كاملة');
    } else {
      check(true, 'لا يوجد اختصار في الصفحة الأولى (تم تخطي فحص الاختصار)');
    }
  }

  /* ---------------------------------------------------------------- D. gameplay */
  section('D. اللعب — الأنماط الثمانية');
  let playerId;
  let firstStageId;
  let stage2Id;
  {
    const me = await player.get('/api/auth/me');
    playerId = me.data.user.id;
    const worlds = (await player.get('/api/worlds')).data.worlds;
    firstStageId = worlds[0].stages[0].id;
    stage2Id = worlds[0].stages[1].id;

    /* All play is subscriber-only; renew the test hero through the admin API. */
    const adminLogin = await admin.login('admin', ADMIN_PASS);
    eq(adminLogin.status, 200, 'دخول المدير لمنح اشتراك اللاعب الاختباري');
    const granted = await admin.post('/api/admin/subscriptions/grant', {
      username, planId: 'monthly', note: 'اشتراك الاختبار الآلي',
    });
    eq(granted.status, 201, 'منح اللاعب الاختباري اشتراكًا شهريًا');
    eq(granted.data.state.active, true, 'اللاعب الاختباري صار مشتركًا');
    const subState = await player.get('/api/subscription');
    eq(subState.data.state.active, true, 'حالة اشتراك اللاعب نشطة عبر الـ API');

    /* ---- meaning: one wrong + rest correct */
    const start = await player.post('/api/play/start', { mode: 'meaning', stageId: firstStageId });
    eq(start.status, 201, 'بدء جولة «خمّن المعنى»');
    const session = start.data.session;
    eq(session.questions.length, 8, 'جولة المعنى 8 أسئلة');
    eq(session.meta.hearts, 0, 'جولة المعنى بلا قلوب');
    check(!JSON.stringify(session).includes('is_correct'), 'استجابة العميل لا تسرّب الإجابة الصحيحة');
    check(session.questions.every(q => q.prompt && Array.isArray(q.options) && q.options.length >= 2), 'كل أسئلة المعنى بخيارات');
    check(session.questions.every(q => q.options.every(o => !('is_correct' in o))), 'الخيارات لا تحمل علم الصحة');
    check(session.questions.every(q => q.arabic === null && q.english === undefined),
      'لا تسريب الترجمة العربية في أسئلة المعنى');

    const q0 = session.questions[0];
    const wrong = await sendAnswer(player, session.id, q0, { correct: false });
    eq(wrong.status, 200, 'إرسال إجابة خاطئة');
    eq(wrong.data.correct, false, 'الخادم يصحّح الخطأ');
    eq(wrong.data.xpEarned, 0, 'لا خبرة للإجابة الخاطئة');
    check(wrong.data.correctAnswer && wrong.data.correctOptionId, 'الخادم يعيد الإجابة الصحيحة والشرح');
    eq(wrong.data.hearts, 0, 'لا خسارة قلوب في نمط المعنى');

    const dup = await sendAnswer(player, session.id, q0, { correct: true });
    eq(dup.status, 409, 'منع الإجابة مرتين عن نفس السؤال');

    const foreignOpt = qa('SELECT id FROM question_options WHERE question_id = ? LIMIT 1',
      session.questions[1].id)[0]?.id;
    const spoof = await player.post('/api/play/answer', {
      sessionId: session.id, questionId: q0.id, optionId: foreignOpt, timeMs: 100,
    });
    eq(spoof.status, 409, 'منع إعادة إرسال السؤال نفسه بخيار آخر');

    for (const q of session.questions.slice(1)) {
      const r = await sendAnswer(player, session.id, q, { correct: true });
      eq(r.status, 200, `إجابة صحيحة للسؤال ${q.id}`);
      check(r.data.xpEarned > 0, 'الخبرة تُمنح للإجابة الصحيحة');
    }
    const done = await player.post('/api/play/complete', { sessionId: session.id, timeMs: 8000 });
    eq(done.status, 200, 'إكمال جولة المعنى');
    eq(done.data.summary.score, 7, 'النتيجة 7 من 8');
    eq(done.data.summary.pct, 88, 'النسبة 88%');
    check(done.data.summary.stage?.completed === true, 'اكتملت المرحلة الأولى');
    eq(done.data.summary.stage?.stars, 2, 'نجمتان لإكمال 7/8');
    gte(done.data.summary.stage?.bonusXp, 1, 'مكافأة إكمال المرحلة تُمنح');

    const again = await player.post('/api/play/complete', { sessionId: session.id, timeMs: 1 });
    eq(again.data.alreadyCompleted, true, 'إعادة الإكمال لا تكرر المكافآت');

    const afterWorlds = (await player.get('/api/worlds')).data.worlds;
    eq(afterWorlds[0].stages[0].status, 'completed', 'المرحلة الأولى مسجلة كمكتملة');
    eq(afterWorlds[0].stages[1].status, 'unlocked', 'المرحلة الثانية انفتحت بعد الإكمال');
    eq(afterWorlds[0].completedStages, 1, 'عدّاد المراحل المكتملة صحيح');

    const s1 = await player.get(`/api/play/session/${session.id}`);
    eq(s1.status, 200, 'استعادة جلسة منتهية تعمل');
    eq(s1.data.session.status, 'completed', 'حالة الجلسة completed');
    isArray(s1.data.answers, 'سجل الإجابات يعود للاستئناف', 8);
    check(s1.data.answers.every(a => a.correct_text || a.answer), 'سجل الإجابات يحتوي الحلول');

    /* ---- english */
    const en = await player.post('/api/play/start', { mode: 'english', stageId: stage2Id });
    eq(en.status, 201, 'بدء جولة «تحدي الإنجليزية»');
    eq(en.data.session.questions.length, 8, 'جولة الإنجليزية 8 أسئلة');
    const enResults = await answerAll(player, en.data.session);
    check(enResults.every(r => r.data?.correct === true), 'كل إجابات الإنجليزية صحيحة');
    const enDone = await player.post('/api/play/complete', { sessionId: en.data.session.id, timeMs: 6000 });
    eq(enDone.data.summary.pct, 100, 'الإنجليزية 100%');
    eq(enDone.data.summary.stage?.stars, 3, 'ثلاث نجوم للإكمال الكامل');

    /* ---- unlock all modes by raising level (test DB only) */
    qrun('UPDATE users SET xp = 5000 WHERE id = ?', playerId);
    const bootAfter = await player.get('/api/bootstrap');
    gte(bootAfter.data.profile.level, 10, 'رفع المستوى لفتح الأنماط (بيانات اختبار)');
    const unlockedModes = bootAfter.data.modes.filter(m => m.unlocked).map(m => m.code);
    eq(unlockedModes.length, 8, 'كل الأنماط مفتوحة بعد رفع المستوى');
    eq(bootAfter.data.profile.rank?.name_ar ? 1 : 0, 1, 'الرتبة تتحدث مع المستوى');

    /* ---- puzzle: normalized text answers */
    const pz = await player.post('/api/play/start', { mode: 'puzzle', stageId: stage2Id });
    eq(pz.status, 201, 'بدء جولة «لغز الكلمات»');
    const pzSession = pz.data.session;
    eq(pzSession.questions.length, 8, 'جولة اللغز 8 أسئلة');
    check(pzSession.questions.every(q => q.options.length === 0), 'أسئلة اللغز بلا خيارات (إجابة نصية)');
    const pzAnswers = new Map(qa("SELECT id, answer FROM questions WHERE mode = 'puzzle'").map(r => [r.id, r.answer]));
    check(pzSession.questions.every(q => q.code && pzAnswers.get(q.id) && q.promptAr), 'كل لغز يحمل حروفًا وإجابة وتلميحًا');
    check(pzSession.questions.every(q =>
      String(q.prompt).replace(/[^A-Za-z]/g, '').toUpperCase()
      !== String(pzAnswers.get(q.id)).replace(/[^A-Za-z]/g, '').toUpperCase()), 'حروف اللغز مبعثرة وليست الإجابة نفسها');
    check(pzSession.questions.every(q => !('answer' in q)), 'الخادم لا يرسل إجابة اللغز إلى العميل');
    check(pzSession.questions.every(q => q.arabic === null && q.definition === null && q.english === undefined),
      'لا تسريب حقول المصطلح في أسئلة اللغز');
    const pzFirst = pzSession.questions[0];
    const pzOk = await sendAnswer(player, pzSession.id, pzFirst, { correct: true, normalize: true });
    eq(pzOk.status, 200, 'إرسال إجابة نصية للغز');
    eq(pzOk.data.correct, true, 'يقبل الخادم الإجابة النصية بعد تجاهل حالة الأحرف والمسافات');
    const pzWrong = await sendAnswer(player, pzSession.id, pzSession.questions[1], { correct: false });
    eq(pzWrong.data.correct, false, 'يرفض الخادم الإجابة النصية الخاطئة');
    const pzDone = await player.post('/api/play/complete', { sessionId: pzSession.id, timeMs: 5000 });
    eq(pzDone.data.summary.score, 1, 'نتيجة اللغز 1 من 2');

    /* ---- match */
    const match = await player.post('/api/play/start', { mode: 'match', stageId: stage2Id });
    eq(match.status, 201, 'بدء جولة «طابق المصطلحات」');
    eq(match.data.session.questions.length, 5, 'المطابقة 5 أزواج');
    eq(match.data.session.meta.pairs, 5, 'إعداد الأزواج 5');
    isArray(match.data.session.matchPairs, 'أزواج المطابقة تعود للعميل', 5);
    check(match.data.session.matchPairs.every(p => p.english && p.arabic && p.optionId), 'كل زوج يحتوي إنجليزي/عربي/خيارًا');
    const matchResults = await answerAll(player, match.data.session);
    check(matchResults.every(r => r.data?.correct === true), 'كل مطابقات الجولة صحيحة');
    const matchDone = await player.post('/api/play/complete', { sessionId: match.data.session.id, timeMs: 3000 });
    eq(matchDone.data.summary.pct, 100, 'المطابقة 100%');

    /* ---- code */
    const code = await player.post('/api/play/start', { mode: 'code', stageId: stage2Id });
    eq(code.status, 201, 'بدء جولة «أكمل الشيفرة»');
    check(code.data.session.questions.every(q => q.code), 'كل سؤال شيفرة يحتوي مقطع كود');
    check(code.data.session.questions.every(q => q.english === undefined && q.arabic === null),
      'لا تسريب المصطلح الإنجليزي في أسئلة الشيفرة');
    const codeResults = await answerAll(player, code.data.session);
    check(codeResults.every(r => r.data?.correct === true), 'كل إجابات الشيفرة صحيحة');
    const codeDone = await player.post('/api/play/complete', { sessionId: code.data.session.id, timeMs: 4000 });
    eq(codeDone.data.summary.pct, 100, 'الشيفرة 100%');

    /* ---- similar (fixed pairs, no stage) */
    const sim = await player.post('/api/play/start', { mode: 'similar' });
    eq(sim.status, 201, 'بدء جولة «مصطلحات متشابهة»');
    eq(sim.data.session.questions.length, 11, 'أسئلة المصطلحات المتشابهة 11');
    check(sim.data.session.questions.every(q => q.options.length >= 2), 'المتشابهة أسئلة اختيار');
    const simResults = await answerAll(player, sim.data.session);
    check(simResults.every(r => r.data?.correct === true), 'كل إجابات المتشابهة صحيحة');
    const simDone = await player.post('/api/play/complete', { sessionId: sim.data.session.id, timeMs: 5000 });
    eq(simDone.data.summary.pct, 100, 'المتشابهة 100%');

    /* ---- speed: completion + achievement */
    const speed = await player.post('/api/play/start', { mode: 'speed' });
    eq(speed.status, 201, 'بدء «تحدي السرعة»');
    eq(speed.data.session.questions.length, 25, 'السرعة 25 سؤالًا');
    eq(speed.data.session.meta.timeLimit, 60, 'مؤقت السرعة 60 ثانية');
    eq(speed.data.session.meta.hearts, 3, 'السرعة 3 قلوب');
    const spOk = await sendAnswer(player, speed.data.session.id, speed.data.session.questions[0], { correct: true });
    eq(spOk.data.correct, true, 'إجابة صحيحة في السرعة');
    const spDone = await player.post('/api/play/complete', { sessionId: speed.data.session.id, timeMs: 1200 });
    eq(spDone.data.summary.total, 1, 'تحسب السرعة الأسئلة المُجابة فقط');
    const achAfterSpeed = (await player.get('/api/achievements')).data.achievements;
    check(achAfterSpeed.find(a => a.code === 'speed_coder')?.unlocked === true, 'إنجاز «مبرمج سريع» يُفتح');

    /* ---- speed: losing all hearts */
    const speed2 = await player.post('/api/play/start', { mode: 'speed' });
    const loseResults = await answerAll(player, speed2.data.session, { correct: false, max: 3 });
    eq(loseResults.length, 3, 'ثلاث إجابات خاطئة في السرعة');
    eq(loseResults[2].data.failed, true, 'تنتهي الجولة بعد فقدان القلوب');
    const failSession = await player.get(`/api/play/session/${speed2.data.session.id}`);
    eq(failSession.data.session.status, 'failed', 'حالة الجلسة failed');
    const afterFail = await sendAnswer(player, speed2.data.session.id, speed2.data.session.questions[3], { correct: true });
    eq(afterFail.status, 409, 'لا يمكن الإجابة بعد فشل الجولة');
    const failDone = await player.post('/api/play/complete', { sessionId: speed2.data.session.id, timeMs: 2500 });
    eq(failDone.status, 200, 'إكمال جولة فاشلة لا يعيد خطأ');

    /* ---- boss */
    const bossesBefore = await player.get('/api/bosses');
    eq(bossesBefore.status, 200, 'GET /api/bosses يعمل');
    eq(bossesBefore.data.bosses.length, 6, 'ستة زعماء');
    check(bossesBefore.data.bosses.every(b => b.category_names.length > 0 && b.questionCount > 0), 'كل زعيم مرتبط بتخصصات وأسئلة');
    const boss = bossesBefore.data.bosses.find(b => b.unlocked && b.required_level <= 10);
    check(!!boss, 'يوجد زعيم متاح للمستوى الحالي');
    if (boss) {
      const lockedBoss = bossesBefore.data.bosses.find(b => !b.unlocked);
      if (lockedBoss) {
        const blocked = await player.post('/api/play/start', { mode: 'boss', bossId: lockedBoss.id });
        eq(blocked.status, 403, 'منع بدء زعيم أعلى من المستوى');
      }
      const bStart = await player.post('/api/play/start', { mode: 'boss', bossId: boss.id });
      eq(bStart.status, 201, `بدء معركة الزعيم «${boss.name_ar}»`);
      eq(bStart.data.session.questions.length, 10, 'معركة الزعيم 10 أسئلة');
      eq(bStart.data.session.meta.hearts, 3, 'معركة الزعيم 3 قلوب');
      const bResults = await answerAll(player, bStart.data.session);
      check(bResults.every(r => r.data?.correct === true), 'كل إجابات الزعيم صحيحة');
      const bDone = await player.post('/api/play/complete', { sessionId: bStart.data.session.id, timeMs: 9000 });
      eq(bDone.data.summary.boss?.defeated, true, 'هزيمة الزعيم بعد 100%');
      gte(bDone.data.summary.boss?.bonusXp, 1, 'مكافأة الزعيم تُمنح');
      const bossesAfter = (await player.get('/api/bosses')).data.bosses;
      eq(bossesAfter.find(b => b.id === boss.id)?.defeated, true, 'الزعيم مسجل كهزيمة');
    }

    /* ---- review (force due in the isolated DB) */
    qrun('UPDATE learning_reviews SET due_at = ? WHERE user_id = ?',
      new Date(Date.now() - 60000).toISOString(), playerId);
    const reviewInfo = await player.get('/api/review');
    gte(reviewInfo.data.count, 1, 'توجد مصطلحات مستحقة للمراجعة');
    isArray(reviewInfo.data.queue, 'قائمة المراجعة تعرض مصطلحات', 1);
    const rStart = await player.post('/api/review/start', {});
    eq(rStart.status, 201, 'بدء جلسة مراجعة ذكية');
    eq(rStart.data.session.mode, 'review', 'نمط الجلسة review');
    const rResults = await answerAll(player, rStart.data.session);
    check(rResults.every(r => r.data?.correct === true), 'كل إجابات المراجعة صحيحة');
    const rDone = await player.post('/api/play/complete', { sessionId: rStart.data.session.id, timeMs: 4000 });
    eq(rDone.status, 200, 'إكمال المراجعة');

    // The reported bug: the badge kept showing reviewed terms as due. The count
    // returned after a round must match the live queue, and terms without a
    // playable question must never be counted as due.
    const reviewAfter = await player.get('/api/review');
    eq(rDone.data.summary.reviewDue, reviewAfter.data.count,
      'عدّاد المراجعة بعد الجولة يطابق الطابور الفعلي');
    const probeReview = q1('SELECT term_id FROM learning_reviews WHERE user_id = ? LIMIT 1', playerId);
    if (probeReview) {
      const probeQs = qa('SELECT id, active FROM questions WHERE term_id = ?', probeReview.term_id);
      qrun('UPDATE questions SET active = 0 WHERE term_id = ?', probeReview.term_id);
      qrun('UPDATE learning_reviews SET due_at = ? WHERE user_id = ? AND term_id = ?',
        new Date(Date.now() - 3600e3).toISOString(), playerId, probeReview.term_id);
      const probeInfo = await player.get('/api/review');
      check(!probeInfo.data.queue.some(t => t.id === probeReview.term_id),
        'المصطلح بلا سؤال قابل للمراجعة لا يظهر في الطابور');
      const expectedDue = q1(
        `SELECT COUNT(DISTINCT r.term_id) AS c FROM learning_reviews r
           JOIN questions q ON q.term_id = r.term_id AND q.active = 1
                AND q.mode IN ('meaning','english','puzzle','code')
          WHERE r.user_id = ? AND r.due_at <= ?`,
        playerId, new Date().toISOString()
      ).c;
      eq(probeInfo.data.count, expectedDue,
        'عدّاد المراجعة يطابق المصطلحات القابلة للمراجعة فقط');
      for (const row of probeQs) {
        qrun('UPDATE questions SET active = ? WHERE id = ?', row.active, row.id);
      }
    }

    /* ---- daily */
    const daily = await player.get('/api/daily');
    eq(daily.status, 200, 'GET /api/daily يعمل');
    eq(daily.data.questionCount, 8, 'تحدي اليوم 8 أسئلة');
    eq(daily.data.completed, false, 'التحدي غير مكتمل بعد');
    const dStart = await player.post('/api/daily/start', {});
    eq(dStart.status, 201, 'بدء تحدي اليوم');
    eq(dStart.data.session.questions.length, 8, 'جلسة التحدي 8 أسئلة');
    const dResults = await answerAll(player, dStart.data.session);
    check(dResults.every(r => r.data?.correct === true), 'كل إجابات التحدي صحيحة');
    const dDone = await player.post('/api/play/complete', { sessionId: dStart.data.session.id, timeMs: 7000 });
    eq(dDone.data.summary.daily?.won, true, 'الفوز بتحدي اليوم');
    gte(dDone.data.summary.daily?.xp, 1, 'مكافأة الخبرة اليومية');
    const dAgain = await player.post('/api/daily/start', {});
    eq(dAgain.status, 409, 'منع إعادة تحدي اليوم نفسه');

    /* ---- dictionary learn */
    const learnTerm = (await player.get('/api/dictionary?status=verified')).data.terms
      .find(t => t.translation_status === 'verified') || (await player.get('/api/dictionary')).data.terms[0];
    const learnDetail = await player.get(`/api/dictionary/${learnTerm.id}`);
    const verifiedTerms = qa(
      "SELECT t.id FROM terms t JOIN questions q ON q.term_id = t.id WHERE t.translation_status = 'verified' AND t.active = 1 GROUP BY t.id HAVING COUNT(q.id) >= 2 LIMIT 5"
    );
    if (verifiedTerms.length) {
      const learn = await player.post(`/api/dictionary/${verifiedTerms[0].id}/learn`, {});
      eq(learn.status, 201, 'بدء جلسة تعلّم من القاموس');
      const lResults = await answerAll(player, learn.data.session);
      check(lResults.every(r => r.data?.correct === true), 'إجابات جلسة التعلّم صحيحة');
      const lDone = await player.post('/api/play/complete', { sessionId: learn.data.session.id, timeMs: 2000 });
      eq(lDone.status, 200, 'إكمال جلسة التعلّم');
    } else {
      check(false, 'وجدان مصطلح موثّق بأسئلته');
    }

    /* ---- insufficient-content handling on an unlocked stage */
    const nowIso = new Date().toISOString();
    for (const stageId of [3, 4]) {
      qrun(
        `INSERT INTO user_progress(user_id, stage_id, status, stars, best_score, attempts, completed_at)
         VALUES(?,?, 'completed', 3, 8, 1, ?)
         ON CONFLICT(user_id, stage_id) DO UPDATE SET status = 'completed', stars = 3, completed_at = excluded.completed_at`,
        playerId, stageId, nowIso
      );
    }
    const emptyStage = await player.get('/api/stages/5');
    eq(emptyStage.status, 200, 'مرحلة بلا أسئلة معنى تفتح');
    eq(emptyStage.data.stage.locked, false, 'المرحلة الخامسة مفتوحة بعد إكمال السلسلة');
    const emptyMeaning = await player.post('/api/play/start', { mode: 'meaning', stageId: 5 });
    eq(emptyMeaning.status, 400, 'معالجة نقص بيانات الترجمة برسالة واضحة (لا أسئلة معنى)');
    includes(emptyMeaning.data.error, 'لا توجد أسئلة كافية', 'رسالة النقص واضحة للمستخدم');
    const fallbackPuzzle = await player.post('/api/play/start', { mode: 'puzzle', stageId: 5 });
    eq(fallbackPuzzle.status, 201, 'نمط اللغز يعمل رغم غياب الترجمات الموثقة');
    eq(fallbackPuzzle.data.session.questions.length, 8, 'اللغز يعتمد على التعريفات البديلة');
    await player.post('/api/play/complete', { sessionId: fallbackPuzzle.data.session.id, timeMs: 100 });
  }

  /* ---------------------------------------------------------------- E. cross-user security */
  section('E. عزل الجلسات بين اللاعبين');
  {
    const reg = await rival.post('/api/auth/register', {
      username: `Rival_${suffix}`, email: `rival_${suffix}@test.dev`, password: 'RivalPass!2026',
    });
    eq(reg.status, 201, 'تسجيل لاعب ثانٍ');
    rival.csrf = reg.data.csrf;

    const mine = await player.post('/api/play/start', { mode: 'meaning', stageId: firstStageId });
    eq(mine.status, 201, 'جلسة خاصة باللاعب الأول');
    const hijack = await rival.get(`/api/play/session/${mine.data.session.id}`);
    eq(hijack.status, 404, 'اللاعب الثاني لا يرى جلسة غيره');
    const hijackAnswer = await sendAnswer(rival, mine.data.session.id, mine.data.session.questions[0], { correct: true });
    eq(hijackAnswer.status, 404, 'اللاعب الثاني لا يستطيع الإجابة في جلسة غيره');
    await player.post('/api/play/complete', { sessionId: mine.data.session.id, timeMs: 10 });
  }

  /* ---------------------------------------------------------------- F. profile / stats */
  section('F. الملف الشخصي والإحصاءات');
  {
    const profile = await player.get('/api/profile');
    eq(profile.status, 200, 'GET /api/profile يعمل');
    hasKeys(profile.data.profile, ['xp', 'level', 'rank', 'coins', 'stats'], 'الملف الشخصي كامل');
    gte(profile.data.profile.xp, 1, 'الخبرة محفوظة');
    gte(profile.data.profile.stats.totalAnswered, 30, 'إحصاء الإجابات محفوظ');
    gte(profile.data.profile.stats.accuracy, 1, 'دقة الإجابات محسوبة');
    gte(profile.data.profile.stats.completedStages, 3, 'عدد المراحل المكتملة صحيح');
    eq(profile.data.chart.length, 14, 'مخطط الخبرة 14 يومًا');
    eq(profile.data.categoryProgress.length, 50, 'تقدم كل التخصصات متاح');
    eq(profile.data.achievements.length, 12, '12 إنجازًا');
    isArray(profile.data.activity, 'سجل النشاط موجود', 5);
    gte(q1("SELECT COUNT(*) AS c FROM user_activity WHERE user_id = ? AND type = 'stage_completed'", playerId).c, 1,
      'نشاط إكمال المرحلة مسجل في قاعدة البيانات');

    const settings = await player.put('/api/profile/settings', {
      displayName: 'Quest Tester', bio: 'أختبر اللعبة', lang: 'en', theme: 'light',
      dailyGoal: 30, sound: false,
    });
    eq(settings.status, 200, 'حفظ الإعدادات');
    eq(settings.data.profile.profile.display_name, 'Quest Tester', 'الاسم المعروض محفوظ');
    eq(settings.data.profile.profile.lang, 'en', 'اللغة محفوظة');
    eq(settings.data.profile.profile.theme, 'light', 'المظهر محفوظ');
    eq(settings.data.profile.profile.daily_goal, 30, 'الهدف اليومي محفوظ');
    eq(settings.data.profile.profile.sound, 0, 'إعداد الصوت محفوظ');

    const restore = await player.put('/api/profile/settings', {
      displayName: 'بطل الاختبار', lang: 'ar', theme: 'dark', dailyGoal: 20, sound: true,
    });
    eq(restore.data.profile.profile.lang, 'ar', 'استعادة اللغة العربية');
    eq(restore.data.profile.profile.theme, 'dark', 'استعادة الوضع الداكن');

    const ach = await player.get('/api/achievements');
    eq(ach.data.achievements.length, 12, 'GET /api/achievements يعيد 12');
    const unlocked = ach.data.achievements.filter(a => a.unlocked);
    gte(unlocked.length, 3, 'فتح عدة إنجازات');
    check(unlocked.some(a => a.code === 'first_word'), 'إنجاز أول كلمة مفتوح');
    check(unlocked.some(a => a.code === 'perfect_round'), 'إنجاز الجولة الكاملة مفتوح');
    const bossAch = ach.data.achievements.find(a => a.code === 'boss_slayer');
    check(!!bossAch, 'إنجاز قاتل الزعماء موجود');
    eq(bossAch?.unlocked, false, 'إنجاز الزعماء يظل مقفلًا بعد زعيم واحد (يتطلب ثلاثة)');
    check(ach.data.achievements.every(a => a.title_ar && a.icon && ['bronze', 'silver', 'gold', 'platinum'].includes(a.tier)), 'بيانات الإنجازات مكتملة');

    for (const period of ['daily', 'weekly', 'monthly', 'all']) {
      const lb = await player.get(`/api/leaderboard?period=${period}`);
      eq(lb.status, 200, `لوحة الصدارة (${period}) تعمل`);
      isArray(lb.data.entries, `ترتيب ${period} يحتوي لاعبين`, 1);
      check(lb.data.entries.every(e => e.position && e.name && e.rank && e.level), `عناصر ترتيب ${period} مكتملة`);
      check(lb.data.entries.some(e => e.isNpc), `ترتيب ${period} يتضمن منافسي NPC المميزين`);
      if (period === 'daily') {
        check(!!lb.data.me, 'اللاعب يظهر في ترتيب اليوم');
        gte(lb.data.me?.xp, 1, 'خبرة اليوم محسوبة');
      }
    }

    const bosses = await player.get('/api/bosses');
    gte(bosses.data.bosses.filter(b => b.defeated).length, 1, 'لوحة الزعماء تعرض هزيمة واحدة على الأقل');
  }

  /* ---------------------------------------------------------------- G. shop */
  section('G. المتجر والعملات');
  {
    qrun('UPDATE users SET coins = 1000 WHERE id = ?', playerId);
    const shop = await player.get('/api/shop');
    eq(shop.status, 200, 'GET /api/shop يعمل');
    eq(shop.data.coins, 1000, 'رصيد العملات صحيح');
    gte(shop.data.rewards.length, 14, 'عناصر المتجر كاملة');
    check(shop.data.rewards.some(r => r.type === 'avatar'), 'شخصيات متاحة');
    check(shop.data.rewards.some(r => r.type === 'frame'), 'إطارات متاحة');
    check(shop.data.rewards.some(r => r.type === 'background'), 'خلفيات متاحة');
    check(shop.data.rewards.every(r => r.cost === 0 || r.cost > 0), 'كل عنصر له سعر صالح');

    const buy = await player.post('/api/shop/buy', { code: 'avatar-byte' });
    eq(buy.status, 200, 'شراء شخصية');
    eq(buy.data.coins, 850, 'خصم السعر من العملات');
    const buyAgain = await player.post('/api/shop/buy', { code: 'avatar-byte' });
    eq(buyAgain.status, 409, 'منع شراء عنصر مملوك');
    const equip = await player.post('/api/shop/equip', { code: 'avatar-byte' });
    eq(equip.status, 200, 'تجهيز الشخصية المشتراة');
    eq(equip.data.profile.profile.avatar, 'byte', 'الشخصية المجهزة محفوظة');
    const equipUnowned = await player.post('/api/shop/equip', { code: 'avatar-quantum' });
    eq(equipUnowned.status, 403, 'منع تجهيز عنصر غير مملوك');
    const unknown = await player.post('/api/shop/buy', { code: 'does-not-exist' });
    eq(unknown.status, 404, 'رفض عنصر غير موجود');
    qrun('UPDATE users SET coins = 0 WHERE id = ?', playerId);
    const poor = await player.post('/api/shop/buy', { code: 'avatar-legend' });
    eq(poor.status, 400, 'منع الشراء بلا عملات كافية');
    const defaultEquip = await player.post('/api/shop/equip', { code: 'avatar-nova' });
    eq(defaultEquip.status, 200, 'تجهيز العنصر الافتراضي');
    eq(defaultEquip.data.profile.profile.avatar, 'nova', 'العودة للشخصية الافتراضية');
    qrun('UPDATE users SET coins = 500 WHERE id = ?', playerId);
  }

  /* ---------------------------------------------------------------- H. admin */
  section('H. لوحة الإدارة والاستيراد والتصدير');
  {
    const denied = await player.get('/api/admin/overview');
    eq(denied.status, 403, 'اللاعب لا يصل إلى لوحة الإدارة');

    const login = await admin.login('admin', ADMIN_PASS);
    eq(login.status, 200, 'دخول المدير');
    eq(login.data.user.role, 'admin', 'دور المدير صحيح');

    const deniedCsrf = await admin.req('PUT', '/api/admin/settings', { body: { xp_correct: 1 }, noCsrf: true });
    eq(deniedCsrf.status, 403, 'منع تعديل الإدارة بدون CSRF');

    const overview = await admin.get('/api/admin/overview');
    eq(overview.status, 200, 'نظرة عامة تعمل');
    hasKeys(overview.data.counts, ['users', 'terms', 'needsReview', 'questions', 'sessions', 'answers', 'accuracy'], 'مؤشرات النظرة العامة كاملة');
    eq(overview.data.counts.terms, 1000, 'عدّاد المصطلحات 1000');
    eq(overview.data.counts.needsReview, 790, 'عدّاد المراجعة 790');
    eq(overview.data.counts.questions, 1411, 'عدّاد الأسئلة 1411');
    isArray(overview.data.hardTerms, 'قائمة المصطلحات الصعبة متاحة');
    isArray(overview.data.recentUsers, 'أحدث اللاعبين متاحون', 2);
    isArray(overview.data.modes, 'توزيع الأنماط متاح', 1);

    const cats = await admin.get('/api/admin/categories');
    eq(cats.status, 200, 'تخصصات الإدارة تعمل');
    eq(cats.data.categories.length, 50, '50 تخصصًا');
    check(cats.data.categories.every(c => c.terms > 0), 'كل تخصص يملك مصطلحات');
    const firstCat = cats.data.categories[0];

    const terms = await admin.get('/api/admin/terms?page=1');
    eq(terms.status, 200, 'قائمة المصطلحات الإدارية تعمل');
    eq(terms.data.total, 1000, 'إجمالي المصطلحات 1000');
    eq(terms.data.terms.length, 25, 'حجم صفحة الإدارة 25');
    const reviewTerms = await admin.get('/api/admin/terms?status=needs_review');
    eq(reviewTerms.data.total, 790, 'فلتر المراجعة في الإدارة يعمل');
    const verifiedTerms = await admin.get('/api/admin/terms?status=verified');
    eq(verifiedTerms.data.total, 210, 'فلتر الموثّق في الإدارة يعمل');
    const searchTerms = await admin.get('/api/admin/terms?q=function');
    gte(searchTerms.data.total, 1, 'بحث الإدارة يعمل');

    const questions = await admin.get('/api/admin/questions?mode=meaning');
    eq(questions.status, 200, 'قائمة الأسئلة الإدارية تعمل');
    gte(questions.data.total, 210, 'أسئلة المعنى تظهر');
    check(questions.data.questions.every(q => Array.isArray(q.options) && q.options.length >= 2), 'الأسئلة تعرض خياراتها');
    check(questions.data.questions.every(q => q.options.filter(o => o.is_correct).length === 1), 'كل سؤال إداري له إجابة صحيحة واحدة');

    /* export */
    const expTerms = await admin.get('/api/admin/export?type=terms');
    eq(expTerms.status, 200, 'تصدير المصطلحات يعمل');
    includes(expTerms.headers.get('content-type'), 'spreadsheetml', 'نوع ملف التصدير XLSX');
    check(expTerms.buffer?.subarray(0, 2).toString() === 'PK', 'ملف التصدير ZIP/XLSX صالح');
    const parsedTerms = parseXlsx(expTerms.buffer);
    const termRows = parsedTerms.Programming_Glossary || [];
    eq(termRows.length, 1000, 'التصدير يحتوي 1000 صف بيانات (الرأس منفصل)');
    includes(Object.keys(termRows[0]).join(','), 'English_Term', 'رأس التصدير يحتوي English_Term');
    includes(Object.keys(termRows[0]).join(','), 'Translation_Status', 'رأس التصدير يحتوي حالة الترجمة');

    const expQuestions = await admin.get('/api/admin/export?type=questions');
    eq(expQuestions.status, 200, 'تصدير الأسئلة يعمل');
    const parsedQuestions = parseXlsx(expQuestions.buffer);
    const qRows = parsedQuestions.Questions || [];
    gte(qRows.length, 1400, 'التصدير يحتوي كل الأسئلة');
    includes(Object.keys(qRows[0]).join(','), 'Correct_Option', 'رأس تصدير الأسئلة يحتوي الإجابة الصحيحة');

    /* dry-run import of the real source workbook */
    const sourcePath = path.join(ROOT, 'data', 'source', 'Programming_Glossary_En_Ar.xlsx');
    const srcBuf = fs.readFileSync(sourcePath);
    const dry = await admin.req('POST', '/api/admin/import?dry=1', {
      buf: srcBuf, filename: 'Programming_Glossary_En_Ar.xlsx',
    });
    eq(dry.status, 200, 'فحص جاف لملف Excel الأصلي');
    eq(dry.data.dryRun, true, 'الاستجابة تعلن dryRun');
    eq(dry.data.inserted, 0, 'لا صفوف جديدة في المصدر الحالي');
    eq(dry.data.updated, 1000, 'كل الصفوف ستُحدَّث');
    eq(dry.data.skipped, 0, 'لا صفوف متخطاة');

    /* dry-run import of our own export (round-trip) */
    const dryExport = await admin.req('POST', '/api/admin/import?dry=1', {
      buf: expTerms.buffer, filename: 'codequest-terms-roundtrip.xlsx',
    });
    eq(dryExport.status, 200, 'فحص جاف لملف تصديرنا (دورة كاملة)');
    eq(dryExport.data.updated, 1000, 'ملف التصدير يُقرأ ويُطابق كل المصطلحات');

    /* real import: one existing + one new row */
    const existing = q1('SELECT * FROM terms WHERE active = 1 ORDER BY id LIMIT 1');
    const existingCat = q1('SELECT name_ar FROM categories WHERE id = ?', existing.category_id).name_ar;
    const probeName = `Import Probe ${suffixLetters}`;
    const probeBuf = buildXlsx([{
      name: 'Programming_Glossary',
      rows: [
        ['English_Term', 'Arabic_Term', 'Definition_AR', 'Category_AR', 'Subcategory', 'Abbreviation', 'Full_Form', 'Difficulty', 'Example', 'Related_Terms'],
        [existing.english, existing.arabic, existing.definition_ar, existingCat, 'Programming Basics', existing.abbreviation || '', existing.full_form || '', existing.difficulty, existing.example || '', ''],
        [probeName, 'مسبار الاستيراد', 'مصطلح تجريبي للتحقق من الاستيراد.', existingCat, 'Programming Basics', 'IPRB', 'Import Probe', 'Intermediate', 'import probe;', ''],
      ],
    }]);
    const imp = await admin.req('POST', '/api/admin/import', { buf: probeBuf, filename: 'probe.xlsx' });
    eq(imp.status, 200, 'استيراد حقيقي لملف صغير');
    eq(imp.data.inserted, 1, 'أُضيف صف جديد واحد');
    eq(imp.data.updated, 1, 'حُدّث صف موجود واحد');
    eq(imp.data.skipped, 0, 'لا صفوف متخطاة');

    const probeTerm = q1('SELECT * FROM terms WHERE english = ?', probeName);
    check(!!probeTerm, 'المصطلح المستورد موجود في قاعدة البيانات');
    eq(probeTerm?.translation_status, 'verified', 'المصطلح المستورد موثّق لوجود ترجمة فعلية');
    const probeQ = qa('SELECT mode, COUNT(*) c FROM questions WHERE term_id = ? AND active = 1 GROUP BY mode', probeTerm.id);
    check(probeQ.some(r => r.mode === 'meaning') && probeQ.some(r => r.mode === 'puzzle'), 'أُعيد توليد أسئلة المصطلح المستورد');

    const overview2 = await admin.get('/api/admin/overview');
    eq(overview2.data.counts.terms, 1001, 'عدّاد المصطلحات يعكس الاستيراد');
    eq(overview2.data.importJobs[0]?.filename, 'probe.xlsx', 'سجل الاستيراد محفوظ');

    /* admin CRUD term */
    const newName = `Aurora Sync ${suffixLetters}`;
    const created = await admin.post('/api/admin/terms', {
      english: newName, arabic: 'بروتوكول مزامنة الشفق', abbreviation: `ASP${suffix.toUpperCase()}`,
      fullForm: 'Aurora Sync Protocol', categoryId: firstCat.id, difficulty: 'Advanced',
      definition: 'بروتوكول افتراضي لاختبار إضافة المصطلحات من لوحة الإدارة.',
      example: 'await aurora.sync();', relatedTerms: existing.english,
    });
    eq(created.status, 201, 'إضافة مصطلح من لوحة الإدارة');
    check(!!created.data.id, 'يعود معرّف المصطلح الجديد');
    const createdQ = qa('SELECT mode FROM questions WHERE term_id = ? AND active = 1', created.data.id);
    check(createdQ.some(r => r.mode === 'meaning') && createdQ.some(r => r.mode === 'puzzle'), 'توليد أسئلة المصطلح الجديد');

    const dupe = await admin.post('/api/admin/terms', {
      english: newName, arabic: 'مكرر', definition: 'مكرر', categoryId: firstCat.id,
    });
    eq(dupe.status, 409, 'رفض تكرار المصطلح');

    const updated = await admin.put(`/api/admin/terms/${created.data.id}`, {
      arabic: 'بروتوكول مزامنة الشفق المعدّل', definition: 'تعريف محدّث للاختبار.', difficulty: 'Intermediate',
    });
    eq(updated.status, 200, 'تعديل مصطلح');
    eq(updated.data.term.arabic, 'بروتوكول مزامنة الشفق المعدّل', 'الترجمة المعدّلة محفوظة');
    eq(updated.data.term.difficulty, 'Intermediate', 'الصعوبة المعدّلة محفوظة');

    const del = await admin.del(`/api/admin/terms/${created.data.id}`);
    eq(del.status, 200, 'حذف مصطلح منطقيًا');
    eq(q1('SELECT active FROM terms WHERE id = ?', created.data.id).active, 0, 'المصطلح معطّل');
    eq(q1('SELECT COUNT(*) c FROM questions WHERE term_id = ? AND active = 1', created.data.id).c, 0, 'أسئلة المصطلح معطّلة');
    const restored = await admin.post(`/api/admin/terms/${created.data.id}/restore`, {});
    eq(restored.status, 200, 'استعادة مصطلح');
    eq(q1('SELECT active FROM terms WHERE id = ?', created.data.id).active, 1, 'المصطلح نشط بعد الاستعادة');

    /* question editor */
    const qSearch = await admin.get('/api/admin/questions?q=' + encodeURIComponent(newName));
    const editedQ = qSearch.data.questions.find(q => q.mode === 'meaning');
    check(!!editedQ, 'يمكن الوصول إلى سؤال المصطلح الجديد');
    if (editedQ) {
      const qEdit = await admin.put(`/api/admin/questions/${editedQ.id}`, {
        prompt: `${newName} — اختر المعنى الصحيح`,
        promptAr: 'اختر المعنى الصحيح',
        explanation: 'شرح محدّث من لوحة الإدارة.',
        difficulty: 'Advanced',
        options: [
          { text: 'المعنى الصحيح', isCorrect: true },
          { text: 'معنى خاطئ أول', isCorrect: false },
          { text: 'معنى خاطئ ثانٍ', isCorrect: false },
        ],
      });
      eq(qEdit.status, 200, 'تعديل سؤال من لوحة الإدارة');
      const opts = qa('SELECT text, is_correct FROM question_options WHERE question_id = ?', editedQ.id);
      eq(opts.length, 3, 'خيارات السؤال المعدّل 3');
      eq(opts.filter(o => o.is_correct).length, 1, 'إجابة صحيحة واحدة بعد التعديل');
      eq(q1('SELECT answer FROM questions WHERE id = ?', editedQ.id).answer, 'المعنى الصحيح', 'نص الإجابة محدّث');
      const badEdit = await admin.put(`/api/admin/questions/${editedQ.id}`, {
        options: [{ text: 'أ', isCorrect: true }, { text: 'ب', isCorrect: true }],
      });
      eq(badEdit.status, 400, 'رفض سؤال بأكثر من إجابة صحيحة');
      await admin.put(`/api/admin/questions/${editedQ.id}`, {
        prompt: editedQ.prompt, promptAr: editedQ.prompt_ar, explanation: editedQ.explanation,
        difficulty: editedQ.difficulty, options: editedQ.options.map(o => ({ text: o.text, isCorrect: !!o.is_correct })),
      });
    }

    /* users */
    const users = await admin.get('/api/admin/users');
    eq(users.status, 200, 'قائمة المستخدمين تعمل');
    check(users.data.users.some(u => u.id === playerId), 'اللاعب يظهر في قائمة المستخدمين');
    check(users.data.users.every(u => u.rank && u.level !== undefined), 'بيانات المستخدمين كاملة');
    const selfEdit = await admin.put(`/api/admin/users/${login.data.user.id}`, { status: 'banned' });
    eq(selfEdit.status, 400, 'منع المدير من تعديل حسابه');
    const userEdit = await admin.put(`/api/admin/users/${playerId}`, { status: 'active', role: 'player' });
    eq(userEdit.status, 200, 'تحديث مستخدم يعمل');

    /* settings */
    const settings = await admin.get('/api/admin/settings');
    eq(settings.status, 200, 'إعدادات اللعبة تعمل');
    check(settings.data.settings.some(s => s.key === 'xp_correct'), 'إعداد xp_correct موجود');
    const setEdit = await admin.put('/api/admin/settings', { xp_correct: 12, game_version: '1.0.1', hack_key: 'nope' });
    eq(setEdit.status, 200, 'حفظ الإعدادات');
    eq(setEdit.data.settings.find(s => s.key === 'xp_correct')?.value, '12', 'قيمة الإعداد محفوظة');
    eq(setEdit.data.settings.find(s => s.key === 'game_version')?.value, '1.0.1', 'إصدار اللعبة محفوظ');
    check(!setEdit.data.settings.some(s => s.key === 'hack_key'), 'تجاهل الإعدادات غير المسموحة');
    await admin.put('/api/admin/settings', { xp_correct: 10, game_version: '1.0.0' });

    /* bad upload */
    const badUpload = await admin.req('POST', '/api/admin/import', {
      buf: Buffer.from('this is not an xlsx file'), filename: 'broken.xlsx',
    });
    eq(badUpload.status, 400, 'رفض ملف Excel غير صالح');

    /* cleanup created terms so final integrity counts stay clean */
    await admin.del(`/api/admin/terms/${probeTerm.id}`);
    await admin.del(`/api/admin/terms/${created.data.id}`);
    eq(q1('SELECT COUNT(*) c FROM terms WHERE active = 1').c, 1000, 'تنظيف مصطلحات الاختبار');
  }

  /* ---------------------------------------------------------------- I. data integrity */
  section('I. سلامة البيانات والاتساق');
  {
    eq(q1('SELECT COUNT(*) c FROM worlds').c, 15, 'عدد العوالم في قاعدة البيانات 15');
    eq(q1('SELECT COUNT(*) c FROM categories').c, 50, 'عدد التخصصات 50');
    eq(q1('SELECT COUNT(*) c FROM stages').c, 50, 'عدد المراحل 50');
    eq(q1('SELECT COUNT(*) c FROM terms WHERE active = 1').c, 1000, 'المصطلحات النشطة 1000');
    eq(q1('SELECT COUNT(DISTINCT english_key) c FROM terms').c, q1('SELECT COUNT(*) c FROM terms').c, 'لا تكرار في المصطلحات الإنجليزية');
    eq(q1('SELECT COUNT(*) c FROM terms WHERE active = 1 AND translation_status = \'verified\'').c, 210, '210 ترجمة موثقة نشطة');
    eq(q1('SELECT COUNT(*) c FROM terms WHERE translation_status = \'needs_review\'').c, 790, '790 ترجمة تحتاج مراجعة');
    eq(q1('SELECT COUNT(*) c FROM abbreviations').c, 69, '69 اختصارًا');
    eq(q1('SELECT COUNT(*) c FROM questions WHERE active = 1').c, 1411, '1411 سؤالًا نشطًا');
    eq(q1('SELECT COUNT(*) c FROM achievements').c, 12, '12 إنجازًا');
    eq(q1('SELECT COUNT(*) c FROM bosses').c, 6, '6 زعماء');
    gte(q1('SELECT COUNT(*) c FROM rewards').c, 14, '14 عنصر متجر أو أكثر');
    eq(q1('SELECT COUNT(*) c FROM users WHERE is_npc = 1').c, 8, '8 خصوم NPC مميزين');

    eq(q1('SELECT COUNT(*) c FROM categories c WHERE NOT EXISTS (SELECT 1 FROM stages s WHERE s.category_id = c.id)').c, 0, 'كل تخصص له مرحلة');
    eq(q1('SELECT COUNT(*) c FROM stages s WHERE NOT EXISTS (SELECT 1 FROM terms t WHERE t.stage_id = s.id)').c, 0, 'كل مرحلة لها مصطلحات');
    eq(q1('SELECT COUNT(*) c FROM categories c WHERE NOT EXISTS (SELECT 1 FROM questions q WHERE q.category_id = c.id AND q.mode = \'puzzle\' AND q.active = 1)').c, 0, 'كل تخصص له أسئلة لغز (حتى بلا ترجمة)');
    eq(q1('SELECT COUNT(*) c FROM questions WHERE prompt IS NULL OR TRIM(prompt) = \'\'').c, 0, 'لا أسئلة بلا نص');
    eq(q1('SELECT COUNT(*) c FROM questions WHERE answer IS NULL OR TRIM(answer) = \'\'').c, 0, 'لا أسئلة بلا إجابة');
    eq(q1('SELECT COUNT(*) c FROM questions q WHERE EXISTS (SELECT 1 FROM question_options o WHERE o.question_id = q.id) AND (SELECT COUNT(*) FROM question_options o WHERE o.question_id = q.id AND o.is_correct = 1) <> 1').c, 0, 'كل سؤال بخيارات له إجابة صحيحة واحدة فقط');
    eq(q1('SELECT COUNT(*) c FROM question_options WHERE text IS NULL OR TRIM(text) = \'\'').c, 0, 'لا خيارات فارغة');
    eq(q1("SELECT COUNT(*) c FROM questions q WHERE q.mode IN ('meaning','english','code','similar') AND NOT EXISTS (SELECT 1 FROM question_options o WHERE o.question_id = q.id)").c, 0, 'كل أسئلة الاختيار لها خيارات');
    eq(q1("SELECT COUNT(*) c FROM questions q WHERE q.mode = 'puzzle' AND EXISTS (SELECT 1 FROM question_options o WHERE o.question_id = q.id)").c, 0, 'أسئلة اللغز نصية بلا خيارات');
    eq(q1("SELECT COUNT(*) c FROM questions q JOIN terms t ON t.id = q.term_id WHERE q.mode = 'meaning' AND t.translation_status <> 'verified'").c, 0, 'لا أسئلة معنى لمصطلحات غير موثقة');
    eq(q1("SELECT COUNT(*) c FROM questions q LEFT JOIN terms t ON t.id = q.term_id WHERE q.mode = 'english' AND (t.id IS NULL OR (t.translation_status <> 'verified' AND (t.abbreviation IS NULL OR t.full_form IS NULL)))").c, 0, 'أسئلة الإنجليزية موثقة أو مبنية على اختصارات كاملة');
    eq(q1("SELECT COUNT(*) c FROM questions q JOIN terms t ON t.id = q.term_id WHERE q.mode = 'puzzle' AND (q.code IS NULL OR TRIM(q.code) = '' OR q.answer IS NULL OR TRIM(q.answer) = '' OR q.prompt_ar IS NULL OR TRIM(q.prompt_ar) = '')").c, 0, 'كل أسئلة اللغز تحمل حروفًا وإجابة وتلميحًا');
    eq(q1("SELECT COUNT(*) c FROM questions q JOIN terms t ON t.id = q.term_id WHERE q.mode = 'puzzle' AND t.translation_status <> 'verified' AND instr(q.prompt_ar, '______') = 0").c, 0, 'ألغاز المصطلحات غير الموثقة تخفي المصطلح في التعريف');
    eq(q1("SELECT COUNT(*) c FROM questions WHERE mode = 'code' AND (code IS NULL OR TRIM(code) = '')").c, 0, 'كل أسئلة الشيفرة تحتوي كودًا');
    eq(q1("SELECT COUNT(*) c FROM questions WHERE mode = 'similar'").c, 11, '11 سؤال مصطلحات متشابهة');
    eq(q1("SELECT COUNT(*) c FROM stages s JOIN categories c ON c.id = s.category_id WHERE s.world_id <> c.world_id").c, 0, 'مرحلة كل تخصص داخل عالمه الصحيح');

    const modes = qa('SELECT mode, COUNT(*) c FROM questions WHERE active = 1 GROUP BY mode ORDER BY mode');
    const modeMap = Object.fromEntries(modes.map(r => [r.mode, r.c]));
    eq(modeMap.code, 87, 'توزيع أسئلة الشيفرة 87');
    eq(modeMap.english, 279, 'توزيع أسئلة الإنجليزية 279');
    eq(modeMap.meaning, 210, 'توزيع أسئلة المعنى 210');
    eq(modeMap.puzzle, 824, 'توزيع أسئلة اللغز 824');
    eq(modeMap.similar, 11, 'توزيع أسئلة المتشابهة 11');

    // no dependency on the invalid Game_Data distractors
    const sourceFiles = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'data', '.git', 'scripts'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|mjs|html|css)$/.test(entry.name)) sourceFiles.push(full);
      }
    })(ROOT);
    const gameDataRefs = sourceFiles.filter(f => /Game_Data/.test(fs.readFileSync(f, 'utf8')));
    eq(gameDataRefs.length, 0, 'لا اعتماد على Game_Data في كود اللعبة', gameDataRefs.map(f => path.relative(ROOT, f)).join(', '));

    // the isolated DB must not leak into the real one
    check(path.basename(DB_PATH).startsWith('test-runtime'), 'الاختبار يستخدم قاعدة بيانات معزولة');
  }

  /* ---------------------------------------------------------------- J. subscriptions & 1v1 */
  section('J. الاشتراكات واللعب الجماعي');
  {
    /* ---- plans & state */
    const sub = await player.get('/api/subscription');
    eq(sub.status, 200, 'GET /api/subscription يعمل');
    eq(sub.data.plans.length, 2, 'خطتا اشتراك فقط');
    const monthly = sub.data.plans.find(p => p.id === 'monthly');
    const yearly = sub.data.plans.find(p => p.id === 'yearly');
    eq(monthly?.price_sar, 100, 'سعر الاشتراك الشهري 100 ريال');
    eq(monthly?.days, 30, 'مدة الاشتراك الشهري 30 يومًا');
    eq(yearly?.price_sar, 1000, 'سعر الاشتراك السنوي 1000 ريال');
    eq(yearly?.days, 365, 'مدة الاشتراك السنوي 365 يومًا');
    eq(sub.data.state.active, true, 'اللاعب الاختباري مشترك');
    eq(sub.data.state.remaining, null, 'المشترك بلا حد يومي');
    eq(sub.data.freeDailyAnswers, 10, 'التجربة المجانية 10 إجابات يوميًا');
    isArray(sub.data.history, 'سجل الاشتراكات متاح', 1);

    const boot = await player.get('/api/bootstrap');
    hasKeys(boot.data.subscription, ['active', 'trial', 'remaining', 'dailyLimit'],
      'bootstrap يحمل حالة الاشتراك');

    const deniedSub = await player.get('/api/admin/subscriptions');
    eq(deniedSub.status, 403, 'اللاعب لا يصل إلى إدارة الاشتراكات');

    /* ---- fresh account starts on the free trial */
    const trial = new Client();
    const trialName = `Trial_${suffix}`;
    const trialReg = await trial.post('/api/auth/register', {
      username: trialName, email: `trial_${suffix}@test.dev`, password: 'TrialPass!2026',
    });
    eq(trialReg.status, 201, 'تسجيل لاعب جديد على التجربة المجانية');
    trial.csrf = trialReg.data.csrf;
    const trialSub = await trial.get('/api/subscription');
    eq(trialSub.data.state.active, false, 'الحساب الجديد بلا اشتراك');
    eq(trialSub.data.state.trial, true, 'الحساب الجديد في التجربة المجانية');
    eq(trialSub.data.state.dailyLimit, 10, 'حد التجربة 10 إجابات');
    eq(trialSub.data.state.remaining, 10, '10 إجابات متبقية اليوم');

    const trialWorlds = (await trial.get('/api/worlds')).data.worlds;
    const trialStage = trialWorlds[0].stages[0].id;
    const tStart = await trial.post('/api/play/start', { mode: 'meaning', stageId: trialStage });
    eq(tStart.status, 201, 'التجربة تسمح ببدء جولة');
    eq(tStart.data.session.questions.length, 8, 'جولة التجربة تعرض 8 أسئلة (ضمن حد 10)');
    const tResults = await answerAll(trial, tStart.data.session);
    check(tResults.every(r => r.status === 200), 'إجابات التجربة الثمانية مقبولة');
    await trial.post('/api/play/complete', { sessionId: tStart.data.session.id, timeMs: 3000 });
    const trialAfterRound = (await trial.get('/api/subscription')).data.state;
    eq(trialAfterRound.remaining, 2, 'تبقّت إجابتان من التجربة');

    const tStart2 = await trial.post('/api/play/start', { mode: 'meaning', stageId: trialStage });
    eq(tStart2.status, 201, 'جولة ثانية مسموحة ضمن المتبقي');
    eq(tStart2.data.session.questions.length, 2, 'الجولة الثانية تعرض الإجابتين المتبقيتين فقط');
    await answerAll(trial, tStart2.data.session);
    await trial.post('/api/play/complete', { sessionId: tStart2.data.session.id, timeMs: 500 });
    eq((await trial.get('/api/subscription')).data.state.remaining, 0, 'انتهت تجربة اليوم');

    const blockedPlay = await trial.post('/api/play/start', { mode: 'meaning', stageId: trialStage });
    eq(blockedPlay.status, 402, 'منع بدء اللعب بعد انتهاء التجربة');
    eq(blockedPlay.data.code, 'SUBSCRIPTION_REQUIRED', 'رمز SUBSCRIPTION_REQUIRED يعود للواجهة');
    const blockedDaily = await trial.post('/api/daily/start', {});
    eq(blockedDaily.status, 402, 'تحدي اليوم يتطلب اشتراكًا بعد انتهاء التجربة');
    const blockedReview = await trial.post('/api/review/start', {});
    eq(blockedReview.status, 402, 'المراجعة تتطلب اشتراكًا بعد انتهاء التجربة');

    /* ---- request → queue → approve */
    const req = await trial.post('/api/subscription/request', {
      planId: 'yearly', method: 'bank', reference: `TRX-${suffix}`,
    });
    eq(req.status, 201, 'إرسال طلب اشتراك سنوي');
    eq(req.data.subscription.status, 'pending', 'الطلب بانتظار المراجعة');
    eq(req.data.subscription.amount_sar, 1000, 'مبلغ الطلب 1000 ريال');
    const dupReq = await trial.post('/api/subscription/request', { planId: 'monthly' });
    eq(dupReq.status, 409, 'منع طلب اشتراك مكرر أثناء الانتظار');
    const badReq = await trial.post('/api/subscription/request', { planId: 'weekly' });
    eq(badReq.status, 400, 'رفض خطة اشتراك غير معروفة');
    const trialPending = await trial.get('/api/subscription');
    check(!!trialPending.data.pending, 'الطلب المعلّق يظهر للاعب');

    const queue = await admin.get('/api/admin/subscriptions');
    eq(queue.status, 200, 'طابور الاشتراكات في الإدارة يعمل');
    eq(queue.data.plans.length, 2, 'الإدارة ترى الخطتين');
    gte(queue.data.counts.pending, 1, 'طلب واحد على الأقل بانتظار المراجعة');
    const pendingRow = queue.data.pending.find(r => r.user_id === trialReg.data.user.id);
    check(!!pendingRow, 'طلب اللاعب يظهر في طابور الإدارة');

    const approve = await admin.post(`/api/admin/subscriptions/${pendingRow.id}/approve`, {
      note: 'تم التحقق من التحويل',
    });
    eq(approve.status, 200, 'موافقة المدير على الطلب');
    eq(approve.data.subscription.status, 'active', 'الطلب صار اشتراكًا نشطًا');
    const approvedState = (await trial.get('/api/subscription')).data.state;
    eq(approvedState.active, true, 'اللاعب صار مشتركًا بعد الموافقة');
    eq(approvedState.plan.plan_id, 'yearly', 'الخطة السنوية مفعّلة');
    gte(Math.round((new Date(approvedState.endsAt).getTime() - Date.now()) / 864e5), 364,
      'صلاحية الاشتراك سنة كاملة');
    const playNow = await trial.post('/api/play/start', { mode: 'meaning', stageId: trialStage });
    eq(playNow.status, 201, 'المشترك يلعب بلا حدود يومية');
    await trial.post('/api/play/complete', { sessionId: playNow.data.session.id, timeMs: 100 });

    /* ---- reject flow */
    const rejectUser = new Client();
    const rejectReg = await rejectUser.post('/api/auth/register', {
      username: `Reject_${suffix}`, email: `reject_${suffix}@test.dev`, password: 'RejectPass!2026',
    });
    eq(rejectReg.status, 201, 'تسجيل لاعب ثالث للمراجعة');
    rejectUser.csrf = rejectReg.data.csrf;
    const rejReq = await rejectUser.post('/api/subscription/request', { planId: 'monthly' });
    eq(rejReq.status, 201, 'طلب اشتراك شهري للاعب الثالث');
    const rej = await admin.post(`/api/admin/subscriptions/${rejReq.data.subscription.id}/reject`, {
      note: 'لم يصل التحويل',
    });
    eq(rej.status, 200, 'رفض المدير الطلب');
    eq(rej.data.subscription.status, 'rejected', 'حالة الطلب مرفوض');
    const rejState = await rejectUser.get('/api/subscription');
    eq(rejState.data.state.active, false, 'المرفوض لا يحصل على اشتراك');
    eq(rejState.data.pending, null, 'لا طلب معلّق بعد الرفض');
    const rejAgain = await admin.post(`/api/admin/subscriptions/${rejReq.data.subscription.id}/reject`, {});
    eq(rejAgain.status, 404, 'لا يمكن معالجة الطلب نفسه مرتين');

    /* ---- direct grant */
    const rivalName = `Rival_${suffix}`;
    const grant = await admin.post('/api/admin/subscriptions/grant', {
      username: rivalName, planId: 'monthly', note: 'منح اختباري',
    });
    eq(grant.status, 201, 'منح اشتراك مباشر للاعب الثاني');
    eq(grant.data.state.active, true, 'حالة اشتراك اللاعب الثاني نشطة');
    const unknownGrant = await admin.post('/api/admin/subscriptions/grant', {
      username: `Ghost_${suffix}`, planId: 'monthly',
    });
    eq(unknownGrant.status, 404, 'رفض منح اشتراك لمستخدم غير موجود');
    const badPlan = await admin.post('/api/admin/subscriptions/grant', {
      username: rivalName, planId: 'weekly',
    });
    eq(badPlan.status, 400, 'رفض منح خطة غير معروفة');

    const totals = await admin.get('/api/admin/subscriptions');
    gte(totals.data.counts.active, 3, 'عدّاد الاشتراكات النشطة يعكس المنح والموافقة');
    gte(totals.data.counts.revenue, 1200, 'إجمالي التحصيل يجمع الاشتراكات النشطة');
    gte(totals.data.recent.length, 3, 'سجل الاشتراكات الإداري يعرض الاشتراكات');

    /* ---- 1v1 multiplayer */
    const noSubMp = await rejectUser.post('/api/mp/create', {});
    eq(noSubMp.status, 402, 'غير المشترك لا ينشئ غرفة');
    eq(noSubMp.data.code, 'SUBSCRIPTION_REQUIRED', 'رمز الاشتراك يعود في اللعب الجماعي');
    const noSubJoin = await rejectUser.post('/api/mp/join', { code: 'ABC234' });
    eq(noSubJoin.status, 402, 'غير المشترك لا ينضم لغرفة');

    const room = await player.post('/api/mp/create', {});
    eq(room.status, 201, 'إنشاء غرفة لعب جماعي');
    eq(room.data.room.status, 'waiting', 'الغرفة بانتظار الخصم');
    eq(room.data.room.role, 'host', 'منشئ الغرفة هو المضيف');
    check(/^[A-Z0-9]{6}$/.test(room.data.room.code), 'كود الدعوة 6 أحرف');
    eq(room.data.room.total, 8, 'المباراة 8 أسئلة');
    eq(room.data.room.question, null, 'لا يُكشف سؤال قبل انضمام الخصم');
    const roomCode = room.data.room.code;

    const join = await rival.post('/api/mp/join', { code: roomCode });
    eq(join.status, 201, 'انضمام اللاعب الثاني بالكود');
    eq(join.data.room.status, 'active', 'المباراة تبدأ فور الانضمام');
    eq(join.data.room.role, 'guest', 'دور اللاعب الثاني guest');
    check(!!join.data.room.question, 'السؤال الأول يظهر للضيف');
    check(!!join.data.room.deadline, 'نهاية المباراة (المؤقت) تصل للعميل');
    const hostRoom = (await player.get('/api/mp/room')).data.room;
    eq(hostRoom.role, 'host', 'دور اللاعب الأول host');
    eq(hostRoom.total, 8, 'عدد الأسئلة نفسه للطرفين');
    eq(hostRoom.question.id, join.data.room.question.id, 'نفس السؤال الأول للطرفين');
    check(!JSON.stringify(hostRoom.question).includes('is_correct'),
      'لا تسريب الإجابة الصحيحة في اللعب الجماعي');
    const duplicateRoom = await player.post('/api/mp/create', {});
    eq(duplicateRoom.status, 409, 'منع فتح غرفتين متزامنتين');
    const badJoin = await rival.post('/api/mp/join', { code: roomCode });
    eq(badJoin.status, 409, 'منع انضمام اللاعب لغرفة هو فيها');

    for (let i = 0; i < 8; i++) {
      const hq = (await player.get('/api/mp/room')).data.room.question;
      const hr = await player.post('/api/mp/answer', { optionId: correctOption(hq.id).id });
      eq(hr.status, 200, `إجابة المضيف ${i + 1} مقبولة`);
      eq(hr.data.correct, true, `إجابة المضيف ${i + 1} صحيحة`);
    }
    let lastGuest;
    for (let i = 0; i < 8; i++) {
      const gq = (await rival.get('/api/mp/room')).data.room.question;
      const gr = await rival.post('/api/mp/answer', { optionId: correctOption(gq.id).id });
      eq(gr.status, 200, `إجابة الضيف ${i + 1} مقبولة`);
      eq(gr.data.correct, true, `إجابة الضيف ${i + 1} صحيحة`);
      lastGuest = gr;
    }
    eq(lastGuest.data.room.status, 'finished', 'تنتهي المباراة بعد إجابة الطرفين');
    const finalRoom = (await player.get('/api/mp/room')).data.room;
    eq(finalRoom.status, 'finished', 'الاستطلاع يعيد المباراة المنتهية');
    eq(finalRoom.you.score, 800, 'نقاط المضيف 800');
    eq(finalRoom.opponent.score, 800, 'نقاط الضيف 800');
    eq(finalRoom.winnerId, null, 'تعادل عند تساوي النقاط');

    const mpXp = qa("SELECT user_id, amount FROM xp_events WHERE source = 'multiplayer' AND ref = ?", roomCode);
    eq(mpXp.length, 2, 'مكافأة XP تُمنح لكلا الطرفين مرة واحدة');
    check(mpXp.every(r => r.amount > 0), 'مكافآت اللعب الجماعي موجبة');
    const xpBeforePoll = q1('SELECT xp FROM users WHERE id = ?', playerId).xp;
    await player.get('/api/mp/room');
    eq(q1('SELECT xp FROM users WHERE id = ?', playerId).xp, xpBeforePoll,
      'إعادة الاستطلاع لا تكرر مكافأة المباراة');
    const leave = await rival.post('/api/mp/leave', {});
    eq(leave.status, 200, 'الخروج من الغرفة المنتهية آمن');
  }

  /* ---------------------------------------------------------------- summary */
  section('النتيجة النهائية');
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`  الفحوصات الناجحة: \x1b[32m${passed}\x1b[0m`);
  console.log(`  الفحوصات الفاشلة: ${failed ? '\x1b[31m' : ''}${failed}\x1b[0m`);
  console.log(`  المدة: ${seconds} ثانية`);
  if (failed) {
    console.log('\n\x1b[31mفشل الاختبار — التفاصيل:\x1b[0m');
    for (const f of failures) console.log('  • ' + f);
  } else {
    console.log('\n\x1b[32m✔ كل الاختبارات ناجحة — اللعبة جاهزة.\x1b[0m');
  }
  process.exitCode = failed ? 1 : 0;
}

try {
  await main();
} catch (err) {
  failed++;
  console.error('\n\x1b[31m✗ خطأ غير متوقع أثناء الاختبار:\x1b[0m', err);
  failures.push(String(err?.stack || err));
  process.exitCode = 1;
} finally {
  if (!KEEP) {
    await stopServer(server);
    try { tdb?.close(); } catch { /* noop */ }
    removeDbFiles(DB_PATH);
  } else {
    console.log(`\n(CQ_TEST_KEEP=1) قاعدة الاختبار: ${DB_PATH}\nالخادم: ${BASE}`);
  }
}
