// CODE QUEST — authentication screen (login / register).
import { api, setCsrf } from '../api.js';
import { toast, esc, t, isAr, pick } from '../ui.js';

export function renderAuth(root, { onSuccess }) {
  root.classList.remove('hidden');
  let mode = 'login';

  const paint = () => {
    root.innerHTML = `
      <div class="auth-wrap">
        <section class="auth-hero card glow">
          <div class="row" style="gap:14px">
            <img src="/assets/logo.svg" alt="" class="brand-logo" style="width:64px;height:64px" />
            <div class="brand-text">
              <strong style="font-size:1.4rem">CODE<em>QUEST</em></strong>
              <small>LEARN THE LANGUAGE OF PROGRAMMERS</small>
            </div>
          </div>
          <h1>${isAr() ? 'أتقن <em>مصطلحات البرمجة</em><br>باللغة الإنجليزية' : 'Master <em>programming terms</em><br>in English'}</h1>
          <p>${isAr()
            ? 'لعبة تعليمية تفاعلية مبنية على قاموس تقني موسوعي: 1000 مصطلح، 50 تخصصًا، 15 عالمًا، و8 أنماط لعب — مع مراجعة ذكية وتقدّم محفوظ.'
            : 'An interactive learning game built on a technical encyclopedia: 1,000 terms, 50 specialisations, 15 worlds and 8 game modes — with smart review and saved progress.'}</p>
          <div class="feat">
            <span class="pill blue">🧩 ${isAr() ? '8 أنماط لعب' : '8 game modes'}</span>
            <span class="pill green">🗺️ ${isAr() ? '15 عالمًا' : '15 worlds'}</span>
            <span class="pill gold">🎖️ ${isAr() ? 'إنجازات ورتب' : 'Ranks & badges'}</span>
            <span class="pill purple">⚖️ ${isAr() ? 'مصطلحات متشابهة' : 'Similar terms'}</span>
          </div>
        </section>

        <section class="auth-card card">
          <div class="auth-tabs">
            <button data-tab="login" class="${mode === 'login' ? 'active' : ''}">${t('login')}</button>
            <button data-tab="register" class="${mode === 'register' ? 'active' : ''}">${t('register')}</button>
          </div>
          <div id="auth-error" class="auth-error hidden"></div>
          <form id="auth-form" autocomplete="on" novalidate>
            ${mode === 'register' ? `
              <div class="field">
                <label for="f-display">${isAr() ? 'الاسم المعروض' : 'Display name'}</label>
                <input class="input" id="f-display" name="displayName" maxlength="40" placeholder="${isAr() ? 'اسمك في اللعبة' : 'Your in-game name'}" />
              </div>` : ''}
            <div class="field">
              <label for="f-user">${mode === 'login' ? (isAr() ? 'اسم المستخدم أو البريد' : 'Username or email') : (isAr() ? 'اسم المستخدم' : 'Username')}</label>
              <input class="input" id="f-user" name="user" required minlength="3" maxlength="40" spellcheck="false" dir="ltr"
                     placeholder="programmer" />
            </div>
            ${mode === 'register' ? `
              <div class="field">
                <label for="f-email">${isAr() ? 'البريد الإلكتروني' : 'Email'}</label>
                <input class="input" id="f-email" name="email" type="email" dir="ltr" placeholder="you@example.com" />
              </div>` : ''}
            <div class="field">
              <label for="f-pass">${isAr() ? 'كلمة المرور' : 'Password'}</label>
              <div style="position:relative">
                <input class="input" id="f-pass" name="password" type="password" required minlength="8"
                       autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" dir="ltr" placeholder="••••••••" />
                <button type="button" class="icon-btn" id="toggle-pass" style="position:absolute;inset-inline-end:6px;top:50%;transform:translateY(-50%);width:32px;height:32px">👁️</button>
              </div>
            </div>
            <button class="btn btn-primary btn-block btn-lg" type="submit" id="auth-submit">
              ${mode === 'login' ? t('login') : t('register')}
            </button>
          </form>
          <p class="small muted center" style="margin:14px 0 0">
            ${isAr() ? 'حساب تجريبي للمدير: <span class="mono">admin</span> / <span class="mono">CodeQuest!2026</span>' : 'Admin demo: <span class="mono">admin</span> / <span class="mono">CodeQuest!2026</span>'}
          </p>
        </section>
      </div>`;
    bind();
  };

  const showError = message => {
    const box = root.querySelector('#auth-error');
    if (!box) return;
    box.textContent = message;
    box.classList.remove('hidden');
  };

  const bind = () => {
    root.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { mode = btn.dataset.tab; paint(); });
    });
    const pass = root.querySelector('#f-pass');
    root.querySelector('#toggle-pass')?.addEventListener('click', () => {
      pass.type = pass.type === 'password' ? 'text' : 'password';
    });
    const form = root.querySelector('#auth-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const submit = root.querySelector('#auth-submit');
      submit.disabled = true;
      const data = new FormData(form);
      const user = String(data.get('user') || '').trim();
      const password = String(data.get('password') || '');
      try {
        if (mode === 'login') {
          const res = await api('/api/auth/login', { method: 'POST', body: { login: user, password } });
          setCsrf(res.csrf);
          root.classList.add('hidden');
          toast(isAr() ? `مرحبًا ${res.user.profile.display_name}!` : `Welcome ${res.user.profile.display_name}!`, 'ok');
          onSuccess(res.user);
        } else {
          const displayName = String(data.get('displayName') || '').trim();
          const email = String(data.get('email') || '').trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError(isAr() ? 'أدخل بريدًا إلكترونيًا صالحًا.' : 'Enter a valid email address.');
            submit.disabled = false;
            return;
          }
          if (password.length < 8) {
            showError(isAr() ? 'كلمة المرور 8 أحرف على الأقل.' : 'Password must be at least 8 characters.');
            submit.disabled = false;
            return;
          }
          const res = await api('/api/auth/register', {
            method: 'POST', body: { username: user, email, password, displayName },
          });
          setCsrf(res.csrf);
          root.classList.add('hidden');
          toast(isAr() ? 'تم إنشاء حسابك! رحلتك تبدأ الآن.' : 'Account created! Your journey begins.', 'gold');
          onSuccess(res.user);
        }
      } catch (err) {
        showError(err.message);
        submit.disabled = false;
        pass.classList.add('shake');
        setTimeout(() => pass.classList.remove('shake'), 400);
      }
    });
  };

  paint();
  return { destroy: () => { root.innerHTML = ''; } };
}
