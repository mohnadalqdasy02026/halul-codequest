// CODE QUEST — live 1v1 rooms (invite code, same questions, server-side scoring).
import { get, nowIso, run } from './db.js';
import {
  addCoins, addXp, checkAchievements, loadQuestion, logActivity, pickQuestions,
  publicQuestion, touchStreak,
} from './game.js';

export const MP_QUESTION_COUNT = 8;
export const MP_MATCH_SECONDS = 180;
export const MP_WAITING_MINUTES = 15;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode() {
  for (let attempt = 0; attempt < 40; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!get('SELECT 1 FROM mp_rooms WHERE code = ?', code)) return code;
  }
  return 'MP' + Date.now().toString(36).toUpperCase().slice(-4);
}

function parseIds(room) {
  try { return JSON.parse(room.question_ids || '[]'); } catch { return []; }
}

function parseAnswers(value) {
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

function playerName(userId) {
  const row = get(
    `SELECT u.username, p.display_name FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`, userId
  );
  return row?.display_name || row?.username || '';
}

export function roomByUser(userId) {
  return get(
    `SELECT * FROM mp_rooms
      WHERE status IN ('waiting','active') AND (host_id = ? OR guest_id = ?)
      ORDER BY id DESC LIMIT 1`,
    userId, userId
  );
}

function finishRoom(room, winnerId = null) {
  if (room.status === 'finished' || room.status === 'cancelled') return room;
  run(
    `UPDATE mp_rooms SET status = 'finished', winner_id = ?, finished_at = ? WHERE id = ?`,
    winnerId, nowIso(), room.id
  );
  const fresh = get('SELECT * FROM mp_rooms WHERE id = ?', room.id);
  if (!fresh.rewards_granted) {
    const players = [
      { id: fresh.host_id, correct: fresh.host_correct, score: fresh.host_score },
      { id: fresh.guest_id, correct: fresh.guest_correct, score: fresh.guest_score },
    ].filter(p => p.id);
    for (const p of players) {
      const won = winnerId && winnerId === p.id;
      const draw = !winnerId;
      const xp = p.correct * 10 + (won ? 30 : draw ? 15 : 5);
      const coins = p.correct * 2 + (won ? 15 : draw ? 8 : 3);
      addXp(p.id, xp, 'multiplayer', fresh.code);
      addCoins(p.id, coins);
      touchStreak(p.id);
      logActivity(p.id, 'mp_match', `${fresh.code}:${p.score}:${winnerId === p.id ? 'win' : draw ? 'draw' : 'loss'}`);
      checkAchievements(p.id);
    }
    run('UPDATE mp_rooms SET rewards_granted = 1 WHERE id = ?', fresh.id);
    return get('SELECT * FROM mp_rooms WHERE id = ?', fresh.id);
  }
  return fresh;
}

/** Close abandoned waiting rooms and enforce the match clock. */
export function tickRoom(room) {
  if (!room) return null;
  const now = Date.now();
  if (room.status === 'waiting') {
    const created = new Date(room.created_at).getTime();
    if (Number.isFinite(created) && now - created > MP_WAITING_MINUTES * 60_000 && !room.guest_id) {
      run("UPDATE mp_rooms SET status = 'cancelled', finished_at = ? WHERE id = ?", nowIso(), room.id);
      return get('SELECT * FROM mp_rooms WHERE id = ?', room.id);
    }
    return room;
  }
  if (room.status === 'active') {
    const ids = parseIds(room);
    const bothDone = room.host_index >= ids.length && room.guest_index >= ids.length;
    const started = new Date(room.started_at || room.created_at).getTime();
    const expired = Number.isFinite(started) && now - started > MP_MATCH_SECONDS * 1000;
    if (bothDone || expired) {
      let winner = null;
      if (room.host_score > room.guest_score) winner = room.host_id;
      else if (room.guest_score > room.host_score) winner = room.guest_id;
      return finishRoom(room, winner);
    }
  }
  return room;
}

/** Sanitised room payload for one of the two players. Never leaks answers. */
export function roomInfo(room, userId) {
  const ids = parseIds(room);
  const isHost = room.host_id === userId;
  const myIndex = isHost ? room.host_index : room.guest_index;
  const oppIndex = isHost ? room.guest_index : room.host_index;
  const myScore = isHost ? room.host_score : room.guest_score;
  const oppScore = isHost ? room.guest_score : room.host_score;
  const myCorrect = isHost ? room.host_correct : room.guest_correct;
  const oppCorrect = isHost ? room.guest_correct : room.host_correct;
  let current = null;
  if (room.status === 'active' && myIndex < ids.length) {
    const loaded = loadQuestion(ids[myIndex]);
    if (loaded) current = publicQuestion(loaded.q, loaded.options);
  }
  const started = new Date(room.started_at || room.created_at).getTime();
  const deadline = room.status === 'active'
    ? new Date(started + MP_MATCH_SECONDS * 1000).toISOString() : null;
  return {
    code: room.code,
    status: room.status,
    role: isHost ? 'host' : 'guest',
    host: {
      id: room.host_id, name: playerName(room.host_id),
      score: room.host_score, correct: room.host_correct, index: room.host_index,
    },
    guest: room.guest_id ? {
      id: room.guest_id, name: playerName(room.guest_id),
      score: room.guest_score, correct: room.guest_correct, index: room.guest_index,
    } : null,
    you: {
      id: userId, name: playerName(userId), index: myIndex, score: myScore, correct: myCorrect,
      finished: myIndex >= ids.length,
    },
    opponent: {
      id: isHost ? room.guest_id : room.host_id,
      name: isHost ? (room.guest_id ? playerName(room.guest_id) : '') : playerName(room.host_id),
      index: oppIndex, score: oppScore, correct: oppCorrect, finished: oppIndex >= ids.length,
    },
    total: ids.length,
    question: current,
    deadline,
    winnerId: room.winner_id,
    finishedAt: room.finished_at,
    startedAt: room.started_at,
    createdAt: room.created_at,
  };
}

export function createRoom(userId) {
  const existing = roomByUser(userId);
  if (existing) return { error: 'already_in_room', room: tickRoom(existing) };
  const questions = pickQuestions({ mode: 'meaning', limit: MP_QUESTION_COUNT });
  if (questions.length < 4) return { error: 'not_enough_questions' };
  const info = run(
    `INSERT INTO mp_rooms(code, host_id, status, question_ids, created_at)
     VALUES(?,?,'waiting',?,?)`,
    randomCode(), userId, JSON.stringify(questions.map(q => q.id)), nowIso()
  );
  return { room: get('SELECT * FROM mp_rooms WHERE id = ?', Number(info.lastInsertRowid)) };
}

export function joinRoom(userId, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) return { error: 'invalid_code' };
  const existing = roomByUser(userId);
  if (existing) return { error: 'already_in_room', room: tickRoom(existing) };
  let room = get('SELECT * FROM mp_rooms WHERE code = ?', code);
  if (!room) return { error: 'not_found' };
  room = tickRoom(room);
  if (room.host_id === userId) return { error: 'own_room', room };
  if (room.status !== 'waiting') return { error: 'not_joinable' };
  if (room.guest_id) return { error: 'room_full' };
  run(
    `UPDATE mp_rooms SET guest_id = ?, status = 'active', started_at = ? WHERE id = ?`,
    userId, nowIso(), room.id
  );
  return { room: get('SELECT * FROM mp_rooms WHERE id = ?', room.id) };
}

export function leaveRoom(userId) {
  const room = roomByUser(userId);
  if (!room) return { ok: true, room: null };
  if (room.status === 'waiting') {
    run("UPDATE mp_rooms SET status = 'cancelled', finished_at = ? WHERE id = ?", nowIso(), room.id);
    return { ok: true, room: get('SELECT * FROM mp_rooms WHERE id = ?', room.id) };
  }
  if (room.status === 'active') {
    const winner = room.host_id === userId ? room.guest_id : room.host_id;
    const fresh = finishRoom(room, winner || null);
    return { ok: true, room: fresh };
  }
  return { ok: true, room };
}

export function submitAnswer(userId, choice) {
  let room = roomByUser(userId);
  if (!room) return { error: 'no_room' };
  room = tickRoom(room);
  if (room.status === 'waiting') return { error: 'not_started' };
  if (room.status !== 'active') return { error: 'not_active' };
  const ids = parseIds(room);
  const isHost = room.host_id === userId;
  const myIndex = isHost ? room.host_index : room.guest_index;
  if (myIndex >= ids.length) return { error: 'already_finished' };
  const qid = ids[myIndex];
  const loaded = loadQuestion(qid);
  if (!loaded) return { error: 'question_missing' };
  const chosen = loaded.options.find(o => o.id === Number(choice));
  if (!chosen) return { error: 'invalid_choice' };
  const correct = !!chosen.is_correct;

  const answers = parseAnswers(isHost ? room.host_answers : room.guest_answers);
  answers.push({ questionId: qid, choice: chosen.id, correct });
  const score = (isHost ? room.host_score : room.guest_score) + (correct ? 100 : 0);
  const correctCount = (isHost ? room.host_correct : room.guest_correct) + (correct ? 1 : 0);

  if (isHost) {
    run(
      `UPDATE mp_rooms SET host_index = host_index + 1, host_score = ?, host_correct = ?,
              host_answers = ? WHERE id = ?`,
      score, correctCount, JSON.stringify(answers), room.id
    );
  } else {
    run(
      `UPDATE mp_rooms SET guest_index = guest_index + 1, guest_score = ?, guest_correct = ?,
              guest_answers = ? WHERE id = ?`,
      score, correctCount, JSON.stringify(answers), room.id
    );
  }

  room = get('SELECT * FROM mp_rooms WHERE id = ?', room.id);
  room = tickRoom(room);
  return {
    correct,
    correctOptionId: loaded.options.find(o => o.is_correct)?.id || null,
    questionId: qid,
    room: roomInfo(room, userId),
  };
}

export function currentRoom(userId) {
  const active = roomByUser(userId);
  if (active) {
    const fresh = tickRoom(active);
    if (fresh && fresh.status !== 'cancelled') return roomInfo(fresh, userId);
  }
  const recent = get(
    `SELECT * FROM mp_rooms
      WHERE status = 'finished' AND (host_id = ? OR guest_id = ?) AND finished_at > ?
      ORDER BY id DESC LIMIT 1`,
    userId, userId, new Date(Date.now() - 15 * 60_000).toISOString()
  );
  return recent ? roomInfo(recent, userId) : null;
}
