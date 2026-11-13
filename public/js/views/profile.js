// CODE QUEST — player profile: stats, XP chart, category progress, settings, logout.
import { api, post, put } from '../api.js';
import {
  avatarHtml, emptyState, esc, formatNum, isAr, pick, progressBar, relTime,
  setLang, sfx, skeleton, toast,
} from '../ui.js';

const GOALS = [10, 20, 30, 50, 100];

export async function profileView(root, ctx) {
  root.innerHTML = `<div class="card" style="margin-bottom:20px">${skeleton(1, 160)}</div>`;
  let data;
  try {
    data = await api('/api/profile');
  } catch (err) {
    root.innerHTML = emptyState('👤', isAr() ? 'تعذر تحميل الملف' : 'Could not load your profile', err.message);
    return;
  }

  const p = data.profile;
  const stats = p.stats;
  const prof = p.profile;
  const chart = data.chart || [];
  const maxXp = Math.max(1, ...chart.map(d => Number(d.xp) || 0));
  const totalPeriodXp = chart.reduce((s, d) => s + (Number(d.xp) || 0), 0);
  const unlocked = (data.achievements || []).filter(a => a.unlocked);
  const xpPct = Math.min(100, Math.round((p.xpIntoLevel / Math.max(1, p.xpForNextLevel)) * 100));

  const dayLabel = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB', { weekday: 'short' });

  root.innerHTML = `
    <!-- hero -->
    <section class="profile-hero card glow">
      <div class="ph-avatar">${avatarHtml(prof, 96)}</div>
      <div style="flex:1;min-width:0">
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <h1 style="margin:0">${esc(prof.display_name)}</h1>
          <span class="pill blue">${p.rank.icon} ${esc(pick(p.rank.name_ar, p.rank.name_en))}</span>
          <span class="pill">${isAr() ? 'المستوى' : 'Level'} ${p.level}</span>
          ${prof.role === 'admin' ? '<span class="pill purple">🛠️ admin</span>' : ''}
        </div>
        <div class="small muted" style="margin-top:4px">@${esc(p.username)} · ${isAr() ? 'انضم' : 'joined'} ${new Date(prof.created_at || Date.now()).toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB')}</div>
        ${prof.bio ? `<p class="ph-bio">${esc(prof.bio)}</p>` : `<p class="ph-bio muted">${isAr() ? 'أضف نبذة عنك من الإعدادات بالأسفل.' : 'Add a short bio from the settings below.'}</p>`}
        <div class="row" style="justify-content:space-between;margin:14px 0 6px">
          <span class="small">${formatNum(p.xp)} ${isAr() ? 'خبرة' : 'XP'}</span>
          <span class="small muted">${p.xpToNext > 0 ? `${formatNum(p.xpToNext)} ${isAr() ? 'للمستوى' : 'to level'} ${p.level + 1}` : (isAr() ? 'أعلى مستوى' : 'Max level')}</span>
        </div>
        ${progressBar(xpPct)}
        ${p.nextRank ? `<div class="small muted" style="margin-top:8px">${isAr() ? 'الرتبة القادمة' : 'Next rank'}: <b style="color:var(--gold)">${esc(pick(p.nextRank.name_ar, p.nextRank.name_en))}</b> · ${isAr() ? 'من المستوى' : 'from level'} ${p.nextRank.minLevel}</div>` : ''}
      </div>
      <div class="ph-side">
        <div class="ph-coins"><span>🪙</span><b>${formatNum(p.coins)}</b><small>${isAr() ? 'عملات' : 'coins'}</small></div>
        <a class="btn btn-sm btn-gold btn-block" href="#/shop">${isAr() ? 'المتجر' : 'Shop'}</a>
      </div>
    </section>

    <!-- stat cards -->
    <div class="stat-cards" style="margin:20px 0">
      <div class="stat-card"><div class="lab">${isAr() ? 'متقن' : 'Mastered'}</div><div class="val" style="color:var(--green)">${formatNum(stats.mastered)}</div></div>
      <div class="stat-card"><div class="lab">${isAr() ? 'مصطلحات مشوهدَة' : 'Terms seen'}</div><div class="val" style="color:var(--cyan)">${formatNum(stats.seen)}</div></div>
      <div class="stat-card"><div class="lab">${isAr() ? 'دقة الإجابات' : 'Accuracy'}</div><div class="val" style="color:var(--purple)">${stats.accuracy}%</div></div>
      <div class="stat-card"><div class="lab">${isAr() ? 'أسئلة مُجابة' : 'Answers'}</div><div class="val">${formatNum(stats.totalAnswered)}</div></div>
      <div class="stat-card"><div class="lab">${isAr() ? 'أطول سلسلة' : 'Best streak'}</div><div class="val" style="color:var(--gold)">${stats.longestStreak}</div></div>
      <div class="stat-card"><div class="lab">${isAr() ? 'مراحل مكتملة' : 'Stages done'}</div><div class="val">${stats.completedStages}</div></div>
    </div>

    <div class="profile-grid">
      <div class="stack">
        <!-- xp chart -->
        <section class="card">
          <h3 class="section-title"><span class="ico">📈</span> ${isAr() ? 'الخبرة — 14 يومًا' : 'XP — last 14 days'}
            <small>${isAr() ? 'الإجمالي' : 'total'}: ${formatNum(totalPeriodXp)} XP</small></h3>
          <div class="xp-chart">
            ${chart.map(d => `
              <div class="xp-col" title="${esc(d.day)} · ${formatNum(d.xp)} XP">
                <div class="xp-bar"><i style="height:${Math.max(3, Math.round((Number(d.xp) / maxXp) * 100))}%"></i></div>
                <small>${dayLabel(d.day)}</small>
              </div>`).join('')}
          </div>
        </section>

        <!-- categories -->
        <section class="card">
          <h3 class="section-title"><span class="ico">🧭</span> ${isAr() ? 'تقدمك حسب التخصص' : 'Progress by specialisation'}</h3>
          ${(data.categoryProgress || []).filter(c => c.touched > 0).length
            ? (data.categoryProgress || []).filter(c => c.touched > 0).map(c => {
                const pct = c.total ? Math.round((c.mastered / c.total) * 100) : 0;
                return `
                <div class="cat-row">
                  <div class="row" style="justify-content:space-between">
                    <span class="row" style="gap:8px"><span class="dot" style="background:${esc(c.color)}"></span><b>${esc(c.category)}</b></span>
                    <span class="small muted">${c.mastered}/${c.total} ${isAr() ? 'متقن' : 'mastered'}</span>
                  </div>
                  ${progressBar(pct, { green: pct >= 85 })}
                  <div class="small muted">${esc(c.world)}</div>
                </div>`;
              }).join('')
            : `<p class="small muted">${isAr() ? 'لم تبدأ أي تخصص بعد — العب أول مرحلة لتظهر إحصاءاتك هنا.' : 'You have not started a specialisation yet — play a stage to see stats here.'}</p>`}
        </section>

        <!-- activity -->
        <section class="card">
          <h3 class="section-title"><span class="ico">🕘</span> ${isAr() ? 'النشاط الأخير' : 'Recent activity'}</h3>
          ${(data.activity || []).length
            ? `<ul class="activity-list">${data.activity.map(a => `
                <li><span class="a-dot"></span><span>${esc(activityLabel(a.type))}</span><small>${relTime(a.created_at)}</small></li>`).join('')}</ul>`
            : `<p class="small muted">${isAr() ? 'لا نشاط بعد.' : 'No activity yet.'}</p>`}
        </section>
      </div>

      <div class="stack">
        <!-- settings -->
        <section class="card">
          <h3 class="section-title"><span class="ico">⚙️</span> ${isAr() ? 'الإعدادات' : 'Settings'}</h3>
          <form id="settings-form">
            <div class="field">
              <label for="s-name">${isAr() ? 'الاسم المعروض' : 'Display name'}</label>
              <input class="input" id="s-name" maxlength="40" value="${esc(prof.display_name)}" />
            </div>
            <div class="field">
              <label for="s-bio">${isAr() ? 'نبذة' : 'Bio'}</label>
              <textarea class="input" id="s-bio" rows="2" maxlength="280">${esc(prof.bio || '')}</textarea>
            </div>
            <div class="row" style="gap:12px">
              <div class="field" style="flex:1">
                <label for="s-lang">${isAr() ? 'اللغة' : 'Language'}</label>
                <select class="select" id="s-lang">
                  <option value="ar" ${prof.lang === 'ar' ? 'selected' : ''}>العربية</option>
                  <option value="en" ${prof.lang === 'en' ? 'selected' : ''}>English</option>
                </select>
              </div>
              <div class="field" style="flex:1">
                <label for="s-theme">${isAr() ? 'المظهر' : 'Theme'}</label>
                <select class="select" id="s-theme">
                  <option value="dark" ${prof.theme === 'dark' ? 'selected' : ''}>${isAr() ? 'داكن' : 'Dark'}</option>
                  <option value="light" ${prof.theme === 'light' ? 'selected' : ''}>${isAr() ? 'فاتح' : 'Light'}</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label>${isAr() ? 'هدف يومي (أسئلة)' : 'Daily goal (questions)'}</label>
              <div class="segmented" id="goal-seg">
                ${GOALS.map(g => `<button type="button" data-goal="${g}" class="${Number(prof.daily_goal) === g ? 'active' : ''}">${g}</button>`).join('')}
              </div>
            </div>
            <label class="switch-row">
              <span>${isAr() ? 'الأصوات' : 'Sound effects'}</span>
              <input type="checkbox" id="s-sound" ${prof.sound ? 'checked' : ''} />
            </label>
            <button class="btn btn-primary btn-block" type="submit" id="s-submit">${isAr() ? 'حفظ الإعدادات' : 'Save settings'}</button>
          </form>
        </section>

        <!-- badges -->
        <section class="card">
          <h3 class="section-title"><span class="ico">🎖️</span> ${isAr() ? 'الإنجازات' : 'Achievements'}
            <small>${unlocked.length} / ${(data.achievements || []).length}</small></h3>
          <div class="badge-strip">
            ${unlocked.length
              ? unlocked.slice(0, 12).map(a => `<span class="badge-chip" title="${esc(pick(a.title_ar, a.title_en))}">${a.icon}</span>`).join('')
              : `<span class="small muted">${isAr() ? 'لم تفتح أي شارة بعد.' : 'No badges unlocked yet.'}</span>`}
          </div>
          <a class="btn btn-sm btn-ghost btn-block" href="#/achievements">${isAr() ? 'كل الإنجازات' : 'All achievements'} →</a>
        </section>

        <!-- account -->
        <section class="card">
          <h3 class="section-title"><span class="ico">🔐</span> ${isAr() ? 'الحساب' : 'Account'}</h3>
          <div class="small muted" style="margin-bottom:12px">${esc(p.email || '')}</div>
          <div class="row">
            <a class="btn btn-sm" href="#/leaderboard">🏆 ${isAr() ? 'ترتيبي' : 'My ranking'}</a>
            <button class="btn btn-sm btn-danger" id="logout-btn">${isAr() ? 'تسجيل الخروج' : 'Log out'}</button>
          </div>
        </section>
      </div>
    </div>`;

  /* ---- goal segmented */
  let goal = Number(prof.daily_goal) || 20;
  root.querySelectorAll('#goal-seg [data-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      goal = Number(btn.dataset.goal);
      root.querySelectorAll('#goal-seg [data-goal]').forEach(b => b.classList.toggle('active', b === btn));
      sfx.click();
    });
  });

  /* ---- save settings */
  root.querySelector('#settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    const submit = root.querySelector('#s-submit');
    submit.disabled = true;
    const payload = {
      displayName: root.querySelector('#s-name').value.trim(),
      bio: root.querySelector('#s-bio').value.trim(),
      lang: root.querySelector('#s-lang').value,
      theme: root.querySelector('#s-theme').value,
      dailyGoal: goal,
      sound: root.querySelector('#s-sound').checked,
    };
    try {
      const res = await put('/api/profile/settings', payload);
      ctx.updateProfile(res.profile);
      toast(isAr() ? 'تم حفظ الإعدادات.' : 'Settings saved.', 'ok', 1800);
      submit.disabled = false;

      if (payload.lang !== prof.lang) {
        setLang(payload.lang);
        document.documentElement.lang = payload.lang;
        document.documentElement.dir = payload.lang === 'ar' ? 'rtl' : 'ltr';
        sfx.level();
        // Re-render the whole shell so every label follows the new language.
        location.reload();
        return;
      }
      if (payload.theme !== prof.theme) {
        document.documentElement.dataset.theme = payload.theme;
      }
      // refresh the view so the hero reflects the new name/bio
      profileView(root, ctx);
    } catch (err) {
      toast(err.message, 'err');
      submit.disabled = false;
    }
  });

  /* ---- logout */
  root.querySelector('#logout-btn').addEventListener('click', async () => {
    try {
      await post('/api/auth/logout');
    } catch { /* session may already be gone */ }
    location.href = '/';
  });

  return { destroy: () => {} };
}

function activityLabel(type) {
  const map = {
    session_completed: { ar: 'أكملت جولة', en: 'Completed a round' },
    stage_completed: { ar: 'أكملت مرحلة', en: 'Completed a stage' },
    boss_defeated: { ar: 'هزمت زعيمًا', en: 'Defeated a boss' },
    speed_completed: { ar: 'أكملت تحدي السرعة', en: 'Completed a speed challenge' },
    achievement: { ar: 'فتحت إنجازًا', en: 'Unlocked an achievement' },
    reward_bought: { ar: 'اشتريت عنصرًا من المتجر', en: 'Bought a shop item' },
    review_completed: { ar: 'أكملت مراجعة ذكية', en: 'Completed a smart review' },
    login: { ar: 'سجلت الدخول', en: 'Logged in' },
    account_created: { ar: 'أنشأت حسابًا', en: 'Created an account' },
    register: { ar: 'أنشأت حسابًا', en: 'Created an account' },
  };
  const v = map[type] || { ar: type, en: type };
  return isAr() ? v.ar : v.en;
}
