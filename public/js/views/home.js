// CODE QUEST — home dashboard.
import { api, post } from '../api.js';
import {
  avatarHtml, confetti, emptyState, esc, formatNum, h, isAr, pick, progressBar, relTime,
  toast, starsHtml,
} from '../ui.js';

export async function homeView(root, ctx) {
  const { state } = ctx;
  const b = state.bootstrap;
  if (!b) { root.innerHTML = '<div class="card">…</div>'; return; }
  const p = b.profile;

  const activeWorld = state.worlds.find(w => w.progress > 0 && w.progress < 100)
    || state.worlds.find(w => w.progress < 100)
    || state.worlds[0];
  const nextStage = activeWorld?.firstStageId;
  const dueCount = b.reviewDue || 0;

  const rankName = pick(p.rank.name_ar, p.rank.name_en);
  const nextRankName = p.nextRank ? pick(p.nextRank.name_ar, p.nextRank.name_en) : null;
  const xpPct = Math.min(100, Math.round((p.xpIntoLevel / Math.max(1, p.xpForNextLevel)) * 100));

  root.innerHTML = `
    <div class="home-grid">
      <div class="stack">
        <section class="hero-card card glow">
          <div>
            <div class="hero-top">
              <span class="pill blue">${p.rank.icon} ${esc(rankName)}</span>
              <span class="pill">${isAr() ? 'المستوى' : 'Level'} ${p.level}</span>
              ${p.stats.currentStreak > 0 ? `<span class="pill gold">🔥 ${p.stats.currentStreak} ${isAr() ? 'يوم متتالي' : 'day streak'}</span>` : ''}
            </div>
            <h2>${isAr() ? `أهلًا ${esc(p.profile.display_name)} 👋` : `Welcome back, ${esc(p.profile.display_name)} 👋`}</h2>
            <p class="sub">${isAr()
              ? 'كل مصطلح تتعلمه يقرّبك خطوة من أن تصبح مطوّرًا يقرأ التوثيق بثقة.'
              : 'Every term you learn brings you closer to reading documentation with confidence.'}</p>
            <div class="hero-actions">
              ${nextStage
                ? `<a class="btn btn-primary btn-lg" href="#/stage/${nextStage}">▶ ${isAr() ? 'واصل التعلّم' : 'Continue learning'}</a>`
                : ''}
              <button class="btn btn-lg" id="start-daily" ${b.daily.completed ? 'disabled' : ''}>
                ${b.daily.completed ? '✅ ' + (isAr() ? 'أكملت تحدي اليوم' : 'Daily done') : '⚡ ' + (isAr() ? 'تحدي اليوم' : 'Daily challenge')}
              </button>
            </div>
          </div>
          <svg class="hero-art" viewBox="0 0 240 240" fill="none" aria-hidden="true">
            <defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
              <stop stop-color="#00D9FF"/><stop offset="1" stop-color="#A855F7"/></linearGradient></defs>
            <circle cx="120" cy="120" r="86" stroke="url(#hg)" stroke-width="1.5" opacity=".45"/>
            <circle cx="120" cy="120" r="62" stroke="url(#hg)" stroke-width="1" opacity=".3"/>
            <path d="M70 96 L46 120 L70 144" stroke="#00D9FF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M170 96 L194 120 L170 144" stroke="#00D9FF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M138 76 L102 164" stroke="url(#hg)" stroke-width="6" stroke-linecap="round"/>
            <circle cx="120" cy="120" r="4" fill="#F8FAFC"/>
          </svg>
          <div class="level-strip">
            <div class="meta">
              <span>${formatNum(p.xp)} ${isAr() ? 'خبرة' : 'XP'} · ${isAr() ? 'المستوى' : 'Level'} ${p.level}</span>
              <span>${p.xpToNext > 0 ? `${formatNum(p.xpToNext)} ${isAr() ? 'للمستوى التالي' : 'to next level'}` : (isAr() ? 'أعلى مستوى' : 'Max level')}</span>
            </div>
            ${progressBar(xpPct)}
            ${nextRankName ? `<div class="small muted">${isAr() ? 'الرتبة القادمة' : 'Next rank'}: <b>${esc(nextRankName)}</b></div>` : ''}
          </div>
        </section>

        <section class="card">
          <h3 class="section-title"><span class="ico">🗺️</span> ${isAr() ? 'واصل رحلتك' : 'Your journey'} <small>${isAr() ? 'العوالم' : 'Worlds'}</small></h3>
          <div class="world-grid">
            ${state.worlds.slice(0, 6).map(w => `
              <a class="world-card" href="#/world/${w.code}" style="--wc:${esc(w.color)}">
                <div class="wc-top">
                  <span class="world-ico">${w.icon}</span>
                  <div>
                    <h3>${esc(pick(w.name_ar, w.name_en))}</h3>
                    <div class="wc-sub">${esc(pick(w.subtitle_ar, w.name_en))}</div>
                  </div>
                </div>
                <div class="wc-meta">
                  <span>${w.completedStages}/${w.totalStages} ${isAr() ? 'مراحل' : 'stages'}</span>
                  <span>${w.progress}%</span>
                </div>
                ${progressBar(w.progress)}
              </a>`).join('')}
          </div>
          <div class="row" style="justify-content:center;margin-top:16px">
            <a class="btn btn-ghost" href="#/worlds">${isAr() ? 'كل العوالم الـ15' : 'All 15 worlds'} →</a>
          </div>
        </section>

        <section class="card">
          <h3 class="section-title"><span class="ico">🎮</span> ${isAr() ? 'أنماط اللعب' : 'Game modes'} <small>${isAr() ? 'اختر تحديًا' : 'Pick a challenge'}</small></h3>
          <div class="mode-grid">
            ${state.modes.map(m => `
              <div class="mode-card ${m.unlocked ? '' : 'locked'}" data-mode="${esc(m.code)}">
                ${m.unlocked ? '' : `<span class="lock-tag">🔒 ${isAr() ? 'المستوى' : 'Level'} ${m.unlocked_level}</span>`}
                <span class="mi">${m.icon}</span>
                <b>${esc(pick(m.name_ar, m.name_en))}</b>
                <small>${esc(m.description_ar)}</small>
              </div>`).join('')}
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="daily-card">
          <div class="row" style="justify-content:space-between">
            <h3 class="section-title" style="margin:0"><span class="ico">⚡</span> ${isAr() ? 'تحدي اليوم' : 'Daily challenge'}</h3>
            <span class="pill gold">${b.daily.completed ? '✅' : '🔥'}</span>
          </div>
          <p class="small muted" style="margin:8px 0 12px">
            ${isAr()
              ? `أجب عن ${b.daily.questionCount} أسئلة مختلطة اليوم لتحصل على ${b.daily.xpReward} خبرة و${b.daily.coinReward} عملة.`
              : `Answer ${b.daily.questionCount} mixed questions for ${b.daily.xpReward} XP and ${b.daily.coinReward} coins.`}
          </p>
          ${b.daily.completed
            ? `<div class="pill green">✅ ${isAr() ? 'مكتمل — عد غدًا' : 'Completed — come back tomorrow'}</div>`
            : `<button class="btn btn-gold btn-block" id="start-daily-2">${isAr() ? 'ابدأ التحدي' : 'Start challenge'} →</button>`}
        </section>

        ${b.wordOfDay ? `
        <section class="word-card">
          <div class="row" style="justify-content:space-between">
            <span class="small muted">${isAr() ? 'كلمة اليوم' : 'Word of the day'}</span>
            <button class="icon-btn" id="speak-word" title="${isAr() ? 'استمع' : 'Listen'}" style="width:32px;height:32px">🔊</button>
          </div>
          <div class="word-en">${esc(b.wordOfDay.english)}</div>
          <div class="word-ar">${esc(b.wordOfDay.arabic)}</div>
          <p class="word-def">${esc(b.wordOfDay.definition_ar)}</p>
          <a class="btn btn-sm btn-ghost" href="#/dictionary?q=${encodeURIComponent(b.wordOfDay.english)}">${isAr() ? 'تفاصيل المصطلح' : 'Open in dictionary'} →</a>
        </section>` : ''}

        <section class="card">
          <h3 class="section-title"><span class="ico">🔁</span> ${isAr() ? 'المراجعة الذكية' : 'Smart review'}</h3>
          <div class="row" style="justify-content:space-between;margin-bottom:10px">
            <div>
              <div style="font-size:1.6rem;font-weight:900;color:${dueCount ? 'var(--cyan)' : 'var(--muted)'}">${dueCount}</div>
              <div class="small muted">${isAr() ? 'مصطلح مستحق الآن' : 'terms due now'}</div>
            </div>
            <div style="font-size:2.2rem">🧠</div>
          </div>
          <button class="btn btn-block ${dueCount ? 'btn-primary' : ''}" id="start-review" ${dueCount ? '' : 'disabled'}>
            ${dueCount ? (isAr() ? 'ابدأ المراجعة' : 'Start review') : (isAr() ? 'لا يوجد مستحق' : 'Nothing due')}
          </button>
        </section>

        <section class="card">
          <h3 class="section-title"><span class="ico">📊</span> ${isAr() ? 'إحصاءاتك' : 'Your stats'}</h3>
          <div class="stat-grid">
            <div class="mini-stat"><div class="lab">${isAr() ? 'متقن' : 'Mastered'}</div><div class="val green">${formatNum(p.stats.mastered)}</div></div>
            <div class="mini-stat"><div class="lab">${isAr() ? 'شوهد' : 'Seen'}</div><div class="val cyan">${formatNum(p.stats.seen)}</div></div>
            <div class="mini-stat"><div class="lab">${isAr() ? 'الدقة' : 'Accuracy'}</div><div class="val purple">${p.stats.accuracy}%</div></div>
            <div class="mini-stat"><div class="lab">${isAr() ? 'أطول سلسلة' : 'Best streak'}</div><div class="val gold">${p.stats.longestStreak}</div></div>
          </div>
        </section>

        <section class="card">
          <h3 class="section-title"><span class="ico">🎖️</span> ${isAr() ? 'آخر الإنجازات' : 'Recent badges'}</h3>
          ${b.recentAchievements?.length
            ? b.recentAchievements.map(a => `
              <div class="ach-row">
                <div class="ach-ico">${a.icon}</div>
                <div><b>${esc(pick(a.title_ar, a.title_en))}</b><small>${relTime(a.unlocked_at)}</small></div>
              </div>`).join('')
            : `<p class="small muted">${isAr() ? 'أكمل جولتك الأولى لتفتح إنجازك الأول.' : 'Finish your first round to unlock a badge.'}</p>`}
          <a class="btn btn-sm btn-ghost btn-block" href="#/achievements">${isAr() ? 'كل الإنجازات' : 'All achievements'} →</a>
        </section>
      </div>
    </div>`;

  /* ---- interactions */
  const startDaily = async button => {
    button.disabled = true;
    try {
      const res = await post('/api/daily/start');
      ctx.go(`#/play/${res.session.id}`);
    } catch (err) {
      toast(err.message, err.status === 409 ? 'gold' : 'err');
      button.disabled = false;
      if (err.status === 409) {
        await refresh(ctx);
      }
    }
  };
  root.querySelector('#start-daily')?.addEventListener('click', e => startDaily(e.currentTarget));
  root.querySelector('#start-daily-2')?.addEventListener('click', e => startDaily(e.currentTarget));

  root.querySelector('#start-review')?.addEventListener('click', async () => {
    try {
      const res = await post('/api/review/start');
      ctx.go(`#/play/${res.session.id}`);
    } catch (err) { toast(err.message, 'err'); }
  });

  root.querySelector('#speak-word')?.addEventListener('click', () => {
    import('../ui.js').then(ui => ui.speak(b.wordOfDay.english, 'en-US'));
  });

  root.querySelectorAll('[data-mode]').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      const m = state.modes.find(x => x.code === mode);
      if (!m?.unlocked) { toast(isAr() ? `يُفتح في المستوى ${m.unlocked_level}` : `Unlocks at level ${m.unlocked_level}`, 'gold'); return; }
      if (mode === 'review') ctx.go('#/review');
      else if (mode === 'boss') ctx.go('#/bosses');
      else {
        const stage = nextStage || state.worlds[0].firstStageId;
        ctx.go(`#/stage/${stage}?mode=${mode}`);
      }
    });
  });
}

async function refresh(ctx) {
  const data = await api('/api/bootstrap');
  ctx.state.bootstrap = data;
  ctx.updateProfile(data.profile);
  await homeView(document.getElementById('view'), ctx);
}
