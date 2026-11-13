// CODE QUEST — subscription plans, free-trial status and manual activation requests.
import { api, post } from '../api.js';
import {
  emptyState, esc, formatNum, isAr, pick, progressBar, sfx, skeleton, toast,
} from '../ui.js';

const STATUS = {
  pending: { ar: 'قيد المراجعة', en: 'Pending review', cls: 'gold' },
  active: { ar: 'نشط', en: 'Active', cls: 'green' },
  rejected: { ar: 'مرفوض', en: 'Rejected', cls: 'red' },
  expired: { ar: 'منتهي', en: 'Expired', cls: '' },
  cancelled: { ar: 'ملغي', en: 'Cancelled', cls: '' },
};

const METHODS = [
  { value: 'bank', ar: 'تحويل بنكي', en: 'Bank transfer' },
  { value: 'stcpay', ar: 'STC Pay', en: 'STC Pay' },
  { value: 'cash', ar: 'نقدًا / أخرى', en: 'Cash / other' },
];

function dateLabel(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function planPeriod(plan) {
  if (plan.id === 'monthly') return isAr() ? 'شهريًا · 30 يومًا' : 'per month · 30 days';
  if (plan.id === 'yearly') return isAr() ? 'سنويًا · 365 يومًا' : 'per year · 365 days';
  return isAr() ? `${plan.days} يومًا` : `${plan.days} days`;
}

export async function subscriptionView(root, ctx) {
  root.innerHTML = `<div class="card">${skeleton(2, 120)}</div>`;
  let data;
  try {
    data = await api('/api/subscription');
  } catch (err) {
    root.innerHTML = emptyState('💳', isAr() ? 'تعذر تحميل الاشتراك' : 'Could not load subscriptions', err.message);
    return;
  }

  const planName = plan => pick(plan?.name_ar, plan?.name_en) || '';

  function paint() {
    const state = data.state;
    const pending = data.pending;
    const history = data.history || [];
    const plans = data.plans || [];
    const selected = plans[0]?.id || 'monthly';

    const hero = state.isAdmin
      ? `<div class="notice ok" style="margin-bottom:14px">🛠️ ${isAr()
          ? 'حساب المدير يملك وصولًا كاملًا لكل أنماط اللعب بلا اشتراك.'
          : 'Admin accounts have full access to every game mode without a subscription.'}</div>`
      : state.active
        ? `<div class="notice ok" style="margin-bottom:14px">✅ ${isAr()
            ? `اشتراكك <b>${esc(planName(state.plan))}</b> نشط حتى <b>${esc(dateLabel(state.endsAt))}</b>. استمتع بكل الأنماط والعوالم واللعب الجماعي.`
            : `Your <b>${esc(planName(state.plan))}</b> is active until <b>${esc(dateLabel(state.endsAt))}</b>. Enjoy every mode, world and multiplayer match.`}</div>`
        : `<div class="notice" style="margin-bottom:14px">🎟️ ${isAr()
            ? `أنت في التجربة المجانية: <b>${formatNum(state.remaining)}</b> من <b>${formatNum(state.dailyLimit)}</b> إجابة متبقية اليوم.`
            : `You are on the free trial: <b>${formatNum(state.remaining)}</b> of <b>${formatNum(state.dailyLimit)}</b> answers left today.`}</div>
          ${progressBar(Math.round(((state.dailyLimit - state.remaining) / Math.max(1, state.dailyLimit)) * 100))}`;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">💳 ${isAr() ? 'الاشتراك' : 'Subscription'}</h1>
          <p class="muted">${isAr()
            ? 'افتح كل أنماط اللعب والعوالم والمراجعة الذكية واللعب الجماعي 1 ضد 1.'
            : 'Unlock every game mode, world, smart review and 1v1 multiplayer.'}</p>
        </div>
        ${state.active ? `<span class="pill green">✅ ${isAr() ? 'مشترك' : 'Subscribed'}</span>`
          : `<span class="pill gold">🎟️ ${isAr() ? 'تجربة مجانية' : 'Free trial'}</span>`}
      </div>

      ${hero}

      ${pending ? `<div class="notice" style="margin-bottom:18px">
        ⏳ ${isAr()
          ? `طلبك للخطة <b>${esc(planName(plans.find(p => p.id === pending.plan_id) || { name_ar: pending.plan_id }))}</b> أُرسل في ${esc(dateLabel(pending.requested_at))} وهو قيد مراجعة الإدارة.`
          : `Your request for <b>${esc(pending.plan_id)}</b> was sent on ${esc(dateLabel(pending.requested_at))} and is waiting for admin review.`}
      </div>` : ''}

      <div class="plan-grid">
        ${plans.map(plan => {
          const featured = plan.id === 'yearly';
          return `<div class="card plan-card ${featured ? 'featured' : ''}">
            ${featured ? `<span class="pill gold plan-ribbon">${isAr() ? 'الأفضل قيمة' : 'Best value'}</span>` : ''}
            <div class="plan-icon">${featured ? '👑' : '📅'}</div>
            <h3>${esc(planName(plan))}</h3>
            <div class="plan-price"><b>${formatNum(plan.price_sar)}</b><span>${isAr() ? 'ريال' : 'SAR'}</span></div>
            <div class="small muted">${esc(planPeriod(plan))}</div>
            <ul class="plan-features">
              <li>✅ ${isAr() ? 'كل أنماط اللعب الثمانية' : 'All eight game modes'}</li>
              <li>✅ ${isAr() ? 'كل العوالم والتخصصات' : 'Every world and specialisation'}</li>
              <li>✅ ${isAr() ? 'المراجعة الذكية والزعماء' : 'Smart review and boss battles'}</li>
              <li>✅ ${isAr() ? 'اللعب الجماعي 1 ضد 1' : '1v1 multiplayer rooms'}</li>
              <li>✅ ${isAr() ? 'بلا حد يومي للإجابات' : 'No daily answer limit'}</li>
            </ul>
            <button class="btn ${featured ? 'btn-gold' : 'btn-primary'} btn-block" data-plan="${esc(plan.id)}"
              ${pending ? 'disabled' : ''}>
              ${state.active ? (isAr() ? 'تجديد الاشتراك' : 'Renew plan') : (isAr() ? 'اطلب هذه الخطة' : 'Request this plan')}
            </button>
            <div class="small muted center" style="margin-top:8px">${isAr() ? 'الدفع يدوي — تفعيل بعد مراجعة الإدارة' : 'Manual payment — activated after admin review'}</div>
          </div>`;
        }).join('')}
      </div>

      <section class="card" style="margin-top:20px" id="request-card">
        <h3 class="section-title"><span class="ico">🧾</span> ${isAr() ? 'إرسال طلب تفعيل' : 'Send an activation request'}</h3>
        <p class="small muted">${isAr()
          ? 'حوّل مبلغ الاشتراك إلى إدارة اللعبة (تحويل بنكي أو STC Pay)، ثم أدخل رقم عملية التحويل هنا. سيراجع الأدمن الطلب ويفعّل اشتراكك.'
          : 'Transfer the plan amount to the game administration (bank transfer or STC Pay), then enter the transfer reference here. An admin will review and activate your subscription.'}</p>
        <form id="sub-form" style="margin-top:14px">
          <div class="row" style="gap:12px;align-items:flex-start;flex-wrap:wrap">
            <div class="field" style="flex:1;min-width:180px">
              <label for="sub-plan">${isAr() ? 'الخطة' : 'Plan'}</label>
              <select class="select" id="sub-plan" ${pending ? 'disabled' : ''}>
                ${plans.map(plan => `<option value="${esc(plan.id)}" ${plan.id === selected ? 'selected' : ''}>
                  ${esc(planName(plan))} — ${formatNum(plan.price_sar)} ${isAr() ? 'ريال' : 'SAR'}
                </option>`).join('')}
              </select>
            </div>
            <div class="field" style="flex:1;min-width:180px">
              <label for="sub-method">${isAr() ? 'طريقة الدفع' : 'Payment method'}</label>
              <select class="select" id="sub-method" ${pending ? 'disabled' : ''}>
                ${METHODS.map(m => `<option value="${m.value}">${esc(pick(m.ar, m.en))}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label for="sub-ref">${isAr() ? 'رقم عملية التحويل / المرجع' : 'Transfer reference'}</label>
            <input class="input" id="sub-ref" maxlength="120" dir="ltr" placeholder="TRX-123456"
              ${pending ? 'disabled' : ''} />
          </div>
          <div class="field">
            <label for="sub-note">${isAr() ? 'ملاحظة (اختياري)' : 'Note (optional)'}</label>
            <textarea class="textarea" id="sub-note" rows="2" maxlength="300" ${pending ? 'disabled' : ''}></textarea>
          </div>
          <button class="btn btn-primary" type="submit" id="sub-submit" ${pending ? 'disabled' : ''}>
            ${pending ? (isAr() ? 'الطلب قيد المراجعة' : 'Request under review') : (isAr() ? 'إرسال الطلب' : 'Send request')}
          </button>
        </form>
      </section>

      <section class="card" style="margin-top:20px">
        <h3 class="section-title"><span class="ico">🕘</span> ${isAr() ? 'سجل الاشتراكات' : 'Subscription history'}</h3>
        ${history.length ? `<div class="table-wrap"><table class="data">
          <thead><tr>
            <th>${isAr() ? 'الخطة' : 'Plan'}</th>
            <th>${isAr() ? 'المبلغ' : 'Amount'}</th>
            <th>${isAr() ? 'الحالة' : 'Status'}</th>
            <th>${isAr() ? 'تاريخ الطلب' : 'Requested'}</th>
            <th>${isAr() ? 'ينتهي' : 'Ends'}</th>
          </tr></thead>
          <tbody>${history.map(row => {
            const st = STATUS[row.status] || { ar: row.status, en: row.status, cls: '' };
            return `<tr>
              <td>${esc(planName(row) || row.plan_id)}</td>
              <td>${formatNum(row.amount_sar)} ${isAr() ? 'ريال' : 'SAR'}</td>
              <td><span class="pill ${st.cls}">${esc(pick(st.ar, st.en))}</span></td>
              <td class="small muted">${esc(dateLabel(row.requested_at))}</td>
              <td class="small muted">${row.ends_at ? esc(dateLabel(row.ends_at)) : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>`
          : `<p class="small muted">${isAr() ? 'لا توجد طلبات اشتراك بعد.' : 'No subscription requests yet.'}</p>`}
      </section>`;

    root.querySelectorAll('[data-plan]').forEach(btn => {
      btn.addEventListener('click', () => {
        const select = root.querySelector('#sub-plan');
        if (select) select.value = btn.dataset.plan;
        sfx.click();
        root.querySelector('#request-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    const form = root.querySelector('#sub-form');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const submit = root.querySelector('#sub-submit');
      submit.disabled = true;
      try {
        await post('/api/subscription/request', {
          planId: root.querySelector('#sub-plan').value,
          method: root.querySelector('#sub-method').value,
          reference: root.querySelector('#sub-ref').value.trim(),
          note: root.querySelector('#sub-note').value.trim(),
        });
        toast(isAr() ? 'تم إرسال الطلب. ستتم المراجعة قريبًا.' : 'Request sent. It will be reviewed shortly.', 'ok', 3600);
        const fresh = await api('/api/subscription');
        data = fresh;
        paint();
      } catch (err) {
        toast(err.message, 'err', 4200);
        submit.disabled = false;
      }
    });
  }

  paint();
  return { destroy: () => {} };
}
