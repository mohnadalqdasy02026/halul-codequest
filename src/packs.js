// CODE QUEST — offline stage packs.
// The Android app downloads one pack per stage on first use and plays
// entirely offline afterwards. Packs intentionally carry answers, because
// offline scoring happens on-device (the app is a local-first game).
import { all, get, run } from './db.js';

const PACK_VERSION = 1;

export function stagePack(stageId) {
  const stage = get(
    `SELECT s.id, s.world_id, s.category_id, s.name_ar, s.name_en, s.sort,
            s.required_level, s.xp_reward, s.coin_reward,
            w.name_ar AS world_name_ar, w.name_en AS world_name_en, w.color AS world_accent, w.icon AS world_icon
       FROM stages s JOIN worlds w ON w.id = s.world_id
      WHERE s.id = ?`,
    Number(stageId)
  );
  if (!stage) return null;

  const category = get(
    'SELECT id, name_ar, name_en FROM categories WHERE id = ?',
    stage.category_id
  );

  const terms = all(
    `SELECT id, english, abbreviation, full_form, arabic, definition_ar,
            subcategory, difficulty, example, related_terms, translation_status
       FROM terms
      WHERE stage_id = ? AND active = 1
      ORDER BY id`,
    stage.id
  );
  const termIds = terms.map(t => t.id);

  let questions = [];
  if (termIds.length) {
    const placeholders = termIds.map(() => '?').join(',');
    questions = all(
      `SELECT q.id, q.term_id, q.mode, q.prompt, q.prompt_ar, q.answer,
              q.explanation, q.code, q.difficulty, q.category_id, t.english AS term_english
         FROM questions q
         LEFT JOIN terms t ON t.id = q.term_id
        WHERE q.active = 1
          AND (q.mode = 'similar'
               OR (q.term_id IN (${placeholders})
                   AND q.mode IN ('meaning','english','puzzle','code')))
        ORDER BY q.mode, q.id`,
      ...termIds
    );
  } else {
    questions = all(
      `SELECT q.id, q.term_id, q.mode, q.prompt, q.prompt_ar, q.answer,
              q.explanation, q.code, q.difficulty, q.category_id, NULL AS term_english
         FROM questions q
        WHERE q.active = 1 AND q.mode = 'similar'
        ORDER BY q.id`
    );
  }

  const questionIds = questions.map(q => q.id);
  const optionsByQuestion = new Map();
  if (questionIds.length) {
    const opts = all(
      `SELECT id, question_id, text, is_correct, sort
         FROM question_options
        WHERE question_id IN (${questionIds.map(() => '?').join(',')})
        ORDER BY question_id, sort`,
      ...questionIds
    );
    for (const opt of opts) {
      const list = optionsByQuestion.get(opt.question_id) || [];
      list.push({ id: opt.id, text: opt.text, correct: !!opt.is_correct });
      optionsByQuestion.set(opt.question_id, list);
    }
  }

  return {
    packVersion: PACK_VERSION,
    fetchedAt: new Date().toISOString(),
    stage: {
      id: stage.id,
      worldId: stage.world_id,
      nameAr: stage.name_ar,
      nameEn: stage.name_en,
      sort: stage.sort,
      requiredLevel: stage.required_level,
      xpReward: stage.xp_reward,
      coinReward: stage.coin_reward,
      world: { nameAr: stage.world_name_ar, nameEn: stage.world_name_en, accent: stage.world_accent, icon: stage.world_icon },
      category: { id: category.id, nameAr: category.name_ar, nameEn: category.name_en },
      counts: { terms: terms.length, questions: questions.length },
    },
    terms: terms.map(t => ({
      id: t.id,
      english: t.english,
      abbreviation: t.abbreviation,
      fullForm: t.full_form,
      arabic: t.arabic,
      definitionAr: t.definition_ar,
      subcategory: t.subcategory,
      difficulty: t.difficulty,
      example: t.example,
      related: (t.related_terms || '').split(';').map(s => s.trim()).filter(Boolean),
      verified: t.translation_status === 'verified',
    })),
    questions: questions.map(q => ({
      id: q.id,
      termId: q.term_id,
      mode: q.mode,
      prompt: q.prompt,
      promptAr: q.prompt_ar,
      answer: q.answer,
      explanation: q.explanation,
      code: q.code,
      difficulty: q.difficulty,
      options: optionsByQuestion.get(q.id) || [],
    })),
  };
}

/** Small index used by the app to show lock/download state quickly. */
export function packIndex() {
  return all(
    `SELECT s.id, s.name_ar, s.name_en, s.sort, s.world_id,
            w.name_ar AS world_name_ar, w.name_en AS world_name_en, w.icon AS world_icon, w.color AS world_color,
            (SELECT COUNT(*) FROM terms t WHERE t.stage_id = s.id AND t.active = 1) AS terms,
            (SELECT COUNT(*) FROM questions q WHERE q.term_id IN
               (SELECT id FROM terms WHERE stage_id = s.id AND active = 1)
               AND q.active = 1) AS questions
       FROM stages s JOIN worlds w ON w.id = s.world_id
      ORDER BY s.world_id, s.sort`
  );
}
