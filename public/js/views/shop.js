// CODE QUEST — cosmetic shop (avatars, frames, backgrounds). Coins never buy answers.
import { api, post } from '../api.js';
import {
  avatarHtml, emptyState, esc, formatNum, isAr, pick, skeleton, toast, sfx, confetti,
} from '../ui.js';

const TYPE_META = {
  all: { ar: 'الكل', en: 'All', icon: '✨' },
  avatar: { ar: 'الشخصيات', en: 'Avatars', icon: '🧑‍🚀' },
  frame: { ar: 'الإطارات', en: 'Frames', icon: '🖼️' },
  background: { ar: 'الخلفيات', en: 'Backgrounds', icon: '🌌' },
};

const RARITY = {
  common: { ar: 'عادي', en: 'Common', color: 'var(--muted)' },
  rare: { ar: 'نادر', en: 'Rare', color: 'var(--blue)' },
  epic: { ar: 'ملحمي', en: 'Epic', color: 'var(--purple)' },
  legendary: { ar: 'أسطوري', en: 'Legendary', color: 'var(--gold)' },
};

export async function shopView(root, ctx) {
  let type = TYPE_META[ctx.query.type] ? ctx.query.type : 'all';

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>🛍️ ${isAr() ? 'المتجر' : 'Shop'}</h1>
        <p>${isAr()
          ? 'عناصر تجميلية فقط — لا يمكن شراء إجابات أو تخطي أسئلة. اكسب العملات باللعب والمراجعة.'
          : 'Cosmetics only — you cannot buy answers or skip questions. Earn coins by playing and reviewing.'}</p>
      </div>
      <div class="spacer"></div>
      <div class="stat-chip coins"><span>🪙</span><b id="shop-coins">…</b></div>
    </div>
    <div class="segmented" id="shop-tabs" style="margin-bottom:18px">
      ${Object.entries(TYPE_META).map(([key, m]) => `
        <button data-type="${key}" class="${key === type ? 'active' : ''}">${m.icon} ${isAr() ? m.ar : m.en}</button>`).join('')}
    </div>
    <div id="shop-preview"></div>
    <div id="shop-grid">${skeleton(6, 190)}</div>`;

  const grid = root.querySelector('#shop-grid');
  const preview = root.querySelector('#shop-preview');
  const coinsEl = root.querySelector('#shop-coins');
  let coins = 0;

  const paintPreview = profileLike => {
    const p = ctx.state.profile;
    preview.innerHTML = `
      <div class="shop-preview card">
        <div class="sp-avatar">${avatarHtml(profileLike || p.profile, 84)}</div>
        <div>
          <b>${esc(p.profile.display_name)}</b>
          <div class="small muted">${isAr() ? 'معاينة مباشرة لعناصرك المجهّزة' : 'Live preview of your equipped items'}</div>
        </div>
        <div class="spacer" style="flex:1"></div>
        <div class="row">
          <span class="pill blue">${p.rank.icon} ${esc(pick(p.rank.name_ar, p.rank.name_en))}</span>
          <span class="pill">${isAr() ? 'المستوى' : 'Level'} ${p.level}</span>
        </div>
      </div>`;
  };

  const cardFor = r => {
    const rarity = RARITY[r.rarity] || RARITY.common;
    const shownFrame = r.type === 'frame' ? r.code : (ctx.state.profile.profile.frame || 'frame-none');
    const shownAvatar = r.type === 'avatar' ? r.asset : (ctx.state.profile.profile.avatar || 'nova');
    const shownBg = r.type === 'background' ? r.code : (ctx.state.profile.profile.background || 'bg-default');

    const visual = r.type === 'background'
      ? `<div class="reward-bg bg-${esc(String(r.asset).replace(/^bg-/, ''))}"></div>`
      : `<div class="reward-av">${avatarHtml({ avatar: shownAvatar, frame: shownFrame, background: shownBg }, 60)}</div>`;

    let action;
    if (r.equipped) action = `<button class="btn btn-sm" disabled>✓ ${isAr() ? 'مجهّز' : 'Equipped'}</button>`;
    else if (r.owned || r.cost === 0) action = `<button class="btn btn-sm btn-primary" data-equip="${esc(r.code)}">${isAr() ? 'تجهيز' : 'Equip'}</button>`;
    else action = `<button class="btn btn-sm btn-gold" data-buy="${esc(r.code)}" ${coins < r.cost ? 'disabled' : ''}>🪙 ${formatNum(r.cost)}</button>`;

    return `
      <div class="shop-card ${r.owned ? 'owned' : ''} ${r.equipped ? 'equipped' : ''}" style="--rarity:${rarity.color}">
        <div class="sc-top">
          ${visual}
          <div style="flex:1;min-width:0">
            <div class="row" style="justify-content:space-between;gap:6px">
              <b>${esc(pick(r.name_ar, r.name_en))}</b>
              <span class="pill tiny" style="border-color:${rarity.color};color:${rarity.color}">${isAr() ? rarity.ar : rarity.en}</span>
            </div>
            <p class="small muted" style="margin:4px 0 0">${esc(pick(r.description_ar, ''))}</p>
          </div>
        </div>
        <div class="sc-foot">
          <span class="small ${r.owned ? 'owned-tag' : 'muted'}">
            ${r.owned ? '✓ ' + (isAr() ? 'مملوك' : 'Owned') : r.cost === 0 ? (isAr() ? 'افتراضي' : 'Default') : `${formatNum(r.cost)} 🪙`}
          </span>
          ${action}
        </div>
      </div>`;
  };

  async function load() {
    grid.innerHTML = skeleton(6, 190);
    let data;
    try {
      data = await api('/api/shop');
    } catch (err) {
      grid.innerHTML = emptyState('📡', isAr() ? 'تعذر تحميل المتجر' : 'Could not load the shop', err.message);
      return;
    }
    coins = data.coins;
    coinsEl.textContent = formatNum(coins);
    const rewards = (data.rewards || []).filter(r => type === 'all' || r.type === type);
    if (!rewards.length) {
      grid.innerHTML = emptyState('🛍️', isAr() ? 'لا عناصر هنا' : 'Nothing here', '', '');
      return;
    }
    grid.innerHTML = `<div class="shop-grid">${rewards.map(cardFor).join('')}</div>`;

    grid.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.buy;
        btn.disabled = true;
        try {
          const res = await post('/api/shop/buy', { code });
          sfx.coin();
          toast(isAr() ? 'تم الشراء! يمكنك تجهيزه الآن.' : 'Purchased! You can equip it now.', 'gold');
          if (coins === 0) confetti({ count: 40 });
          await load();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    });

    grid.querySelectorAll('[data-equip]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.equip;
        btn.disabled = true;
        try {
          const res = await post('/api/shop/equip', { code });
          ctx.updateProfile(res.profile);
          paintPreview(res.profile.profile);
          sfx.level();
          toast(isAr() ? 'تم تجهيز العنصر.' : 'Item equipped.', 'ok', 1800);
          await load();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    });
  }

  root.querySelectorAll('#shop-tabs [data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      type = btn.dataset.type;
      root.querySelectorAll('#shop-tabs [data-type]').forEach(b => b.classList.toggle('active', b === btn));
      history.replaceState(null, '', type === 'all' ? '#/shop' : `#/shop?type=${type}`);
      load();
    });
  });

  paintPreview();
  await load();
}
