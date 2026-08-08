/* ═══════════════════════════════════════════════
   nav.js — Navegação entre páginas,
   controles de período dos filtros,
   e restrições de acesso por role
   ═══════════════════════════════════════════════ */

// ─── Navegação principal ───

function goPage(id, el) {
  closeMob();
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.nl').forEach(n => n.classList.remove('on'));
  document.getElementById('p-' + id).classList.add('on');
  if (el) el.classList.add('on');

  const titles = {
    main: 'GRÁFICOS COMPLEMENTARES',
    monitoramento: 'FINANCEIRO',
    'graficos-estoque': 'ESTOQUE',
    'movimentacoes-financeiras': 'MOVIMENTAÇÕES FINANCEIRAS',
    gestao: 'GESTÃO DE DADOS',
    'movimentacao-estoque': 'MOVIMENTAÇÃO DE ESTOQUE',
    estoque: 'GESTÃO DE ESTOQUE',
    messenger: 'MESSENGER',
    comercial: 'FUNIL DE PEDIDOS',
    'historico-pedidos': 'HISTÓRICO DE PEDIDOS'
  };
  document.getElementById('pgTitle').textContent = titles[id] || id.toUpperCase();

  if (id === 'gestao') initGestao();
  if (id === 'monitoramento') initMonitoramento();
  if (id === 'estoque') initEstoque();
  if (id === 'graficos-estoque') initGraficosEstoque();
  if (id === 'movimentacao-estoque') initMovimentacaoEstoque();
  if (id === 'movimentacoes-financeiras') initMovimentacoesFinanceiras();
  if (id === 'messenger') initMessengerPage();
  if (id === 'comercial') initComercial();
  if (id === 'historico-pedidos') initHistoricoPedidos();
}

function toggleMob() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('mobOverlay').classList.toggle('open');
}

function closeMob() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('mobOverlay').classList.remove('open');
}

// ─── Filtros de período — Entradas e Saídas ───

function setEntPeriod(p, btn) {
  const now = new Date();
  let from = '', to = '';
  if (p === 'hoje') {
    from = to = toIso(now);
  } else if (p === '7d') {
    const f = new Date(now); f.setDate(f.getDate() - 6);
    from = toIso(f); to = toIso(now);
  } else if (p === '15d') {
    const f = new Date(now); f.setDate(f.getDate() - 14);
    from = toIso(f); to = toIso(now);
  } else if (p === '30d') {
    const f = new Date(now); f.setDate(f.getDate() - 29);
    from = toIso(f); to = toIso(now);
  }
  document.getElementById('eDateFrom').value = from;
  document.getElementById('eDateTo').value = to;
  document.querySelectorAll('.ent-period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEntradas();
}

function setSaiPeriod(p, btn) {
  const now = new Date();
  let from = '', to = '';
  if (p === 'hoje') {
    from = to = toIso(now);
  } else if (p === '7d') {
    const f = new Date(now); f.setDate(f.getDate() - 6);
    from = toIso(f); to = toIso(now);
  } else if (p === '15d') {
    const f = new Date(now); f.setDate(f.getDate() - 14);
    from = toIso(f); to = toIso(now);
  } else if (p === '30d') {
    const f = new Date(now); f.setDate(f.getDate() - 29);
    from = toIso(f); to = toIso(now);
  }
  document.getElementById('sDateFrom').value = from;
  document.getElementById('sDateTo').value = to;
  document.querySelectorAll('.sai-period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderSaidas();
}

// ─── Restrições por Role ───

function applyRoleRestrictions() {
  const role = sessionStorage.getItem('dac_role') || 'gestor';
  const navLinks = document.querySelectorAll('.nl');
  const groups = document.querySelectorAll('.ng');

  // Reset display
  navLinks.forEach(link => link.style.display = 'none');
  groups.forEach(g => g.style.display = 'none');

  if (role === 'operador') {
    // Perfil Financeiro: Movimentações Financeiras e Gestão de Dados
    navLinks.forEach(link => {
      const text = link.textContent.trim();
      if (text.includes('Movimentações Financeiras') || text.includes('Gestão de Dados')) {
        link.style.display = 'flex';
      }
    });
    // Mostrar grupo Financeiro
    groups.forEach(g => {
      if (g.textContent.trim() === 'Financeiro') g.style.display = 'block';
    });

    const activeLink = document.querySelector('.nl.on');
    if (!activeLink || activeLink.style.display === 'none') {
      const target = [...navLinks].find(l => l.textContent.trim().includes('Movimentações Financeiras'));
      goPage('movimentacoes-financeiras', target);
    }

  } else if (role === 'estoque') {
    // Perfil Estoque: Funil + Movimentação de Estoque + Gestão de Estoque
    navLinks.forEach(link => {
      const text = link.textContent.trim();
      if (text.includes('Movimentação de Estoque') || text.includes('Gestão de Estoque') ||
          text.includes('Funil')) {
        link.style.display = 'flex';
      }
    });
    // Mostrar apenas grupo Estoque
    groups.forEach(g => {
      if (g.textContent.trim() === 'Estoque') g.style.display = 'block';
    });

    const activeLink = document.querySelector('.nl.on');
    if (!activeLink || activeLink.style.display === 'none') {
      const target = [...navLinks].find(l => l.textContent.trim().includes('Funil'));
      goPage('comercial', target);
    }

  } else if (role === 'comercial') {
    // Perfil Comercial: Funil + Histórico
    navLinks.forEach(link => {
      const text = link.textContent.trim();
      if (text.includes('Funil') || text.includes('Histórico de Pedidos')) {
        link.style.display = 'flex';
      }
    });
    groups.forEach(g => {
      if (g.textContent.trim() === 'Comercial') g.style.display = 'block';
    });

    const activeLink = document.querySelector('.nl.on');
    if (!activeLink || activeLink.style.display === 'none') {
      const target = [...navLinks].find(l => l.textContent.trim().includes('Funil'));
      goPage('comercial', target);
    }

  } else if (role === 'camila') {
    // Perfil Camila: Monitoramento + Financeiro + Comercial
    navLinks.forEach(link => {
      const text = link.textContent.trim();
      const pageAttr = link.getAttribute('onclick') || '';
      if (pageAttr.includes("'monitoramento'") || pageAttr.includes("'main'") ||
          text.includes('Movimentações Financeiras') || text.includes('Gestão de Dados') ||
          text.includes('Funil') || text.includes('Histórico de Pedidos')) {
        link.style.display = 'flex';
      }
    });
    groups.forEach(g => {
      const text = g.textContent.trim();
      if (text === 'Monitoramento' || text === 'Financeiro' || text === 'Comercial') {
        g.style.display = 'block';
      }
    });

    const activeLink = document.querySelector('.nl.on');
    if (!activeLink || activeLink.style.display === 'none') {
      const target = [...navLinks].find(l => l.getAttribute('onclick')?.includes("'monitoramento'"));
      goPage('monitoramento', target);
    }

  } else {
    // Gestor: Tudo
    navLinks.forEach(link => link.style.display = 'flex');
    groups.forEach(g => g.style.display = 'block');
  }
}
// ─── TV Mode Toggle ───

function toggleTvMode() {
  const body = document.body;
  const btn = document.getElementById('tvModeBtn');
  const isTv = body.classList.toggle('tv-mode');
  
  if (btn) {
    if (isTv) {
      btn.classList.add('active');
      btn.style.borderColor = 'var(--red)';
      btn.style.color = '#fff';
      btn.style.background = 'var(--red)';
    } else {
      btn.classList.remove('active');
      btn.style.borderColor = 'var(--border)';
      btn.style.color = 'var(--muted)';
      btn.style.background = 'rgba(255,255,255,0.03)';
    }
  }
  
  localStorage.setItem('dac_tv_mode', isTv ? 'on' : 'off');
  
  // Forçar redimensionamento dos gráficos e KPIs
  setTimeout(() => {
    if (typeof renderKpis === 'function') renderKpis();
    if (typeof renderIndicadores === 'function') renderIndicadores();
    if (typeof renderContaSparklines === 'function') renderContaSparklines();
    if (window.Chart) {
      Object.values(Chart.instances).forEach(chart => chart.resize());
    }
  }, 100);
}

function initTvMode() {
  const saved = localStorage.getItem('dac_tv_mode');
  if (saved === 'on') {
    document.body.classList.add('tv-mode');
    const btn = document.getElementById('tvModeBtn');
    if (btn) {
      btn.classList.add('active');
      btn.style.borderColor = 'var(--red)';
      btn.style.color = '#fff';
      btn.style.background = 'var(--red)';
    }
  }
}

// Inicializar após o carregamento
window.addEventListener('load', initTvMode);

let messengerLoaded = false;

async function initMessengerPage() {
  if (!messengerLoaded) {
    try {
      const resp = await fetch('/pages/messenger.html');
      const html = await resp.text();
      document.getElementById('messenger-content').innerHTML = html;
      document.getElementById('messenger-content').parentElement.style.display = '';
      messengerLoaded = true;
    } catch (err) {
      console.error('Erro ao carregar messenger:', err);
    }
  }
  if (typeof initMessenger === 'function') initMessenger();
}
