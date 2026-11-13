// CODE QUEST — admin console (standalone page).
import { api, setCsrf, uploadXlsx, downloadFile } from './api.js';
import {
  confirmBox, esc, formatNum, openModal, skeleton, toast,
} from './ui.js';

/* ------------------------------------------------------------------ state */
const state = {
  me: null,
  tab: 'overview',
  terms: { page: 1, q: '', status: '', category: '' },
  questions: { page: 1, mode: '', q: '' },
  users: { q: '' },
};

const TAB_KEYS = ['overview', 'terms', 'questions', 'import', 'export', 'users', 'subscriptions', 'settings'];
const MODE_LABELS = {
  meaning: 'خمّن المعنى', english: 'تحدي الإنجليزية', match: 'طابق المصطلحات', puzzle: 'لغز الكلمات',
  code: 'أكمل الشيفرة', speed: 'تحدي السرعة', boss: 'معركة الزعيم', similar: 'مصطلحات متشابهة',
  daily: 'تحدي اليوم', review: 'مراجعة',
};

const view = document.getElementById('admin-view');
const gate = document.getElementById('admin-gate');
const shell = document.getElementById('admin-shell');

/* ------------------------------------------------------------------ boot */
async function boot() {
  let me;
  try {
    me = await api('/api/auth/me');
  } catch {
    showGate('تعذر الاتصال بالخادم.');
    return;
  }
  if (!me.user) { showGate(); return; }
  if (me.user.role !== 'admin') { showForbidden(me.user); return; }
  setCsrf(me.csrf);
  state.me = me.user;
  document.getElementById('admin-user').textContent = `🛠️ ${me.user.profile?.display_name || me.user.username}`;
  gate.classList.add('hidden');
  shell.classList.remove('hidden');
  const hash = (location.hash || '').replace(/^#\/?/, '');
  state.tab = TAB_KEYS.includes(hash) ? hash : 'overview';
  paintTabs();
  await renderTab();
}

function showGate(message = '') {
  shell.classList.add('hidden');
  gate.classList.remove('hidden');
  const box = document.getElementById('gate-message');
  box.className = message ? 'auth-error' : 'auth-error hidden';
  box.textContent = message;
  document.getElementById('gate-form').classList.remove('hidden');
}

function showForbidden(user) {
  shell.classList.add('hidden');
  gate.classList.remove('hidden');
  document.getElementById('gate-form').classList.add('hidden');
  const box = document.getElementById('gate-message');
  box.className = 'notice';
  box.innerHTML = `⛔ الحساب <b>${esc(user.username)}</b> ليس مديرًا. سجّل الدخول بحساب إداري أو
    <a href="/">ارجع إلى اللعبة</a>.`;
}

document.getElementById('gate-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('g-submit');
  btn.disabled = true;
  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: {
        login: document.getElementById('g-user').value.trim(),
        password: document.getElementById('g-pass').value,
      },
    });
    if (res.user.role !== 'admin') {
      showForbidden(res.user);
      return;
    }
    setCsrf(res.csrf);
    state.me = res.user;
    document.getElementById('admin-user').textContent = `🛠️ ${res.user.profile?.display_name || res.user.username}`;
    gate.classList.add('hidden');
    shell.classList.remove('hidden');
    await renderTab();
    toast('مرحبًا بك في لوحة الإدارة', 'ok');
  } catch (err) {
    const box = document.getElementById('gate-message');
    box.className = 'auth-error';
    box.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('admin-logout').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* noop */ }
  location.href = '/';
});

document.getElementById('admin-theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  document.getElementById('admin-theme').textContent = next === 'light' ? '☀️' : '🌙';
});

/* ------------------------------------------------------------------ tabs */
function paintTabs() {
  document.querySelectorAll('#admin-tabs [data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.tab);
    btn.onclick = () => {
      state.tab = btn.dataset.tab;
      location.hash = `#${state.tab}`;
      paintTabs();
      renderTab();
    };
  });
}

async function renderTab() {
  view.innerHTML = `<div class="card">${skeleton(4, 90)}</div>`;
  try {
    if (state.tab === 'overview') await renderOverview();
    else if (state.tab === 'terms') await renderTerms();
    else if (state.tab === 'questions') await renderQuestions();
    else if (state.tab === 'import') renderImport();
    else if (state.tab === 'export') renderExport();
    else if (state.tab === 'users') await renderUsers();
    else if (state.tab === 'subscriptions') await renderSubscriptions();
    else if (state.tab === 'settings') await renderSettings();
  } catch (err) {
    view.innerHTML = `<div class="card">
      <h2>تعذر تحميل الصفحة</h2>
      <p class="muted">${esc(err.message)}</p>
      <button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>
    </div>`;
  }
}

function kpi(label, value, color = 'var(--text)', sub = '') {
  return `<div class="stat-card">
    <div class="lab">${esc(label)}</div>
    <div class="val" style="color:${color}">${value}</div>
    ${sub ? `<div class="small muted">${esc(sub)}</div>` : ''}
  </div>`;
}

/* ------------------------------------------------------------------ overview */
async function renderOverview() {
  const data = await api('/api/admin/overview');
  const c = data.counts;
  const maxMode = Math.max(1, ...data.modes.map(m => Number(m.c) || 0));
  const maxWrong = Math.max(1, ...data.hardTerms.map(t => Number(t.wrongs) || 0));

  view.innerHTML = `
    <div class="admin-grid">
      ${kpi('اللاعبون', formatNum(c.users), 'var(--cyan)')}
      ${kpi('المصطلحات النشطة', formatNum(c.terms), 'var(--blue)')}
      ${kpi('تحتاج مراجعة ترجمة', formatNum(c.needsReview), 'var(--gold)')}
      ${kpi('الأسئلة النشطة', formatNum(c.questions), 'var(--purple)')}
      ${kpi('الجولات', formatNum(c.sessions))}
      ${kpi('الإجابات', formatNum(c.answers))}
      ${kpi('دقة الإجابات', `${c.accuracy}%`, 'var(--green)')}
      ${kpi('نشِطون آخر 24 ساعة', formatNum(c.activeToday), 'var(--cyan)')}
    </div>

    <div class="admin-cols">
      <section class="card">
        <h3 class="section-title"><span class="ico">🎮</span> توزيع الإجابات على الأنماط</h3>
        ${data.modes.length ? data.modes.map(m => {
          const pct = Math.round((Number(m.c) / maxMode) * 100);
          const acc = m.c ? Math.round((Number(m.correct) / Number(m.c)) * 100) : 0;
          return `<div class="cat-row">
            <div class="row" style="justify-content:space-between">
              <b>${esc(MODE_LABELS[m.mode] || m.mode)}</b>
              <span class="small muted">${formatNum(m.c)} إجابة · ${acc}% دقة</span>
            </div>
            <div class="progress"><i style="width:${pct}%"></i></div>
          </div>`;
        }).join('') : '<p class="small muted">لا إجابات بعد.</p>'}
      </section>

      <section class="card">
        <h3 class="section-title"><span class="ico">📥</span> آخر عمليات الاستيراد</h3>
        ${data.importJobs.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>الملف</th><th>الحالة</th><th>أضيف</th><th>حُدّث</th><th>تُخطي</th><th>التاريخ</th></tr></thead>
          <tbody>${data.importJobs.map(j => `<tr>
            <td class="mono small" dir="ltr">${esc(j.filename)}</td>
            <td><span class="pill ${j.status === 'ok' ? 'green' : j.status === 'partial' ? 'gold' : 'red'}">${esc(j.status)}</span></td>
            <td>${j.inserted}</td><td>${j.updated}</td><td>${j.skipped}</td>
            <td class="small muted">${new Date(j.created_at).toLocaleString('ar-EG')}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : '<p class="small muted">لا عمليات استيراد بعد.</p>'}
      </section>
    </div>

    <div class="admin-cols">
      <section class="card">
        <h3 class="section-title"><span class="ico">🔥</span> مصطلحات يخطئ فيها اللاعبون</h3>
        ${data.hardTerms.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>المصطلح</th><th>الترجمة</th><th>التخصص</th><th>أخطاء</th><th></th></tr></thead>
          <tbody>${data.hardTerms.map(t => `<tr>
            <td><b class="mono" dir="ltr">${esc(t.english)}</b></td>
            <td>${esc(t.arabic)}</td>
            <td class="small muted">${esc(t.category)}</td>
            <td><b style="color:var(--red)">${t.wrongs}</b></td>
            <td><div class="progress" style="min-width:80px"><i style="width:${Math.round((t.wrongs / maxWrong) * 100)}%;background:linear-gradient(90deg,var(--red),var(--gold))"></i></div></td>
          </tr>`).join('')}</tbody>
        </table></div>` : '<p class="small muted">لا أخطاء مسجلة.</p>'}
      </section>

      <section class="card">
        <h3 class="section-title"><span class="ico">👥</span> أحدث اللاعبين</h3>
        ${data.recentUsers.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>اللاعب</th><th>XP</th><th>إجابات</th><th>التسجيل</th></tr></thead>
          <tbody>${data.recentUsers.map(u => `<tr>
            <td><b>${esc(u.display_name || u.username)}</b><div class="small muted mono" dir="ltr">@${esc(u.username)}</div></td>
            <td style="color:var(--cyan)">${formatNum(u.xp)}</td>
            <td>${u.answers}</td>
            <td class="small muted">${new Date(u.created_at).toLocaleDateString('ar-EG')}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : '<p class="small muted">لا لاعبين بعد.</p>'}
      </section>
    </div>

    ${data.hardQuestions.length ? `<section class="card">
      <h3 class="section-title"><span class="ico">🧠</span> أسئلة صعبة</h3>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>#</th><th>النمط</th><th>السؤال</th><th>الإجابة</th><th>أخطاء</th></tr></thead>
        <tbody>${data.hardQuestions.map(q => `<tr>
          <td>${q.id}</td>
          <td><span class="pill">${esc(MODE_LABELS[q.mode] || q.mode)}</span></td>
          <td class="small">${esc(String(q.prompt || '').slice(0, 90))}</td>
          <td class="small">${esc(String(q.answer || '').slice(0, 60))}</td>
          <td><b style="color:var(--red)">${q.mistakes}</b></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>` : ''}`;
}

/* ------------------------------------------------------------------ terms */
async function renderTerms() {
  const { page, q, status, category } = state.terms;
  const params = new URLSearchParams({ page: String(page), status, category, q });
  const [data, cats] = await Promise.all([
    api(`/api/admin/terms?${params}`),
    api('/api/admin/categories'),
  ]);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const catOptions = cats.categories.map(c =>
    `<option value="${esc(c.name_ar)}" ${c.name_ar === category ? 'selected' : ''}>${esc(c.name_ar)} (${c.terms})</option>`).join('');

  view.innerHTML = `
    <div class="admin-toolbar card">
      <input class="input" id="t-q" placeholder="ابحث بالمصطلح أو الترجمة…" value="${esc(q)}" />
      <select class="select" id="t-status">
        <option value="">كل الحالات</option>
        <option value="verified" ${status === 'verified' ? 'selected' : ''}>موثّقة</option>
        <option value="needs_review" ${status === 'needs_review' ? 'selected' : ''}>تحتاج مراجعة</option>
      </select>
      <select class="select" id="t-cat">
        <option value="">كل التخصصات</option>
        ${catOptions}
      </select>
      <button class="btn btn-primary" id="t-add">＋ مصطلح جديد</button>
      <span class="spacer"></span>
      <span class="small muted">${formatNum(data.total)} نتيجة</span>
    </div>

    <div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>#</th><th>المصطلح</th><th>الترجمة</th><th>التعريف</th><th>التخصص</th>
          <th>الصعوبة</th><th>الترجمة</th><th>الحالة</th><th>إجراءات</th>
        </tr></thead>
        <tbody>
          ${data.terms.length ? data.terms.map(t => `<tr class="${t.active ? '' : 'row-off'}">
            <td class="muted">${t.id}</td>
            <td><b class="mono" dir="ltr">${esc(t.english)}</b>${t.abbreviation ? `<div class="small muted mono">${esc(t.abbreviation)}</div>` : ''}</td>
            <td>${esc(t.arabic)}</td>
            <td class="small muted term-def">${esc(t.definition_ar || '')}</td>
            <td class="small">${esc(t.category)}</td>
            <td><span class="pill ${t.difficulty === 'Beginner' ? 'green' : t.difficulty === 'Advanced' ? 'red' : 'gold'}">${esc(t.difficulty)}</span></td>
            <td>${t.translation_status === 'verified'
              ? '<span class="pill green">موثّقة</span>'
              : '<span class="pill gold">مراجعة</span>'}</td>
            <td>${t.active ? '<span class="pill green">نشط</span>' : '<span class="pill red">محذوف</span>'}</td>
            <td class="row-actions">
              <button class="btn btn-xs" data-edit="${t.id}">تعديل</button>
              ${t.active
                ? `<button class="btn btn-xs btn-danger" data-del="${t.id}">حذف</button>`
                : `<button class="btn btn-xs btn-gold" data-restore="${t.id}">استعادة</button>`}
            </td>
          </tr>`).join('') : `<tr><td colspan="9" class="center muted">لا نتائج مطابقة.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="row" style="justify-content:center;margin-top:16px">
      <button class="btn btn-sm" id="t-prev" ${page <= 1 ? 'disabled' : ''}>‹ السابق</button>
      <span class="small muted">صفحة ${page} / ${pages}</span>
      <button class="btn btn-sm" id="t-next" ${page >= pages ? 'disabled' : ''}>التالي ›</button>
    </div>`;

  const reload = () => renderTerms();
  const qEl = view.querySelector('#t-q');
  qEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { state.terms.q = qEl.value.trim(); state.terms.page = 1; reload(); }
  });
  qEl.addEventListener('input', debounce(() => { state.terms.q = qEl.value.trim(); state.terms.page = 1; reload(); }, 420));
  view.querySelector('#t-status').addEventListener('change', e => { state.terms.status = e.target.value; state.terms.page = 1; reload(); });
  view.querySelector('#t-cat').addEventListener('change', e => { state.terms.category = e.target.value; state.terms.page = 1; reload(); });
  view.querySelector('#t-add').addEventListener('click', () => termModal(null, cats.categories));
  view.querySelector('#t-prev').addEventListener('click', () => { state.terms.page = Math.max(1, page - 1); reload(); });
  view.querySelector('#t-next').addEventListener('click', () => { state.terms.page = Math.min(pages, page + 1); reload(); });

  view.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    const term = data.terms.find(t => t.id === Number(btn.dataset.edit));
    if (term) termModal(term, cats.categories);
  }));
  view.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
    const term = data.terms.find(t => t.id === Number(btn.dataset.del));
    const ok = await confirmBox('حذف مصطلح', `سيُخفى «${term.english}» وأسئلته من اللعبة (يمكن استعادته).`, { okText: 'حذف', danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/terms/${term.id}`, { method: 'DELETE' });
      toast('تم حذف المصطلح منطقيًا.', 'ok');
      reload();
    } catch (err) { toast(err.message, 'err'); }
  }));
  view.querySelectorAll('[data-restore]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await api(`/api/admin/terms/${btn.dataset.restore}/restore`, { method: 'POST', body: {} });
      toast('تمت استعادة المصطلح.', 'ok');
      reload();
    } catch (err) { toast(err.message, 'err'); }
  }));
}

function termModal(term, categories) {
  const isEdit = !!term;
  openModal({
    title: isEdit ? `تعديل: ${term.english}` : 'إضافة مصطلح جديد',
    wide: true,
    body: `
      <div class="form-grid">
        <div class="field">
          <label>المصطلح الإنجليزي *</label>
          <input class="input mono" id="f-english" dir="ltr" value="${esc(term?.english || '')}" />
        </div>
        <div class="field">
          <label>الترجمة العربية *</label>
          <input class="input" id="f-arabic" value="${esc(term?.arabic || '')}" />
        </div>
        <div class="field">
          <label>الاختصار</label>
          <input class="input mono" id="f-abbr" dir="ltr" value="${esc(term?.abbreviation || '')}" />
        </div>
        <div class="field">
          <label>الشكل الكامل للاختصار</label>
          <input class="input mono" id="f-full" dir="ltr" value="${esc(term?.full_form || '')}" />
        </div>
        <div class="field">
          <label>التخصص *</label>
          <select class="select" id="f-cat">
            ${categories.map(c => `<option value="${c.id}" ${term?.category_id === c.id ? 'selected' : ''}>${esc(c.name_ar)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>الصعوبة</label>
          <select class="select" id="f-diff">
            ${['Beginner', 'Intermediate', 'Advanced'].map(d =>
              `<option value="${d}" ${term?.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>التعريف العربي *</label>
        <textarea class="input" id="f-def" rows="3">${esc(term?.definition_ar || '')}</textarea>
      </div>
      <div class="field">
        <label>مثال برمجي (اختياري)</label>
        <textarea class="input mono" id="f-example" dir="ltr" rows="3">${esc(term?.example || '')}</textarea>
      </div>
      <div class="field">
        <label>مصطلحات ذات صلة (مفصولة بفاصلة)</label>
        <input class="input" id="f-related" value="${esc(term?.related_terms || '')}" />
      </div>
      <div class="notice" style="font-size:.8rem">
        تُعتبر الترجمة «موثّقة» فقط عند وجود نص عربي فعلي (وليس Placeholder). أسئلة المعنى/الإنجليزية تُعاد توليدها تلقائيًا بعد الحفظ.
      </div>`,
    actions: [
      { label: 'إلغاء', class: 'btn-ghost' },
      {
        label: isEdit ? 'حفظ التعديلات' : 'إضافة المصطلح',
        class: 'btn-primary',
        onClick: async () => {
          const rootEl = document.getElementById('modal-root');
          const val = id => rootEl.querySelector(`#${id}`).value.trim();
          const payload = {
            english: val('f-english'),
            arabic: val('f-arabic'),
            abbreviation: val('f-abbr'),
            fullForm: val('f-full'),
            categoryId: Number(val('f-cat')),
            difficulty: val('f-diff'),
            definition: val('f-def'),
            example: val('f-example'),
            relatedTerms: val('f-related'),
          };
          if (!payload.english || !payload.arabic || !payload.definition) {
            toast('المصطلح والترجمة والتعريف مطلوبة.', 'err');
            return false;
          }
          try {
            if (isEdit) await api(`/api/admin/terms/${term.id}`, { method: 'PUT', body: payload });
            else await api('/api/admin/terms', { method: 'POST', body: payload });
            toast(isEdit ? 'تم حفظ التعديلات.' : 'تمت إضافة المصطلح وتوليد أسئلته.', 'ok');
            await renderTerms();
            return true;
          } catch (err) {
            toast(err.message, 'err');
            return false;
          }
        },
      },
    ],
  });
}

/* ------------------------------------------------------------------ questions */
async function renderQuestions() {
  const { page, mode, q } = state.questions;
  const params = new URLSearchParams({ page: String(page), mode, q });
  const data = await api(`/api/admin/questions?${params}`);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const modeCount = Object.fromEntries(data.modes.map(m => [m.mode, m.c]));

  view.innerHTML = `
    <div class="admin-toolbar card">
      <input class="input" id="q-q" placeholder="ابحث في نص السؤال أو الإجابة…" value="${esc(q)}" />
      <select class="select" id="q-mode">
        <option value="">كل الأنماط (${formatNum(data.total)})</option>
        ${Object.entries(MODE_LABELS).map(([k, v]) =>
          `<option value="${k}" ${mode === k ? 'selected' : ''}>${esc(v)} (${modeCount[k] || 0})</option>`).join('')}
      </select>
      <span class="spacer"></span>
      <span class="small muted">${formatNum(data.total)} سؤال</span>
    </div>

    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>#</th><th>النمط</th><th>السؤال</th><th>الإجابة الصحيحة</th><th>الخيارات</th><th>الحالة</th><th></th></tr></thead>
        <tbody>
          ${data.questions.length ? data.questions.map(qq => `<tr class="${qq.active ? '' : 'row-off'}">
            <td class="muted">${qq.id}</td>
            <td><span class="pill">${esc(MODE_LABELS[qq.mode] || qq.mode)}</span></td>
            <td class="small">
              <div class="mono" dir="ltr" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(qq.prompt || '')}</div>
              ${qq.term ? `<span class="muted">${esc(qq.term)}</span>` : ''}
            </td>
            <td class="small"><b>${esc(String(qq.answer || '').slice(0, 70))}</b></td>
            <td class="muted">${qq.options.length || '—'}</td>
            <td>${qq.active ? '<span class="pill green">نشط</span>' : '<span class="pill red">معطّل</span>'}</td>
            <td><button class="btn btn-xs" data-qedit="${qq.id}">تعديل</button></td>
          </tr>`).join('') : '<tr><td colspan="7" class="center muted">لا نتائج.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="row" style="justify-content:center;margin-top:16px">
      <button class="btn btn-sm" id="q-prev" ${page <= 1 ? 'disabled' : ''}>‹ السابق</button>
      <span class="small muted">صفحة ${page} / ${pages}</span>
      <button class="btn btn-sm" id="q-next" ${page >= pages ? 'disabled' : ''}>التالي ›</button>
    </div>`;

  const reload = () => renderQuestions();
  const qEl = view.querySelector('#q-q');
  qEl.addEventListener('input', debounce(() => { state.questions.q = qEl.value.trim(); state.questions.page = 1; reload(); }, 420));
  view.querySelector('#q-mode').addEventListener('change', e => { state.questions.mode = e.target.value; state.questions.page = 1; reload(); });
  view.querySelector('#q-prev').addEventListener('click', () => { state.questions.page = Math.max(1, page - 1); reload(); });
  view.querySelector('#q-next').addEventListener('click', () => { state.questions.page = Math.min(pages, page + 1); reload(); });
  view.querySelectorAll('[data-qedit]').forEach(btn => btn.addEventListener('click', () => {
    const qq = data.questions.find(x => x.id === Number(btn.dataset.qedit));
    if (qq) questionModal(qq);
  }));
}

function questionModal(q) {
  const hasOptions = q.options.length >= 2;
  openModal({
    title: `تعديل السؤال #${q.id} — ${MODE_LABELS[q.mode] || q.mode}`,
    wide: true,
    body: `
      <div class="field">
        <label>نص السؤال (Prompt)</label>
        <textarea class="input mono" id="qf-prompt" dir="auto" rows="3">${esc(q.prompt || '')}</textarea>
      </div>
      <div class="field">
        <label>سؤال/توجيه عربي</label>
        <input class="input" id="qf-prompt-ar" value="${esc(q.prompt_ar || '')}" />
      </div>
      ${hasOptions ? `
      <div class="field">
        <label>الخيارات — حدّد إجابة صحيحة واحدة فقط</label>
        <div id="qf-options" class="opt-editor">
          ${q.options.map(o => optRow(o.text, !!o.is_correct)).join('')}
        </div>
        <button class="btn btn-sm" id="qf-add-opt" type="button">＋ إضافة خيار</button>
      </div>` : `
      <div class="notice" style="font-size:.8rem">هذا النمط لا يستخدم خيارات متعددة (إجابة نصية / أحرف). عدّل النص أو الشرح فقط.</div>`}
      <div class="field">
        <label>الإجابة الصحيحة</label>
        <input class="input mono" id="qf-answer" dir="auto" value="${esc(q.answer || '')}" ${hasOptions ? 'readonly' : ''} />
      </div>
      <div class="row" style="gap:12px">
        <div class="field" style="flex:1">
          <label>الصعوبة</label>
          <select class="select" id="qf-diff">
            ${['Beginner', 'Intermediate', 'Advanced'].map(d =>
              `<option value="${d}" ${q.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="flex:1">
          <label>الحالة</label>
          <select class="select" id="qf-active">
            <option value="1" ${q.active ? 'selected' : ''}>نشط</option>
            <option value="0" ${q.active ? '' : 'selected'}>معطّل</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>الشرح</label>
        <textarea class="input" id="qf-expl" rows="2">${esc(q.explanation || '')}</textarea>
      </div>`,
    onMount: modal => {
      const list = modal.querySelector('#qf-options');
      if (!list) return;
      modal.querySelector('#qf-add-opt').addEventListener('click', () => {
        list.insertAdjacentHTML('beforeend', optRow('', false));
      });
      list.addEventListener('click', e => {
        const rm = e.target.closest('[data-remove-opt]');
        if (!rm) return;
        if (list.children.length <= 2) { toast('يجب أن يبقى خياران على الأقل.', 'err'); return; }
        rm.closest('.opt-row').remove();
      });
      list.addEventListener('input', e => {
        if (e.target.matches('input[type="text"]')) {
          const any = [...list.querySelectorAll('input[type="radio"]')].find(r => r.checked);
          if (any) modal.querySelector('#qf-answer').value = any.closest('.opt-row').querySelector('input[type="text"]').value;
        }
      });
    },
    actions: [
      { label: 'إلغاء', class: 'btn-ghost' },
      {
        label: 'حفظ السؤال',
        class: 'btn-primary',
        onClick: async () => {
          const rootEl = document.getElementById('modal-root');
          const payload = {
            prompt: rootEl.querySelector('#qf-prompt').value,
            promptAr: rootEl.querySelector('#qf-prompt-ar').value,
            explanation: rootEl.querySelector('#qf-expl').value,
            difficulty: rootEl.querySelector('#qf-diff').value,
            active: rootEl.querySelector('#qf-active').value === '1',
          };
          if (hasOptions) {
            const options = [...rootEl.querySelectorAll('#qf-options .opt-row')].map(row => ({
              text: row.querySelector('input[type="text"]').value.trim(),
              isCorrect: row.querySelector('input[type="radio"]').checked,
            })).filter(o => o.text);
            if (options.length < 2) { toast('أضف خيارين على الأقل.', 'err'); return false; }
            if (options.filter(o => o.isCorrect).length !== 1) {
              toast('حدّد إجابة صحيحة واحدة فقط.', 'err');
              return false;
            }
            payload.options = options;
          } else {
            payload.answer = rootEl.querySelector('#qf-answer').value.trim();
          }
          try {
            await api(`/api/admin/questions/${q.id}`, { method: 'PUT', body: payload });
            toast('تم حفظ السؤال.', 'ok');
            await renderQuestions();
            return true;
          } catch (err) {
            toast(err.message, 'err');
            return false;
          }
        },
      },
    ],
  });
}

function optRow(text, correct) {
  return `<div class="opt-row">
    <input type="radio" name="qf-correct" ${correct ? 'checked' : ''} title="الإجابة الصحيحة" />
    <input type="text" class="input" value="${esc(text || '')}" dir="auto" placeholder="نص الخيار" />
    <button type="button" class="icon-btn btn-xs" data-remove-opt title="إزالة">✕</button>
  </div>`;
}

/* ------------------------------------------------------------------ import */
function renderImport() {
  view.innerHTML = `
    <section class="card">
      <h3 class="section-title"><span class="ico">📥</span> استيراد مصطلحات من Excel</h3>
      <p class="muted small" style="margin-top:0">
        ارفع ملف <span class="mono">.xlsx</span> يحتوي ورقة <b class="mono">Programming_Glossary</b>.
        تُقرأ الأعمدة: <span class="mono">English_Term, Arabic_Term, Definition_AR, Category_AR, Subcategory,
        Abbreviation, Full_Form, Difficulty, Example, Related_Terms</span>.
        المصطلح الموجود يُحدّث، والجديد يُضاف، والتخصص الجديد يُنشأ تلقائيًا مع مرحلته.
      </p>
      <div class="import-drop" id="imp-drop">
        <div style="font-size:2.2rem">📄</div>
        <b id="imp-name">لم يُختر ملف بعد</b>
        <small class="muted">اسحب الملف هنا أو اضغط للاختيار</small>
        <input type="file" id="imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn" id="imp-dry">🔍 فحص جاف (بدون كتابة)</button>
        <button class="btn btn-primary" id="imp-go">📥 استيراد الآن</button>
        <span class="spacer"></span>
        <button class="btn btn-sm btn-ghost" id="imp-backup">⬇ نسخة احتياطية من الحالي</button>
      </div>
      <div id="imp-result" style="margin-top:16px"></div>
      <div class="notice" style="margin-top:16px">
        ⚠️ ملف المصدر الأصلي <span class="mono">E:\\my_program\\Programming_Glossary_En_Ar.xlsx</span> لا يُعدّل من هنا.
        الاستيراد يحدّث قاعدة بيانات اللعبة فقط، ويعيد توليد أسئلة المصطلحات المتأثرة.
      </div>
    </section>`;

  const input = view.querySelector('#imp-file');
  const drop = view.querySelector('#imp-drop');
  const nameEl = view.querySelector('#imp-name');
  const result = view.querySelector('#imp-result');
  let file = null;

  const choose = () => input.click();
  drop.addEventListener('click', choose);
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer.files?.[0];
    if (f) { file = f; nameEl.textContent = f.name; }
  });
  input.addEventListener('change', () => {
    file = input.files?.[0] || null;
    nameEl.textContent = file ? file.name : 'لم يُختر ملف بعد';
  });

  const run = async (dry) => {
    if (!file) { toast('اختر ملف Excel أولًا.', 'err'); return; }
    const btn = dry ? view.querySelector('#imp-dry') : view.querySelector('#imp-go');
    btn.disabled = true;
    result.innerHTML = `<div class="notice">جارٍ ${dry ? 'الفحص' : 'الاستيراد'}…</div>`;
    try {
      const res = await uploadXlsx(`/api/admin/import${dry ? '?dry=1' : ''}`, file);
      result.innerHTML = `
        <div class="notice ${res.skipped ? '' : 'ok'}">
          <b>${res.dryRun ? 'نتيجة الفحص الجاف' : 'تم الاستيراد'}</b><br>
          أضيف: <b style="color:var(--green)">${res.inserted}</b> ·
          حُدّث: <b style="color:var(--blue)">${res.updated}</b> ·
          تُخطّي: <b style="color:var(--gold)">${res.skipped}</b> ·
          تخصصات جديدة: <b>${res.createdCategories}</b>
        </div>
        ${res.errors?.length ? `<div class="table-wrap" style="margin-top:12px"><table class="data">
          <thead><tr><th>الملاحظات (أول ${res.errors.length})</th></tr></thead>
          <tbody>${res.errors.map(e => `<tr><td class="small">${esc(e)}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}`;
      toast(dry ? 'اكتمل الفحص.' : 'اكتمل الاستيراد.', 'ok');
    } catch (err) {
      result.innerHTML = `<div class="notice" style="border-color:var(--red)">${esc(err.message)}</div>`;
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  };

  view.querySelector('#imp-dry').addEventListener('click', () => run(true));
  view.querySelector('#imp-go').addEventListener('click', () => run(false));
  view.querySelector('#imp-backup').addEventListener('click', async () => {
    try {
      await downloadFile('/api/admin/export?type=terms', 'codequest-terms.xlsx');
    } catch (err) { toast(err.message, 'err'); }
  });
}

/* ------------------------------------------------------------------ export */
function renderExport() {
  view.innerHTML = `
    <div class="admin-cols">
      <section class="card">
        <h3 class="section-title"><span class="ico">📚</span> تصدير المصطلحات</h3>
        <p class="muted small">ملف Excel بكل المصطلحات النشطة مع الترجمات والتعريفات والتخصصات وحالة الترجمة.</p>
        <button class="btn btn-primary" id="exp-terms">⬇ تنزيل codequest-terms.xlsx</button>
      </section>
      <section class="card">
        <h3 class="section-title"><span class="ico">❓</span> تصدير الأسئلة</h3>
        <p class="muted small">ملف Excel بكل الأسئلة وخياراتها والإجابة الصحيحة لكل سؤال — مفيد للمراجعة والنسخ الاحتياطي.</p>
        <button class="btn btn-primary" id="exp-questions">⬇ تنزيل codequest-questions.xlsx</button>
      </section>
    </div>
    <section class="card" style="margin-top:16px">
      <h3 class="section-title"><span class="ico">🔁</span> دورة العمل المقترحة</h3>
      <ol class="tips-list">
        <li>صدّر المصطلحات كنسخة احتياطية قبل أي تعديل كبير.</li>
        <li>حرّر الترجمة أو أضف مصطلحات في Excel ثم استوردها من تبويب الاستيراد.</li>
        <li>استخدم «فحص جاف» أولًا لمعرفة عدد الصفوف التي ستُضاف أو تُحدّث أو تُتخطى.</li>
        <li>صدّر الأسئلة للتحقق من وجود إجابة صحيحة واحدة لكل سؤال.</li>
      </ol>
    </section>`;

  view.querySelector('#exp-terms').addEventListener('click', async () => {
    try { await downloadFile('/api/admin/export?type=terms', 'codequest-terms.xlsx'); }
    catch (err) { toast(err.message, 'err'); }
  });
  view.querySelector('#exp-questions').addEventListener('click', async () => {
    try { await downloadFile('/api/admin/export?type=questions', 'codequest-questions.xlsx'); }
    catch (err) { toast(err.message, 'err'); }
  });
}

/* ------------------------------------------------------------------ users */
async function renderUsers() {
  const data = await api(`/api/admin/users?q=${encodeURIComponent(state.users.q)}`);
  view.innerHTML = `
    <div class="admin-toolbar card">
      <input class="input" id="u-q" placeholder="ابحث باسم المستخدم أو البريد…" value="${esc(state.users.q)}" />
      <span class="spacer"></span>
      <span class="small muted">${data.users.length} مستخدم</span>
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>#</th><th>اللاعب</th><th>البريد</th><th>المستوى</th><th>XP</th><th>إجابات</th><th>الحالة</th><th>الدور</th><th></th></tr></thead>
        <tbody>
          ${data.users.map(u => `<tr>
            <td class="muted">${u.id}</td>
            <td><b>${esc(u.display_name || u.username)}</b><div class="small muted mono" dir="ltr">@${esc(u.username)}</div></td>
            <td class="small mono" dir="ltr">${esc(u.email || '')}</td>
            <td><span class="pill">${u.rank.icon} ${esc(u.rank.name_ar)}</span><div class="small muted">مستوى ${u.level}</div></td>
            <td style="color:var(--cyan)">${formatNum(u.xp)}</td>
            <td>${u.answers}</td>
            <td>
              <select class="select select-sm" data-status="${u.id}">
                <option value="active" ${u.status === 'active' ? 'selected' : ''}>نشط</option>
                <option value="banned" ${u.status === 'banned' ? 'selected' : ''}>محظور</option>
              </select>
            </td>
            <td>
              <select class="select select-sm" data-role="${u.id}" ${u.id === state.me.id ? 'disabled' : ''}>
                <option value="player" ${u.role === 'player' ? 'selected' : ''}>لاعب</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>مدير</option>
              </select>
            </td>
            <td><button class="btn btn-xs btn-primary" data-usave="${u.id}" ${u.id === state.me.id ? 'disabled' : ''}>حفظ</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const qEl = view.querySelector('#u-q');
  qEl.addEventListener('input', debounce(() => { state.users.q = qEl.value.trim(); renderUsers(); }, 420));

  view.querySelectorAll('[data-usave]').forEach(btn => btn.addEventListener('click', async () => {
    const id = Number(btn.dataset.usave);
    const status = view.querySelector(`[data-status="${id}"]`).value;
    const role = view.querySelector(`[data-role="${id}"]`).value;
    btn.disabled = true;
    try {
      await api(`/api/admin/users/${id}`, { method: 'PUT', body: { status, role } });
      toast('تم تحديث المستخدم.', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  }));
}

/* ------------------------------------------------------------------ subscriptions */
const SUB_STATUS = {
  pending: { label: 'بانتظار المراجعة', cls: 'gold' },
  active: { label: 'نشط', cls: 'green' },
  rejected: { label: 'مرفوض', cls: 'red' },
  expired: { label: 'منتهٍ', cls: 'red' },
  cancelled: { label: 'ملغى', cls: 'red' },
};

function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function renderSubscriptions() {
  const data = await api('/api/admin/subscriptions');
  const { pending, recent, counts, plans } = data;
  const planById = Object.fromEntries(plans.map(p => [p.id, p]));
  const planName = row => {
    const p = planById[row.plan_id] || row;
    return p.name_ar || row.plan_id;
  };
  const userCell = row => `<b>${esc(row.display_name || row.username)}</b>
    <div class="small muted mono" dir="ltr">@${esc(row.username)} · #${row.user_id}</div>`;

  view.innerHTML = `
    <div class="admin-grid">
      ${kpi('طلبات بانتظار المراجعة', formatNum(counts.pending), 'var(--gold)')}
      ${kpi('اشتراكات نشطة', formatNum(counts.active), 'var(--green)')}
      ${kpi('إجمالي التحصيل', `${formatNum(counts.revenue)} ريال`, 'var(--cyan)')}
    </div>

    <div class="admin-cols">
      <section class="card">
        <h3 class="section-title"><span class="ico">📝</span> منح اشتراك مباشر</h3>
        <p class="small muted" style="margin-top:0">
          استخدمه بعد تأكيد التحويل اليدوي. المتتالية تُمدَّد من نهاية الاشتراك الحالي.
        </p>
        <div class="form-grid">
          <div class="field">
            <label>المستخدم (اسم المستخدم أو الرقم)</label>
            <input class="input" id="sub-user" placeholder="username أو 12" />
          </div>
          <div class="field">
            <label>الخطة</label>
            <select class="select" id="sub-plan">
              ${plans.map(p => `<option value="${esc(p.id)}">${esc(p.name_ar)} — ${formatNum(p.price_sar)} ريال / ${p.days} يوم</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>ملاحظة (اختياري)</label>
          <input class="input" id="sub-note" placeholder="رقم التحويل أو المرجع" />
        </div>
        <button class="btn btn-primary" id="sub-grant">تفعيل الاشتراك</button>
      </section>

      <section class="card">
        <h3 class="section-title"><span class="ico">💳</span> خطط الاشتراك</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>الخطة</th><th>السعر</th><th>المدة</th></tr></thead>
          <tbody>${plans.map(p => `<tr>
            <td><b>${esc(p.name_ar)}</b><div class="small muted">${esc(p.name_en || '')}</div></td>
            <td style="color:var(--gold)">${formatNum(p.price_sar)} ريال</td>
            <td>${p.days} يوم</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </section>
    </div>

    <section class="card">
      <h3 class="section-title"><span class="ico">⏳</span> طلبات التفعيل</h3>
      ${pending.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>اللاعب</th><th>الخطة</th><th>المبلغ</th><th>طريقة الدفع</th><th>المرجع</th><th>الطلب</th><th>إجراءات</th></tr></thead>
        <tbody>${pending.map(r => `<tr>
          <td>${userCell(r)}</td>
          <td><b>${esc(planName(r))}</b><div class="small muted">${r.days} يوم</div></td>
          <td style="color:var(--gold)">${formatNum(r.amount_sar)} ريال</td>
          <td class="small">${esc(r.method || '—')}</td>
          <td class="small mono" dir="ltr">${esc(r.reference || '—')}</td>
          <td class="small muted">${fmtDate(r.requested_at)}</td>
          <td class="row-actions">
            <button class="btn btn-xs btn-primary" data-approve="${r.id}">موافقة</button>
            <button class="btn btn-xs btn-danger" data-reject="${r.id}">رفض</button>
          </td>
        </tr>`).join('')}</tbody>
      </table></div>` : '<p class="small muted">لا طلبات بانتظار المراجعة.</p>'}
    </section>

    <section class="card">
      <h3 class="section-title"><span class="ico">🗂️</span> آخر الاشتراكات</h3>
      ${recent.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>اللاعب</th><th>الخطة</th><th>المبلغ</th><th>الحالة</th><th>البداية</th><th>النهاية</th><th>الطريقة</th></tr></thead>
        <tbody>${recent.map(r => {
          const st = SUB_STATUS[r.status] || { label: r.status, cls: '' };
          const expired = r.status === 'active' && r.ends_at && new Date(r.ends_at) <= new Date();
          return `<tr>
            <td>${userCell(r)}</td>
            <td>${esc(planName(r))}</td>
            <td>${formatNum(r.amount_sar)} ريال</td>
            <td><span class="pill ${expired ? 'red' : st.cls}">${expired ? 'منتهٍ' : esc(st.label)}</span>
              ${r.admin_note ? `<div class="small muted">${esc(r.admin_note)}</div>` : ''}</td>
            <td class="small muted">${fmtDate(r.starts_at)}</td>
            <td class="small muted">${fmtDate(r.ends_at)}</td>
            <td class="small">${esc(r.method || '—')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : '<p class="small muted">لا اشتراكات مسجلة بعد.</p>'}
    </section>`;

  view.querySelector('#sub-grant').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const raw = view.querySelector('#sub-user').value.trim();
    const planId = view.querySelector('#sub-plan').value;
    const note = view.querySelector('#sub-note').value.trim();
    if (!raw) { toast('أدخل اسم المستخدم أو رقمه.', 'err'); return; }
    const body = /^\d+$/.test(raw) ? { userId: Number(raw), planId, note } : { username: raw, planId, note };
    btn.disabled = true;
    try {
      const res = await api('/api/admin/subscriptions/grant', { method: 'POST', body });
      toast(`تم تفعيل ${planName(res.subscription)} حتى ${fmtDate(res.subscription.ends_at)}.`, 'ok');
      await renderSubscriptions();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });

  const review = (row, action) => {
    openModal({
      title: action === 'approve' ? 'تفعيل الاشتراك' : 'رفض الطلب',
      body: `
        <p class="muted" style="margin-top:0">${esc(row.display_name || row.username)} — ${esc(planName(row))}
          (${formatNum(row.amount_sar)} ريال)</p>
        <div class="field">
          <label>ملاحظة للمستخدم (اختياري)</label>
          <input class="input" id="review-note" placeholder="${action === 'approve' ? 'تم تأكيد التحويل' : 'سبب الرفض'}" />
        </div>`,
      actions: [
        { label: 'إلغاء', class: 'btn-ghost' },
        {
          label: action === 'approve' ? 'تفعيل' : 'رفض',
          class: action === 'approve' ? 'btn-primary' : 'btn-danger',
          onClick: async ({ close }) => {
            const note = document.getElementById('review-note')?.value.trim() || '';
            try {
              await api(`/api/admin/subscriptions/${row.id}/${action}`, { method: 'POST', body: { note } });
              close();
              toast(action === 'approve' ? 'تم تفعيل الاشتراك.' : 'تم رفض الطلب.', 'ok');
              await renderSubscriptions();
            } catch (err) {
              toast(err.message, 'err');
              return false;
            }
          },
        },
      ],
    });
  };

  view.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', () => {
    const row = pending.find(r => r.id === Number(btn.dataset.approve));
    if (row) review(row, 'approve');
  }));
  view.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => {
    const row = pending.find(r => r.id === Number(btn.dataset.reject));
    if (row) review(row, 'reject');
  }));
}

/* ------------------------------------------------------------------ settings */
const SETTING_META = {
  xp_correct: { label: 'XP لكل إجابة صحيحة', type: 'number' },
  speed_seconds: { label: 'مدة تحدي السرعة (ثانية)', type: 'number' },
  daily_question_count: { label: 'عدد أسئلة التحدي اليومي', type: 'number' },
  game_version: { label: 'إصدار اللعبة', type: 'text' },
};

async function renderSettings() {
  const data = await api('/api/admin/settings');
  view.innerHTML = `
    <section class="card">
      <h3 class="section-title"><span class="ico">⚙️</span> إعدادات اللعبة</h3>
      <p class="small muted" style="margin-top:0">القيم القابلة للتعديل تؤثر على الجولات الجديدة فقط.</p>
      <div class="form-grid">
        ${data.settings.map(s => {
          const meta = SETTING_META[s.key];
          return `<div class="field">
            <label>${esc(meta?.label || s.key)} <span class="mono small muted">(${esc(s.key)})</span></label>
            <input class="input" data-setting="${esc(s.key)}" type="${meta?.type || 'text'}"
              value="${esc(s.value)}" ${meta ? '' : 'disabled'} />
          </div>`;
        }).join('')}
      </div>
      <button class="btn btn-primary" id="set-save">حفظ الإعدادات</button>
      <div class="notice" style="margin-top:16px;font-size:.8rem">
        إحصائيات المحتوى (عدد المصطلحات، الأسئلة، الترجمات قيد المراجعة) تُحدّث تلقائيًا من قاعدة البيانات
        بعد كل استيراد. الحقول المعطّلة للقراءة فقط.
      </div>
    </section>`;

  view.querySelector('#set-save').addEventListener('click', async e => {
    const payload = {};
    view.querySelectorAll('[data-setting]:not([disabled])').forEach(input => {
      payload[input.dataset.setting] = input.value;
    });
    e.currentTarget.disabled = true;
    try {
      const res = await api('/api/admin/settings', { method: 'PUT', body: payload });
      toast('تم حفظ الإعدادات.', 'ok');
      const map = Object.fromEntries(res.settings.map(s => [s.key, s.value]));
      view.querySelectorAll('[data-setting]').forEach(input => {
        if (map[input.dataset.setting] !== undefined) input.value = map[input.dataset.setting];
      });
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      e.currentTarget.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ utils */
function debounce(fn, ms = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

window.addEventListener('hashchange', () => {
  const hash = (location.hash || '').replace(/^#\/?/, '');
  if (TAB_KEYS.includes(hash) && hash !== state.tab) {
    state.tab = hash;
    paintTabs();
    renderTab();
  }
});

boot();
