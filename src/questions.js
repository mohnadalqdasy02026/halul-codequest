// CODE QUEST — question generation for admin edits and future imports.
import { all, get, run } from './db.js';
import { CODE_BANK } from './content.js';

const ARABIC_RE = /[\u0600-\u06FF]/;
const LATIN_RE = /[A-Za-z]/;

export function normKey(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isVerifiedArabic(arabic) {
  const ar = String(arabic || '').trim();
  if (!ar || !ARABIC_RE.test(ar)) return false;
  if (ar.includes('مصطلح تقني')) return false;
  if (LATIN_RE.test(ar)) return false;
  return true;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

function insertQuestion(q) {
  const info = run(
    `INSERT INTO questions(qkey, term_id, category_id, mode, prompt, prompt_ar, code,
                           answer, explanation, difficulty, source)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    q.qkey, q.termId, q.categoryId, q.mode, q.prompt, q.promptAr || null, q.code || null,
    q.answer, q.explanation || null, q.difficulty || null, q.source || 'generated'
  );
  const qid = Number(info.lastInsertRowid);
  for (const [i, opt] of (q.options || []).entries()) {
    run(
      'INSERT INTO question_options(question_id, text, is_correct, sort) VALUES(?,?,?,?)',
      qid, opt, normKey(opt) === normKey(q.correct) ? 1 : 0, i + 1
    );
  }
  return qid;
}

function scramble(word) {
  const letters = word.split('');
  for (let attempt = 0; attempt < 30; attempt++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    const out = letters.join('');
    if (normKey(out) !== normKey(word)) return out.toUpperCase();
  }
  return letters.join('').toUpperCase();
}

function redact(text, term) {
  if (!text) return '';
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text).replace(new RegExp(escaped, 'gi'), '______');
}

/** Regenerate every auto-generated question for a single term. */
export function regenerateTermQuestions(termId) {
  const term = get(
    `SELECT t.*, s.id AS stage_id, c.name_ar AS category_ar
       FROM terms t JOIN categories c ON c.id = t.category_id
       LEFT JOIN stages s ON s.category_id = t.category_id
      WHERE t.id = ?`, termId
  );
  if (!term) return 0;
  // Retire the previous auto-generated questions instead of deleting them:
  // play_answers/user_answers/user_mistakes reference question ids, so a hard
  // delete would fail (or destroy the learner's history) once a term is played.
  // Renaming the qkey keeps the UNIQUE constraint happy while new questions
  // are inserted under the canonical key.
  run(
    `UPDATE questions SET active = 0, qkey = qkey || ':retired:' || id
      WHERE term_id = ? AND source = 'generated' AND active = 1`,
    termId
  );
  const verified = term.translation_status === 'verified';
  let made = 0;

  if (verified) {
    const pool = all(
      `SELECT arabic AS text FROM terms WHERE translation_status = 'verified' AND id <> ?`,
      termId
    ).map(r => r.text);
    if (pool.length >= 3) {
      const options = shuffle([term.arabic, ...pickDistractors(pool, term.arabic)]);
      insertQuestion({
        qkey: `meaning:${termId}`, termId, categoryId: term.category_id, mode: 'meaning',
        prompt: term.english, promptAr: 'ماذا يعني هذا المصطلح؟',
        answer: term.arabic, explanation: `«${term.english}» تعني «${term.arabic}».`,
        difficulty: term.difficulty, options, correct: term.arabic,
      });
      made++;
    }
    const ePool = all(
      `SELECT english AS text FROM terms WHERE translation_status = 'verified' AND id <> ?`,
      termId
    ).map(r => r.text);
    if (ePool.length >= 3) {
      const options = shuffle([term.english, ...pickDistractors(ePool, term.english)]);
      insertQuestion({
        qkey: `english:${termId}`, termId, categoryId: term.category_id, mode: 'english',
        prompt: term.arabic, promptAr: 'ما المصطلح الإنجليزي الذي يعني هذا؟',
        answer: term.english, explanation: `المصطلح الإنجليزي الصحيح هو «${term.english}».`,
        difficulty: term.difficulty, options, correct: term.english,
      });
      made++;
    }
  }

  const letters = term.english.replace(/\s+/g, '');
  if (/^[A-Za-z]{4,20}$/.test(letters)) {
    const scrambled = scramble(letters);
    insertQuestion({
      qkey: `puzzle:${termId}`, termId, categoryId: term.category_id, mode: 'puzzle',
      prompt: scrambled,
      promptAr: verified
        ? `رتّب الأحرف لتكوين المصطلح الإنجليزي الذي يعني: ${term.arabic}`
        : (() => {
            const clue = redact(term.definition_ar, term.english);
            return `رتّب الأحرف لتكوين المصطلح الإنجليزي المناسب للتعريف:\n${clue.includes('______') ? clue : `${clue}\nالمصطلح: ______`}`;
          })(),
      code: letters, answer: term.english,
      explanation: `المصطلح هو «${term.english}»${verified ? ` — ${term.arabic}` : ''}.`,
      difficulty: term.difficulty, options: [], correct: null,
    });
    made++;
  }

  const bank = CODE_BANK.find(b => normKey(b.term) === normKey(term.english));
  if (bank) {
    const pool = all(
      `SELECT english AS text FROM terms WHERE id <> ? AND category_id = ?`, termId, term.category_id
    ).map(r => r.text);
    const fallback = all('SELECT english AS text FROM terms WHERE id <> ? LIMIT 50', termId).map(r => r.text);
    const options = shuffle([term.english, ...pickDistractors(pool.length >= 3 ? pool : fallback, term.english)]);
    insertQuestion({
      qkey: `code:${termId}`, termId, categoryId: term.category_id, mode: 'code',
      prompt: bank.code, promptAr: 'أي مصطلح يكمل الشيفرة بشكل صحيح؟', code: bank.code,
      answer: term.english, explanation: bank.note_ar, difficulty: term.difficulty,
      options, correct: term.english,
    });
    made++;
  }
  return made;
}

/** Recompute translation_status after a term edit. */
export function refreshTranslationStatus(termId) {
  const t = get('SELECT arabic FROM terms WHERE id = ?', termId);
  if (!t) return;
  const status = isVerifiedArabic(t.arabic) ? 'verified' : 'needs_review';
  run('UPDATE terms SET translation_status = ?, updated_at = ? WHERE id = ?', status, new Date().toISOString(), termId);
}
