/* ═══════════════════════════════════════════════
   api.js — Comunicação com o servidor
   (estado global ENT/SAI, loadData, renderAll)
   ═══════════════════════════════════════════════ */

const API = window.location.origin + '/api';

// Carrega todos os dados do servidor e atualiza a UI
async function loadData() {
  const dot = document.getElementById('gsd');
  const lbl = document.getElementById('gslbl');

  try {
    dot.className = 'gsdot loading';
    lbl.textContent = 'Sincronizando...';

    const res = await authFetch(API + '/all');

    if (res.status === 401) {
      sessionStorage.removeItem('dac_token');
      AUTH_TOKEN = '';
      document.getElementById('loginOverlay').style.display = 'flex';
      return;
    }

    const data = await res.json();
    ENT = data.entradas || [];
    SAI = data.saidas || [];
    ESTQ = data.estoque || [];
    // Comercial = itens do estoque que vieram do funil (têm ref_orcamento)
    COMERCIAL = ESTQ.filter(r => r.ref_orcamento);

    dot.className = 'gsdot';
    lbl.textContent = 'Conectado';

    document.getElementById('lsync').textContent = new Date().toLocaleString('pt-BR', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
    });
    document.getElementById('gsft').innerHTML =
      '⬤ <span style="color:var(--muted)">BD conectado</span>';

    renderAll();
  } catch (e) {
    console.error('❌ Erro no carregamento/renderização dos dados:', e);
    dot.className = 'gsdot err';
    lbl.textContent = 'Erro';
  }
}

function safeRun(fn, name) {
  try {
    if (typeof fn === 'function') fn();
  } catch (err) {
    console.error(`❌ Erro em ${name || 'renderAll'}:`, err);
  }
}

// Dispara todas as funções de renderização
function renderAll() {
  safeRun(renderKpis, 'renderKpis');
  safeRun(populateFilters, 'populateFilters');
  safeRun(renderEntradas, 'renderEntradas');
  safeRun(renderSaidas, 'renderSaidas');
  safeRun(renderIndicadores, 'renderIndicadores');
  safeRun(renderSaidasCategoriaChart, 'renderSaidasCategoriaChart');
  safeRun(renderFluxoChart, 'renderFluxoChart');
  safeRun(renderReceitaClienteChart, 'renderReceitaClienteChart');
  safeRun(renderCrescimento, 'renderCrescimento');
  safeRun(populateGeneralMonthFilters, 'populateGeneralMonthFilters');
  safeRun(renderEvolucaoDespesas, 'renderEvolucaoDespesas');
  safeRun(renderReceitaFormaPagamento, 'renderReceitaFormaPagamento');
  safeRun(renderContaDistribuicao, 'renderContaDistribuicao');
  safeRun(renderContaSparklines, 'renderContaSparklines');
  safeRun(renderSmartNewsFeed, 'renderSmartNewsFeed');
  
  if (typeof renderGestaoTable === 'function') {
    safeRun(populateGestaoCatFiltro, 'populateGestaoCatFiltro');
    safeRun(renderGestaoTable, 'renderGestaoTable');
    safeRun(renderGestaoBadges, 'renderGestaoBadges');
  }

  if (typeof populateMfCategorias === 'function') {
    safeRun(populateMfCategorias, 'populateMfCategorias');
  }

  if (typeof initMonitoramento === 'function') {
    safeRun(initMonitoramento, 'initMonitoramento');
  }

  if (typeof renderEstoqueTable === 'function') {
    safeRun(renderEstoqueTable, 'renderEstoqueTable');
  }

  if (typeof renderGraficosEstoque === 'function') {
    safeRun(renderGraficosEstoque, 'renderGraficosEstoque');
  }

  if (typeof renderMovimentacaoEstoque === 'function') {
    safeRun(renderMovimentacaoEstoque, 'renderMovimentacaoEstoque');
  }

  if (typeof renderMovimentacoesFinanceiras === 'function') {
    safeRun(renderMovimentacoesFinanceiras, 'renderMovimentacoesFinanceiras');
  }

  if (typeof renderFooterKpis === 'function') {
    safeRun(renderKanban, 'renderKanban');
    safeRun(renderFooterKpis, 'renderFooterKpis');
  }

  if (typeof renderHistoricoTable === 'function') {
    safeRun(renderHistoricoTable, 'renderHistoricoTable');
    safeRun(renderHistoricoKpis, 'renderHistoricoKpis');
  }
}

// ─── Inicialização e auto-refresh ───

// PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.error('Erro no SW:', err));
  });
}

let refreshInterval = null;

function startAutoRefresh() {
  if (refreshInterval) return; // Já está rodando
  loadData();
  refreshInterval = setInterval(loadData, 30000);
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// A sincronização será iniciada pelo auth.js após confirmar a validade do token
