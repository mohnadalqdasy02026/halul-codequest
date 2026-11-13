// CODE QUEST — interactive dictionary with TTS and detail panel.
import { api, post } from '../api.js';
import {
  debounce, emptyState, esc, h, isAr, pick, progressBar, speak, toast, avatarEmoji,
} from '../ui.js';

export async function dictionaryView(root, ctx) {
  const q = ctx.query.q || '';
  let filters = {
    q,
    category: ctx.query.category || '',
    difficulty: ctx.query.difficulty || '',
    status: ctx.query.status || '',
    world: ctx.query.world || '',
    favorites: ctx.query.favorites === '1',
    page: 1,
  };

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>📖 ${isAr() ? 'القاموس التفاعلي' : 'Interactive dictionary'}</h1>
        <p>${isAr()
          ? 'ابحث في 1000 مصطلح برمجي، استمع للنطق، أضف للمفضلة، وابدأ تدريبًا مخصصًا.'
          : 'Search 1,000 programming terms, listen to pronunciation, favourite them and start focused practice.'}</p>
      </div>
      <div class="spacer"></div>
      <span class="pill" id="dict-count">…</span>
    </div>

    <div class="dict-bar">
      <input class="input" id="dict-q" placeholder="${isAr() ? 'ابحث بالإنجليزية أو العربية أو الاختصار…' : 'Search English, Arabic or abbreviation…'}" value="${esc(q)}" />
      <select class="select" id="dict-cat"><option value="">${isAr() ? 'كل التخصصات' : 'All categories'}</option></select>
      <select class="select" id="dict-diff">
        <option value="">${isAr() ? 'كل الصعوبات' : 'All levels'}</option>
        <option value="Beginner">Beginner</option>
        <option value="Intermediate">Intermediate</option>
        <option value="Advanced">Advanced</option>
      </select>
      <select class="select" id="dict-status">
        <option value="">${isAr() ? 'كل الحالات' : 'All progress'}</option>
        <option value="new">${isAr() ? 'جديد' : 'New'}</option>
        <option value="learning">${isAr() ? 'قيد التعلم' : 'Learning'}</option>
        <option value="reviewing">${isAr() ? 'مراجعة' : 'Reviewing'}</option>
        <option value="mastered">${isAr() ? 'متقن' : 'Mastered'}</option>
      </select>
      <button class="btn" id="dict-fav">⭐ ${isAr() ? 'المفضلة' : 'Favorites'}</button>
    </div>

    <div id="dict-results"></div>
    <div id="dict-pager" class="pager-wrap"></div>
    <div id="dict-detail"></div>`;

  const resultsEl = root.querySelector('#dict-results');
  const pagerEl = root.querySelector('#dict-pager');
  const catEl = root.querySelector('#dict-cat');
  const diffEl = root.querySelector('#dict-diff');
  const statusEl = root.querySelector('#dict-status');
  const favBtn = root.querySelector('#dict-fav');

  diffEl.value = filters.difficulty;
  statusEl.value = filters.status;
  favBtn.classList.toggle('btn-gold', filters.favorites);

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.category) params.set('category', filters.category);
    if (filters.difficulty) params.set('difficulty', filters.difficulty);
    if (filters.status) params.set('status', filters.status);
    if (filters.world) params.set('world', filters.world);
    if (filters.favorites) params.set('favorites', '1');
    params.set('page', String(filters.page));
    params.set('pageSize', '24');
    return params;
  };

  const syncHash = () => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.category) params.set('category', filters.category);
    if (filters.world) params.set('world', filters.world);
    const qs = params.toString();
    history.replaceState(null, '', `#/dictionary${qs ? `?${qs}` : ''}`);
  };

  let requestSeq = 0;
  async function load() {
    const seq = ++requestSeq;
    resultsEl.innerHTML = `<div class="dict-grid">${Array.from({ length: 8 }, () => '<div class="skeleton" style="height:130px"></div>').join('')}</div>`;
    try {
      const data = await api(`/api/dictionary?${buildQuery().toString()}`);
      if (seq !== requestSeq) return;
      root.querySelector('#dict-count').textContent = `${data.total} ${isAr() ? 'مصطلح' : 'terms'}`;
      if (!catEl.options.length || catEl.options.length === 1) {
        catEl.innerHTML = `<option value="">${isAr() ? 'كل التخصصات' : 'All categories'}</option>` +
          data.categories.map(c => `<option value="${esc(c.name_ar)}">${esc(c.name_ar)} (${c.c})</option>`).join('');
        catEl.value = filters.category;
      }
      if (!data.terms.length) {
        resultsEl.innerHTML = emptyState('🔍', isAr() ? 'لا نتائج' : 'No results',
          isAr() ? 'جرّب كلمة مختلفة أو أزل عوامل التصفية.' : 'Try a different word or clear the filters.');
        pagerEl.innerHTML = '';
        return;
      }
      resultsEl.innerHTML = `<div class="dict-grid">${data.terms.map(termCard).join('')}</div>`;
      resultsEl.querySelectorAll('[data-term]').forEach(card => {
        card.addEventListener('click', e => {
          if (e.target.closest('[data-fav]')) return;
          openDetail(Number(card.dataset.term));
        });
      });
      resultsEl.querySelectorAll('[data-fav]').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          const id = Number(btn.dataset.fav);
          try {
            const res = await post(`/api/dictionary/${id}/favorite`);
            btn.textContent = res.favorite ? '★' : '☆';
            toast(res.favorite ? (isAr() ? 'أضيف للمفضلة' : 'Added to favourites') : (isAr() ? 'أزيل من المفضلة' : 'Removed from favourites'), 'ok', 1600);
          } catch (err) { toast(err.message, 'err'); }
        });
      });
      renderPager(data.page, data.total, data.pageSize);
    } catch (err) {
      if (seq !== requestSeq) return;
      resultsEl.innerHTML = emptyState('📡', isAr() ? 'تعذر تحميل القاموس' : 'Could not load the dictionary', err.message);
    }
  }

  function termCard(t) {
    const statusPill = t.progress === 'mastered'
      ? `<span class="pill green">✓ ${isAr() ? 'متقن' : 'Mastered'}</span>`
      : t.progress === 'new' ? `<span class="pill">${isAr() ? 'جديد' : 'New'}</span>`
        : `<span class="pill gold">${isAr() ? 'قيد التعلم' : 'Learning'}</span>`;
    return `
      <div class="dict-card" data-term="${t.id}" role="button" tabindex="0">
        <button class="fav" data-fav="${t.id}" style="background:none;border:none;font-size:1.1rem">${t.favorite ? '★' : '☆'}</button>
        <div class="dc-en">${esc(t.english)}</div>
        <div class="dc-ar">${esc(t.arabic)}</div>
        <div class="dc-desc">${esc(t.definition_ar)}</div>
        <div class="dc-foot">
          <span class="pill" style="border-color:${esc(t.world_color)}55;color:${esc(t.world_color)}">${esc(t.category)}</span>
          <span class="pill ${t.difficulty === 'Beginner' ? 'green' : t.difficulty === 'Advanced' ? 'red' : 'gold'}">${esc(t.difficulty)}</span>
          ${statusPill}
        </div>
      </div>`;
  }

  function renderPager(page, total, pageSize) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages <= 1) { pagerEl.innerHTML = ''; return; }
    pagerEl.innerHTML = `
      <div class="pager">
        <button class="btn btn-sm" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>
        <span>${page} / ${pages}</span>
        <button class="btn btn-sm" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''}>›</button>
      </div>`;
    pagerEl.querySelectorAll('[data-p]').forEach(btn => btn.addEventListener('click', () => {
      filters.page = Number(btn.dataset.p);
      load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
  }

  async function openDetail(id) {
    const host = root.querySelector('#dict-detail');
    host.innerHTML = `<div class="detail-panel"><div class="detail-box"><div class="skeleton" style="height:200px"></div></div></div>`;
    const close = () => { host.innerHTML = ''; document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    host.querySelector('.detail-panel').addEventListener('click', e => {
      if (e.target.classList.contains('detail-panel')) close();
    });

    let data;
    try { data = await api(`/api/dictionary/${id}`); }
    catch (err) { toast(err.message, 'err'); close(); return; }
    const { term, progress, review, related, examples, favorite, abbreviation } = data;
    const masteryPct = Math.round((progress.mastery || 0) * 100);
    const nextDue = review?.due_at ? new Date(review.due_at) : null;

    host.innerHTML = `
      <div class="detail-panel">
        <div class="detail-box">
          <div class="row" style="justify-content:space-between">
            <div class="row">
              <span class="pill" style="border-color:${esc(term.world_color)}55;color:${esc(term.world_color)}">${esc(term.category)}</span>
              <span class="pill ${term.difficulty === 'Beginner' ? 'green' : term.difficulty === 'Advanced' ? 'red' : 'gold'}">${esc(term.difficulty)}</span>
            </div>
            <button class="icon-btn" id="d-close">✕</button>
          </div>
          <h2>${esc(term.english)}</h2>
          <div class="row">
            <div class="d-ar">${esc(term.arabic)}</div>
            <span class="spacer" style="flex:1"></span>
            <button class="icon-btn" id="d-speak" title="${isAr() ? 'استمع' : 'Listen'}">🔊</button>
            <button class="icon-btn" id="d-fav" title="${isAr() ? 'مفضلة' : 'Favourite'}">${favorite ? '★' : '☆'}</button>
          </div>
          ${term.translation_status === 'needs_review'
            ? `<div class="notice" style="margin-top:12px;font-size:.8rem">⚠️ ${isAr() ? 'الترجمة العربية لهذا المصطلح غير موثقة في المصدر — تُعرض للاطلاع فقط.' : 'The Arabic translation is not verified in the source — shown for reference only.'}</div>`
            : ''}

          <div class="detail-sec">
            <h4>${isAr() ? 'التعريف' : 'Definition'}</h4>
            <p>${esc(term.definition_ar)}</p>
          </div>

          ${abbreviation ? `<div class="detail-sec">
            <h4>${isAr() ? 'الاختصار' : 'Abbreviation'}</h4>
            <p><b class="mono" dir="ltr">${esc(abbreviation.abbreviation)}</b> = ${esc(abbreviation.full_form)}</p>
          </div>` : ''}

          ${term.example ? `<div class="detail-sec">
            <h4>${isAr() ? 'مثال' : 'Example'}</h4>
            <pre class="q-code" style="margin:0">${esc(term.example)}</pre>
          </div>` : ''}

          ${examples?.length ? `<div class="detail-sec">
            <h4>${isAr() ? 'أمثلة إضافية' : 'More examples'}</h4>
            ${examples.map(x => `<pre class="q-code" style="margin:0 0 8px">${esc(x.code)}</pre>`).join('')}
          </div>` : ''}

          <div class="detail-sec">
            <h4>${isAr() ? 'تقدمك' : 'Your progress'}</h4>
            <div class="row" style="justify-content:space-between;margin-bottom:6px">
              <span class="small">${isAr() ? 'الإتقان' : 'Mastery'} ${masteryPct}%</span>
              <span class="small muted">${isAr() ? 'صحيح' : 'Correct'} ${progress.correct_count || 0} · ${isAr() ? 'خطأ' : 'Wrong'} ${progress.wrong_count || 0}</span>
            </div>
            ${progressBar(masteryPct, { green: masteryPct >= 85 })}
            ${nextDue ? `<div class="small muted" style="margin-top:8px">${isAr() ? 'المراجعة القادمة' : 'Next review'}: ${nextDue.toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB')}</div>` : ''}
          </div>

          ${related?.length ? `<div class="detail-sec">
            <h4>${isAr() ? 'مصطلحات ذات صلة' : 'Related terms'}</h4>
            <div class="rel-chips">
              ${related.map(r => `<button class="pill blue" data-related="${r.id}" style="cursor:pointer">${esc(r.english)} · ${esc(r.arabic)}</button>`).join('')}
            </div>
          </div>` : ''}

          <div class="detail-sec">
            <button class="btn btn-primary btn-block" id="d-learn">🎯 ${isAr() ? 'تدرّب على هذا المصطلح' : 'Practise this term'}</button>
          </div>
        </div>
      </div>`;

    host.querySelector('#d-close').addEventListener('click', close);
    host.querySelector('#d-speak').addEventListener('click', () => speak(term.english, 'en-US'));
    host.querySelector('#d-fav').addEventListener('click', async e => {
      try {
        const res = await post(`/api/dictionary/${term.id}/favorite`);
        e.currentTarget.textContent = res.favorite ? '★' : '☆';
      } catch (err) { toast(err.message, 'err'); }
    });
    host.querySelectorAll('[data-related]').forEach(chip => {
      chip.addEventListener('click', () => openDetail(Number(chip.dataset.related)));
    });
    host.querySelector('#d-learn').addEventListener('click', async e => {
      e.currentTarget.disabled = true;
      try {
        const res = await post(`/api/dictionary/${term.id}/learn`);
        ctx.go(`#/play/${res.session.id}`);
      } catch (err) {
        toast(err.message, 'err');
        e.currentTarget.disabled = false;
      }
    });
  }

  /* ---- controls */
  const onSearch = debounce(() => {
    filters.q = root.querySelector('#dict-q').value.trim();
    filters.page = 1;
    syncHash();
    load();
  }, 300);
  root.querySelector('#dict-q').addEventListener('input', onSearch);
  catEl.addEventListener('change', () => { filters.category = catEl.value; filters.page = 1; syncHash(); load(); });
  diffEl.addEventListener('change', () => { filters.difficulty = diffEl.value; filters.page = 1; load(); });
  statusEl.addEventListener('change', () => { filters.status = statusEl.value; filters.page = 1; load(); });
  favBtn.addEventListener('click', () => {
    filters.favorites = !filters.favorites;
    filters.page = 1;
    favBtn.classList.toggle('btn-gold', filters.favorites);
    load();
  });

  await load();
  if (ctx.query.q) {
    // auto-open the exact first match for deep links from stage pages
    try {
      const data = await api(`/api/dictionary?${buildQuery().toString()}`);
      if (data.terms.length === 1) openDetail(data.terms[0].id);
    } catch { /* ignore */ }
  }

  return { destroy: () => { } };
}
