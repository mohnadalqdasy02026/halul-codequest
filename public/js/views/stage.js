// CODE QUEST — stage detail: choose a game mode for this specialisation.
import { api, post } from '../api.js';
import { emptyState, esc, isAr, pick, progressBar, starsHtml, toast } from '../ui.js';

const MODE_META = {
  meaning: { icon: '🔍' },
  english: { icon: '🇬🇧' },
  match: { icon: '🔗' },
  puzzle: { icon: '🧩' },
  code: { icon: '💻' },
  speed: { icon: '⏱️' },
  similar: { icon: '⚖️' },
  boss: { icon: '⚔️' },
};

export async function stageView(root, ctx) {
  const stageId = Number(ctx.params[0]);
  root.innerHTML = '<div class="card"><div class="skeleton" style="height:180px"></div></div>';
  let data;
  try {
    data = await api(`/api/stages/${stageId}`);
  } catch (err) {
    root.innerHTML = emptyState('🔒', isAr() ? 'تعذر فتح المرحلة' : 'Cannot open stage', err.message,
      `<a class="btn btn-primary" href="#/worlds">${isAr() ? 'عودة للعوالم' : 'Back to worlds'}</a>`);
    return;
  }
  const { stage, terms, questionCounts } = data;
  const counts = Object.fromEntries(questionCounts.map(r => [r.mode, r.c]));
  const world = ctx.state.worlds.find(w => w.code === stage.world_code);
  const level = ctx.state.profile.level;

  const availability = mode => {
    if (mode === 'meaning') return counts.meaning || 0;
    if (mode === 'english') return counts.english || 0;
    if (mode === 'puzzle') return counts.puzzle || 0;
    if (mode === 'code') return counts.code || 0;
    if (mode === 'match') return (counts.meaning || 0) >= 5 ? 5 : 0;
    if (mode === 'speed') return (counts.meaning || 0) + (counts.english || 0) + (counts.code || 0);
    if (mode === 'similar') return 11;
    return 0;
  };

  const modes = ctx.state.modes.filter(m => m.code !== 'boss');

  root.innerHTML = `
    <div class="row" style="margin-bottom:14px">
      <a class="btn btn-sm btn-ghost" href="#/world/${stage.world_code}">← ${isAr() ? 'العالم' : 'World'}</a>
      <span class="small muted">${esc(pick(world?.name_ar || '', world?.name_en || ''))}</span>
    </div>

    <section class="world-hero" style="--wc:${esc(stage.world_color || world?.color || '#258BFF')}">
      <div class="wh">
        <span class="world-ico">${world?.icon || '🎯'}</span>
        <div style="min-width:0">
          <h1>${esc(pick(stage.name_ar, stage.name_en))}</h1>
          <p>${isAr() ? 'مرحلة' : 'Stage'} ${stage.sort} · ${stage.termCount} ${isAr() ? 'مصطلحًا' : 'terms'} · ${stage.questionCount} ${isAr() ? 'سؤالًا' : 'questions'}</p>
        </div>
        <div class="spacer"></div>
        <div class="row">
          ${stage.stars ? starsHtml(stage.stars) : ''}
          <span class="pill ${stage.completed ? 'green' : stage.locked ? 'red' : 'blue'}">
            ${stage.completed ? '✅ ' + (isAr() ? 'مكتملة' : 'Completed') : stage.locked ? '🔒 ' + (isAr() ? 'مقفلة' : 'Locked') : '▶ ' + (isAr() ? 'متاحة' : 'Available')}
          </span>
        </div>
      </div>
      ${stage.attempts ? `<p class="small muted" style="margin:10px 0 0">${isAr() ? 'أفضل نتيجة' : 'Best score'}: ${stage.bestScore} · ${isAr() ? 'المحاولات' : 'attempts'}: ${stage.attempts}</p>` : ''}
    </section>

    ${stage.locked ? `
      <div class="card center" style="padding:30px">
        <div style="font-size:2.4rem">🔒</div>
        <h2>${isAr() ? 'هذه المرحلة مقفلة' : 'This stage is locked'}</h2>
        <p class="muted">${!stage.chainOk
          ? (isAr() ? 'أكمل المرحلة السابقة في هذا العالم أولًا.' : 'Complete the previous stage in this world first.')
          : (isAr() ? `تحتاج المستوى ${stage.required_level} (أنت في ${level}).` : `Requires level ${stage.required_level} (you are ${level}).`)}</p>
        ${stage.previousStageId ? `<a class="btn btn-primary" href="#/stage/${stage.previousStageId}">${isAr() ? 'المرحلة السابقة' : 'Previous stage'}</a>` : ''}
      </div>` : `
      ${(counts.meaning || 0) === 0 && (counts.english || 0) === 0 ? `
        <div class="notice">
          ⚠️ ${isAr()
            ? 'ترجمات هذا التخصص ما زالت قيد المراجعة في المصدر، لذلك لا تتوفر أسئلة معنى/إنجليزية موثوقة بعد. يمكنك التعلّم عبر «لغز الكلمات» و«أكمل الشيفرة»، أو مراجعة الترجمة من لوحة الإدارة.'
            : 'Translations for this specialisation are still under review in the source, so verified meaning/English questions are not available yet. Use Word Puzzle and Complete the Code, or review translations in the admin panel.'}
        </div>` : ''}
      <h2 class="section-title"><span class="ico">🎮</span> ${isAr() ? 'اختر نمط اللعب' : 'Choose a game mode'}</h2>
      <div class="mode-grid" id="stage-modes">
        ${modes.map(m => {
          const available = availability(m.code);
          const levelOk = level >= m.unlocked_level;
          const playable = available > 0 && levelOk;
          return `
            <div class="mode-card ${playable ? '' : 'locked'}" data-mode="${esc(m.code)}" ${playable ? 'role="button" tabindex="0"' : ''}
                 ${ctx.query.mode === m.code ? 'style="outline:2px solid var(--cyan)"' : ''}>
              ${!levelOk ? `<span class="lock-tag">🔒 ${isAr() ? 'المستوى' : 'Level'} ${m.unlocked_level}</span>`
                : available === 0 ? `<span class="lock-tag" style="color:var(--muted)">${isAr() ? 'لا أسئلة' : 'no questions'}</span>` : ''}
              <span class="mi">${MODE_META[m.code]?.icon || m.icon}</span>
              <b>${esc(pick(m.name_ar, m.name_en))}</b>
              <small>${esc(m.description_ar)}</small>
              ${playable ? `<div class="small" style="margin-top:8px;color:var(--cyan);font-weight:700">${available} ${isAr() ? 'سؤال متاح' : 'questions ready'} →</div>` : ''}
            </div>`;
        }).join('')}
      </div>

      <div class="row" style="margin-top:18px">
        <button class="btn btn-purple" id="boss-link">⚔️ ${isAr() ? 'معارك الزعماء' : 'Boss battles'}</button>
        <a class="btn" href="#/dictionary?category=${encodeURIComponent(stage.name_ar)}">📖 ${isAr() ? 'قاموس التخصص' : 'Category dictionary'}</a>
      </div>
    `}

    <h2 class="section-title" style="margin-top:26px"><span class="ico">📚</span> ${isAr() ? 'مصطلحات المرحلة' : 'Stage terms'} <small>${terms.length} ${isAr() ? 'من' : 'of'} ${stage.termCount}</small></h2>
    <div class="dict-grid">
      ${terms.map(term => `
        <a class="dict-card" href="#/dictionary?q=${encodeURIComponent(term.english)}">
          <div class="dc-en">${esc(term.english)}</div>
          <div class="dc-ar">${esc(term.arabic)}</div>
          <div class="dc-foot">
            <span class="pill ${term.difficulty === 'Beginner' ? 'green' : term.difficulty === 'Advanced' ? 'red' : 'gold'}">${esc(term.difficulty)}</span>
          </div>
        </a>`).join('')}
    </div>`;

  const start = async (mode, card) => {
    card.style.pointerEvents = 'none';
    try {
      const res = await post('/api/play/start', { mode, stageId });
      ctx.go(`#/play/${res.session.id}`);
    } catch (err) {
      toast(err.message, 'err');
      card.style.pointerEvents = '';
    }
  };

  root.querySelectorAll('#stage-modes [data-mode]:not(.locked)').forEach(card => {
    const activate = () => start(card.dataset.mode, card);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  });
  root.querySelector('#boss-link')?.addEventListener('click', () => ctx.go('#/bosses'));

  if (ctx.query.mode) {
    const card = root.querySelector(`#stage-modes [data-mode="${ctx.query.mode}"]:not(.locked)`);
    if (card) {
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      start(ctx.query.mode, card);
    }
  }
}
