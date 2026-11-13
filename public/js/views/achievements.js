// CODE QUEST — achievements gallery.
import { api } from '../api.js';
import { emptyState, esc, formatNum, isAr, pick, progressBar, relTime, skeleton, toast } from '../ui.js';

const TIER_META = {
  bronze: { ar: 'برونزي', en: 'Bronze', color: '#CD7F32', icon: '🥉' },
  silver: { ar: 'فضي', en: 'Silver', color: '#C0C0C0', icon: '🥈' },
  gold: { ar: 'ذهبي', en: 'Gold', color: '#F5B942', icon: '🥇' },
  platinum: { ar: 'بلاتيني', en: 'Platinum', color: '#00D9FF', icon: '💎' },
};

export async function achievementsView(root, ctx) {
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>🎖️ ${isAr() ? 'الإنجازات' : 'Achievements'}</h1>
        <p>${isAr()
          ? 'كل إنجاز يمنحك خبرة وعملات. أكمل الشروط لفتح الشارة.'
          : 'Every badge grants XP and coins. Complete the conditions to unlock it.'}</p>
      </div>
    </div>
    <div id="ach-summary"></div>
    <div id="ach-body">${skeleton(6, 150)}</div>`;

  const body = root.querySelector('#ach-body');
  const summary = root.querySelector('#ach-summary');

  let data;
  try {
    data = await api('/api/achievements');
  } catch (err) {
    body.innerHTML = emptyState('📡', isAr() ? 'تعذر تحميل الإنجازات' : 'Could not load achievements', err.message);
    return;
  }
  const rows = data.achievements || [];
  const unlocked = rows.filter(a => a.unlocked);
  const pct = rows.length ? Math.round((unlocked.length / rows.length) * 100) : 0;
  const earnedXp = unlocked.reduce((s, a) => s + (a.xp_reward || 0), 0);
  const earnedCoins = unlocked.reduce((s, a) => s + (a.coin_reward || 0), 0);

  summary.innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <div class="row" style="justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:1.7rem;font-weight:900">${unlocked.length} <span class="muted" style="font-size:.9rem">/ ${rows.length}</span></div>
          <div class="small muted">${isAr() ? 'شارة مفتوحة' : 'badges unlocked'}</div>
        </div>
        <div class="center">
          <div style="font-weight:900;color:var(--cyan)">+${formatNum(earnedXp)} XP</div>
          <div style="font-weight:900;color:var(--gold)">+${formatNum(earnedCoins)} 🪙</div>
        </div>
      </div>
      ${progressBar(pct, { gold: true })}
    </div>`;

  const sorted = rows.slice().sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || a.sort - b.sort);

  body.innerHTML = `<div class="ach-grid">
    ${sorted.map(a => {
      const tier = TIER_META[a.tier] || TIER_META.bronze;
      return `
      <div class="ach-card ${a.unlocked ? 'unlocked' : 'locked'}" style="--tier:${tier.color}">
        <div class="ach-badge">${a.icon}</div>
        <div class="ach-body">
          <div class="row" style="justify-content:space-between;gap:8px">
            <b>${esc(pick(a.title_ar, a.title_en))}</b>
            <span class="pill tiny" style="border-color:${tier.color}66;color:${tier.color};white-space:nowrap">${tier.icon} ${isAr() ? tier.ar : tier.en}</span>
          </div>
          <p class="small muted" style="margin:4px 0 8px">${esc(pick(a.description_ar, a.description_en || ''))}</p>
          <div class="row" style="justify-content:space-between">
            <span class="small" style="color:var(--cyan);font-weight:700">+${a.xp_reward} XP · +${a.coin_reward} 🪙</span>
            ${a.unlocked
              ? `<span class="small" style="color:var(--green);font-weight:700">✓ ${relTime(a.unlocked_at)}</span>`
              : `<span class="small muted">🔒 ${isAr() ? 'مقفل' : 'Locked'}</span>`}
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;

  return { destroy: () => {} };
}
