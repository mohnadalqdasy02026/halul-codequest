// CODE QUEST — subscription plans, trial allowance and manual activation.
import { all, addDaysIso, get, nowIso, run } from './db.js';

/** Answers a non-subscriber may submit per calendar day. */
export const FREE_DAILY_ANSWERS = 10;

/** Prices are fixed by the product owner: 100 SAR / month, 1,000 SAR / year. */
export const SUBSCRIPTION_PLANS = [
  {
    id: 'monthly', name_ar: 'الاشتراك الشهري', name_en: 'Monthly plan',
    price_sar: 100, days: 30, sort: 1,
  },
  {
    id: 'yearly', name_ar: 'الاشتراك السنوي', name_en: 'Yearly plan',
    price_sar: 1000, days: 365, sort: 2,
  },
];

export function ensureSubscriptionPlans() {
  for (const plan of SUBSCRIPTION_PLANS) {
    run(
      `INSERT INTO subscription_plans(id, name_ar, name_en, price_sar, days, sort, active)
       VALUES(?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         name_ar = excluded.name_ar,
         name_en = excluded.name_en,
         price_sar = excluded.price_sar,
         days = excluded.days,
         sort = excluded.sort`,
      plan.id, plan.name_ar, plan.name_en, plan.price_sar, plan.days, plan.sort
    );
  }
}

export function listPlans() {
  return all('SELECT * FROM subscription_plans WHERE active = 1 ORDER BY sort');
}

export function planById(planId) {
  return get('SELECT * FROM subscription_plans WHERE id = ? AND active = 1', String(planId || ''));
}

export function isAdmin(userId) {
  return get('SELECT role FROM users WHERE id = ?', userId)?.role === 'admin';
}

/** Mark active subscriptions whose end date has passed. */
export function expireSubscriptions() {
  run(
    "UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= ?",
    nowIso()
  );
}

/** Raw active subscription row for a user (admins are handled separately). */
export function activeSubscription(userId) {
  return get(
    `SELECT s.*, p.name_ar, p.name_en, p.price_sar
       FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.user_id = ? AND s.status = 'active' AND s.ends_at > ?
      ORDER BY s.ends_at DESC LIMIT 1`,
    userId, nowIso()
  );
}

/** Start of the current local day as an ISO string (answers are stored in UTC). */
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function answersToday(userId) {
  return get(
    'SELECT COUNT(*) AS c FROM user_answers WHERE user_id = ? AND created_at >= ?',
    userId, startOfToday()
  )?.c || 0;
}

export function pendingRequest(userId) {
  return get(
    "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'pending' ORDER BY requested_at DESC LIMIT 1",
    userId
  );
}

/**
 * Current access state for a player.
 * `remaining` is null for subscribers/admins (unlimited).
 */
export function subscriptionState(userId) {
  expireSubscriptions();
  const admin = isAdmin(userId);
  const usedToday = answersToday(userId);
  if (admin) {
    return {
      active: true, isAdmin: true, trial: false,
      plan: { id: 'admin', name_ar: 'حساب مدير', name_en: 'Admin account', price_sar: 0, days: 0 },
      endsAt: null, usedToday, dailyLimit: null, remaining: null,
    };
  }
  const sub = activeSubscription(userId);
  return {
    active: !!sub,
    isAdmin: false,
    trial: !sub,
    plan: sub || null,
    endsAt: sub?.ends_at || null,
    usedToday,
    dailyLimit: FREE_DAILY_ANSWERS,
    remaining: sub ? null : Math.max(0, FREE_DAILY_ANSWERS - usedToday),
  };
}

export function requestSubscription(userId, planId, { method = '', reference = '', note = '' } = {}) {
  const plan = planById(planId);
  if (!plan) return { error: 'plan_not_found' };
  const pending = pendingRequest(userId);
  if (pending) return { error: 'already_pending', pending };
  const info = run(
    `INSERT INTO subscriptions(user_id, plan_id, amount_sar, days, status, method, reference, note, requested_at)
     VALUES(?,?,?,?,'pending',?,?,?,?)`,
    userId, plan.id, plan.price_sar, plan.days,
    String(method || '').slice(0, 40) || null,
    String(reference || '').slice(0, 120) || null,
    String(note || '').slice(0, 300) || null,
    nowIso()
  );
  return { subscription: get('SELECT * FROM subscriptions WHERE id = ?', Number(info.lastInsertRowid)) };
}

/** Activate a pending request. Consecutive plans stack instead of overlapping. */
export function approveRequest(requestId, adminId, adminNote = '') {
  const row = get('SELECT * FROM subscriptions WHERE id = ?', Number(requestId));
  if (!row || row.status !== 'pending') return null;
  const now = nowIso();
  const latest = get(
    `SELECT ends_at FROM subscriptions
      WHERE user_id = ? AND id <> ? AND status = 'active' AND ends_at > ?
      ORDER BY ends_at DESC LIMIT 1`,
    row.user_id, row.id, now
  );
  const start = latest?.ends_at && latest.ends_at > now ? latest.ends_at : now;
  const end = addDaysIso(start, row.days);
  run(
    `UPDATE subscriptions
        SET status = 'active', starts_at = ?, ends_at = ?, reviewed_at = ?,
            reviewed_by = ?, admin_note = ?
      WHERE id = ?`,
    start, end, now, adminId, String(adminNote || '').slice(0, 300) || null, row.id
  );
  return get('SELECT * FROM subscriptions WHERE id = ?', row.id);
}

export function rejectRequest(requestId, adminId, adminNote = '') {
  const row = get('SELECT * FROM subscriptions WHERE id = ?', Number(requestId));
  if (!row || row.status !== 'pending') return null;
  run(
    `UPDATE subscriptions SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, admin_note = ?
      WHERE id = ?`,
    nowIso(), adminId, String(adminNote || '').slice(0, 300) || null, row.id
  );
  return get('SELECT * FROM subscriptions WHERE id = ?', row.id);
}

/** Directly grant (or renew) a plan, bypassing the request queue. */
export function grantSubscription(userId, planId, { adminId = null, method = 'admin', note = '' } = {}) {
  const plan = planById(planId);
  if (!plan) return null;
  const now = nowIso();
  const latest = get(
    `SELECT ends_at FROM subscriptions
      WHERE user_id = ? AND status = 'active' AND ends_at > ?
      ORDER BY ends_at DESC LIMIT 1`,
    userId, now
  );
  const start = latest?.ends_at && latest.ends_at > now ? latest.ends_at : now;
  const end = addDaysIso(start, plan.days);
  const info = run(
    `INSERT INTO subscriptions(user_id, plan_id, amount_sar, days, status, method, note,
                               requested_at, reviewed_at, reviewed_by, starts_at, ends_at)
     VALUES(?,?,?,?,'active',?,?,?,?,?,?,?)`,
    userId, plan.id, plan.price_sar, plan.days, String(method).slice(0, 40),
    String(note || '').slice(0, 300) || null, now, now, adminId, start, end
  );
  return get('SELECT * FROM subscriptions WHERE id = ?', Number(info.lastInsertRowid));
}

export function subscriptionHistory(userId, limit = 20) {
  return all(
    `SELECT s.*, p.name_ar, p.name_en FROM subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.user_id = ? ORDER BY s.requested_at DESC LIMIT ?`,
    userId, limit
  );
}

export function adminSubscriptionQueue(limit = 100) {
  const pending = all(
    `SELECT s.*, p.name_ar, p.name_en, u.username, u.email, pr.display_name
       FROM subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_profiles pr ON pr.user_id = s.user_id
      WHERE s.status = 'pending' ORDER BY s.requested_at ASC LIMIT ?`, limit
  );
  const recent = all(
    `SELECT s.*, p.name_ar, p.name_en, u.username, u.email, pr.display_name
       FROM subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_profiles pr ON pr.user_id = s.user_id
      WHERE s.status <> 'pending' ORDER BY s.requested_at DESC LIMIT ?`, limit
  );
  const counts = {
    pending: get("SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'pending'").c,
    active: get("SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'active' AND ends_at > ?", nowIso()).c,
    revenue: get("SELECT COALESCE(SUM(amount_sar),0) AS s FROM subscriptions WHERE status = 'active'").s,
  };
  return { pending, recent, counts };
}
