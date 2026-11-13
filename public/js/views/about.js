// CODE QUEST — about the designer & Halul Code.
import { esc, isAr, toast } from '../ui.js';

const STACK = [
  'Node.js (zero npm dependencies)', 'Vanilla JS / CSS', 'SQLite (node:sqlite)',
  'RTL/LTR bilingual SPA', 'Excel-driven content', 'Spaced repetition (SM-2)',
  'scrypt + HttpOnly sessions', 'CSRF protection',
];

export async function aboutView(root, ctx) {
  const ar = isAr();
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>ℹ️ ${ar ? 'عن المصمم' : 'About the designer'}</h1>
        <p>${ar
          ? 'من يقف خلف CODE QUEST وفريق حلول كود.'
          : 'The mind behind CODE QUEST and the Halul Code team.'}</p>
      </div>
    </div>

    <div class="admin-cols">
      <section class="card glow" style="text-align:center;padding:30px 20px">
        <div style="font-size:4.5rem;line-height:1">👨‍💻</div>
        <h2 style="margin:14px 0 2px">${ar ? 'المهندس مهند القدسي' : 'Muhannad Al-Qudsi'}</h2>
        <div class="muted" style="font-weight:700">${ar ? 'فريق حلول كود — Halul Code' : 'Halul Code Team'}</div>
        <div class="pill gold" style="margin-top:12px">${ar ? 'تصميم وتطوير' : 'Designed & developed by'}</div>
        <p class="small muted" style="margin-top:18px">
          ${ar
            ? 'مهندس برمجيات ومصمم ومطور CODE QUEST — من الفكرة حتى اللعبة الكاملة: المحتوى، والواجهة، والخادم، وقواعد البيانات، وأنظمة المستويات والاشتراكات واللعب الجماعي.'
            : 'Software engineer and the designer & developer of CODE QUEST — from idea to a complete game: content, interface, server, database, and the level, subscription and multiplayer systems.'}
        </p>
        <a class="btn btn-primary" href="https://github.com/mohnadalqdasy02026" target="_blank" rel="noopener noreferrer">
          🐙 ${ar ? 'حسابي في GitHub' : 'GitHub profile'}
        </a>
        <button class="btn btn-ghost" id="about-copy" type="button" style="margin-top:10px">
          📋 ${ar ? 'نسخ رابط المستودع' : 'Copy repository link'}
        </button>
      </section>

      <section class="card">
        <h3 class="section-title"><span class="ico">🛠️</span> ${ar ? 'ما بُني في هذه اللعبة' : 'What went into this game'}</h3>
        <ul class="plan-features" style="direction:inherit">
          <li>✅ ${ar ? '1,000 مصطلح و50 تخصصًا و1,400+ سؤال تُولَّد من ملف Excel فقط' : '1,000 terms, 50 specialisations and 1,400+ questions generated solely from the Excel glossary'}</li>
          <li>✅ ${ar ? '8 أنماط لعب عبر 15 عالمًا مع تقدم محفوظ وحالة الترجمة' : '8 game modes across 15 worlds, with saved progress and translation states'}</li>
          <li>✅ ${ar ? 'واجهتان عربية وإنجليزية مع RTL/LTR وثيمين داكن وفاتح' : 'Arabic & English interfaces with full RTL/LTR and dark/light themes'}</li>
          <li>✅ ${ar ? 'اشتراكات (تجربة مجانية 10 إجابات/يوم، شهري 100 ريال، سنوي 1000 ريال) ولعب 1 ضد 1' : 'Subscriptions (free trial of 10 answers/day, 100 SAR monthly, 1000 SAR yearly) and 1v1 multiplayer'}</li>
          <li>✅ ${ar ? 'لوحة إدارة كاملة وجولة Excel قابلة للتصدير وإعادة الاستيراد' : 'A full admin console and a reversible XLSX export/import round-trip'}</li>
          <li>✅ ${ar ? 'أكثر من 500 فحص آلي (npm test) يضمن سلامة اللعبة' : '500+ automated checks (npm test) guard the game end-to-end'}</li>
        </ul>
        <div class="small muted" style="margin-top:16px">
          ${ar ? 'التقنيات:' : 'Stack:'}
          <div class="chips" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
            ${STACK.map(s => `<span class="pill">${esc(s)}</span>`).join('')}
          </div>
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:20px;text-align:center">
      <div class="small muted">${ar ? 'تصميم وتطوير' : 'Designed & developed by'}</div>
      <div style="font-weight:900;font-size:1.3rem;margin:6px 0">${ar
        ? 'فريق حلول كود — المهندس مهند القدسي'
        : 'Halul Code Team — Muhannad Al-Qudsi'}</div>
      <div class="small muted">© 2026 CODE QUEST. ${ar ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}</div>
    </section>`;

  root.querySelector('#about-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('https://github.com/mohnadalqdasy02026/halul-codequest');
      toast(ar ? 'نُسخ رابط المستودع' : 'Repository link copied', 'ok');
    } catch {
      toast(ar ? 'تعذر النسخ — راجع عنوان الريبو في README' : 'Copy failed — see README', 'err');
    }
  });
}
