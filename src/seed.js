// CODE QUEST — seeder: imports the Excel encyclopedia and generates questions.
// Usage: node src/seed.js [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db, { DATA_DIR, all, get, run, tx } from './db.js';
import { parseXlsx } from './xlsx.js';
import { hashPassword } from './auth.js';
import {
  WORLDS, RANKS, MAX_LEVEL, xpForLevel, ACHIEVEMENTS, BOSSES, CODE_BANK,
  SIMILAR_PAIRS, SHOP_REWARDS, GAME_MODES,
} from './content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = process.env.CODEQUEST_SOURCE
  || path.join(ROOT, 'data', 'source', 'Programming_Glossary_En_Ar.xlsx');

const FORCE = process.argv.includes('--force');

// ---------------------------------------------------------------- utilities
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xC0DE_9E57);
function shuffle(arr, rand = rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function normKey(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function clean(s) {
  return String(s ?? '').replace(/\r\n/g, '\n').replace(/\s+$/gm, '').trim();
}
const ARABIC_RE = /[\u0600-\u06FF]/;
const LATIN_RE = /[A-Za-z]/;
function isVerifiedTranslation(t) {
  const ar = clean(t.arabic);
  if (!ar || !ARABIC_RE.test(ar)) return false;
  if (ar.includes('مصطلح تقني')) return false;
  if (LATIN_RE.test(ar)) return false;
  return true;
}
const isGenericExample = (s) => !s || s.startsWith('مثال: استخدام');

function pickDistractors(pool, correct, count = 3) {
  const seen = new Set([normKey(correct)]);
  const out = [];
  for (const item of shuffle(pool)) {
    const k = normKey(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length === count) break;
  }
  return out;
}

// ---------------------------------------------------------------- wipe
function wipe() {
  // Defer FK enforcement until the transaction commits; every table is emptied.
  try { db.exec('PRAGMA defer_foreign_keys = ON'); } catch { /* older sqlite */ }
  const tables = [
    'play_answers', 'play_sessions', 'user_answers', 'user_mistakes', 'learning_reviews',
    'user_terms', 'user_progress', 'user_daily', 'user_bosses', 'daily_challenges',
    'user_achievements', 'user_rewards', 'favorites', 'xp_events', 'user_activity',
    'leaderboard_snapshots', 'sessions', 'user_profiles', 'users',
    'question_options', 'questions', 'related_terms', 'examples', 'terms',
    'stages', 'subcategories', 'categories', 'bosses', 'worlds',
    'abbreviations', 'programming_languages', 'concepts',
    'levels', 'achievements', 'rewards', 'game_modes', 'import_jobs', 'game_settings',
  ];
  for (const t of tables) {
    try { run(`DELETE FROM ${t}`); } catch { /* table may not exist yet */ }
  }
  try { run("DELETE FROM sqlite_sequence WHERE name NOT IN ('meta')"); } catch { /* no sequence */ }
}

// ---------------------------------------------------------------- import
function loadSource() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`ملف المصدر غير موجود: ${SOURCE}`);
  }
  const sheets = parseXlsx(fs.readFileSync(SOURCE));
  const required = ['Programming_Glossary', 'Categories', 'Abbreviations', 'Programming_Languages', 'Technical_Concepts'];
  for (const name of required) {
    if (!Array.isArray(sheets[name]) || !sheets[name].length) {
      throw new Error(`ورقة Excel مفقودة أو فارغة: ${name}`);
    }
  }
  return sheets;
}

function main() {
  if (!FORCE) {
    const existing = get('SELECT COUNT(*) AS c FROM terms');
    if (existing && existing.c > 0) {
      console.log(`قاعدة البيانات تحتوي ${existing.c} مصطلحًا بالفعل. استخدم --force لإعادة التوليد.`);
      return;
    }
  }

  const sheets = loadSource();
  const glossary = sheets.Programming_Glossary.map(r => ({
    sourceId: Number(r.ID) || null,
    english: clean(r.English_Term),
    abbreviation: clean(r.Abbreviation),
    fullForm: clean(r.Full_Form),
    arabic: clean(r.Arabic_Term),
    definition: clean(r.Definition_AR),
    category: clean(r.Category),
    subcategory: clean(r.Subcategory),
    difficulty: clean(r.Difficulty) || 'Beginner',
    example: clean(r.Example),
    related: clean(r.Related_Terms),
  })).filter(t => t.english && t.arabic && t.category);

  const categories = sheets.Categories.map(r => ({
    nameEn: clean(r.Category_EN),
    nameAr: clean(r.Category_AR),
    termCount: Number(r.Term_Count) || 0,
  })).filter(c => c.nameAr);

  // ---- integrity checks before writing anything
  const catByName = new Map(categories.map(c => [c.nameAr, c]));
  const mapped = new Map();
  for (const w of WORLDS) {
    for (const c of w.categories) {
      if (!catByName.has(c)) throw new Error(`عالم ${w.code}: تخصص غير موجود في Excel: ${c}`);
      if (mapped.has(c)) throw new Error(`التخصص ${c} مكرر في أكثر من عالم`);
      mapped.set(c, w.code);
    }
  }
  const unmapped = categories.filter(c => !mapped.has(c.nameAr));
  if (unmapped.length) {
    throw new Error('تخصصات غير مغطاة بالعوالم: ' + unmapped.map(c => c.nameAr).join('، '));
  }
  const glossaryCats = new Set(glossary.map(t => t.category));
  for (const c of glossaryCats) {
    if (!catByName.has(c)) throw new Error(`مصطلح ينتمي لتخصص غير معرّف: ${c}`);
  }
  const dupKeys = new Map();
  for (const t of glossary) {
    const k = normKey(t.english);
    if (dupKeys.has(k)) throw new Error(`مصطلح إنجليزي مكرر: ${t.english}`);
    dupKeys.set(k, t);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const report = {};

  tx(() => {
    if (FORCE) wipe();

    // ---- worlds
    const worldIdByCode = new Map();
    WORLDS.forEach((w, i) => {
      const info = run(
        `INSERT INTO worlds(code, name_en, name_ar, subtitle_ar, description_ar, color, icon, sort)
         VALUES(?,?,?,?,?,?,?,?)`,
        w.code, w.name_en, w.name_ar, w.subtitle_ar, w.description_ar, w.color, w.icon, i + 1
      );
      worldIdByCode.set(w.code, Number(info.lastInsertRowid));
    });

    // ---- categories + subcategories + stages (one stage per category)
    const categoryIdByName = new Map();
    const stageIdByCategory = new Map();
    let stageIdx = 0;
    const totalCats = categories.length;
    for (const w of WORLDS) {
      const worldId = worldIdByCode.get(w.code);
      const worldCategories = categories.filter(c => w.categories.includes(c.nameAr));
      worldCategories.forEach((c, idxInWorld) => {
        const catInfo = run(
          'INSERT INTO categories(name_en, name_ar, world_id, sort) VALUES(?,?,?,?)',
          c.nameEn, c.nameAr, worldId, stageIdx + 1
        );
        const categoryId = Number(catInfo.lastInsertRowid);
        categoryIdByName.set(c.nameAr, categoryId);

        const subInfo = run(
          'INSERT INTO subcategories(category_id, name_en, name_ar) VALUES(?,?,?)',
          categoryId, c.nameEn, c.nameAr
        );
        const subId = Number(subInfo.lastInsertRowid);

        const difficultyBoost = Math.min(8, Math.floor(stageIdx / 7));
        const requiredLevel = Math.max(1, 1 + Math.floor((stageIdx / totalCats) * 34));
        const stageInfo = run(
          `INSERT INTO stages(world_id, category_id, name_ar, name_en, sort, required_level, xp_reward, coin_reward)
           VALUES(?,?,?,?,?,?,?,?)`,
          worldId, categoryId, c.nameAr, c.nameEn, idxInWorld + 1,
          requiredLevel, 70 + difficultyBoost * 10, 18 + difficultyBoost * 3
        );
        stageIdByCategory.set(c.nameAr, {
          id: Number(stageInfo.lastInsertRowid),
          subId,
          categoryId,
          worldCode: w.code,
          requiredLevel,
        });
        stageIdx++;
      });
    }
    report.worlds = WORLDS.length;
    report.categories = categories.length;
    report.stages = stageIdx;

    // ---- terms
    const termIdByKey = new Map();
    const verifiedArabicPool = [];
    const verifiedEnglishPool = [];
    const termsByCategory = new Map();
    let verifiedCount = 0;
    let needsReviewCount = 0;

    for (const t of glossary) {
      const stage = stageIdByCategory.get(t.category);
      if (!stage) throw new Error(`لا توجد مرحلة للتخصص: ${t.category}`);
      const verified = isVerifiedTranslation(t) ? 'verified' : 'needs_review';
      if (verified === 'verified') verifiedCount++; else needsReviewCount++;
      const info = run(
        `INSERT INTO terms(
            english, english_key, abbreviation, full_form, arabic, definition_ar,
            category_id, subcategory_id, subcategory, difficulty, example, related_terms,
            stage_id, translation_status, source_id
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        t.english, normKey(t.english), t.abbreviation || null, t.fullForm || null,
        t.arabic, t.definition, stage.categoryId, stage.subId, t.subcategory,
        t.difficulty, t.example || null, t.related || null, stage.id, verified, t.sourceId
      );
      const termId = Number(info.lastInsertRowid);
      termIdByKey.set(normKey(t.english), termId);
      if (verified === 'verified') {
        verifiedArabicPool.push({ id: termId, text: t.arabic, category: t.category, english: t.english });
        verifiedEnglishPool.push({ id: termId, text: t.english, category: t.category, arabic: t.arabic });
      }
      if (!termsByCategory.has(t.category)) termsByCategory.set(t.category, []);
      termsByCategory.get(t.category).push({ id: termId, ...t, verified });

      if (!isGenericExample(t.example)) {
        run(
          'INSERT INTO examples(term_id, code, language, note_ar) VALUES(?,?,?,?)',
          termId, t.example, guessLanguage(t.example), null
        );
      }
    }
    report.terms = glossary.length;
    report.verified = verifiedCount;
    report.needs_review = needsReviewCount;

    // ---- related terms
    let relatedCount = 0;
    for (const t of glossary) {
      if (!t.related) continue;
      const fromId = termIdByKey.get(normKey(t.english));
      for (const raw of t.related.split(';')) {
        const toId = termIdByKey.get(normKey(raw));
        if (!toId || toId === fromId) continue;
        run(
          'INSERT OR IGNORE INTO related_terms(term_id, related_term_id, relation) VALUES(?,?,?)',
          fromId, toId, 'related'
        );
        relatedCount++;
      }
    }
    report.related_terms = relatedCount;

    // ---- abbreviations / languages / concepts
    const abbrSeen = new Set();
    const abbrs = [];
    for (const a of sheets.Abbreviations) {
      const abbr = clean(a.Abbreviation);
      const full = clean(a.Full_Form);
      if (!abbr || !full) continue;
      const k = abbr.toLowerCase();
      if (abbrSeen.has(k)) continue;
      abbrSeen.add(k);
      const catId = categoryIdByName.get(clean(a.Category)) || null;
      run(
        'INSERT INTO abbreviations(abbreviation, full_form, meaning_ar, arabic_term, category_id) VALUES(?,?,?,?,?)',
        abbr, full, clean(a.Meaning_AR) || null, clean(a.Arabic_Term) || null, catId
      );
      abbrs.push({ abbr, full, catId });
    }
    report.abbreviations = abbrs.length;

    for (const l of sheets.Programming_Languages) {
      const name = clean(l.Language);
      if (!name) continue;
      run(
        `INSERT OR IGNORE INTO programming_languages(name, arabic_name, primary_uses, difficulty, paradigm)
         VALUES(?,?,?,?,?)`,
        name, clean(l.Arabic_Name) || null, clean(l.Primary_Uses) || null,
        clean(l.Difficulty) || null, clean(l.Paradigm_or_Notes) || null
      );
    }
    report.languages = sheets.Programming_Languages.length;

    const conceptByKey = new Map();
    for (const c of sheets.Technical_Concepts) {
      const name = clean(c.Concept);
      if (!name) continue;
      const info = run(
        'INSERT INTO concepts(concept, arabic_term, explanation_ar, difficulty, is_pair) VALUES(?,?,?,?,?)',
        name, clean(c.Arabic_Term) || null, clean(c.Explanation_AR) || null,
        clean(c.Difficulty) || null, name.includes(' vs ') ? 1 : 0
      );
      conceptByKey.set(normKey(name), { id: Number(info.lastInsertRowid), ...c });
    }
    report.concepts = conceptByKey.size;

    // ---- levels / ranks
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const rank = [...RANKS].reverse().find(r => level >= r.minLevel) || RANKS[0];
      run(
        'INSERT INTO levels(level, min_xp, title_en, title_ar, rank_key, color, icon) VALUES(?,?,?,?,?,?,?)',
        level, xpForLevel(level), rank.name_en, rank.name_ar, rank.key, rank.color, rank.icon
      );
    }
    report.levels = MAX_LEVEL;

    // ---- achievements
    ACHIEVEMENTS.forEach(a => {
      run(
        `INSERT INTO achievements(code, title_ar, title_en, description_ar, icon, tier, xp_reward, coin_reward, condition_json, sort)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        a.code, a.title_ar, a.title_en, a.description_ar, a.icon, a.tier,
        a.xp, a.coins, JSON.stringify(a.condition), a.sort
      );
    });
    report.achievements = ACHIEVEMENTS.length;

    // ---- rewards
    SHOP_REWARDS.forEach((r, i) => {
      run(
        `INSERT INTO rewards(code, name_ar, name_en, type, cost, description_ar, asset, rarity, sort)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        r.code, r.name_ar, r.name_en, r.type, r.cost, r.description_ar, r.asset, r.rarity, i + 1
      );
    });
    report.rewards = SHOP_REWARDS.length;

    // ---- bosses
    BOSSES.forEach(b => {
      const known = b.categories.filter(c => categoryIdByName.has(c));
      if (!known.length) throw new Error(`زعيم بلا تخصصات صالحة: ${b.code}`);
      run(
        `INSERT INTO bosses(code, name_ar, name_en, category_names, icon, color, required_level,
                            xp_reward, coin_reward, title_ar, description_ar, sort)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        b.code, b.name_ar, b.name_en, JSON.stringify(known), b.icon, b.color,
        b.requiredLevel, b.xp, b.coins, b.title_ar, b.description_ar, b.sort
      );
    });
    report.bosses = BOSSES.length;

    // ---- game modes
    GAME_MODES.forEach(m => {
      run(
        'INSERT INTO game_modes(code, name_en, name_ar, description_ar, icon, unlocked_level, config) VALUES(?,?,?,?,?,?,?)',
        m.code, m.name_en, m.name_ar, m.description_ar, m.icon, m.unlockedLevel, null
      );
    });
    report.modes = GAME_MODES.length;

    // ------------------------------------------------------------ questions
    const diffs = ['Beginner', 'Intermediate', 'Advanced'];
    const questionStats = {};

    // 1) Guess the meaning (verified translations only)
    for (const t of verifiedArabicPool) {
      const stage = stageIdByCategory.get(t.category);
      const sameCat = verifiedArabicPool.filter(x => x.category === t.category && x.id !== t.id);
      const pool = sameCat.length >= 3 ? sameCat : verifiedArabicPool.filter(x => x.id !== t.id);
      if (pool.length < 3) continue;
      const options = shuffle([t.text, ...pickDistractors(pool.map(x => x.text), t.text, 3)]);
      const qid = insertQuestion({
        qkey: `meaning:${t.id}`,
        termId: t.id,
        categoryId: stage.categoryId,
        mode: 'meaning',
        prompt: t.english,        // English term shown big
        promptAr: 'ماذا يعني هذا المصطلح؟',
        answer: t.text,
        answerIsArabic: true,
        explanation: explanationFor(t.id),
        difficulty: diffs[Math.floor(rng() * 2)],
        options,
        correct: t.text,
      });
      questionStats.meaning = (questionStats.meaning || 0) + 1;
    }

    // 2) English challenge (verified translations only)
    for (const t of verifiedEnglishPool) {
      const stage = stageIdByCategory.get(t.category);
      const sameCat = verifiedEnglishPool.filter(x => x.category === t.category && x.id !== t.id);
      const pool = sameCat.length >= 3 ? sameCat : verifiedEnglishPool.filter(x => x.id !== t.id);
      if (pool.length < 3) continue;
      const options = shuffle([t.text, ...pickDistractors(pool.map(x => x.text), t.text, 3)]);
      insertQuestion({
        qkey: `english:${t.id}`,
        termId: t.id,
        categoryId: stage.categoryId,
        mode: 'english',
        prompt: t.arabic,
        promptAr: 'ما المصطلح الإنجليزي الذي يعني هذا؟',
        answer: t.text,
        explanation: `المصطلح الإنجليزي الصحيح هو «${t.text}».`,
        difficulty: diffs[Math.floor(rng() * 2)],
        options,
        correct: t.text,
      });
      questionStats.english = (questionStats.english || 0) + 1;
    }

    // 3) Word puzzle (every term — prompt hides the term in the definition)
    for (const t of glossary) {
      const termId = termIdByKey.get(normKey(t.english));
      const letters = t.english.replace(/\s+/g, '');
      if (!/^[A-Za-z]{4,20}$/.test(letters)) continue;
      const scrambled = scramble(letters, rng);
      if (normKey(scrambled) === normKey(letters)) continue;
      const stage = stageIdByCategory.get(t.category);
      const isVerified = isVerifiedTranslation(t);
      const clue = redact(t.definition, t.english);
      const safeClue = clue.includes('______') ? clue : `${clue}\nالمصطلح: ______`;
      const promptAr = isVerified
        ? `رتّب الأحرف لتكوين المصطلح الإنجليزي الذي يعني: ${t.arabic}`
        : `رتّب الأحرف لتكوين المصطلح الإنجليزي المناسب للتعريف:\n${safeClue}`;
      insertQuestion({
        qkey: `puzzle:${termId}`,
        termId,
        categoryId: stage.categoryId,
        mode: 'puzzle',
        prompt: scrambled,
        promptAr,
        code: letters,
        answer: t.english,
        explanation: `المصطلح هو «${t.english}»${isVerified ? ` — ${t.arabic}` : ''}.`,
        difficulty: t.difficulty,
        options: [],
        correct: null,
      });
      questionStats.puzzle = (questionStats.puzzle || 0) + 1;
    }

    // 4) Complete the code (curated snippets matched to real terms)
    for (const entry of CODE_BANK) {
      const key = normKey(entry.term);
      const termId = termIdByKey.get(key);
      if (!termId) continue;
      const term = glossary.find(g => normKey(g.english) === key);
      const stage = stageIdByCategory.get(term.category);
      const sameCat = (termsByCategory.get(term.category) || []).filter(x => x.id !== termId);
      const pool = sameCat.length >= 3
        ? sameCat.map(x => x.english)
        : glossary.filter(g => normKey(g.english) !== key).map(g => g.english);
      const options = shuffle([term.english, ...pickDistractors(pool, term.english, 3)]);
      insertQuestion({
        qkey: `code:${termId}`,
        termId,
        categoryId: stage.categoryId,
        mode: 'code',
        prompt: entry.code,
        promptAr: 'أي مصطلح يكمل الشيفرة بشكل صحيح؟',
        code: entry.code,
        answer: term.english,
        explanation: entry.note_ar,
        difficulty: term.difficulty,
        options,
        correct: term.english,
      });
      questionStats.code = (questionStats.code || 0) + 1;
    }

    // 5) Abbreviation questions (English challenge variant)
    const fullForms = abbrs.map(a => a.full);
    for (const a of abbrs) {
      const pool = fullForms.filter(f => normKey(f) !== normKey(a.full));
      if (pool.length < 3) continue;
      const options = shuffle([a.full, ...pickDistractors(pool, a.full, 3)]);
      insertQuestion({
        qkey: `abbr:${a.abbr}`,
        termId: termIdByKey.get(normKey(a.abbr)) || null,
        categoryId: a.catId,
        mode: 'english',
        prompt: a.abbr,
        promptAr: `ماذا يعني الاختصار ${a.abbr}؟`,
        answer: a.full,
        explanation: `${a.abbr} = ${a.full}`,
        difficulty: 'Intermediate',
        options,
        correct: a.full,
      });
      questionStats.abbreviation = (questionStats.abbreviation || 0) + 1;
    }

    // 6) Similar terms
    for (const pair of SIMILAR_PAIRS) {
      const concept = conceptByKey.get(normKey(pair.title_en)) || null;
      insertQuestion({
        qkey: `similar:${pair.code}`,
        termId: termIdByKey.get(normKey(pair.left.term)) || null,
        categoryId: null,
        mode: 'similar',
        prompt: pair.title_ar,
        promptAr: pair.question.prompt,
        answer: pair.question.answer,
        explanation: concept ? clean(concept.Explanation_AR) : null,
        difficulty: 'Intermediate',
        options: pair.question.options.slice(),
        correct: pair.question.answer,
      });
      questionStats.similar = (questionStats.similar || 0) + 1;
    }

    report.questions = questionStats;
    report.question_total = Object.values(questionStats).reduce((a, b) => a + b, 0);

    // ------------------------------------------------------------ users
    const adminPassword = process.env.ADMIN_PASSWORD || 'CodeQuest!2026';
    const adminInfo = run(
      'INSERT INTO users(username, email, password_hash, role, xp, coins, created_at) VALUES(?,?,?,?,?,?,?)',
      'admin', 'admin@codequest.local', hashPassword(adminPassword), 'admin', 0, 1000, new Date().toISOString()
    );
    const adminId = Number(adminInfo.lastInsertRowid);
    run(
      `INSERT INTO user_profiles(user_id, display_name, avatar, onboarded) VALUES(?,?,?,1)`,
      adminId, 'مدير اللعبة', 'cyber'
    );
    run('INSERT OR IGNORE INTO user_achievements(user_id, achievement_id) SELECT ?, id FROM achievements WHERE code = ?', adminId, 'first_word');

    // NPC rivals for a lively leaderboard (clearly flagged with is_npc = 1)
    const rivals = [
      ['NovaByte', 'نوفا', 'nova', 720], ['Syntax Wolf', 'ذئب الصياغة', 'pixel', 1850],
      ['Kernel Kid', 'كيد النواة', 'byte', 3200], ['Cipher Queen', 'ملكة التشفير', 'cyber', 5600],
      ['Vector', 'فيكتور', 'quantum', 8900], ['Deep Logic', 'منطق عميق', 'legend', 14200],
      ['Async Fox', 'ثعلب غير متزامن', 'byte', 21000], ['CodeMage', 'ساحر الشيفرة', 'legend', 31500],
    ];
    rivals.forEach(([name, ar, avatar, xp], i) => {
      const info = run(
        'INSERT INTO users(username, email, password_hash, xp, coins, is_npc, created_at) VALUES(?,?,?,?,?,?,?)',
        name, `rival${i + 1}@codequest.local`, hashPassword(`rival-${Date.now()}-${i}-${Math.random()}`),
        xp, 500, 1, new Date().toISOString()
      );
      run(
        'INSERT INTO user_profiles(user_id, display_name, avatar, onboarded) VALUES(?,?,?,1)',
        Number(info.lastInsertRowid), ar, avatar
      );
    });
    report.rivals = rivals.length;

    // ---- starter reward rows for admin (so profile looks functional)
    run(
      `INSERT OR IGNORE INTO user_rewards(user_id, reward_id, equipped)
       SELECT ?, id, 1 FROM rewards WHERE code IN ('avatar-nova','bg-default','frame-none')`,
      adminId
    );

    // ---- settings
    const settings = {
      seeded_at: new Date().toISOString(),
      source_file: path.basename(SOURCE),
      source_terms: String(glossary.length),
      verified_translations: String(verifiedCount),
      needs_review: String(needsReviewCount),
      game_version: '1.0.0',
      xp_correct: '10',
      speed_seconds: '60',
      daily_question_count: '8',
    };
    for (const [k, v] of Object.entries(settings)) {
      run('INSERT OR REPLACE INTO game_settings(key, value) VALUES(?,?)', k, v);
    }
  });

  // ---------------------------------------------------------------- report
  const byMode = all('SELECT mode, COUNT(*) AS c FROM questions GROUP BY mode ORDER BY mode');
  const verifiedByCat = all(`
    SELECT c.name_ar AS cat, SUM(CASE WHEN t.translation_status='verified' THEN 1 ELSE 0 END) AS v,
           COUNT(t.id) AS total
      FROM categories c LEFT JOIN terms t ON t.category_id = c.id
     GROUP BY c.id ORDER BY v ASC, c.name_ar LIMIT 8
  `);
  console.log('\n=== CODE QUEST — تقرير الاستيراد ===');
  console.log(`المصدر: ${path.basename(SOURCE)}`);
  console.log(`العوالم: ${report.worlds} | التخصصات: ${report.categories} | المراحل: ${report.stages}`);
  console.log(`المصطلحات: ${report.terms} | ترجمات موثقة: ${report.verified} | تحتاج مراجعة: ${report.needs_review}`);
  console.log(`الاختصارات: ${report.abbreviations} | اللغات: ${report.languages} | المفاهيم: ${report.concepts}`);
  console.log(`العلاقات: ${report.related_terms} | الزعماء: ${report.bosses} | الإنجازات: ${report.achievements}`);
  console.log('الأسئلة حسب النمط:');
  for (const r of byMode) console.log(`  - ${r.mode}: ${r.c}`);
  console.log(`إجمالي الأسئلة: ${report.question_total}`);
  console.log('أقل التخصصات بترجمات موثقة:');
  for (const r of verifiedByCat) console.log(`  - ${r.cat}: ${r.v}/${r.total}`);
  console.log(`\nحساب المدير: admin / ${process.env.ADMIN_PASSWORD ? '(من ADMIN_PASSWORD)' : 'CodeQuest!2026'}`);
  console.log('تم بناء قاعدة البيانات بنجاح.\n');
}

// ---------------------------------------------------------------- helpers
function insertQuestion(q) {
  const info = run(
    `INSERT INTO questions(qkey, term_id, category_id, mode, prompt, prompt_ar, code,
                           answer, explanation, difficulty, source)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    q.qkey, q.termId, q.categoryId, q.mode, q.prompt, q.promptAr || null, q.code || null,
    q.answer, q.explanation || null, q.difficulty || null, 'generated'
  );
  const qid = Number(info.lastInsertRowid);
  if (Array.isArray(q.options)) {
    q.options.forEach((opt, i) => {
      run(
        'INSERT INTO question_options(question_id, text, is_correct, sort) VALUES(?,?,?,?)',
        qid, opt, normKey(opt) === normKey(q.correct) ? 1 : 0, i + 1
      );
    });
  }
  return qid;
}

function scramble(word, rand) {
  const letters = word.split('');
  if (letters.length < 2) return word;
  for (let attempt = 0; attempt < 30; attempt++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    const out = letters.join('');
    if (normKey(out) !== normKey(word)) return out.toUpperCase();
  }
  [letters[0], letters[1]] = [letters[1], letters[0]];
  return letters.join('').toUpperCase();
}

function redact(text, term) {
  if (!text) return '';
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), '______');
}

function explanationFor(termId) {
  const row = get(
    `SELECT t.english, t.arabic, t.definition_ar, t.example
       FROM terms t WHERE t.id = ?`, termId
  );
  if (!row) return null;
  const parts = [`«${row.english}» تعني «${row.arabic}».`];
  if (row.definition_ar && !row.definition_ar.includes('مفهوم يُستخدم في مجال')) {
    parts.push(row.definition_ar);
  }
  if (row.example && !isGenericExample(row.example)) parts.push(`مثال: ${row.example}`);
  return parts.join('\n');
}

function guessLanguage(sample) {
  const s = String(sample);
  if (/\bSELECT\b|\bCREATE TABLE\b|\bINSERT INTO\b/i.test(s)) return 'sql';
  if (/\bdef \b|import |print\(/.test(s)) return 'python';
  if (/\bclass \w+:|self\./.test(s)) return 'python';
  if (/console\.log|function |const |let /.test(s)) return 'javascript';
  if (/\bgit \b/.test(s)) return 'bash';
  if (/^</.test(s) || /<\/\w+>/.test(s)) return 'html';
  return null;
}

try {
  main();
} catch (err) {
  console.error('\nفشل الاستيراد:', err.message);
  if (process.env.DEBUG) console.error(err);
  process.exitCode = 1;
}
