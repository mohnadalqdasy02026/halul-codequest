// CODE QUEST — typed-ish fetch wrapper with CSRF + error handling.

let csrfToken = null;

export function setCsrf(value) { csrfToken = value || null; }
export function getCsrf() { return csrfToken; }

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function api(path, options = {}) {
  const { method = 'GET', body, raw, headers = {}, signal } = options;
  const h = { Accept: 'application/json', ...headers };
  let payload;

  if (raw !== undefined) payload = raw;
  else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (!['GET', 'HEAD'].includes(method) && csrfToken) h['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(path, { method, headers: h, body: payload, credentials: 'same-origin', signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('تعذر الاتصال بالخادم. تحقق من الشبكة.', 0, null);
  }

  const type = res.headers.get('content-type') || '';
  let data = null;
  if (type.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  } else {
    data = await res.text().catch(() => '');
  }

  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent('cq:unauthorized'));
    if (res.status === 402 && data?.code === 'SUBSCRIPTION_REQUIRED') {
      window.dispatchEvent(new CustomEvent('cq:subscription-required', { detail: data }));
    }
    const message = (data && data.error) || `حدث خطأ (${res.status}).`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

export const get = path => api(path);
export const post = (path, body) => api(path, { method: 'POST', body: body ?? {} });
export const put = (path, body) => api(path, { method: 'PUT', body: body ?? {} });
export const del = path => api(path, { method: 'DELETE' });

export function uploadXlsx(path, file) {
  return api(path, {
    method: 'POST',
    raw: file,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'X-Filename': file.name,
    },
  });
}

export async function downloadFile(path, fallbackName = 'export.xlsx') {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
  });
  if (!res.ok) {
    let message = `فشل التنزيل (${res.status}).`;
    try { const d = await res.json(); if (d?.error) message = d.error; } catch { /* binary */ }
    throw new ApiError(message, res.status, null);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const name = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}
