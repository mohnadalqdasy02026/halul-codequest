// CODE QUEST — 1v1 multiplayer: invite-code lobby, live room, server-scored match.
import { api, post } from '../api.js';
import {
  confetti, emptyState, esc, formatNum, formatTime, isAr, pick, progressBar, sfx,
  skeleton, toast,
} from '../ui.js';

export async function multiplayerView(root, ctx) {
  const sub = ctx.state.bootstrap?.subscription;
  const canPlay = !!sub?.active;
  let room = null;
  let busy = false;
  let feedback = null;
  let lastKey = '';
  let timeoutHit = false;
  let destroyed = false;
  let pollTimer = null;
  let clockTimer = null;

  root.innerHTML = `<div class="card">${skeleton(2, 120)}</div>`;

  function paintLobby() {
    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1 style="margin:0">🎮 ${isAr() ? 'اللعب الجماعي' : 'Multiplayer'}</h1>
          <p>${isAr()
            ? 'غرفة بكود دعوة · لاعب ضد لاعب · نفس الأسئلة ونتائج مباشرة.'
            : 'Invite-code room · 1v1 · same questions and live scores.'}</p>
        </div>
        <span class="pill purple">⚔️ 1v1</span>
      </div>

      ${canPlay ? '' : `<div class="notice" style="margin-bottom:18px">
        🔒 ${isAr()
          ? 'اللعب الجماعي متاح للمشتركين فقط. فعّل اشتراكك ثم ارجع لتحدي صديقك.'
          : 'Multiplayer is available to subscribers. Activate your subscription, then come back to challenge a friend.'}
        <div style="margin-top:10px"><a class="btn btn-gold btn-sm" href="#/subscription">💳 ${isAr() ? 'عرض الاشتراكات' : 'View plans'}</a></div>
      </div>`}

      <div class="mp-lobby">
        <section class="card mp-card">
          <div class="mp-icon">🎯</div>
          <h3>${isAr() ? 'أنشئ غرفة' : 'Create a room'}</h3>
          <p class="small muted">${isAr()
            ? 'ستحصل على كود من 6 أحرف. شاركه مع صديقك ليدخل ويبدأ التحدي.'
            : 'You get a 6-character code. Share it with a friend to start the duel.'}</p>
          <button class="btn btn-primary btn-block" id="mp-create" ${canPlay ? '' : 'disabled'}>
            ${isAr() ? 'إنشاء غرفة جديدة' : 'Create a new room'}
          </button>
        </section>

        <section class="card mp-card">
          <div class="mp-icon">🔑</div>
          <h3>${isAr() ? 'انضم بكود' : 'Join with a code'}</h3>
          <p class="small muted">${isAr()
            ? 'أدخل كود الغرفة الذي وصلك من صديقك.'
            : 'Enter the room code your friend shared with you.'}</p>
          <form id="mp-join-form">
            <input class="input mp-code-input" id="mp-code" maxlength="8" dir="ltr"
              placeholder="ABC123" autocomplete="off" spellcheck="false" ${canPlay ? '' : 'disabled'} />
            <button class="btn btn-gold btn-block" type="submit" id="mp-join" ${canPlay ? '' : 'disabled'}>
              ${isAr() ? 'دخول الغرفة' : 'Join room'}
            </button>
          </form>
        </section>
      </div>

      <section class="card" style="margin-top:18px">
        <h3 class="section-title"><span class="ico">📋</span> ${isAr() ? 'كيف تعمل المباراة؟' : 'How a match works'}</h3>
        <div class="mp-steps">
          <div><b>1</b><span>${isAr() ? 'أنشئ غرفة وشارك الكود.' : 'Create a room and share the code.'}</span></div>
          <div><b>2</b><span>${isAr() ? 'يدخل صديقك، وتبدأ المباراة تلقائيًا.' : 'Your friend joins and the match starts automatically.'}</span></div>
          <div><b>3</b><span>${isAr() ? '8 أسئلة متطابقة — كل إجابة صحيحة 100 نقطة.' : '8 identical questions — 100 points per correct answer.'}</span></div>
          <div><b>4</b><span>${isAr() ? 'الفائز يحصل على مكافأة خبرة وعملات إضافية.' : 'The winner earns bonus XP and coins.'}</span></div>
        </div>
      </section>`;

    root.querySelector('#mp-create')?.addEventListener('click', createRoom);
    root.querySelector('#mp-join-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const code = root.querySelector('#mp-code').value.trim();
      if (!code) return;
      await joinRoom(code);
    });
  }

  function playerCard(p, side, isYou) {
    const score = p?.score || 0;
    const correct = p?.correct || 0;
    return `<div class="mp-player ${isYou ? 'you' : ''}">
      <span class="mp-avatar">${isYou ? '🫵' : '🧑‍💻'}</span>
      <div style="flex:1;min-width:0">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <b>${esc(p?.name || (isAr() ? 'بانتظار لاعب…' : 'Waiting for a player…'))}</b>
          ${isYou ? `<span class="pill blue">${isAr() ? 'أنت' : 'You'}</span>` : ''}
        </div>
        <div class="small muted">${correct} ${isAr() ? 'إجابة صحيحة' : 'correct'}</div>
      </div>
      <div class="mp-score">${formatNum(score)}</div>
      <span class="mp-side">${side}</span>
    </div>`;
  }

  function paintWaiting() {
    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1 style="margin:0">🎮 ${isAr() ? 'غرفة الانتظار' : 'Waiting room'}</h1>
          <p>${isAr() ? 'شارك الكود مع صديقك لتبدأ المباراة.' : 'Share the code with your friend to begin.'}</p>
        </div>
        <button class="btn btn-sm btn-danger" id="mp-leave">${isAr() ? 'خروج' : 'Leave'}</button>
      </div>

      <section class="card glow mp-waiting">
        <div class="small muted">${isAr() ? 'كود الغرفة' : 'Room code'}</div>
        <div class="mp-room-code" id="mp-room-code">${esc(room.code)}</div>
        <div class="row" style="justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" id="mp-copy">📋 ${isAr() ? 'نسخ الكود' : 'Copy code'}</button>
          <button class="btn" id="mp-share">🔗 ${isAr() ? 'نسخ رابط الدعوة' : 'Copy invite link'}</button>
        </div>
        <div class="mp-vs" style="margin-top:26px">
          ${playerCard(room.host, isAr() ? 'المضيف' : 'Host', room.role === 'host')}
          <div class="mp-vs-badge">VS</div>
          ${room.guest ? playerCard(room.guest, isAr() ? 'الضيف' : 'Guest', room.role === 'guest')
            : `<div class="mp-player waiting"><span class="mp-avatar">⏳</span>
                <div><b>${isAr() ? 'بانتظار الخصم…' : 'Waiting for opponent…'}</b>
                <div class="small muted">${isAr() ? 'سيبدأ التحدي فور دخوله.' : 'The duel starts as soon as they join.'}</div></div></div>`}
        </div>
        <div class="mp-dots" style="margin-top:18px"><i></i><i></i><i></i></div>
      </section>`;

    const copy = async text => {
      try {
        await navigator.clipboard.writeText(text);
        toast(isAr() ? 'تم النسخ!' : 'Copied!', 'ok', 1600);
      } catch {
        toast(text, 'info', 4200);
      }
    };
    root.querySelector('#mp-copy')?.addEventListener('click', () => copy(room.code));
    root.querySelector('#mp-share')?.addEventListener('click', () => {
      copy(`${location.origin}${location.pathname}#/multiplayer?code=${room.code}`);
    });
    root.querySelector('#mp-leave')?.addEventListener('click', leaveRoom);
  }

  function paintGame() {
    if (room.you.finished) {
      root.innerHTML = `
        <div class="page-head">
          <div><h1 style="margin:0">🎮 ${isAr() ? 'المباراة جارية' : 'Match in progress'}</h1>
            <p>${isAr() ? 'أجبت عن كل أسئلتك — بانتظار خصمك.' : 'You answered all your questions — waiting for your opponent.'}</p></div>
          <button class="btn btn-sm btn-danger" id="mp-leave">${isAr() ? 'انسحاب' : 'Forfeit'}</button>
        </div>
        <section class="card mp-waiting">
          <div class="mp-vs">
            ${playerCard(room.you, isAr() ? 'أنت' : 'You', true)}
            <div class="mp-vs-badge">VS</div>
            ${playerCard(room.opponent, isAr() ? 'الخصم' : 'Opponent', false)}
          </div>
          <div class="mp-dots" style="margin-top:22px"><i></i><i></i><i></i></div>
        </section>`;
      root.querySelector('#mp-leave')?.addEventListener('click', leaveRoom);
      return;
    }

    const q = room.question;
    if (!q) {
      paintFinished();
      return;
    }
    const myPct = Math.round((room.you.index / Math.max(1, room.total)) * 100);
    const oppPct = Math.round((room.opponent.index / Math.max(1, room.total)) * 100);

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1 style="margin:0">🎮 ${isAr() ? 'المباراة' : 'Match'} <span class="mono muted" style="font-size:.8em">#${esc(room.code)}</span></h1>
          <p>${isAr() ? 'أجب أسرع من خصمك — النقاط تُحسب على الخادم.' : 'Answer faster than your opponent — scoring is server-side.'}</p>
        </div>
        <div class="row" style="gap:8px">
          <span class="pill blue" id="mp-timer">${room.deadline ? formatTime(new Date(room.deadline).getTime() - Date.now()) : '—'}</span>
          <button class="btn btn-sm btn-danger" id="mp-leave">${isAr() ? 'انسحاب' : 'Forfeit'}</button>
        </div>
      </div>

      <section class="card mp-scoreboard" style="margin-bottom:16px">
        <div class="mp-score-row">
          <div class="mp-score-side">
            <div class="row" style="gap:8px"><b>${esc(room.you.name || '')}</b><span class="pill blue">${isAr() ? 'أنت' : 'You'}</span></div>
            <div class="mp-big-score">${formatNum(room.you.score)}</div>
            ${progressBar(myPct)}
            <div class="small muted">${room.you.index} / ${room.total}</div>
          </div>
          <div class="mp-vs-badge">VS</div>
          <div class="mp-score-side">
            <div class="row" style="gap:8px;justify-content:flex-end"><b>${esc(room.opponent.name || (isAr() ? 'الخصم' : 'Opponent'))}</b></div>
            <div class="mp-big-score" style="color:var(--gold)">${formatNum(room.opponent.score)}</div>
            ${progressBar(oppPct, { gold: true })}
            <div class="small muted">${room.opponent.index} / ${room.total}</div>
          </div>
        </div>
      </section>

      <section class="q-card mp-question">
        <div class="q-mode">
          <span>⚔️</span><span>${isAr() ? 'السؤال' : 'Question'} ${room.you.index + 1} / ${room.total}</span>
          <span style="flex:1"></span>
          ${q.difficulty ? `<span class="pill gold">${esc(q.difficulty)}</span>` : ''}
        </div>
        <div class="q-prompt">
          <div class="big-en" dir="ltr">${esc(q.prompt || '')}</div>
        </div>
        <div class="options" id="mp-options">
          ${(q.options || []).map((opt, i) => {
            let cls = '';
            if (feedback) {
              if (opt.id === feedback.correctOptionId) cls = 'correct';
              else if (opt.id === feedback.choiceId) cls = 'wrong';
              else cls = 'dim';
            }
            return `<button class="option-btn ${cls}" data-option="${opt.id}" ${feedback ? 'disabled' : ''}>
              <span class="option-key">${'ABCD'[i] || i + 1}</span>
              <span class="opt-text" dir="auto">${esc(opt.text)}</span>
            </button>`;
          }).join('')}
        </div>
        ${feedback ? `<div class="feedback ${feedback.correct ? 'ok' : 'no'}" style="margin-top:16px">
          <h4>${feedback.correct ? '✅ ' + (isAr() ? 'إجابة صحيحة! +100' : 'Correct! +100')
            : '❌ ' + (isAr() ? 'إجابة خاطئة' : 'Not quite')}</h4>
        </div>` : ''}
      </section>`;

    root.querySelectorAll('#mp-options [data-option]').forEach(btn => {
      btn.addEventListener('click', () => answer(Number(btn.dataset.option)));
    });
    root.querySelector('#mp-leave')?.addEventListener('click', leaveRoom);
  }

  function paintFinished() {
    const won = room.winnerId && room.winnerId === room.you.id;
    const draw = !room.winnerId;
    const emoji = won ? '🏆' : draw ? '🤝' : '💪';
    const title = won ? (isAr() ? 'فزت بالمباراة!' : 'You won!')
      : draw ? (isAr() ? 'تعادل!' : 'A draw!')
        : (isAr() ? 'الخصم فاز هذه المرة' : 'Your opponent won this time');
    if (won) { sfx.win(); confetti(); } else sfx.flip();
    root.innerHTML = `
      <div class="play-shell">
        <div class="summary card glow">
          <div class="s-emoji">${emoji}</div>
          <h2>${title}</h2>
          <div class="mp-final">
            <div class="mp-final-side ${won ? 'win' : ''}">
              <span class="small muted">${esc(room.you.name || (isAr() ? 'أنت' : 'You'))}</span>
              <b>${formatNum(room.you.score)}</b>
              <span class="small muted">${room.you.correct} ${isAr() ? 'صحيحة' : 'correct'}</span>
            </div>
            <div class="mp-vs-badge">VS</div>
            <div class="mp-final-side ${!won && !draw ? 'win' : ''}">
              <span class="small muted">${esc(room.opponent.name || (isAr() ? 'الخصم' : 'Opponent'))}</span>
              <b>${formatNum(room.opponent.score)}</b>
              <span class="small muted">${room.opponent.correct} ${isAr() ? 'صحيحة' : 'correct'}</span>
            </div>
          </div>
          <div class="notice ok" style="text-align:start;margin-top:18px">
            🎁 ${isAr() ? 'تمت إضافة مكافأة الخبرة والعملات إلى حسابك.' : 'XP and coin rewards were added to your account.'}
          </div>
          <div class="s-actions" style="margin-top:18px">
            <button class="btn btn-primary" id="mp-again">🎮 ${isAr() ? 'مباراة جديدة' : 'New match'}</button>
            <a class="btn" href="#/leaderboard">🏆 ${isAr() ? 'لوحة الصدارة' : 'Leaderboard'}</a>
            <a class="btn btn-ghost" href="#/home">${isAr() ? 'الرئيسية' : 'Home'}</a>
          </div>
        </div>
      </div>`;
    root.querySelector('#mp-again')?.addEventListener('click', async () => {
      room = null;
      lastKey = '';
      busy = false;
      await createRoom();
    });
  }

  function paint() {
    if (destroyed) return;
    if (!room) {
      lastKey = 'lobby';
      paintLobby();
      return;
    }
    lastKey = stateKey();
    if (room.status === 'waiting') paintWaiting();
    else if (room.status === 'active') paintGame();
    else if (room.status === 'finished') paintFinished();
    else { room = null; paintLobby(); }
  }

  function stateKey() {
    if (!room) return 'lobby';
    return [
      room.status, room.code, room.you.index, room.you.score, room.you.finished,
      room.opponent?.score, room.opponent?.index, room.opponent?.finished, room.winnerId,
    ].join('|');
  }

  async function createRoom() {
    if (busy) return;
    busy = true;
    try {
      const res = await post('/api/mp/create');
      room = res.room;
      timeoutHit = false;
      paint();
    } catch (err) {
      toast(err.message, 'err', 4200);
    } finally {
      busy = false;
    }
  }

  async function joinRoom(code) {
    if (busy) return;
    busy = true;
    try {
      const res = await post('/api/mp/join', { code });
      room = res.room;
      timeoutHit = false;
      sfx.level();
      paint();
    } catch (err) {
      toast(err.message, 'err', 4200);
    } finally {
      busy = false;
    }
  }

  async function leaveRoom() {
    if (busy) return;
    busy = true;
    try {
      await post('/api/mp/leave');
      room = null;
      lastKey = '';
      paint();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      busy = false;
    }
  }

  async function answer(optionId) {
    if (busy || feedback) return;
    busy = true;
    try {
      const res = await post('/api/mp/answer', { optionId });
      res.choiceId = optionId;
      feedback = res;
      room = res.room;
      res.correct ? sfx.correct() : sfx.wrong();
      paint();
      setTimeout(() => {
        if (destroyed) return;
        feedback = null;
        busy = false;
        paint();
      }, 1150);
    } catch (err) {
      toast(err.message, 'err', 3600);
      busy = false;
      paint();
    }
  }

  async function refresh() {
    if (destroyed || !room || busy || feedback) return;
    try {
      const data = await api('/api/mp/room');
      if (!data.room) {
        if (room) { room = null; paint(); }
        return;
      }
      room = data.room;
      const key = stateKey();
      if (key !== lastKey) paint();
    } catch { /* polling is best-effort */ }
  }

  function onClock() {
    if (destroyed || !room?.deadline) return;
    const el = root.querySelector('#mp-timer');
    if (!el) return;
    const ms = new Date(room.deadline).getTime() - Date.now();
    if (ms <= 0) {
      el.textContent = '0:00';
      if (!timeoutHit) { timeoutHit = true; refresh(); }
    } else {
      timeoutHit = false;
      el.textContent = formatTime(ms);
    }
  }

  try {
    const data = await api('/api/mp/room');
    room = data.room;
    paint();
  } catch (err) {
    root.innerHTML = emptyState('🎮', isAr() ? 'تعذر تحميل اللعب الجماعي' : 'Could not load multiplayer', err.message);
    return;
  }

  // Invite links land here with ?code=… while no room is open.
  if (!room) {
    const prefill = new URLSearchParams(location.hash.split('?')[1] || '').get('code');
    if (prefill) {
      const input = root.querySelector('#mp-code');
      if (input) input.value = prefill.toUpperCase();
      if (canPlay) await joinRoom(prefill);
    }
  }

  pollTimer = setInterval(refresh, 1800);
  clockTimer = setInterval(onClock, 500);
  onClock();

  return {
    destroy: () => {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (clockTimer) clearInterval(clockTimer);
    },
  };
}
