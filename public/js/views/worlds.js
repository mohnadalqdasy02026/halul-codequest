// CODE QUEST — worlds list and world detail (stages).
import { esc, isAr, pick, progressBar, starsHtml, toast, skeleton, emptyState } from '../ui.js';

export async function worldsView(root, ctx) {
  const worlds = ctx.state.worlds;
  const totalStages = worlds.reduce((a, w) => a + w.totalStages, 0);
  const doneStages = worlds.reduce((a, w) => a + w.completedStages, 0);
  const overall = totalStages ? Math.round((doneStages / totalStages) * 100) : 0;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${isAr() ? 'خريطة العوالم' : 'World map'}</h1>
        <p>${isAr()
          ? `15 عالمًا تغطي 50 تخصصًا برمجيًا. أكملت ${doneStages} من ${totalStages} مرحلة.`
          : `15 worlds covering 50 specialisations. ${doneStages}/${totalStages} stages complete.`}</p>
      </div>
      <div class="spacer"></div>
      <div class="world-progress">
        <span class="pill blue">${overall}% ${isAr() ? 'إجمالي' : 'overall'}</span>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <b>${isAr() ? 'تقدمك الكلي' : 'Overall progress'}</b>
        <span class="small muted">${doneStages} / ${totalStages}</span>
      </div>
      ${progressBar(overall, { green: overall === 100 })}
    </div>
    <div class="world-grid">
      ${worlds.map(w => `
        <a class="world-card ${w.progress === 0 && w.unlockedStages === 0 ? 'locked' : ''}" href="#/world/${w.code}" style="--wc:${esc(w.color)}">
          <div class="wc-top">
            <span class="world-ico">${w.icon}</span>
            <div style="min-width:0">
              <h3>${esc(pick(w.name_ar, w.name_en))}</h3>
              <div class="wc-sub">${esc(pick(w.subtitle_ar, w.name_en))}</div>
            </div>
          </div>
          <div class="wc-meta">
            <span>${w.unlockedStages ? (isAr() ? `${w.unlockedStages} متاحة` : `${w.unlockedStages} open`) : (isAr() ? 'تحتاج تقدمًا' : 'needs progress')}</span>
            <span>${w.completedStages}/${w.totalStages}</span>
          </div>
          ${progressBar(w.progress)}
          <div class="row" style="justify-content:space-between;margin-top:10px;color:var(--muted);font-size:.72rem">
            <span>${starsHtml(Math.round((w.progress / 100) * 3))}</span>
            <span>${w.progress}%</span>
          </div>
        </a>`).join('')}
    </div>`;
}

export async function worldView(root, ctx) {
  const code = ctx.params[0];
  const world = ctx.state.worlds.find(w => w.code === code);
  if (!world) {
    root.innerHTML = emptyState('🗺️', isAr() ? 'العالم غير موجود' : 'World not found',
      '', `<a class="btn btn-primary" href="#/worlds">${isAr() ? 'عودة للعوالم' : 'Back to worlds'}</a>`);
    return;
  }
  const stages = world.stages || [];
  const nextStage = stages.find(s => s.status === 'unlocked');

  root.innerHTML = `
    <div class="world-hero" style="--wc:${esc(world.color)}">
      <div class="wh">
        <span class="world-ico">${world.icon}</span>
        <div style="min-width:0">
          <h1>${esc(pick(world.name_ar, world.name_en))}</h1>
          <p>${esc(pick(world.subtitle_ar, world.name_en))}</p>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <span class="pill blue">${world.completedStages}/${world.totalStages} ${isAr() ? 'مكتملة' : 'done'}</span>
          <span class="pill">${world.progress}%</span>
        </div>
      </div>
      <p class="muted" style="margin:14px 0 8px;font-size:.9rem">${esc(pick(world.description_ar, ''))}</p>
      ${progressBar(world.progress)}
      ${nextStage ? `<div class="row" style="margin-top:16px">
        <a class="btn btn-primary" href="#/stage/${nextStage.id}">▶ ${isAr() ? 'المرحلة التالية' : 'Next stage'}: ${esc(pick(nextStage.name_ar, nextStage.name_en))}</a>
      </div>` : ''}
    </div>

    <h2 class="section-title"><span class="ico">🧭</span> ${isAr() ? 'المراحل' : 'Stages'} <small>${stages.length} ${isAr() ? 'تخصصًا' : 'specialisations'}</small></h2>
    <div class="stage-list">
      ${stages.map(stage => {
        const canPlay = stage.status !== 'locked';
        return `
        <div class="stage-row ${stage.status}" ${canPlay ? `data-href="#/stage/${stage.id}" role="link" tabindex="0"` : ''}>
          <div class="stage-num">${stage.status === 'completed' ? '✓' : stage.status === 'locked' ? '🔒' : stage.sort}</div>
          <div class="stage-info">
            <b>${esc(pick(stage.name_ar, stage.name_en))}</b>
            <small>
              ${stage.status === 'locked'
                ? `${isAr() ? 'يتطلب المستوى' : 'Requires level'} ${stage.requiredLevel}${stage.status === 'locked' ? '' : ''}`
                : `${isAr() ? 'مفتوحة' : 'Open'} · ${isAr() ? 'المستوى المطلوب' : 'required level'} ${stage.requiredLevel}`}
            </small>
          </div>
          <div class="row">
            ${stage.stars ? starsHtml(stage.stars) : ''}
            ${canPlay
              ? `<span class="pill ${stage.status === 'completed' ? 'green' : 'blue'}">${stage.status === 'completed' ? '✅ ' + (isAr() ? 'مكتملة' : 'Done') : '▶ ' + (isAr() ? 'ابدأ' : 'Play')}</span>`
              : `<span class="pill">🔒 ${isAr() ? 'مقفلة' : 'Locked'}</span>`}
          </div>
        </div>`;
      }).join('')}
    </div>`;

  root.querySelectorAll('[data-href]').forEach(row => {
    const open = () => ctx.go(row.dataset.href);
    row.addEventListener('click', open);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}
