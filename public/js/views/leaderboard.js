// CODE QUEST — global leaderboard with daily / weekly / monthly / all-time periods.
import { api } from '../api.js';
import {
  avatarHtml, emptyState, esc, formatNum, isAr, pick, skeleton, toast,
} from '../ui.js';

const PERIODS = [
  { key: 'daily', ar: 'اليوم', en: 'Today' },
  { key: 'weekly', ar: 'هذا الأسبوع', en: 'This week' },
  { key: 'monthly', ar: 'هذا الشهر', en: 'This month' },
  { key: 'all', ar: 'كل الوقت', en: 'All time' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export async function leaderboardView(root, ctx) {
  let period = PERIODS.some(p => p.key === ctx.query.period) ? ctx.query.period : 'all';
  const me = ctx.state.profile;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>🏆 ${isAr() ? 'لوحة الصدارة' : 'Leaderboard'}</h1>
        <p>${isAr()
          ? 'تنافس مع لاعبين حقيقيين على نقاط الخبرة. التحديث فوري بعد كل جولة.'
          : 'Compete with real players for XP. Rankings refresh after every round.'}</p>
      </div>
      <div class="spacer"></div>
      <div class="segmented" id="lb-periods">
        ${PERIODS.map(p => `<button data-period="${p.key}" class="${p.key === period ? 'active' : ''}">${isAr() ? p.ar : p.en}</button>`).join('')}
      </div>
    </div>
    <div id="lb-me"></div>
    <div id="lb-body">${skeleton(6, 74)}</div>`;

  const body = root.querySelector('#lb-body');
  const meSlot = root.querySelector('#lb-me');

  async function load() {
    body.innerHTML = skeleton(6, 74);
    try {
      const data = await api(`/api/leaderboard?period=${encodeURIComponent(period)}`);
      const entries = data.entries || [];
      if (!entries.length) {
        body.innerHTML = emptyState('🏅', isAr() ? 'لا يوجد متسابقون بعد' : 'No players yet',
          isAr() ? 'العب جولة واحدة لتظهر في الترتيب.' : 'Play one round to appear on the board.',
          `<a class="btn btn-primary" href="#/worlds">${isAr() ? 'ابدأ اللعب' : 'Start playing'}</a>`);
        meSlot.innerHTML = '';
        return;
      }
      const topScore = Math.max(1, Number(entries[0].periodXp) || 1);
      const myRank = entries.find(e => e.id === me?.id);

      meSlot.innerHTML = `
        <div class="lb-me card">
          <div class="row" style="gap:12px">
            ${avatarHtml(me.profile, 46)}
            <div style="min-width:0">
              <b>${esc(pick(me.profile.display_name, me.profile.display_name))}</b>
              <div class="small muted">${isAr() ? 'مركزك' : 'Your position'}: ${data.me ? `#${data.me.position}` : (isAr() ? 'خارج أفضل 30' : 'outside top 30')}</div>
            </div>
            <div class="spacer" style="flex:1"></div>
            <div class="center">
              <div style="font-size:1.32rem;font-weight:900;color:var(--cyan)">${formatNum(myRank ? myRank.periodXp : (data.me?.xp || 0))}</div>
              <div class="small muted">${isAr() ? 'خبرة' : 'XP'}</div>
            </div>
          </div>
        </div>`;

      body.innerHTML = `<div class="lb-list">
        ${entries.map(e => {
          const isMe = e.id === me?.id;
          const pct = Math.max(4, Math.round((Number(e.periodXp) / topScore) * 100));
          return `
          <div class="lb-row ${isMe ? 'me' : ''} ${e.isNpc ? 'npc' : ''}">
            <div class="lb-pos">${e.position <= 3 ? MEDALS[e.position - 1] : `#${e.position}`}</div>
            ${avatarHtml(e, 44)}
            <div class="lb-name">
              <b>${esc(e.name)}${isMe ? ` <span class="pill blue tiny">${isAr() ? 'أنت' : 'you'}</span>` : ''}
                ${e.isNpc ? `<span class="pill tiny" title="${isAr() ? 'لاعب آلي' : 'bot'}">🤖</span>` : ''}
              </b>
              <small>${e.rank.icon} ${esc(pick(e.rank.name_ar, e.rank.name_en))} · ${isAr() ? 'المستوى' : 'Level'} ${e.level}</small>
              <div class="lb-bar"><i style="width:${pct}%"></i></div>
            </div>
            <div class="lb-stats">
              <b>${formatNum(e.periodXp)}</b>
              <small>XP</small>
            </div>
            <div class="lb-ach" title="${isAr() ? 'الإنجازات' : 'Achievements'}">🎖️ ${e.achievements}</div>
          </div>`;
        }).join('')}
      </div>`;
    } catch (err) {
      body.innerHTML = emptyState('📡', isAr() ? 'تعذر تحميل الترتيب' : 'Could not load the leaderboard', err.message);
    }
  }

  root.querySelectorAll('#lb-periods [data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      period = btn.dataset.period;
      root.querySelectorAll('#lb-periods [data-period]').forEach(b => b.classList.toggle('active', b === btn));
      history.replaceState(null, '', `#/leaderboard?period=${period}`);
      load();
    });
  });

  await load();
}
