// CODE QUEST — smart review (spaced repetition) landing page.
import { api, post } from '../api.js';
import { emptyState, esc, isAr, pick, progressBar, toast } from '../ui.js';

export async function reviewView(root, ctx) {
  root.innerHTML = '<div class="card"><div class="skeleton" style="height:220px"></div></div>';
  let data;
  try {
    data = await api('/api/review');
  } catch (err) {
    root.innerHTML = emptyState('🔁', isAr() ? 'تعذر تحميل المراجعة' : 'Could not load review', err.message);
    return;
  }
  const p = ctx.state.profile;
  const due = data.count || 0;
  if (ctx.state.bootstrap && ctx.state.bootstrap.reviewDue !== due) {
    ctx.state.bootstrap.reviewDue = due;
    ctx.updateProfile(p);
  }

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${isAr() ? 'المراجعة الذكية' : 'Smart review'}</h1>
        <p>${isAr()
          ? 'نظام تكرار متباعد (SM-2) يعيد المصطلحات في اللحظة المناسبة قبل أن تنساها.'
          : 'A spaced-repetition system (SM-2) resurfaces each term right before you forget it.'}</p>
      </div>
    </div>

    <div class="review-hero card glow">
      <div class="rev-ring" style="--pct:${Math.min(100, due)}">
        <div class="rev-num">${due}</div>
        <div class="rev-lab">${isAr() ? 'مستحق الآن' : 'due now'}</div>
      </div>
      <div style="flex:1;min-width:0">
        <h2 style="margin:0 0 4px">${due
          ? (isAr() ? 'لديك مصطلحات جاهزة للمراجعة' : 'You have terms ready to review')
          : (isAr() ? 'لا شيء مستحق الآن 🎉' : 'Nothing due right now 🎉')}</h2>
        <p class="muted" style="margin:0 0 14px">
          ${due
            ? (isAr() ? 'المراجعة القصيرة اليومية هي أسرع طريقة لتثبيت المفردات في الذاكرة طويلة المدى.' : 'A short daily review is the fastest way to move vocabulary into long-term memory.')
            : (isAr() ? 'العب مرحلة جديدة أو راجع القاموس لتوليد جدول مراجعة جديد.' : 'Play a new stage or browse the dictionary to build a new review schedule.')}
        </p>
        <div class="row">
          <button class="btn btn-primary btn-lg" id="review-start" ${due ? '' : 'disabled'}>▶ ${isAr() ? 'ابدأ المراجعة' : 'Start review'}</button>
          <a class="btn" href="#/dictionary">📖 ${isAr() ? 'تصفّح القاموس' : 'Browse dictionary'}</a>
        </div>
      </div>
    </div>

    <div class="stat-cards">
      <div class="stat-card"><div class="lab">${isAr() ? 'مصطلحات متقنة' : 'Mastered terms'}</div><div class="val" style="color:var(--green)">${p.stats.mastered}</div></div>
      <div class="stat-card"><div class="lab">${isAr() ? 'قيد التعلم' : 'Learning'}</div><div class="val" style="color:var(--gold)">${Math.max(0, p.stats.seen - p.stats.mastered)}</div></div>
      <div class="stat-card"><div class="lab">${isAr() ? 'إجمالي المشاهد' : 'Seen'}</div><div class="val" style="color:var(--cyan)">${p.stats.seen}</div></div>
      <div class="stat-card"><div class="lab">${isAr() ? 'المستوى' : 'Level'}</div><div class="val">${p.level}</div></div>
    </div>

    ${data.queue?.length ? `
      <h2 class="section-title" style="margin-top:24px"><span class="ico">⏳</span> ${isAr() ? 'التالي في الطابور' : 'Up next'}</h2>
      <div class="review-queue">
        ${data.queue.map(q => `
          <a class="queue-item" href="#/dictionary?q=${encodeURIComponent(q.english)}">
            <span class="q-ico">${q.mode === 'puzzle' ? '🧩' : q.mode === 'code' ? '💻' : '🔍'}</span>
            <span class="mono" dir="ltr">${esc(q.english)}</span>
            <span class="muted">${esc(q.arabic)}</span>
            <span class="pill">${esc(q.mode)}</span>
          </a>`).join('')}
      </div>` : ''}

    <div class="card" style="margin-top:22px">
      <h3 class="section-title"><span class="ico">🧠</span> ${isAr() ? 'كيف تعمل المراجعة؟' : 'How it works'}</h3>
      <div class="how-grid">
        <div class="how-step"><b>1</b><div>${isAr() ? 'أجب صحيحًا فيزيد الفاصل الزمني (1 → 3 → 7 → 14 يومًا…).' : 'Answer correctly and the interval grows (1 → 3 → 7 → 14 days…).'}</div></div>
        <div class="how-step"><b>2</b><div>${isAr() ? 'أخطئ فيعود المصطلح بعد 10 دقائق مع انخفاض معامل السهولة.' : 'Miss it and the term returns in 10 minutes with a lower ease factor.'}</div></div>
        <div class="how-step"><b>3</b><div>${isAr() ? 'بعد 3 إجابات صحيحة ومستوى إتقان 85% يصبح المصطلح «متقنًا».' : 'After 3 correct answers and 85% mastery the term becomes “mastered”.'}</div></div>
      </div>
    </div>`;

  root.querySelector('#review-start')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await post('/api/review/start');
      ctx.go(`#/play/${res.session.id}`);
    } catch (err) {
      toast(err.message, err.status === 400 ? 'gold' : 'err');
      btn.disabled = false;
    }
  });
}
