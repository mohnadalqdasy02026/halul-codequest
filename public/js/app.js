// CODE QUEST — application shell, router and shared state.
import { api, setCsrf } from './api.js';
import {
  applyBackground, avatarHtml, esc, h, isAr, pick, setLang, setSoundEnabled, sfx, t, toast,
} from './ui.js';
import { renderAuth } from './views/auth.js';

/* ------------------------------------------------------------------ state */
export const state = {
  user: null,
  profile: null,
  worlds: [],
  modes: [],
  csrf: null,
  bootstrap: null,
  loading: false,
};

const appEl = document.getElementById('app');
const authEl = document.getElementById('auth-screen');
const viewEl = document.getElementById('view');

/* ------------------------------------------------------------------ helpers */
export const go = hash => {
  if (location.hash === hash) render();
  else location.hash = hash;
};

export function updateProfile(profile) {
  if (!profile) return;
  state.profile = profile;
  if (state.user) state.user = { ...state.user, ...profile };
  paintChrome();
}

export function setTitle(text) {
  document.title = text ? `${text} — CODE QUEST` : 'CODE QUEST — تعلّم لغة المبرمجين';
}

export const ctx = {
  state,
  go,
  updateProfile,
  setTitle,
  get isAr() { return isAr(); },
  pick,
  t,
};

/* ------------------------------------------------------------------ chrome */
function paintParticles() {
  const wrap = document.getElementById('particles');
  if (!wrap || wrap.childElementCount) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 26; i++) {
    const dot = document.createElement('span');
    dot.className = 'particle';
    dot.style.left = `${Math.random() * 100}%`;
    dot.style.bottom = `${-10 - Math.random() * 40}%`;
    dot.style.animationDuration = `${12 + Math.random() * 18}s`;
    dot.style.animationDelay = `${-Math.random() * 20}s`;
    dot.style.opacity = String(0.18 + Math.random() * 0.45);
    if (Math.random() > 0.55) dot.style.background = 'var(--purple)';
    frag.appendChild(dot);
  }
  wrap.appendChild(frag);
}

let lastLevel = null;

function paintStaticText() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const value = t(el.dataset.i18nTitle);
    el.title = value;
    el.setAttribute('aria-label', value);
  });
  document.documentElement.lang = isAr() ? 'ar' : 'en';
  document.documentElement.dir = isAr() ? 'rtl' : 'ltr';
  document.title = t('docTitle');
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', t('docDesc'));
}

export function paintChrome() {
  const p = state.profile;
  if (!p) return;
  paintStaticText();
  document.getElementById('top-xp').textContent = p.xp.toLocaleString('en-US');
  document.getElementById('top-coins').textContent = p.coins.toLocaleString('en-US');
  document.getElementById('top-streak').textContent = p.stats.currentStreak;

  const avatarSlot = document.getElementById('top-avatar');
  if (avatarSlot) avatarSlot.innerHTML = avatarHtml(p.profile, 42);

  const mini = document.getElementById('player-mini');
  if (mini) {
    mini.innerHTML = `
      ${avatarHtml(p.profile, 40)}
      <div>
        <div class="p-name">${esc(p.profile.display_name)}</div>
        <div class="p-rank">${p.rank.icon} ${esc(pick(p.rank.name_ar, p.rank.name_en))} · ${t('level')} ${p.level}</div>
      </div>`;
  }

  const badge = document.getElementById('review-badge');
  const due = state.bootstrap?.reviewDue || 0;
  if (badge) {
    badge.hidden = due <= 0;
    badge.textContent = due > 99 ? '99+' : String(due);
  }

  const adminLink = document.getElementById('admin-link');
  if (adminLink) adminLink.classList.toggle('hidden', p.role !== 'admin');

  const trialChip = document.getElementById('trial-chip');
  if (trialChip) {
    const sub = state.bootstrap?.subscription;
    if (!sub || sub.active) {
      trialChip.classList.add('hidden');
    } else {
      trialChip.classList.remove('hidden');
      trialChip.textContent = sub.remaining > 0
        ? `🎟️ ${t('trialLeft', { n: sub.remaining })}`
        : `🔒 ${t('trialEnded')}`;
      trialChip.title = isAr()
        ? 'التجربة المجانية — فعّل الاشتراك لفتح كل اللعب'
        : 'Free trial — subscribe to unlock all play';
    }
  }

  applyBackground(p.profile.background);

  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.textContent = document.documentElement.dataset.theme === 'light' ? '☀️' : '🌙';
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) langBtn.textContent = isAr() ? 'EN' : 'AR';
  const soundBtn = document.getElementById('sound-toggle');
  if (soundBtn) soundBtn.textContent = p.profile.sound ? '🔊' : '🔇';

  if (lastLevel !== null && p.level > lastLevel) {
    sfx.level();
    toast(isAr() ? `🎉 وصلت إلى المستوى ${p.level}!` : `🎉 Level ${p.level} reached!`, 'gold', 4200);
  }
  lastLevel = p.level;
}

function setNavActive(name) {
  document.querySelectorAll('[data-nav]').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === name);
  });
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  paintParticles();
  try {
    const me = await api('/api/auth/me');
    if (!me.user) { showAuth(); return; }
    setCsrf(me.csrf);
    state.user = me.user;
    state.profile = me.user;
    setLang(me.user.profile.lang);
    document.documentElement.lang = isAr() ? 'ar' : 'en';
    document.documentElement.dir = isAr() ? 'rtl' : 'ltr';
    setSoundEnabled(!!me.user.profile.sound);
    applyTheme(me.user.profile.theme);
    await loadBootstrap();
    showApp();
  } catch (err) {
    console.error(err);
    showAuth();
    toast(err.message, 'err');
  }
}

async function loadBootstrap() {
  const data = await api('/api/bootstrap');
  state.bootstrap = data;
  state.profile = data.profile;
  state.worlds = data.worlds;
  state.modes = data.modes;
}

function showAuth() {
  appEl.classList.add('hidden');
  authEl.classList.remove('hidden');
  renderAuth(authEl, {
    onSuccess: async user => {
      state.user = user;
      state.profile = user;
      setLang(user.profile.lang);
      document.documentElement.lang = isAr() ? 'ar' : 'en';
      document.documentElement.dir = isAr() ? 'rtl' : 'ltr';
      applyTheme(user.profile.theme);
      setSoundEnabled(!!user.profile.sound);
      await loadBootstrap();
      showApp();
      if (!location.hash || location.hash === '#/' || location.hash === '#') go('#/home');
      else render();
    },
  });
}

function showApp() {
  authEl.classList.add('hidden');
  appEl.classList.remove('hidden');
  paintChrome();
  render();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

/* ------------------------------------------------------------------ router */
const routes = [
  { re: /^\/?$/, nav: 'home', load: () => import('./views/home.js').then(m => m.homeView) },
  { re: /^\/home$/, nav: 'home', load: () => import('./views/home.js').then(m => m.homeView) },
  { re: /^\/worlds$/, nav: 'worlds', load: () => import('./views/worlds.js').then(m => m.worldsView) },
  { re: /^\/world\/([^/]+)$/, nav: 'worlds', load: () => import('./views/worlds.js').then(m => m.worldView) },
  { re: /^\/stage\/(\d+)$/, nav: 'worlds', load: () => import('./views/stage.js').then(m => m.stageView) },
  { re: /^\/play\/([^/]+)$/, nav: 'home', load: () => import('./views/play.js').then(m => m.playView) },
  { re: /^\/review$/, nav: 'review', load: () => import('./views/review.js').then(m => m.reviewView) },
  { re: /^\/bosses$/, nav: 'bosses', load: () => import('./views/bosses.js').then(m => m.bossesView) },
  { re: /^\/multiplayer$/, nav: 'multiplayer', load: () => import('./views/multiplayer.js').then(m => m.multiplayerView) },
  { re: /^\/subscription$/, nav: 'subscription', load: () => import('./views/subscription.js').then(m => m.subscriptionView) },
  { re: /^\/about$/, nav: 'profile', load: () => import('./views/about.js').then(m => m.aboutView) },
  { re: /^\/dictionary$/, nav: 'dictionary', load: () => import('./views/dictionary.js').then(m => m.dictionaryView) },
  { re: /^\/leaderboard$/, nav: 'leaderboard', load: () => import('./views/leaderboard.js').then(m => m.leaderboardView) },
  { re: /^\/achievements$/, nav: 'achievements', load: () => import('./views/achievements.js').then(m => m.achievementsView) },
  { re: /^\/shop$/, nav: 'shop', load: () => import('./views/shop.js').then(m => m.shopView) },
  { re: /^\/profile$/, nav: 'profile', load: () => import('./views/profile.js').then(m => m.profileView) },
];

let cleanup = null;
let renderToken = 0;

export async function render() {
  const raw = location.hash.replace(/^#/, '') || '/home';
  const path = raw.split('?')[0];
  const query = Object.fromEntries(new URLSearchParams(raw.split('?')[1] || ''));
  const token = ++renderToken;

  if (cleanup) { try { cleanup(); } catch { /* noop */ } cleanup = null; }

  for (const route of routes) {
    const m = route.re.exec(path);
    if (!m) continue;
    setNavActive(route.nav);
    closeSidebar();
    viewEl.innerHTML = `<div class="view-loading">${isAr() ? 'جارٍ التحميل…' : 'Loading…'}</div>`;
    viewEl.scrollTop = 0;
    window.scrollTo({ top: 0 });
    try {
      const view = await route.load();
      if (token !== renderToken) return;
      const result = await view(viewEl, { ...ctx, params: m.slice(1), query });
      if (token !== renderToken) return;
      cleanup = result?.destroy || null;
    } catch (err) {
      if (token !== renderToken) return;
      console.error(err);
      viewEl.innerHTML = `<div class="card center" style="padding:40px">
        <div style="font-size:2.4rem">🛰️</div>
        <h2>${esc(isAr() ? 'تعذر عرض الصفحة' : 'Could not load this page')}</h2>
        <p class="muted">${esc(err.message)}</p>
        <div class="row" style="justify-content:center;margin-top:14px">
          <button class="btn btn-primary" onclick="location.reload()">${esc(isAr() ? 'إعادة تحميل' : 'Reload')}</button>
          <a class="btn" href="#/home">${esc(t('home'))}</a>
        </div>
      </div>`;
    }
    return;
  }
  go('#/home');
}

/* ------------------------------------------------------------------ events */
window.addEventListener('hashchange', render);

window.addEventListener('cq:unauthorized', () => {
  state.user = null;
  state.profile = null;
  state.bootstrap = null;
  showAuth();
});

window.addEventListener('cq:subscription-required', () => {
  if (!location.hash.startsWith('#/subscription')) go('#/subscription');
});

document.addEventListener('DOMContentLoaded', () => {
  // sidebar + mobile menu
  document.getElementById('menu-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });

  // theme
  document.getElementById('theme-toggle')?.addEventListener('click', async () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    paintChrome();
    sfx.click();
    try {
      const res = await api('/api/profile/settings', { method: 'PUT', body: { theme: next } });
      updateProfile(res.profile);
    } catch (err) { toast(err.message, 'err'); }
  });

  // language
  document.getElementById('lang-toggle')?.addEventListener('click', async () => {
    const next = isAr() ? 'en' : 'ar';
    try {
      const res = await api('/api/profile/settings', { method: 'PUT', body: { lang: next } });
      setLang(next);
      document.documentElement.lang = next;
      document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
      updateProfile(res.profile);
      await loadBootstrap().catch(() => {});
      paintChrome();
      render();
      toast(next === 'ar' ? 'تم التبديل إلى العربية' : 'Switched to English', 'ok', 1800);
    } catch (err) { toast(err.message, 'err'); }
  });

  // sound
  document.getElementById('sound-toggle')?.addEventListener('click', async () => {
    const next = state.profile?.profile?.sound ? 0 : 1;
    setSoundEnabled(!!next);
    if (next) sfx.click();
    try {
      const res = await api('/api/profile/settings', { method: 'PUT', body: { sound: !!next } });
      updateProfile(res.profile);
    } catch (err) { toast(err.message, 'err'); }
  });

  boot();
});

// keep router in sync when navigating from the sidebar or bottom nav
document.addEventListener('click', e => {
  const link = e.target.closest('a[href^="#/"]');
  if (link) sfx.click();
});
