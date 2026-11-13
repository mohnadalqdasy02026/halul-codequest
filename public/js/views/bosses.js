// CODE QUEST — technical boss battles.
import { api, post } from '../api.js';
import { esc, isAr, pick, progressBar, toast, confetti } from '../ui.js';

export async function bossesView(root, ctx) {
  root.innerHTML = '<div class="card"><div class="skeleton" style="height:260px"></div></div>';
  let data;
  try {
    data = await api('/api/bosses');
  } catch (err) {
    root.innerHTML = `<div class="card center">${esc(err.message)}</div>`;
    return;
  }
  const p = ctx.state.profile;
  const defeatedCount = data.bosses.filter(b => b.defeated).length;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>⚔️ ${isAr() ? 'معارك الزعماء' : 'Boss battles'}</h1>
        <p>${isAr()
          ? 'كل زعيم يمثل تخصصًا كاملًا. أجب عن 80% أو أكثر لتسقطه وتحصل على مكافأة كبيرة.'
          : 'Each boss represents a whole specialisation. Score 80%+ to defeat it for a big reward.'}</p>
      </div>
      <div class="spacer"></div>
      <span class="pill gold">🏅 ${defeatedCount} / ${data.bosses.length} ${isAr() ? 'مهزوم' : 'defeated'}</span>
    </div>

    <div class="boss-grid">
      ${data.bosses.map(b => `
        <div class="boss-card" style="--bc:${esc(b.color)};flex-direction:column;align-items:stretch">
          <div class="row" style="gap:16px;position:relative">
            <div class="boss-avatar" style="width:70px;height:70px;font-size:2rem">${b.icon}</div>
            <div style="flex:1;min-width:0">
              <div class="row" style="justify-content:space-between">
                <b style="font-size:1.05rem">${esc(pick(b.name_ar, b.name_en))}</b>
                ${b.defeated ? `<span class="pill green">✅ ${isAr() ? 'مهزوم' : 'Defeated'}</span>` : ''}
              </div>
              <div class="small muted">${esc(pick(b.title_ar, b.name_en))}</div>
              <div class="small" style="margin-top:6px">${b.questionCount} ${isAr() ? 'سؤالًا' : 'questions'} · ${b.xp_reward} XP · ${b.coin_reward} 🪙</div>
            </div>
          </div>
          <p class="small muted" style="margin:12px 0 10px">${esc(pick(b.description_ar, ''))}</p>
          <div class="row" style="margin-bottom:6px">
            <span class="small muted">${isAr() ? 'أفضل نتيجة' : 'Best'}: ${b.bestScore}/10</span>
            <span class="spacer" style="flex:1"></span>
            <span class="small muted">${b.unlocked ? (isAr() ? 'متاح' : 'Ready') : `${isAr() ? 'المستوى' : 'Level'} ${b.required_level}`}</span>
          </div>
          ${progressBar(Math.min(100, (b.bestScore / 10) * 100), { gold: true })}
          <div class="row" style="margin-top:14px">
            ${b.unlocked
              ? `<button class="btn btn-primary btn-block" data-boss="${b.id}">${b.defeated ? '🔁 ' + (isAr() ? 'قاتل مجددًا' : 'Fight again') : '⚔️ ' + (isAr() ? 'قاتل' : 'Fight')}</button>`
              : `<button class="btn btn-block" disabled>🔒 ${isAr() ? 'يتطلب المستوى' : 'Requires level'} ${b.required_level}</button>`}
          </div>
        </div>`).join('')}
    </div>

    <div class="card" style="margin-top:22px">
      <h3 class="section-title"><span class="ico">💡</span> ${isAr() ? 'نصائح المعركة' : 'Battle tips'}</h3>
      <ul class="tips-list">
        <li>${isAr() ? 'لديك 3 محاولات فقط — إجابة خاطئة واحدة تكلّفك قلبًا.' : 'You only get 3 hearts — a wrong answer costs one.'}</li>
        <li>${isAr() ? 'تحتاج 80% أو أكثر من الإجابات الصحيحة للفوز.' : 'You need 80%+ correct answers to win.'}</li>
        <li>${isAr() ? 'الأسئلة تتضمن خمّن المعنى، تحدي الإنجليزية، أكمل الشيفرة، ولغز الكلمات.' : 'Questions mix meaning, English, code completion and word puzzles.'}</li>
        <li>${isAr() ? 'يمكنك إعادة المحاولة بلا حدود، لكن المكافأة تُمنح مرة واحدة.' : 'You can retry freely, but the bonus reward is granted once.'}</li>
      </ul>
    </div>`;

  root.querySelectorAll('[data-boss]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await post('/api/play/start', { mode: 'boss', bossId: Number(btn.dataset.boss) });
        ctx.go(`#/play/${res.session.id}`);
      } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}
