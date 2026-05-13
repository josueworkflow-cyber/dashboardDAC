/* ═══════════════════════════════════════════════
   auth.js — Autenticação do frontend
   (token, login, check, fetch autenticado, roles)
   ═══════════════════════════════════════════════ */

let AUTH_TOKEN = sessionStorage.getItem('dac_token') || '';

// Realiza login e salva o token + role em sessão
async function doLogin() {
  const user = document.getElementById('loginUser').value;
  const pass = document.getElementById('loginPass').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');

  btn.textContent = 'Entrando...';
  btn.disabled = true;
  err.style.display = 'none';

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass })
    });
    const data = await res.json();
    if (data.success) {
      AUTH_TOKEN = data.token;
      sessionStorage.setItem('dac_token', AUTH_TOKEN);
      sessionStorage.setItem('dac_role', data.role || 'gestor');
      document.getElementById('loginOverlay').style.display = 'none';
      applyRoleRestrictions();
      if (typeof startAutoRefresh === 'function') startAutoRefresh();
      else loadData();
    } else {
      err.style.display = 'block';
    }
  } catch (e) {
    err.textContent = 'Erro de conexão';
    err.style.display = 'block';
  }

  btn.textContent = 'Entrar';
  btn.disabled = false;
}

// Realiza logout
function doLogout() {
  sessionStorage.removeItem('dac_token');
  sessionStorage.removeItem('dac_role');
  AUTH_TOKEN = '';
  if (typeof stopAutoRefresh === 'function') stopAutoRefresh();
  document.getElementById('loginPass').value = '';
  document.getElementById('loginOverlay').style.display = 'flex';
}

// Verifica se o token atual ainda é válido
async function checkAuth() {
  if (!AUTH_TOKEN) {
    console.log('ℹ️ Nenhuma sessão encontrada. Aguardando login...');
    return;
  }
  
  console.log('🔍 Verificando validade da sessão...');
  try {
    const r = await fetch('/auth/check', {
      headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN }
    });
    if (r.ok) {
      const data = await r.json();
      console.log('✅ Sessão ativa:', data.role);
      if (data.role) {
        sessionStorage.setItem('dac_role', data.role);
      }
      document.getElementById('loginOverlay').style.display = 'none';
      applyRoleRestrictions();
      if (typeof startAutoRefresh === 'function') startAutoRefresh();
      else loadData();
    } else {
      console.warn('⚠️ Sessão expirada ou inválida. Limpando dados...');
      sessionStorage.removeItem('dac_token');
      sessionStorage.removeItem('dac_role');
      AUTH_TOKEN = '';
    }
  } catch (e) {
    console.error('❌ Erro ao verificar autenticação:', e.message);
  }
}

// Fetch com header de autorização e sem cache
function authFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    'Authorization': 'Bearer ' + AUTH_TOKEN,
    'Content-Type': 'application/json'
  };
  return fetch(url, { 
    ...options,
    headers,
    cache: 'no-store'
  });
}

// ─── Event listeners do formulário de login ───
document.getElementById('loginUser').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('loginPass').focus();
});
document.getElementById('loginPass').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

// Verifica autenticação após o carregamento completo dos scripts
window.addEventListener('load', checkAuth);
