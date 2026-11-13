// CODE QUEST — game rules: XP, ranks, mastery, spaced repetition, achievements.
import { all, addDaysIso, get, nowIso, run, todayKey, tx } from './db.js';
import {
  RANKS, MAX_LEVEL, xpForLevel, levelFromXp, rankForLevel,
} from './content.js';

export const XP_BY_MODE = {
  meaning: 10, english: 10, puzzle: 12, code: 14, match: 12, speed: 8, boss: 15, similar: 12, review: 10,
};
export const COINS_BY_MODE = {
  meaning: 1, english: 1, puzzle: 1, code: 2, match: 2, speed: 1, boss: 3, similar: 2, review: 1,
};

export function addXp(userId, amount, source, ref = null) {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  if (!n) return 0;
  run('UPDATE users SET xp = xp + ? WHERE id = ?', n, userId);
  run('INSERT INTO xp_events(user_id, amount, source, ref) VALUES(?,?,?,?)', userId, n, source, ref);
  return n;
}

export function addCoins(userId, amount) {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  if (!n) return 0;
  run('UPDATE users SET coins = coins + ? WHERE id = ?', n, userId);
  return n;
}

export function spendCoins(userId, amount) {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  const user = get('SELECT coins FROM users WHERE id = ?', userId);
  if (!user || user.coins < n) return false;
  run('UPDATE users SET coins = coins - ? WHERE id = ?', n, userId);
  return true;
}

export function getProfile(userId) {
  const user = get('SELECT * FROM users WHERE id = ?', userId);
  if (!user) return null;
  let profile = get('SELECT * FROM user_profiles WHERE user_id = ?', userId);
  if (!profile) {
    run('INSERT INTO user_profiles(user_id, display_name) VALUES(?,?)', userId, user.username);
    profile = get('SELECT * FROM user_profiles WHERE user_id = ?', userId);
  }
  const level = levelFromXp(user.xp);
  const rank = rankForLevel(level);
  const current = xpForLevel(level);
  const next = level >= MAX_LEVEL ? current : xpForLevel(level + 1);
  const mastered = get(
    "SELECT COUNT(*) AS c FROM user_terms WHERE user_id = ? AND status = 'mastered'", userId
  ).c;
  const seen = get('SELECT COUNT(*) AS c FROM user_terms WHERE user_id = ?', userId).c;
  const completedStages = get(
    "SELECT COUNT(*) AS c FROM user_progress WHERE user_id = ? AND status = 'completed'", userId
  ).c;
  const achievements = get('SELECT COUNT(*) AS c FROM user_achievements WHERE user_id = ?', userId).c;
  const nextRank = RANKS.find(r => r.minLevel > level) || null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    xp: user.xp,
    coins: user.coins,
    level,
    rank,
    nextRank,
    xpIntoLevel: user.xp - current,
    xpForNextLevel: Math.max(1, next - current),
    xpToNext: Math.max(0, next - user.xp),
    profile,
    stats: {
      mastered,
      seen,
      completedStages,
      achievements,
      totalAnswered: profile.total_answered,
      totalCorrect: profile.total_correct,
      accuracy: profile.total_answered
        ? Math.round((profile.total_correct / profile.total_answered) * 1000) / 10 : 0,
      currentStreak: profile.current_streak,
      longestStreak: profile.longest_streak,
      totalTimeMs: profile.total_time_ms,
    },
  };
}

// ------------------------------------------------------------------ mastery
export function recordTermResult(userId, termId, isCorrect, quality = isCorrect ? 5 : 2) {
  if (!termId) return;
  const now = nowIso();
  const existing = get('SELECT * FROM user_terms WHERE user_id = ? AND term_id = ?', userId, termId);
  let correct = (existing?.correct_count || 0) + (isCorrect ? 1 : 0);
  let wrong = (existing?.wrong_count || 0) + (isCorrect ? 0 : 1);
  let mastery = existing?.mastery ?? 0;
  if (isCorrect) mastery = mastery + (1 - mastery) * 0.22;
  else mastery = mastery * 0.55;
  if (mastery > 0.999) mastery = 1;
  let status = 'new';
  if (correct + wrong > 0) status = 'learning';
  if (mastery >= 0.5) status = 'reviewing';
  if (mastery >= 0.85 && correct >= 3) status = 'mastered';

  run(
    `INSERT INTO user_terms(user_id, term_id, status, correct_count, wrong_count, last_seen_at, mastery, updated_at)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, term_id) DO UPDATE SET
       status = excluded.status,
       correct_count = excluded.correct_count,
       wrong_count = excluded.wrong_count,
       last_seen_at = excluded.last_seen_at,
       mastery = excluded.mastery,
       updated_at = excluded.updated_at`,
    userId, termId, status, correct, wrong, now, mastery, now
  );

  // SM-2 style spaced repetition
  const rev = get('SELECT * FROM learning_reviews WHERE user_id = ? AND term_id = ?', userId, termId);
  let ease = rev?.ease ?? 2.5;
  let reps = rev?.repetitions ?? 0;
  let interval = rev?.interval_days ?? 1;
  let lapses = rev?.lapses ?? 0;
  if (isCorrect) {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.min(180, Math.round(interval * ease));
    ease = Math.min(3.0, ease + 0.06);
  } else {
    reps = 0;
    lapses += 1;
    interval = 1;
    ease = Math.max(1.3, ease - 0.22);
  }
  const dueAt = isCorrect
    ? addDaysIso(now, interval)
    : new Date(Date.now() + 10 * 60 * 1000).toISOString();
  run(
    `INSERT INTO learning_reviews(user_id, term_id, due_at, interval_days, ease, repetitions, lapses, last_result, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, term_id) DO UPDATE SET
       due_at = excluded.due_at,
       interval_days = excluded.interval_days,
       ease = excluded.ease,
       repetitions = excluded.repetitions,
       lapses = excluded.lapses,
       last_result = excluded.last_result,
       updated_at = excluded.updated_at`,
    userId, termId, dueAt, interval, ease, reps, lapses, isCorrect ? 1 : 0, now
  );
}

export function touchStreak(userId) {
  const profile = get('SELECT * FROM user_profiles WHERE user_id = ?', userId);
  if (!profile) return;
  const today = todayKey();
  const last = profile.last_streak_date;
  if (last === today) return;
  const yesterday = todayKey(new Date(Date.now() - 864e5));
  const streak = last === yesterday ? profile.current_streak + 1 : 1;
  const longest = Math.max(profile.longest_streak, streak);
  run(
    'UPDATE user_profiles SET current_streak = ?, longest_streak = ?, last_streak_date = ? WHERE user_id = ?',
    streak, longest, today, userId
  );
}

export function logActivity(userId, type, detail = null) {
  run(
    'INSERT INTO user_activity(user_id, type, detail) VALUES(?,?,?)',
    userId, type, detail
  );
}

// ------------------------------------------------------------------ achievements
export function achievementSnapshot(userId) {
  const profile = get('SELECT * FROM user_profiles WHERE user_id = ?', userId) || {};
  const termsSeen = get('SELECT COUNT(*) AS c FROM user_terms WHERE user_id = ?', userId).c;
  const termsMastered = get(
    "SELECT COUNT(*) AS c FROM user_terms WHERE user_id = ? AND status = 'mastered'", userId
  ).c;
  const perfect = get(
    'SELECT COUNT(*) AS c FROM play_sessions WHERE user_id = ? AND status = ? AND total > 0 AND score = total',
    userId, 'completed'
  ).c;
  const speed = get(
    'SELECT COUNT(*) AS c FROM play_sessions WHERE user_id = ? AND mode = ? AND status = ?',
    userId, 'speed', 'completed'
  ).c;
  const bosses = get(
    'SELECT COUNT(*) AS c FROM user_bosses WHERE user_id = ? AND defeated_at IS NOT NULL', userId
  ).c;
  const user = get('SELECT xp FROM users WHERE id = ?', userId);
  const level = levelFromXp(user?.xp || 0);
  const completedWorlds = new Set(
    all(`SELECT w.code FROM worlds w
           JOIN stages s ON s.world_id = w.id
           JOIN user_progress p ON p.stage_id = s.id AND p.user_id = ? AND p.status = 'completed'
          GROUP BY w.id
         HAVING COUNT(DISTINCT s.id) = (SELECT COUNT(*) FROM stages s2 WHERE s2.world_id = w.id)`, userId)
      .map(r => r.code)
  );
  return {
    terms_seen: termsSeen,
    terms_mastered: termsMastered,
    perfect_round: perfect,
    speed_completed: speed,
    streak: profile.current_streak || 0,
    bosses_defeated: bosses,
    level,
    worlds: completedWorlds,
  };
}

export function checkAchievements(userId) {
  const snap = achievementSnapshot(userId);
  const owned = new Set(
    all('SELECT achievement_id FROM user_achievements WHERE user_id = ?', userId).map(r => r.achievement_id)
  );
  const unlocked = [];
  for (const a of all('SELECT * FROM achievements ORDER BY sort')) {
    if (owned.has(a.id)) continue;
    let cond;
    try { cond = JSON.parse(a.condition_json); } catch { continue; }
    let ok = false;
    switch (cond.type) {
      case 'terms_seen': ok = snap.terms_seen >= cond.value; break;
      case 'terms_mastered': ok = snap.terms_mastered >= cond.value; break;
      case 'perfect_round': ok = snap.perfect_round >= cond.value; break;
      case 'mode_completed': ok = cond.mode === 'speed' && snap.speed_completed > 0; break;
      case 'streak': ok = snap.streak >= cond.value; break;
      case 'bosses_defeated': ok = snap.bosses_defeated >= cond.value; break;
      case 'level': ok = snap.level >= cond.value; break;
      case 'world_completed': ok = snap.worlds.has(cond.world); break;
      default: ok = false;
    }
    if (!ok) continue;
    run('INSERT OR IGNORE INTO user_achievements(user_id, achievement_id) VALUES(?,?)', userId, a.id);
    addXp(userId, a.xp_reward, 'achievement', a.code);
    addCoins(userId, a.coin_reward);
    logActivity(userId, 'achievement', a.code);
    unlocked.push({
      code: a.code, title_ar: a.title_ar, title_en: a.title_en, icon: a.icon,
      tier: a.tier, xp: a.xp_reward, coins: a.coin_reward,
    });
  }
  return unlocked;
}

// ------------------------------------------------------------------ stages
export function stageState(userId, stageId) {
  const stage = get(
    `SELECT s.*, c.name_ar AS category_ar, c.name_en AS category_en, w.code AS world_code,
            w.name_ar AS world_ar, w.color AS world_color
       FROM stages s JOIN categories c ON c.id = s.category_id
       JOIN worlds w ON w.id = s.world_id WHERE s.id = ?`, stageId
  );
  if (!stage) return null;
  const prog = get(
    'SELECT * FROM user_progress WHERE user_id = ? AND stage_id = ?', userId, stageId
  );
  const prev = get(
    'SELECT * FROM stages WHERE world_id = ? AND sort < ? ORDER BY sort DESC LIMIT 1',
    stage.world_id, stage.sort
  );
  const prevProg = prev
    ? get('SELECT status FROM user_progress WHERE user_id = ? AND stage_id = ?', userId, prev.id)
    : null;
  const userLevel = levelFromXp(get('SELECT xp FROM users WHERE id = ?', userId).xp);
  const levelOk = userLevel >= stage.required_level;
  const chainOk = !prev || prevProg?.status === 'completed';
  const unlocked = levelOk && chainOk;
  const status = prog?.status === 'completed' ? 'completed' : (unlocked ? 'unlocked' : 'locked');
  const termCount = get(
    'SELECT COUNT(*) AS c FROM terms WHERE category_id = ? AND active = 1', stage.category_id
  ).c;
  const questionCount = get(
    'SELECT COUNT(*) AS c FROM questions WHERE category_id = ? AND active = 1', stage.category_id
  ).c;
  return {
    ...stage,
    locked: status === 'locked',
    status,
    levelOk,
    chainOk,
    stars: prog?.stars || 0,
    bestScore: prog?.best_score || 0,
    attempts: prog?.attempts || 0,
    completed: status === 'completed',
    termCount,
    questionCount,
    previousStageId: prev?.id || null,
  };
}

export function ensureProgressRow(userId, stageId) {
  const stage = get('SELECT * FROM stages WHERE id = ?', stageId);
  if (!stage) return null;
  const existing = get('SELECT * FROM user_progress WHERE user_id = ? AND stage_id = ?', userId, stageId);
  if (existing) return existing;
  const state = stageState(userId, stageId);
  run(
    'INSERT INTO user_progress(user_id, stage_id, status) VALUES(?,?,?)',
    userId, stageId, state?.status === 'locked' ? 'locked' : 'unlocked'
  );
  return get('SELECT * FROM user_progress WHERE user_id = ? AND stage_id = ?', userId, stageId);
}

export function completeStage(userId, stageId, score, total) {
  const stage = get('SELECT * FROM stages WHERE id = ?', stageId);
  if (!stage || !total) return { completed: false, stars: 0, bonusXp: 0, bonusCoins: 0 };
  const pct = score / total;
  const stars = pct >= 0.999 ? 3 : pct >= 0.85 ? 2 : pct >= 0.7 ? 1 : 0;
  const row = get('SELECT * FROM user_progress WHERE user_id = ? AND stage_id = ?', userId, stageId);
  const wasCompleted = row?.status === 'completed';
  const bestStars = Math.max(row?.stars || 0, stars);
  const completedNow = stars > 0;
  run(
    `INSERT INTO user_progress(user_id, stage_id, status, stars, best_score, attempts, last_played_at, completed_at)
     VALUES(?,?,?,?,?,1,?,?)
     ON CONFLICT(user_id, stage_id) DO UPDATE SET
       status = CASE WHEN user_progress.status = 'completed' OR excluded.status = 'completed'
                     THEN 'completed' ELSE excluded.status END,
       stars = MAX(user_progress.stars, excluded.stars),
       best_score = MAX(user_progress.best_score, excluded.best_score),
       attempts = user_progress.attempts + 1,
       last_played_at = excluded.last_played_at,
       completed_at = COALESCE(user_progress.completed_at, excluded.completed_at)`,
    userId, stageId, completedNow ? 'completed' : (row?.status || 'unlocked'),
    bestStars, score, nowIso(), completedNow ? nowIso() : null
  );
  let bonusXp = 0;
  let bonusCoins = 0;
  if (completedNow && !wasCompleted) {
    bonusXp = stage.xp_reward;
    bonusCoins = stage.coin_reward;
    addXp(userId, bonusXp, 'stage', stageId);
    addCoins(userId, bonusCoins);
    logActivity(userId, 'stage_completed', stageId);
  }
  return { completed: completedNow, stars, bonusXp, bonusCoins };
}

// ------------------------------------------------------------------ questions
export function publicQuestion(row, options) {
  // Never send term fields that could reveal the expected answer. The puzzle
  // and code modes answer with the English term, while the meaning mode answers
  // with its Arabic translation — exposing either would let the client cheat.
  // The "similar" mode is different: it asks which of two near-synonyms fits a
  // definition, so the linked term's translation/definition is safe context.
  const similar = row.mode === 'similar';
  return {
    id: row.id,
    mode: row.mode,
    prompt: row.prompt,
    promptAr: row.prompt_ar,
    code: row.code,
    termId: row.term_id,
    arabic: similar ? row.arabic || null : null,
    definition: similar ? row.definition_ar || null : null,
    difficulty: row.difficulty,
    options: options.map(o => ({ id: o.id, text: o.text })),
  };
}

export function loadQuestion(questionId) {
  const q = get(
    `SELECT q.*, t.english, t.arabic, t.definition_ar, t.example
       FROM questions q LEFT JOIN terms t ON t.id = q.term_id
      WHERE q.id = ? AND q.active = 1`, questionId
  );
  if (!q) return null;
  const options = all(
    'SELECT id, text, is_correct, sort FROM question_options WHERE question_id = ? ORDER BY sort',
    questionId
  );
  return { q, options };
}

export function pickQuestions({ mode, categoryIds = [], limit = 8, excludeIds = [], difficulty = null }) {
  const where = ["q.active = 1"];
  const params = [];
  if (mode === 'review') {
    where.push("q.mode IN ('meaning','english','puzzle','code')");
  } else if (mode === 'speed') {
    where.push("q.mode IN ('meaning','english','code')");
  } else if (mode === 'boss') {
    where.push("q.mode IN ('meaning','english','code','puzzle')");
  } else if (mode === 'match') {
    where.push("q.mode = 'meaning'");
  } else {
    where.push('q.mode = ?');
    params.push(mode);
  }
  if (categoryIds.length) {
    where.push(`q.category_id IN (${categoryIds.map(() => '?').join(',')})`);
    params.push(...categoryIds);
  }
  if (difficulty) { where.push('q.difficulty = ?'); params.push(difficulty); }
  if (excludeIds.length) {
    where.push(`q.id NOT IN (${excludeIds.map(() => '?').join(',')})`);
    params.push(...excludeIds);
  }
  const rows = all(
    `SELECT q.*, t.english, t.arabic, t.definition_ar, t.example
       FROM questions q LEFT JOIN terms t ON t.id = q.term_id
      WHERE ${where.join(' AND ')}
      ORDER BY RANDOM() LIMIT ?`,
    ...params, limit
  );
  return rows;
}

export function reviewQueue(userId, limit = 12) {
  return all(
    `SELECT q.*, t.english, t.arabic, t.definition_ar, t.example
       FROM learning_reviews r
       JOIN terms t ON t.id = r.term_id
       JOIN questions q ON q.term_id = r.term_id AND q.active = 1
            AND q.mode IN ('meaning','english','puzzle','code')
      WHERE r.user_id = ? AND r.due_at <= ?
      GROUP BY t.id
      ORDER BY r.due_at ASC LIMIT ?`,
    userId, nowIso(), limit
  );
}

export function reviewCount(userId) {
  // Count only terms that actually have a playable review question, otherwise
  // the badge can show due items while /api/review/start finds an empty queue.
  return get(
    `SELECT COUNT(DISTINCT r.term_id) AS c
       FROM learning_reviews r
       JOIN questions q ON q.term_id = r.term_id AND q.active = 1
            AND q.mode IN ('meaning','english','puzzle','code')
      WHERE r.user_id = ? AND r.due_at <= ?`,
    userId, nowIso()
  ).c;
}

// ------------------------------------------------------------------ leaderboard
export function leaderboard(period = 'all', limit = 25) {
  let since = null;
  const now = new Date();
  if (period === 'daily') { since = new Date(now.getTime() - 864e5).toISOString(); }
  else if (period === 'weekly') { since = new Date(now.getTime() - 7 * 864e5).toISOString(); }
  else if (period === 'monthly') { since = new Date(now.getTime() - 30 * 864e5).toISOString(); }

  let rows;
  if (period === 'all' || !since) {
    rows = all(
      `SELECT u.id, u.username, u.xp, u.is_npc, p.display_name, p.avatar, p.frame,
              (SELECT COUNT(*) FROM user_achievements ua WHERE ua.user_id = u.id) AS achievements
         FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.status = 'active'
        ORDER BY u.xp DESC LIMIT ?`, limit
    );
  } else {
    rows = all(
      `SELECT u.id, u.username, u.xp, u.is_npc, p.display_name, p.avatar, p.frame,
              (SELECT COUNT(*) FROM user_achievements ua WHERE ua.user_id = u.id) AS achievements,
              COALESCE((SELECT SUM(x.amount) FROM xp_events x
                         WHERE x.user_id = u.id AND x.created_at >= ?), 0) AS period_xp
         FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.status = 'active'
        ORDER BY period_xp DESC, u.xp DESC LIMIT ?`, since, limit
    );
  }
  return rows.map((r, i) => {
    const level = levelFromXp(r.xp);
    return {
      position: i + 1,
      id: r.id,
      name: r.display_name || r.username,
      avatar: r.avatar || 'nova',
      frame: r.frame || 'frame-none',
      xp: r.xp,
      periodXp: r.period_xp ?? r.xp,
      level,
      rank: rankForLevel(level),
      achievements: r.achievements,
      isNpc: !!r.is_npc,
    };
  });
}

// ------------------------------------------------------------------ daily
export function ensureDailyChallenge() {
  const key = todayKey();
  let row = get('SELECT * FROM daily_challenges WHERE challenge_date = ?', key);
  if (row) return row;
  const pool = all(
    `SELECT id FROM questions WHERE active = 1 AND mode IN ('meaning','english','code','puzzle')
      ORDER BY RANDOM() LIMIT 8`
  ).map(r => r.id);
  run(
    'INSERT INTO daily_challenges(challenge_date, question_ids, xp_reward, coin_reward, title_ar) VALUES(?,?,?,?,?)',
    key, JSON.stringify(pool), 100, 30, 'تحدي اليوم'
  );
  return get('SELECT * FROM daily_challenges WHERE challenge_date = ?', key);
}
