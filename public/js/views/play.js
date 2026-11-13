// CODE QUEST — gameplay view: 8 modes, feedback, summary.
import { api, post } from '../api.js';
import {
  confetti, emptyState, esc, formatNum, formatTime, h, isAr, pick, progressBar, sfx,
  speak, starsHtml, toast,
} from '../ui.js';

const MODE_LABEL = {
  meaning: { ar: 'خمّن المعنى', en: 'Guess the Meaning', icon: '🔍' },
  english: { ar: 'تحدي الإنجليزية', en: 'English Challenge', icon: '🇬🇧' },
  match: { ar: 'طابق المصطلحات', en: 'Match the Terms', icon: '🔗' },
  puzzle: { ar: 'لغز الكلمات', en: 'Word Puzzle', icon: '🧩' },
  code: { ar: 'أكمل الشيفرة', en: 'Complete the Code', icon: '💻' },
  speed: { ar: 'تحدي السرعة', en: 'Speed Challenge', icon: '⏱️' },
  boss: { ar: 'معركة الزعيم', en: 'Boss Battle', icon: '⚔️' },
  similar: { ar: 'المصطلحات المتشابهة', en: 'Similar Terms', icon: '⚖️' },
  daily: { ar: 'تحدي اليوم', en: 'Daily Challenge', icon: '⚡' },
  review: { ar: 'المراجعة الذكية', en: 'Smart Review', icon: '🔁' },
};

const AR_RE = /[\u0600-\u06FF]/;

export async function playView(root, ctx) {
  const sid = ctx.params[0];
  let payload;
  try {
    payload = await api(`/api/play/session/${sid}`);
  } catch (err) {
    root.innerHTML = emptyState('🎮', isAr() ? 'تعذر تحميل الجلسة' : 'Could not load session', err.message,
      `<a class="btn btn-primary" href="#/home">${isAr() ? 'الرئيسية' : 'Home'}</a>`);
    return;
  }
  const session = payload.session;
  const questions = session.questions || [];
  const answers = payload.answers || [];
  const mode = session.mode;
  const label = MODE_LABEL[mode] || MODE_LABEL.meaning;

  if (session.status !== 'active' || !questions.length) {
    await finish(session, true);
    return;
  }

  const st = {
    idx: 0,
    hearts: session.hearts,
    correct: session.score,
    answered: new Set(answers.map(a => a.question_id)),
    matched: new Set(answers.filter(a => a.is_correct).map(a => a.question_id)),
    locked: false,
    done: false,
    completing: false,
    started: Date.now(),
    remaining: (session.meta?.timeLimit || 0) * 1000,
    timer: null,
    matchedCount: 0,
  };
  while (st.idx < questions.length && st.answered.has(questions[st.idx].id)) st.idx++;

  const maxHearts = session.meta?.hearts || 0;
  const boss = session.bossId ? await api('/api/bosses').then(r => r.bosses.find(b => b.id === session.bossId)).catch(() => null) : null;

  root.innerHTML = `
    <div class="play-shell">
      <div class="play-top">
        <a class="icon-btn" href="${session.stageId ? `#/stage/${session.stageId}` : '#/home'}" title="${isAr() ? 'خروج' : 'Exit'}">✕</a>
        <span class="pill blue">${label.icon} ${esc(pick(label.ar, label.en))}</span>
        <div class="progress" id="session-progress"><i style="width:0%"></i></div>
        <span class="pill" id="q-counter">1 / ${questions.length}</span>
        <div id="hearts-slot"></div>
        <div id="timer-slot"></div>
      </div>
      <div id="boss-slot"></div>
      <div id="q-area"></div>
    </div>`;

  const qArea = root.querySelector('#q-area');
  const heartsSlot = root.querySelector('#hearts-slot');
  const timerSlot = root.querySelector('#timer-slot');
  const progressEl = root.querySelector('#session-progress > i');
  const counterEl = root.querySelector('#q-counter');

  /* ------------------------------------------------------------ header */
  function paintHeader() {
    if (maxHearts > 0) {
      heartsSlot.innerHTML = `<span class="hearts" title="${isAr() ? 'المحاولات' : 'Hearts'}">${
        Array.from({ length: maxHearts }, (_, i) => `<span class="${i < st.hearts ? '' : 'off'}">❤️</span>`).join('')
      }</span>`;
    }
    if (mode === 'match') {
      counterEl.textContent = `${st.matchedCount} / ${questions.length}`;
      progressEl.style.width = `${(st.matchedCount / questions.length) * 100}%`;
    } else if (mode === 'speed') {
      counterEl.textContent = `${st.correct} ✅`;
    } else {
      counterEl.textContent = `${Math.min(st.idx + 1, questions.length)} / ${questions.length}`;
      progressEl.style.width = `${(st.answered.size / questions.length) * 100}%`;
    }
  }

  function paintBoss() {
    if (!boss) return;
    const hp = Math.max(0, 100 - Math.round((st.correct / Math.max(1, questions.length)) * 100));
    root.querySelector('#boss-slot').innerHTML = `
      <div class="boss-card" style="--bc:${esc(boss.color)}">
        <div class="boss-avatar">${boss.icon}</div>
        <div style="flex:1;min-width:0">
          <div class="row" style="justify-content:space-between">
            <b>${esc(pick(boss.name_ar, boss.name_en))}</b>
            <span class="pill red">${isAr() ? 'الصحة' : 'HP'} ${hp}%</span>
          </div>
          <div class="boss-hp"><i style="width:${hp}%"></i></div>
          <div class="small muted" style="margin-top:6px">${esc(boss.title_ar || '')}</div>
        </div>
      </div>`;
  }

  if (mode === 'speed') {
    st.timer = setInterval(() => {
      st.remaining -= 250;
      if (st.remaining <= 0) {
        st.remaining = 0;
        clearInterval(st.timer);
        st.timer = null;
        timerSlot.innerHTML = `<span class="timer warn">0:00</span>`;
        if (!st.completing) complete();
        return;
      }
      timerSlot.innerHTML = `<span class="timer ${st.remaining <= 10000 ? 'warn' : ''}">${formatTime(st.remaining)}</span>`;
    }, 250);
    timerSlot.innerHTML = `<span class="timer">${formatTime(st.remaining)}</span>`;
  }

  /* ------------------------------------------------------------ answer */
  async function sendAnswer(body) {
    const timeMs = Date.now() - st.started;
    try {
      const res = await post('/api/play/answer', {
        sessionId: sid,
        questionId: body.questionId,
        optionId: body.optionId ?? null,
        answerText: body.answerText ?? null,
        timeMs,
      });
      st.hearts = res.hearts;
      st.correct = res.score;
      st.answered.add(body.questionId);
      if (res.correct) st.matched.add(body.questionId);
      if (res.reviewDue !== undefined && ctx.state.bootstrap) ctx.state.bootstrap.reviewDue = res.reviewDue;
      if (res.profile) ctx.updateProfile({ ...ctx.state.profile, ...res.profile, stats: ctx.state.profile.stats });
      if (res.newAchievements?.length) {
        res.newAchievements.forEach(a => toast(`🎖️ ${pick(a.title_ar, a.title_en)} +${a.xp} XP`, 'gold', 4200));
        sfx.level();
      }
      paintHeader();
      paintBoss();
      return res;
    } catch (err) {
      toast(err.message, 'err');
      throw err;
    }
  }

  function feedbackHtml(res, { showNext = true } = {}) {
    const correct = res.correct;
    return `
      <div class="feedback ${correct ? 'ok' : 'no'}" id="feedback">
        <h4>${correct ? '✅ ' + (isAr() ? 'إجابة صحيحة!' : 'Correct!') : '❌ ' + (isAr() ? 'إجابة خاطئة' : 'Not quite')}
          ${res.xpEarned ? `<span class="xp-pop" style="margin-inline-start:auto">+${res.xpEarned} XP</span>` : ''}
          ${res.combo > 1 && correct ? `<span class="pill gold">🔥 ×${res.combo}</span>` : ''}
        </h4>
        ${!correct ? `<div class="answer-line">${isAr() ? 'الإجابة الصحيحة' : 'Correct answer'}: <b>${esc(res.correctAnswer || '')}</b></div>` : ''}
        ${res.term?.english ? `<div class="answer-line muted"><span class="mono">${esc(res.term.english)}</span>${res.term.arabic ? ` — ${esc(res.term.arabic)}` : ''}</div>` : ''}
        ${res.explanation ? `<div class="explain">${esc(res.explanation)}</div>` : ''}
        ${showNext && !res.failed ? `<div class="feedback-actions">
          <button class="btn btn-primary" id="next-btn">${st.idx + 1 >= questions.length ? (isAr() ? 'عرض النتيجة' : 'See results') : (isAr() ? 'التالي' : 'Next')} →</button>
        </div>` : ''}
      </div>`;
  }

  function bindNext() {
    root.querySelector('#next-btn')?.addEventListener('click', next);
  }

  function next() {
    if (st.done || st.completing) return;
    if (st.hearts <= 0 && maxHearts > 0) { complete(); return; }
    let guard = 0;
    do { st.idx++; guard++; } while (st.idx < questions.length && st.answered.has(questions[st.idx].id) && guard < 500);
    st.locked = false;
    if (st.idx >= questions.length) { complete(); return; }
    paint();
  }

  /* ------------------------------------------------------------ render */
  function paint() {
    paintHeader();
    const q = questions[st.idx];
    if (!q) { complete(); return; }
    if (mode === 'match') { paintMatch(); return; }
    if (q.mode === 'puzzle' || mode === 'puzzle') { paintPuzzle(q); return; }
    paintMcq(q);
  }

  function questionHead(q, { big, lead, definition = false } = {}) {
    const main = big ?? q.prompt ?? '';
    const isArabic = AR_RE.test(main);
    return `
      <div class="q-card">
        ${mode === 'speed' ? `<div class="combo">🔥 ${st.correct}</div>` : ''}
        <div class="q-mode">
          <span>${label.icon}</span><span>${esc(pick(label.ar, label.en))}</span>
          <span class="spacer" style="flex:1"></span>
          ${q.difficulty ? `<span class="pill ${q.difficulty === 'Beginner' ? 'green' : q.difficulty === 'Advanced' ? 'red' : 'gold'}">${esc(q.difficulty)}</span>` : ''}
        </div>
        <div class="q-prompt">
          <div class="${isArabic ? 'big-ar' : 'big-en'}">${esc(main)}</div>
          ${lead ? `<div class="lead">${esc(lead)}</div>` : ''}
          ${q.mode === 'meaning' ? `<button class="btn btn-sm btn-ghost" id="speak-term" style="margin-top:8px">🔊 ${isAr() ? 'استمع للنطق' : 'Hear it'}</button>` : ''}
        </div>
        ${q.mode === 'similar' && q.arabic ? `<div class="q-def">${esc(q.definition || '')}</div>` : ''}
        ${definition && q.definition ? `<div class="q-def">${esc(q.definition)}</div>` : ''}
        <div id="answer-area"></div>
        <div id="feedback-slot"></div>
      </div>`;
  }

  function paintMcq(q) {
    const lead = q.promptAr || '';
    const codeBlock = q.mode === 'code' && q.code
      ? `<pre class="q-code">${esc(q.code)}</pre>` : '';
    const head = questionHead(q, {
      big: q.mode === 'code' ? '' : (q.prompt ?? ''),
      lead,
    });
    qArea.innerHTML = head.replace('<div id="answer-area"></div>', `${codeBlock}<div id="answer-area"></div>`);

    const area = qArea.querySelector('#answer-area');
    const options = q.options || [];
    if (!options.length) {
      // Fallback: free text answer (defensive — should not happen for MCQ modes)
      area.innerHTML = `
        <div class="field" style="margin-top:18px">
          <label>${isAr() ? 'اكتب الإجابة' : 'Type the answer'}</label>
          <input class="input mono" id="free-answer" autocomplete="off" spellcheck="false" dir="ltr" />
        </div>
        <button class="btn btn-primary btn-block" id="free-submit" style="margin-top:10px">${isAr() ? 'تأكيد' : 'Submit'}</button>`;
      const submit = async () => {
        const value = area.querySelector('#free-answer').value.trim();
        if (!value || st.locked) return;
        st.locked = true;
        const res = await sendAnswer({ questionId: q.id, answerText: value });
        qArea.querySelector('#feedback-slot').innerHTML = feedbackHtml(res);
        bindNext();
      };
      area.querySelector('#free-submit').addEventListener('click', submit);
      area.querySelector('#free-answer').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      return;
    }

    area.innerHTML = `<div class="options">${options.map((opt, i) => `
      <button class="option-btn" data-option="${opt.id}">
        <span class="option-key">${'ABCD'[i] || i + 1}</span>
        <span class="opt-text ${AR_RE.test(opt.text) ? '' : 'mono'}" ${AR_RE.test(opt.text) ? '' : 'dir="ltr"'}>${esc(opt.text)}</span>
      </button>`).join('')}</div>`;

    qArea.querySelector('#speak-term')?.addEventListener('click', () => speak(q.prompt || '', 'en-US'));

    area.querySelectorAll('[data-option]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (st.locked) return;
        st.locked = true;
        const optionId = Number(btn.dataset.option);
        area.querySelectorAll('[data-option]').forEach(b => { b.disabled = true; });
        try {
          const res = await sendAnswer({ questionId: q.id, optionId });
          area.querySelectorAll('[data-option]').forEach(b => {
            const id = Number(b.dataset.option);
            if (id === res.correctOptionId) b.classList.add('correct');
            else if (id === optionId && !res.correct) b.classList.add('wrong');
            else b.classList.add('dim');
          });
          res.correct ? sfx.correct() : sfx.wrong();
          if (res.failed) {
            qArea.querySelector('#feedback-slot').innerHTML = feedbackHtml(res, { showNext: false });
            setTimeout(() => complete(), 1300);
          } else {
            qArea.querySelector('#feedback-slot').innerHTML = feedbackHtml(res);
            bindNext();
            if (mode === 'speed') setTimeout(() => { if (!st.completing) next(); }, 950);
          }
        } catch {
          st.locked = false;
          area.querySelectorAll('[data-option]').forEach(b => { b.disabled = false; });
        }
      });
    });
  }

  /* ------------------------------------------------------------ puzzle */
  function paintPuzzle(q) {
    const letters = String(q.prompt || '').replace(/[^A-Za-z]/g, '').toUpperCase().split('');
    const target = String(q.code || q.answer || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    let chosen = []; // tile indexes

    qArea.innerHTML = `
      <div class="q-card">
        <div class="q-mode"><span>🧩</span><span>${esc(pick(label.ar, label.en))}</span>
          <span style="flex:1"></span>
          ${q.difficulty ? `<span class="pill gold">${esc(q.difficulty)}</span>` : ''}
        </div>
        <div class="q-prompt">
          <div class="lead">${esc(q.promptAr || '')}</div>
        </div>
        <div class="puzzle-answer" id="puzzle-slots"></div>
        <div class="letter-bank" id="letter-bank"></div>
        <div class="puzzle-tools">
          <button class="btn btn-sm" id="p-clear">${isAr() ? 'مسح' : 'Clear'}</button>
          <button class="btn btn-sm" id="p-hint">💡 ${isAr() ? 'تلميح' : 'Hint'}</button>
          <button class="btn btn-sm btn-primary" id="p-submit">${isAr() ? 'تأكيد' : 'Submit'}</button>
        </div>
        <div id="feedback-slot"></div>
      </div>`;

    const slotsEl = qArea.querySelector('#puzzle-slots');
    const bankEl = qArea.querySelector('#letter-bank');

    const original = letters.map((ch, i) => ({ ch, i, used: false }));

    function paintTiles() {
      slotsEl.innerHTML = chosen.length
        ? chosen.map((ti, pos) => `<button class="letter-tile slot" data-slot="${pos}">${esc(original[ti].ch)}</button>`).join('')
        : `<span class="small muted" style="padding:14px">${isAr() ? 'اضغط الحروف بالترتيب…' : 'Tap the letters in order…'}</span>`;
      bankEl.innerHTML = original.map(o => `
        <button class="letter-tile ${o.used ? 'used' : ''}" data-tile="${o.i}">${esc(o.ch)}</button>`).join('');
      slotsEl.querySelectorAll('[data-slot]').forEach(b => b.addEventListener('click', () => {
        if (st.locked) return;
        const pos = Number(b.dataset.slot);
        const removed = chosen.splice(pos, 1)[0];
        original[removed].used = false;
        sfx.flip();
        paintTiles();
      }));
      bankEl.querySelectorAll('[data-tile]').forEach(b => b.addEventListener('click', () => {
        if (st.locked) return;
        const i = Number(b.dataset.tile);
        if (original[i].used) return;
        original[i].used = true;
        chosen.push(i);
        sfx.click();
        paintTiles();
        if (chosen.length === letters.length) submitPuzzle();
      }));
    }

    async function submitPuzzle() {
      if (st.locked) return;
      if (chosen.length !== letters.length) {
        toast(isAr() ? 'رتّب كل الحروف أولًا.' : 'Place all the letters first.', 'info', 1800);
        return;
      }
      st.locked = true;
      const answerText = chosen.map(ti => original[ti].ch).join('');
      const res = await sendAnswer({ questionId: q.id, answerText });
      res.correct ? sfx.correct() : sfx.wrong();
      qArea.querySelector('#feedback-slot').innerHTML = feedbackHtml(res);
      bindNext();
      if (res.failed) { setTimeout(() => complete(), 1300); return; }
      if (mode === 'speed') setTimeout(() => { if (!st.completing) next(); }, 950);
    }

    qArea.querySelector('#p-clear').addEventListener('click', () => {
      if (st.locked) return;
      chosen = [];
      original.forEach(o => { o.used = false; });
      paintTiles();
    });
    qArea.querySelector('#p-hint').addEventListener('click', () => {
      if (st.locked) return;
      chosen = [];
      original.forEach(o => { o.used = false; });
      for (let pos = 0; pos < Math.min(2, target.length); pos++) {
        const need = target[pos];
        const tile = original.find(o => !o.used && o.ch === need);
        if (tile) { tile.used = true; chosen.push(tile.i); }
      }
      paintTiles();
      toast(isAr() ? `المصطلح يبدأ بـ ${target.slice(0, 2)}` : `The term starts with ${target.slice(0, 2)}`, 'info', 2200);
    });
    qArea.querySelector('#p-submit').addEventListener('click', submitPuzzle);

    paintTiles();
  }

  /* ------------------------------------------------------------ match */
  function paintMatch() {
    const pairs = session.matchPairs || [];
    if (!pairs.length) {
      qArea.innerHTML = emptyState('🔗', isAr() ? 'لا توجد أزواج للمطابقة' : 'No pairs to match', '',
        `<a class="btn btn-primary" href="#/home">${isAr() ? 'الرئيسية' : 'Home'}</a>`);
      return;
    }
    const done = new Set([...st.matched]);
    const remaining = pairs.filter(p => !done.has(p.questionId));
    if (!remaining.length) { complete(); return; }

    // keep a stable per-session shuffle
    if (!st.matchOrder) {
      const shuffle = arr => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      st.matchOrder = {
        left: shuffle(pairs.map(p => p.questionId)),
        right: shuffle(pairs.map(p => p.questionId)),
      };
    }
    const byId = new Map(pairs.map(p => [p.questionId, p]));

    qArea.innerHTML = `
      <div class="q-card">
        <div class="q-mode"><span>🔗</span><span>${esc(pick(label.ar, label.en))}</span>
          <span style="flex:1"></span><span class="pill blue">${st.matchedCount} / ${pairs.length}</span></div>
        <div class="q-prompt"><div class="big-ar" style="font-size:1.3rem">${isAr() ? 'اربط كل مصطلح إنجليزي بمعناه العربي' : 'Match each English term with its Arabic meaning'}</div></div>
        <div class="match-board">
          <div class="match-col" id="match-left">
            ${st.matchOrder.left.map(id => {
              const p = byId.get(id);
              return `<button class="match-item en ${done.has(id) ? 'done' : ''}" data-qid="${id}">${esc(p.english)}</button>`;
            }).join('')}
          </div>
          <div class="match-col" id="match-right">
            ${st.matchOrder.right.map(id => {
              const p = byId.get(id);
              return `<button class="match-item ${done.has(id) ? 'done' : ''}" data-qid="${id}">${esc(p.arabic)}</button>`;
            }).join('')}
          </div>
        </div>
        <div class="small muted center" style="margin-top:12px">${isAr() ? 'اختر مصطلحًا ثم معناه. المطابقة الخاطئة لا تُحتسب لكنها تُظهر تنبيهًا.' : 'Pick a term then its meaning. A wrong match is not counted but shows a warning.'}</div>
      </div>`;

    let selected = null; // { side, id }
    const leftEl = qArea.querySelector('#match-left');
    const rightEl = qArea.querySelector('#match-right');

    const clearSel = () => {
      selected = null;
      qArea.querySelectorAll('.match-item.sel').forEach(el => el.classList.remove('sel'));
    };

    const attempt = async (qid) => {
      if (st.locked) return;
      st.locked = true;
      const pair = byId.get(qid);
      try {
        const res = await sendAnswer({ questionId: qid, optionId: pair.optionId });
        if (res.correct) {
          st.matchedCount++;
          sfx.correct();
          qArea.querySelectorAll(`[data-qid="${qid}"]`).forEach(el => { el.classList.add('done'); el.classList.remove('sel'); });
          clearSel();
          st.locked = false;
          paintHeader();
          if (st.matchedCount >= pairs.length) setTimeout(() => complete(), 500);
          else paintMatch();
        } else {
          sfx.wrong();
          toast(isAr() ? 'ليست المطابقة الصحيحة — حاول مجددًا.' : 'Not the right match — try again.', 'err', 1800);
          st.locked = false;
        }
      } catch {
        st.locked = false;
      }
    };

    const onPick = (side, id, el) => {
      if (st.locked) return;
      if (!selected) {
        selected = { side, id };
        el.classList.add('sel');
        sfx.click();
        return;
      }
      if (selected.side === side) {
        clearSel();
        selected = { side, id };
        el.classList.add('sel');
        sfx.click();
        return;
      }
      const leftId = side === 'left' ? id : selected.id;
      if (leftId === (side === 'left' ? id : selected.id)) {
        attempt(leftId);
      } else {
        sfx.wrong();
        toast(isAr() ? 'ليست المطابقة الصحيحة — حاول مجددًا.' : 'Not the right match — try again.', 'err', 1600);
        el.classList.add('shake');
        setTimeout(() => el.classList.remove('shake'), 420);
        clearSel();
      }
    };

    leftEl.querySelectorAll('[data-qid]').forEach(el => el.addEventListener('click', () => {
      if (el.classList.contains('done')) return;
      onPick('left', Number(el.dataset.qid), el);
    }));
    rightEl.querySelectorAll('[data-qid]').forEach(el => el.addEventListener('click', () => {
      if (el.classList.contains('done')) return;
      onPick('right', Number(el.dataset.qid), el);
    }));

    // Progress reflects answered-correct pairs
    st.matchedCount = st.matched.size;
    paintHeader();
  }

  /* ------------------------------------------------------------ summary */
  async function complete() {
    if (st.completing) return;
    st.completing = true;
    if (st.timer) clearInterval(st.timer);
    try {
      const res = await post('/api/play/complete', { sessionId: sid, timeMs: Date.now() - st.started });
      finish(res.summary, false);
    } catch (err) {
      st.completing = false;
      toast(err.message, 'err');
    }
  }

  async function finish(summary, resumed) {
    let s = summary;
    if (resumed) {
      try {
        const res = await post('/api/play/complete', { sessionId: sid, timeMs: 0 });
        s = res.summary;
      } catch { s = null; }
    }
    if (!s) {
      root.innerHTML = emptyState('📭', isAr() ? 'لا توجد نتائج' : 'No results', '',
        `<a class="btn btn-primary" href="#/home">${isAr() ? 'الرئيسية' : 'Home'}</a>`);
      return;
    }
    // Keep the sidebar review badge in sync immediately after a round.
    if (s.reviewDue !== undefined && ctx.state.bootstrap) {
      ctx.state.bootstrap.reviewDue = s.reviewDue;
    }
    if (s.profile) ctx.updateProfile(s.profile);
    const stars = s.stage?.stars ?? (s.pct >= 99 ? 3 : s.pct >= 85 ? 2 : s.pct >= 70 ? 1 : 0);
    const xpTotal = (s.xpFromAnswers || 0) + (s.stage?.bonusXp || 0) + (s.boss?.bonusXp || 0) + (s.daily?.xp || 0);
    const coinsTotal = (s.stage?.bonusCoins || 0) + (s.boss?.bonusCoins || 0) + (s.daily?.coins || 0);
    const good = s.pct >= 70;
    if (good) { sfx.win(); confetti(); } else sfx.flip();

    const stageCtx = s.stageId ? findStage(s.stageId) : null;

    root.innerHTML = `
      <div class="play-shell">
        <div class="summary card glow">
          <div class="s-emoji">${s.pct >= 99 ? '🏆' : s.pct >= 85 ? '🌟' : s.pct >= 70 ? '🎉' : s.pct >= 40 ? '💪' : '📘'}</div>
          <h2>${s.mode === 'boss' && s.boss ? (s.boss.defeated ? (isAr() ? 'هزمت الزعيم!' : 'Boss defeated!') : (isAr() ? 'الزعيم صمد…' : 'The boss held on…'))
            : s.pct >= 70 ? (isAr() ? 'أحسنت!' : 'Well done!') : (isAr() ? 'لا بأس، واصل التدريب' : 'Keep practising')}</h2>
          <div class="score-big">${s.score} / ${s.total}</div>
          <div class="s-stars">${starsHtml(stars)}</div>
          <div class="s-stats">
            <div class="s-stat"><b>${s.pct}%</b><small>${isAr() ? 'الدقة' : 'Accuracy'}</small></div>
            <div class="s-stat"><b style="color:var(--cyan)">+${formatNum(xpTotal)}</b><small>XP</small></div>
            ${coinsTotal ? `<div class="s-stat"><b style="color:var(--gold)">+${formatNum(coinsTotal)}</b><small>${isAr() ? 'عملات' : 'Coins'}</small></div>` : ''}
            <div class="s-stat"><b>${s.answered ?? s.total}</b><small>${isAr() ? 'أسئلة' : 'answered'}</small></div>
          </div>

          ${s.boss ? `<div class="notice ${s.boss.defeated ? 'ok' : ''}" style="text-align:start">
            ⚔️ <b>${esc(s.boss.name_ar)}</b> — ${s.boss.defeated ? (isAr() ? 'مهزوم! أضيف إلى سجل انتصاراتك.' : 'Defeated! Added to your victories.') : (isAr() ? `وصلت إلى ${s.boss.pct}% — تحتاج 80%.` : `You reached ${s.boss.pct}% — 80% required.`)}
          </div>` : ''}

          ${s.daily ? `<div class="notice ${s.daily.won ? 'ok' : ''}" style="text-align:start">
            ⚡ ${s.daily.won
              ? (isAr() ? `تحدي اليوم مكتمل! +${s.daily.xp} XP و+${s.daily.coins} عملة.` : `Daily challenge complete! +${s.daily.xp} XP, +${s.daily.coins} coins.`)
              : (isAr() ? 'لم تصل إلى 75% هذه المرة — حاول غدًا.' : 'You did not reach 75% — try again tomorrow.')}
          </div>` : ''}

          ${s.newAchievements?.length ? `
            <div class="s-ach">
              <div class="small muted" style="margin-bottom:8px">${isAr() ? 'إنجازات جديدة' : 'New achievements'}</div>
              ${s.newAchievements.map(a => `<div class="ach-row"><div class="ach-ico">${a.icon}</div>
                <div><b>${esc(pick(a.title_ar, a.title_en))}</b><small>+${a.xp} XP · +${a.coins} 🪙</small></div></div>`).join('')}
            </div>` : ''}

          <div class="s-actions">
            ${stageCtx ? `<button class="btn btn-primary" id="retry">🔁 ${isAr() ? 'العب مرة أخرى' : 'Play again'}</button>` : ''}
            ${stageCtx ? `<a class="btn" href="#/stage/${stageCtx.stageId}">${isAr() ? 'عودة للمرحلة' : 'Back to stage'}</a>` : ''}
            ${stageCtx && stageCtx.nextStageId ? `<a class="btn btn-gold" href="#/stage/${stageCtx.nextStageId}">${isAr() ? 'المرحلة التالية' : 'Next stage'} →</a>` : ''}
            <a class="btn btn-ghost" href="#/home">${isAr() ? 'الرئيسية' : 'Home'}</a>
          </div>
        </div>
      </div>`;

    root.querySelector('#retry')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const res = await post('/api/play/start', {
          mode: s.mode === 'daily' ? 'meaning' : s.mode,
          stageId: stageCtx?.stageId || null,
          bossId: s.boss?.id || null,
        });
        ctx.go(`#/play/${res.session.id}`);
      } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
      }
    });
  }

  function findStage(stageId) {
    for (const w of ctx.state.worlds) {
      const i = w.stages.findIndex(s => s.id === stageId);
      if (i >= 0) {
        const next = w.stages.slice(i + 1).find(s => s.status !== 'locked');
        return { stageId, worldCode: w.code, nextStageId: next?.id || null };
      }
    }
    return { stageId, worldCode: null, nextStageId: null };
  }

  paintBoss();
  paint();
}

function isArabicText(value) {
  return AR_RE.test(String(value || ''));
}
