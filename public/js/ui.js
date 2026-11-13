// CODE QUEST — UI toolkit: toasts, modals, confetti, sounds, speech, formatting.

/* ------------------------------------------------------------------ strings */
export const L = {
  ar: {
    home: 'الرئيسية', worlds: 'العوالم', review: 'المراجعة الذكية', bosses: 'الزعماء',
    dictionary: 'القاموس', leaderboard: 'لوحة الصدارة', achievements: 'الإنجازات',
    shop: 'المتجر', profile: 'ملفي', multiplayer: 'اللعب الجماعي', subscription: 'الاشتراك',
    logout: 'تسجيل الخروج', login: 'دخول', register: 'حساب جديد',
    continue: 'متابعة', start: 'ابدأ', play: 'العب', back: 'رجوع', next: 'التالي', prev: 'السابق',
    retry: 'إعادة', close: 'إغلاق', save: 'حفظ', cancel: 'إلغاء', search: 'بحث', all: 'الكل',
    level: 'المستوى', xp: 'خبرة', coins: 'عملات', streak: 'أيام متتالية', stars: 'نجوم',
    completed: 'مكتمل', locked: 'مقفل', unlocked: 'متاح', progress: 'التقدم',
    accuracy: 'الدقة', mastered: 'متقن', seen: 'مصطلح', answered: 'سؤال',
    question: 'سؤال', of: 'من', correct: 'إجابة صحيحة', wrong: 'إجابة خاطئة',
    yourAnswer: 'الإجابة الصحيحة', explanation: 'التفسير', continueNext: 'السؤال التالي',
    finish: 'إنهاء', timeLeft: 'الوقت', hearts: 'المحاولات', combo: 'سلسلة',
    sessionDone: 'انتهت الجولة', score: 'النتيجة', earnedXp: 'خبرة مكتسبة', earnedCoins: 'عملات مكتسبة',
    newAchievements: 'إنجازات جديدة', playAgain: 'العب مرة أخرى', backToStage: 'عودة للمرحلة',
    noData: 'لا توجد بيانات لعرضها.', loading: 'جارٍ التحميل…', error: 'حدث خطأ',
    filters: 'تصفية', category: 'التخصص', difficulty: 'الصعوبة', status: 'الحالة',
    favorites: 'المفضلة', speak: 'استمع', details: 'التفاصيل', learnNow: 'تدرّب على هذا المصطلح',
    example: 'مثال', related: 'مصطلحات ذات صلة', definition: 'التعريف',
    daily: 'تحدي اليوم', wordOfDay: 'كلمة اليوم', reviewDue: 'مصطلحات مستحقة',
    startReview: 'ابدأ المراجعة', startDaily: 'ابدأ التحدي', doneToday: 'أكملت تحدي اليوم',
    mode: 'نمط اللعب', modes: 'أنماط اللعب', stage: 'المرحلة', world: 'العالم',
    defeated: 'مهزوم', undefeated: 'لم يُهزم بعد', fight: 'قاتل', hp: 'الصحة',
    needLevel: 'يتطلب المستوى', buy: 'شراء', equip: 'تجهيز', equipped: 'مجهّز', owned: 'مملوك',
    notEnough: 'عملات غير كافية', complete: 'إكمال', questions: 'أسئلة', terms: 'مصطلحات',
    saveSettings: 'حفظ الإعدادات', settings: 'الإعدادات', displayName: 'الاسم المعروض',
    bio: 'نبذة', language: 'اللغة', theme: 'المظهر', sound: 'الأصوات', dailyGoal: 'هدف يومي',
    dark: 'داكن', light: 'فاتح', yes: 'نعم', no: 'لا', confirm: 'تأكيد',
    period: 'الفترة', today: 'اليوم', week: 'أسبوع', month: 'شهر', forever: 'كل الوقت',
    you: 'أنت', rank: 'الرتبة', noQuestions: 'لا توجد أسئلة كافية لهذا الاختيار.',
    startNow: 'ابدأ الآن', keepGoing: 'واصل التعلّم', totalXp: 'إجمالي الخبرة',
    nextRank: 'الرتبة القادمة', toNextLevel: 'للمستوى التالي', hint: 'تلميح',
    shuffle: 'خلط', clear: 'مسح', submit: 'تأكيد', spell: 'اكتب المصطلح',
    docTitle: 'CODE QUEST — تعلّم لغة المبرمجين',
    brandTagline: 'تعلّم لغة المبرمجين',
    themeToggle: 'تبديل المظهر', langToggle: 'تبديل اللغة', soundToggle: 'الصوت',
    adminPanel: 'لوحة الإدارة', menu: 'القائمة', xpTitle: 'نقاط الخبرة',
    coinsTitle: 'العملات', streakTitle: 'سلسلة الأيام',
    aboutTitle: 'عن المصمم — فريق حلول كود',
    trialLeft: 'متبقي {n} إجابات تجريبية', trialEnded: 'انتهت التجربة المجانية',
    docDesc: 'لعبة تعليمية تفاعلية لإتقان المصطلحات البرمجية الإنجليزية.',
  },
  en: {
    home: 'Home', worlds: 'Worlds', review: 'Smart Review', bosses: 'Bosses',
    dictionary: 'Dictionary', leaderboard: 'Leaderboard', achievements: 'Achievements',
    shop: 'Shop', profile: 'Profile', multiplayer: 'Multiplayer', subscription: 'Subscription',
    logout: 'Log out', login: 'Log in', register: 'Sign up',
    continue: 'Continue', start: 'Start', play: 'Play', back: 'Back', next: 'Next', prev: 'Previous',
    retry: 'Retry', close: 'Close', save: 'Save', cancel: 'Cancel', search: 'Search', all: 'All',
    level: 'Level', xp: 'XP', coins: 'Coins', streak: 'Day streak', stars: 'Stars',
    completed: 'Completed', locked: 'Locked', unlocked: 'Unlocked', progress: 'Progress',
    accuracy: 'Accuracy', mastered: 'Mastered', seen: 'terms', answered: 'answers',
    question: 'Question', of: 'of', correct: 'Correct', wrong: 'Incorrect',
    yourAnswer: 'Correct answer', explanation: 'Explanation', continueNext: 'Next question',
    finish: 'Finish', timeLeft: 'Time', hearts: 'Hearts', combo: 'Combo',
    sessionDone: 'Round complete', score: 'Score', earnedXp: 'XP earned', earnedCoins: 'Coins earned',
    newAchievements: 'New achievements', playAgain: 'Play again', backToStage: 'Back to stage',
    noData: 'Nothing to show yet.', loading: 'Loading…', error: 'Something went wrong',
    filters: 'Filters', category: 'Category', difficulty: 'Difficulty', status: 'Status',
    favorites: 'Favorites', speak: 'Listen', details: 'Details', learnNow: 'Practise this term',
    example: 'Example', related: 'Related terms', definition: 'Definition',
    daily: 'Daily challenge', wordOfDay: 'Word of the day', reviewDue: 'Terms due',
    startReview: 'Start review', startDaily: 'Start challenge', doneToday: 'Daily challenge done',
    mode: 'Game mode', modes: 'Game modes', stage: 'Stage', world: 'World',
    defeated: 'Defeated', undefeated: 'Not defeated yet', fight: 'Fight', hp: 'HP',
    needLevel: 'Requires level', buy: 'Buy', equip: 'Equip', equipped: 'Equipped', owned: 'Owned',
    notEnough: 'Not enough coins', complete: 'Complete', questions: 'questions', terms: 'terms',
    saveSettings: 'Save settings', settings: 'Settings', displayName: 'Display name',
    bio: 'Bio', language: 'Language', theme: 'Theme', sound: 'Sounds', dailyGoal: 'Daily goal',
    dark: 'Dark', light: 'Light', yes: 'Yes', no: 'No', confirm: 'Confirm',
    period: 'Period', today: 'Today', week: 'Week', month: 'Month', forever: 'All time',
    you: 'You', rank: 'Rank', noQuestions: 'Not enough questions for this pick.',
    startNow: 'Start now', keepGoing: 'Keep learning', totalXp: 'Total XP',
    nextRank: 'Next rank', toNextLevel: 'to next level', hint: 'Hint',
    shuffle: 'Shuffle', clear: 'Clear', submit: 'Submit', spell: 'Type the term',
    docTitle: 'CODE QUEST — Learn the language of programmers',
    brandTagline: 'LEARN THE LANGUAGE OF PROGRAMMERS',
    themeToggle: 'Toggle theme', langToggle: 'Switch language', soundToggle: 'Sound',
    adminPanel: 'Admin console', menu: 'Menu', xpTitle: 'Experience points',
    coinsTitle: 'Coins', streakTitle: 'Day streak',
    aboutTitle: 'About the designer — Halul Code',
    trialLeft: '{n} trial answers left', trialEnded: 'Free trial ended',
    docDesc: 'An interactive learning game for mastering English programming terms.',
  },
};

let lang = 'ar';
export function setLang(value) { lang = value === 'en' ? 'en' : 'ar'; }
export function getLang() { return lang; }
export function isAr() { return lang === 'ar'; }
export function t(key, vars) {
  let s = L[lang]?.[key] ?? L.ar[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export function pick(ar, en) { return lang === 'en' && en ? en : ar; }

/* ------------------------------------------------------------------ DOM */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function h(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html).trim();
  return tpl.content.firstElementChild;
}

export function debounce(fn, ms = 260) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function skeleton(count = 4, height = 92) {
  return `<div class="skeleton-grid">${Array.from({ length: count }, () =>
    `<div class="skeleton" style="height:${height}px"></div>`).join('')}</div>`;
}

/* ------------------------------------------------------------------ format */
export const nf = new Intl.NumberFormat('en-US');
export const formatNum = n => nf.format(Math.round(Number(n) || 0));

export function formatTime(ms) {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return lang === 'ar' ? 'الآن' : 'just now';
  if (min < 60) return lang === 'ar' ? `قبل ${min} دقيقة` : `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return lang === 'ar' ? `قبل ${hours} ساعة` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return lang === 'ar' ? `قبل ${days} يوم` : `${days}d ago`;
  return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB');
}

export function starsHtml(stars, max = 3) {
  const n = Number(stars) || 0;
  let html = '<span class="stars">';
  for (let i = 1; i <= max; i++) html += i <= n ? '★' : '<span class="off">★</span>';
  return html + '</span>';
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export const AVATAR_EMOJI = {
  nova: '🚀', byte: '🤖', pixel: '🎨', cyber: '🛡️', quantum: '⚛️', legend: '👑',
};
export function avatarEmoji(asset) { return AVATAR_EMOJI[asset] || '🚀'; }

export function avatarHtml(profile = {}, size = 42) {
  const asset = profile.avatar || 'nova';
  const frame = profile.frame || 'frame-none';
  const bg = String(profile.background || 'default').replace(/^bg-/, '');
  return `<span class="cq-avatar av-${esc(asset)} ${esc(frame)} bg-${esc(bg)}" style="--av-size:${size}px">
    <span class="av-glyph">${avatarEmoji(asset)}</span>
  </span>`;
}

export function applyBackground(name) {
  const cls = `bg-${String(name || 'default').replace(/^bg-/, '')}`;
  document.body.classList.forEach(c => { if (c.startsWith('bg-')) document.body.classList.remove(c); });
  document.body.classList.add(cls);
}

/* ------------------------------------------------------------------ toast */
export function toast(message, type = 'info', ms = 3200) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const icons = { ok: '✅', err: '⚠️', gold: '🏆', info: '💡' };
  const node = h(`<div class="toast ${esc(type)}">${icons[type] || ''}<span>${esc(message)}</span></div>`);
  root.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s, transform .25s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 260);
  }, ms);
}

/* ------------------------------------------------------------------ modal */
export function openModal({ title, body, actions = [], wide = false, onMount }) {
  const root = document.getElementById('modal-root');
  if (!root) return () => {};
  root.classList.remove('hidden');
  root.innerHTML = '';
  const modal = h(`<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head">
      <h3>${esc(title || '')}</h3>
      <button class="icon-btn" data-close aria-label="close">✕</button>
    </div>
    <div class="modal-body">${body || ''}</div>
    ${actions.length ? '<div class="modal-actions"></div>' : ''}
  </div>`);

  const close = () => {
    root.classList.add('hidden');
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  modal.querySelector('[data-close]').addEventListener('click', close);
  root.onclick = e => { if (e.target === root) close(); };

  if (actions.length) {
    const bar = modal.querySelector('.modal-actions');
    actions.forEach(a => {
      const btn = h(`<button class="btn ${a.class || ''}">${esc(a.label)}</button>`);
      btn.addEventListener('click', async () => {
        if (a.onClick) {
          const keep = await a.onClick({ close });
          if (keep === false) return;
        }
        if (a.close !== false) close();
      });
      bar.appendChild(btn);
    });
  }
  root.appendChild(modal);
  if (onMount) onMount(modal, close);
  return close;
}

export function confirmBox(title, message, { okText, danger = false } = {}) {
  return new Promise(resolve => {
    let settled = false;
    openModal({
      title,
      body: `<p class="muted" style="margin:0">${esc(message)}</p>`,
      actions: [
        { label: t('cancel'), class: 'btn-ghost', onClick: () => { settled = true; resolve(false); } },
        {
          label: okText || t('confirm'),
          class: danger ? 'btn-danger' : 'btn-primary',
          onClick: () => { settled = true; resolve(true); },
        },
      ],
    });
    const root = document.getElementById('modal-root');
    const observer = new MutationObserver(() => {
      if (root.classList.contains('hidden') && !settled) { settled = true; resolve(false); observer.disconnect(); }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  });
}

/* ------------------------------------------------------------------ confetti */
export function confetti({ count = 140, duration = 2600 } = {}) {
  const canvas = document.getElementById('confetti');
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = ['#00D9FF', '#258BFF', '#A855F7', '#22C55E', '#F5B942', '#F43F5E', '#F8FAFC'];
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.42 + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 13 - 3,
    g: 0.32 + Math.random() * 0.14,
    size: 5 + Math.random() * 7,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.34,
    color: colors[Math.floor(Math.random() * colors.length)],
    life: 1,
  }));
  const start = performance.now();
  let raf = 0;
  const draw = now => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.995;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - elapsed / duration);
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
      ctx.restore();
    }
    if (elapsed < duration) raf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  };
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}

/* ------------------------------------------------------------------ sound */
let audioCtx = null;
let soundEnabled = true;
export function setSoundEnabled(v) { soundEnabled = !!v; }
export function isSoundEnabled() { return soundEnabled; }

function ctxAudio() {
  if (!soundEnabled) return null;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}

function tone(freq, start, dur, { type = 'sine', gain = 0.05 } = {}) {
  const ac = ctxAudio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.02);
}

export const sfx = {
  click: () => tone(520, 0, 0.06, { type: 'triangle', gain: 0.03 }),
  flip: () => tone(360, 0, 0.09, { type: 'sine', gain: 0.03 }),
  correct: () => { tone(660, 0, 0.12, { gain: 0.05 }); tone(880, 0.09, 0.18, { gain: 0.045 }); },
  wrong: () => { tone(220, 0, 0.16, { type: 'sawtooth', gain: 0.035 }); tone(164, 0.1, 0.2, { type: 'sawtooth', gain: 0.03 }); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.1, 0.26, { gain: 0.045 })),
  level: () => [440, 554, 659, 880, 1108].forEach((f, i) => tone(f, i * 0.08, 0.3, { type: 'triangle', gain: 0.04 })),
  coin: () => { tone(1046, 0, 0.07, { type: 'square', gain: 0.025 }); tone(1318, 0.06, 0.12, { type: 'square', gain: 0.02 }); },
};

/* ------------------------------------------------------------------ speech */
let voiceCache = [];
function loadVoices() { try { voiceCache = speechSynthesis.getVoices(); } catch { voiceCache = []; } }
if (typeof speechSynthesis !== 'undefined') {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

export function speak(text, langCode = 'en-US') {
  if (!text || typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(String(text));
    utter.lang = langCode;
    utter.rate = 0.94;
    const preferred = voiceCache.find(v => v.lang?.startsWith(langCode.split('-')[0]) && /google|natural|siri/i.test(v.name))
      || voiceCache.find(v => v.lang?.startsWith(langCode.split('-')[0]));
    if (preferred) utter.voice = preferred;
    speechSynthesis.speak(utter);
  } catch { /* speech unsupported */ }
}

/* ------------------------------------------------------------------ misc */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(lang === 'ar' ? 'تم النسخ' : 'Copied', 'ok', 1600);
  } catch {
    toast(lang === 'ar' ? 'تعذر النسخ' : 'Copy failed', 'err');
  }
}

export function progressBar(value, { gold = false, green = false } = {}) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="progress ${gold ? 'gold' : green ? 'green' : ''}"><i style="width:${pct}%"></i></div>`;
}

export function emptyState(emoji, title, sub = '', action = '') {
  return `<div class="empty-state">
    <div class="e-emoji">${emoji}</div>
    <h3>${esc(title)}</h3>
    ${sub ? `<p>${esc(sub)}</p>` : ''}
    ${action}
  </div>`;
}

export function pagination(page, total, pageSize, onPage) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const wrap = h(`<div class="pager">
    <button class="btn btn-sm" data-p="-1" ${page <= 1 ? 'disabled' : ''}>‹</button>
    <span>${page} / ${pages}</span>
    <button class="btn btn-sm" data-p="1" ${page >= pages ? 'disabled' : ''}>›</button>
  </div>`);
  wrap.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    onPage(page + Number(b.dataset.p));
  }));
  return wrap;
}
