/* ═══════════════════════════════════════════════
   graficos-estoque.js — Relatório Visual Inteligente
   Lógica focada no novo design premium
   ═══════════════════════════════════════════════ */

let geCharts = {}; // Armazena instâncias do Chart.js
let geFilterEnt = 'DAC';
let geFilterSai = 'DAC';

// 🚀 Inicialização
function initGraficosEstoque() {
  console.log("Iniciando Novo Relatório de Estoque...");
  renderGraficosEstoque();
}

window.handleGePeriodoChange = function() {
  const p = document.getElementById('ge-periodo');
  const c = document.getElementById('ge-custom-dates');
  if (p && c) {
    if (p.value === 'custom') c.style.display = 'flex';
    else c.style.display = 'none';
  }
  renderGraficosEstoque();
}

window.setGeFilterEnt = function(val, el) {
  geFilterEnt = val;
  if (el && el.parentNode) {
    el.parentNode.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
  }
  renderGraficosEstoque();
}

window.setGeFilterSai = function(val, el) {
  geFilterSai = val;
  if (el && el.parentNode) {
    el.parentNode.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
  }
  renderGraficosEstoque();
}

// ─── Lógica de Dados ───

function getEstoqueDataRange(isComparison = false) {
  const periodo = document.getElementById('ge-periodo') ? document.getElementById('ge-periodo').value : 'mes';
  const hj = new Date();
  let start, end;
  
  if (!isComparison) {
    if (periodo === 'mes') {
      start = new Date(hj.getFullYear(), hj.getMonth(), 1);
      end = hj;
    } else if (periodo === 'semana') {
      const day = hj.getDay(), diff = hj.getDate() - day + (day == 0 ? -6:1);
      start = new Date(hj.setDate(diff));
      start.setHours(0,0,0,0);
      end = new Date();
    } else if (periodo === 'custom') {
      const iniStr = document.getElementById('ge-inicio').value;
      const fimStr = document.getElementById('ge-fim').value;
      start = iniStr ? new Date(iniStr + 'T00:00:00') : new Date(0);
      end = fimStr ? new Date(fimStr + 'T23:59:59') : hj;
    } else {
      start = new Date(hj.getFullYear(), hj.getMonth(), 1);
      end = hj;
    }
  } else {
    // Comparação
    const comp = document.getElementById('ge-comparacao') ? document.getElementById('ge-comparacao').value : 'anterior';
    if (periodo === 'mes') {
      if (comp === 'mes_anterior' || comp === 'anterior') {
        start = new Date(hj.getFullYear(), hj.getMonth() - 1, 1);
        end = new Date(hj.getFullYear(), hj.getMonth(), 0);
      } else {
        start = new Date(0); end = new Date(0);
      }
    } else if (periodo === 'semana') {
      const day = hj.getDay(), diff = hj.getDate() - day + (day == 0 ? -6:1) - 7;
      start = new Date(new Date().setDate(diff));
      start.setHours(0,0,0,0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23,59,59,999);
    } else {
      start = new Date(0); end = new Date(0);
    }
  }
  return { start, end };
}

function filterEstoque(range) {
  if (!range || !range.start || !range.end) return [];
  return ESTQ.filter(r => {
    const d = parseDate(r.data);
    if (!d) return false;
    return d >= range.start && d <= range.end;
  });
}

// ─── Helpers Fiscais ───
function isNF(r) { return normalizeString(r.modo_emissao) === 'COM NOTA FISCAL'; }
function isPorPD(r) { return normalizeString(r.modo_emissao) === 'POR PD'; }
function isPorEmp(r) { return normalizeString(r.modo_emissao) === 'POR EMPRESTIMO'; }

// ─── Renderização Principal ───

function renderGraficosEstoque() {
  const range = getEstoqueDataRange(false);
  const compRange = getEstoqueDataRange(true);
  
  const current = filterEstoque(range);
  const compare = filterEstoque(compRange);
  
  const entCurr = current.filter(r => normalizeString(r.movimentacao).includes('ENTRADA'));
  const entPrev = compare.filter(r => normalizeString(r.movimentacao).includes('ENTRADA'));
  
  const saiCurr = current.filter(r => normalizeString(r.movimentacao).includes('SAIDA'));
  const saiPrev = compare.filter(r => normalizeString(r.movimentacao).includes('SAIDA'));

  const sum = (arr) => arr.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
  
  const vEnt = sum(entCurr);
  const vEntPrev = sum(entPrev);
  const vSai = sum(saiCurr);
  const vSaiPrev = sum(saiPrev);

  // 2. Entradas Detail (DAC e Pulse)
  const entDac = entCurr.filter(r => normalizeString(r.empresa) === 'DAC');
  const entPulse = entCurr.filter(r => normalizeString(r.empresa).includes('PULSE'));

  const entDacNF = entDac.filter(r => isNF(r));
  const entDacSNF = entDac.filter(r => isPorPD(r));
  const entDacEmp = entDac.filter(r => isPorEmp(r));
  
  setElVal('ge-v-ent-dac-nf', sum(entDacNF)); setElText('ge-q-ent-dac-nf', `${entDacNF.length} notas`);
  setElVal('ge-v-ent-dac-snf', sum(entDacSNF)); setElText('ge-q-ent-dac-snf', `${entDacSNF.length} lançamentos`);
  setElVal('ge-v-ent-dac-emp', sum(entDacEmp)); setElText('ge-q-ent-dac-emp', `${entDacEmp.length} lançamentos`);
  setElVal('ge-v-ent-dac-tot', sum(entDac)); setElText('ge-q-ent-dac-tot', `${entDac.length} total`);
  
  const entDacTotal = sum(entDac);
  setElStyle('ge-bar-ent-dac-nf', 'width', `${entDacTotal > 0 ? (sum(entDacNF) / entDacTotal) * 100 : 0}%`);
  setElStyle('ge-bar-ent-dac-snf', 'width', `${entDacTotal > 0 ? (sum(entDacSNF) / entDacTotal) * 100 : 0}%`);
  setElStyle('ge-bar-ent-dac-emp', 'width', `${entDacTotal > 0 ? (sum(entDacEmp) / entDacTotal) * 100 : 0}%`);

  const entPulNF = entPulse.filter(r => isNF(r));
  const entPulSNF = entPulse.filter(r => isPorPD(r));
  const entPulEmp = entPulse.filter(r => isPorEmp(r));
  
  setElVal('ge-v-ent-pul-nf', sum(entPulNF)); setElText('ge-q-ent-pul-nf', `${entPulNF.length} notas`);
  setElVal('ge-v-ent-pul-snf', sum(entPulSNF)); setElText('ge-q-ent-pul-snf', `${entPulSNF.length} lançamentos`);
  setElVal('ge-v-ent-pul-emp', sum(entPulEmp)); setElText('ge-q-ent-pul-emp', `${entPulEmp.length} lançamentos`);
  setElVal('ge-v-ent-pul-tot', sum(entPulse)); setElText('ge-q-ent-pul-tot', `${entPulse.length} total`);

  const entPulTotal = sum(entPulse);
  setElStyle('ge-bar-ent-pul-nf', 'width', `${entPulTotal > 0 ? (sum(entPulNF) / entPulTotal) * 100 : 0}%`);
  setElStyle('ge-bar-ent-pul-snf', 'width', `${entPulTotal > 0 ? (sum(entPulSNF) / entPulTotal) * 100 : 0}%`);
  setElStyle('ge-bar-ent-pul-emp', 'width', `${entPulTotal > 0 ? (sum(entPulEmp) / entPulTotal) * 100 : 0}%`);

  // Composição Fiscal Global (Gráfico Donut - Entradas/Compras)
  let entChartData = entCurr;
  if (geFilterEnt !== 'TODOS') {
    entChartData = entCurr.filter(r => normalizeString(r.empresa) === geFilterEnt);
  }
  
  const entNF = entChartData.filter(r => isNF(r));
  const entSNF = entChartData.filter(r => isPorPD(r));
  const entEmp = entChartData.filter(r => isPorEmp(r));
  
  const vEntChart = sum(entChartData);
  const nfPct = vEntChart > 0 ? (sum(entNF) / vEntChart) * 100 : 0;
  setElText('ge-nf-pct', `${nfPct.toFixed(0)}%`);
  
  renderDonutEntradas(sum(entNF), sum(entSNF), sum(entEmp));

  // 3. Formas de Pagamento (Entradas)
  renderPaymentMethods(entCurr);

  // 4. Saídas Detail (DAC vs Pulse - Vendas/Faturamento)
  const saiDac = saiCurr.filter(r => normalizeString(r.empresa) === 'DAC');
  const saiPulse = saiCurr.filter(r => normalizeString(r.empresa).includes('PULSE'));
  
  const dacNF = saiDac.filter(r => isNF(r));
  const dacSNF = saiDac.filter(r => isPorPD(r));
  const dacPD = saiDac.filter(r => isPorEmp(r));
  
  setElVal('ge-v-sai-dac-nf', sum(dacNF)); setElText('ge-q-sai-dac-nf', `${dacNF.length} notas`);
  setElVal('ge-v-sai-dac-snf', sum(dacSNF)); setElText('ge-q-sai-dac-snf', `${dacSNF.length} lançamentos`);
  setElVal('ge-v-sai-dac-pd', sum(dacPD)); setElText('ge-q-sai-dac-pd', `${dacPD.length} pedidos`);
  setElVal('ge-v-sai-dac-tot', sum(saiDac)); setElText('ge-q-sai-dac-tot', `${saiDac.length} total`);

  const saiDacTotal = sum(saiDac);
  setElStyle('ge-bar-sai-dac-nf', 'width', `${saiDacTotal > 0 ? (sum(dacNF) / saiDacTotal) * 100 : 0}%`);
  setElStyle('ge-bar-sai-dac-snf', 'width', `${saiDacTotal > 0 ? (sum(dacSNF) / saiDacTotal) * 100 : 0}%`);
  setElStyle('ge-bar-sai-dac-pd', 'width', `${saiDacTotal > 0 ? (sum(dacPD) / saiDacTotal) * 100 : 0}%`);

  const pulseNF = saiPulse.filter(r => isNF(r));
  const pulseSNF = saiPulse.filter(r => isPorPD(r));
  const pulsePD = saiPulse.filter(r => isPorEmp(r));
  
  setElVal('ge-v-sai-pul-nf', sum(pulseNF)); setElText('ge-q-sai-pul-nf', `${pulseNF.length} notas`);
  setElVal('ge-v-sai-pul-snf', sum(pulseSNF)); setElText('ge-q-sai-pul-snf', `${pulseSNF.length} lançamentos`);
  setElVal('ge-v-sai-pul-pd', sum(pulsePD)); setElText('ge-q-sai-pul-pd', `${pulsePD.length} pedidos`);
  setElVal('ge-v-sai-pul-tot', sum(saiPulse)); setElText('ge-q-sai-pul-tot', `${saiPulse.length} total`);
  
  const saiPulTotal = sum(saiPulse);
  setElStyle('ge-bar-sai-pul-nf', 'width', `${saiPulTotal > 0 ? (sum(pulseNF) / saiPulTotal) * 100 : 0}%`);
  setElStyle('ge-bar-sai-pul-snf', 'width', `${saiPulTotal > 0 ? (sum(pulseSNF) / saiPulTotal) * 100 : 0}%`);
  setElStyle('ge-bar-sai-pul-pd', 'width', `${saiPulTotal > 0 ? (sum(pulsePD) / saiPulTotal) * 100 : 0}%`);

  setElVal('ge-v-sai-tot', vSai); setElText('ge-q-sai-tot', `${saiCurr.length} total`);
  setElStyle('ge-bar-sai-tot', 'width', `100%`);

  // 5. Charts
  // renderDonutEntradas já foi chamado acima com o filtro aplicado
  
  let saiChartData = saiCurr;
  if (geFilterSai !== 'TODOS') {
    saiChartData = saiCurr.filter(r => normalizeString(r.empresa) === geFilterSai);
  }
  
  const saiNF = saiChartData.filter(r => isNF(r));
  const saiSNF = saiChartData.filter(r => isPorPD(r));
  const saiPD = saiChartData.filter(r => isPorEmp(r));
  renderDonutSaidas(sum(saiNF), sum(saiSNF), sum(saiPD));
  
  renderPaymentMethodsSaidas(saiCurr);
  
   
}

function renderPaymentMethods(entries) {
  const container = document.getElementById('ge-payment-container');
  if (!container) return;
  
  const methods = {};
  const displayNames = {};
  let total = 0;
  entries.forEach(r => {
    const f = r.forma_pagamento || 'Outros';
    const v = parseFloat(r.valor) || 0;
    const key = normalizeString(f);
    methods[key] = (methods[key] || 0) + v;
    if (!displayNames[key]) displayNames[key] = f;
    total += v;
  });
  
  const sorted = Object.entries(methods).sort((a,b) => b[1] - a[1]);
  
  let html = '';
  sorted.forEach(([key, val]) => {
    const name = displayNames[key];
    const pct = total > 0 ? (val / total) * 100 : 0;
    const icon = key.includes('PIX') ? '⚡' : (key.includes('BOLETO') ? '📄' : '💰');
    const colorClass = key.includes('PIX') ? 'pix' : (key.includes('BOLETO') ? 'boleto' : 'dac');
    
    html += `
      <div class="payment-item">
        <div class="payment-icon ${colorClass}">${icon}</div>
        <div class="payment-info">
          <div class="payment-name">${name}</div>
          <div class="payment-qty">${pct.toFixed(0)}% do total</div>
        </div>
        <div>
          <div class="payment-value">${fmt(val)}</div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html || '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 11px;">Nenhuma entrada no período</div>';
}

function renderPaymentMethodsSaidas(exits) {
  const container = document.getElementById('ge-payment-container-sai');
  if (!container) return;
  
  const methods = {};
  const displayNames = {};
  let total = 0;
  exits.forEach(r => {
    const f = r.forma_pagamento || 'Outros';
    const v = parseFloat(r.valor) || 0;
    const key = normalizeString(f);
    methods[key] = (methods[key] || 0) + v;
    if (!displayNames[key]) displayNames[key] = f;
    total += v;
  });
  
  const sorted = Object.entries(methods).sort((a,b) => b[1] - a[1]);
  
  let html = '';
  sorted.forEach(([key, val]) => {
    const name = displayNames[key];
    const pct = total > 0 ? (val / total) * 100 : 0;
    const icon = key.includes('PIX') ? '⚡' : (key.includes('BOLETO') ? '📄' : '💰');
    const colorClass = key.includes('PIX') ? 'pix' : (key.includes('BOLETO') ? 'boleto' : 'dac');
    
    html += `
      <div class="payment-item">
        <div class="payment-icon ${colorClass}">${icon}</div>
        <div class="payment-info">
          <div class="payment-name">${name}</div>
          <div class="payment-qty">${pct.toFixed(0)}% do total</div>
        </div>
        <div>
          <div class="payment-value">${fmt(val)}</div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html || '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 11px;">Nenhuma saída no período</div>';
}

function renderDonutEntradas(nf, snf, pd) {
  const ctx = document.getElementById('donutEntradas');
  if (!ctx) return;
  destroyChart('donutEntradas');
  
  const total = nf + snf + pd;
  const nfPct = total > 0 ? (nf / total) * 100 : 0;
  const snfPct = total > 0 ? (snf / total) * 100 : 0;
  const pdPct = total > 0 ? (pd / total) * 100 : 0;

  geCharts['donutEntradas'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: total > 0 ? [nf, snf, pd] : [0.1],
        backgroundColor: ['#e53935', '#FFB800', '#3D8EF0', '#1E2430'],
        borderWidth: 0
      }]
    },
    options: {
      cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { animateRotate: true, duration: 1000 }
    }
  });
  
  const legend = document.getElementById('ge-nf-legend');
  if (legend) {
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-dot" style="background:var(--red)"></div>
        <div class="legend-info">
          <div class="legend-name">Com NF</div>
          <div class="legend-val">${fmt(nf)}</div>
        </div>
        <span class="legend-pct">${nfPct.toFixed(0)}%</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:var(--yellow)"></div>
        <div class="legend-info">
          <div class="legend-name">Sem NF</div>
          <div class="legend-val">${fmt(snf)}</div>
        </div>
        <span class="legend-pct">${snfPct.toFixed(0)}%</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:var(--blue)"></div>
        <div class="legend-info">
          <div class="legend-name">Empréstimo</div>
          <div class="legend-val">${fmt(pd)}</div>
        </div>
        <span class="legend-pct">${pdPct.toFixed(0)}%</span>
      </div>
    `;
  }
}

function renderDonutSaidas(nf, snf, pd) {
  const ctx = document.getElementById('donutSaidas');
  if (!ctx) return;
  destroyChart('donutSaidas');
  
  const total = nf + snf + pd;
  const nfPct = total > 0 ? (nf / total) * 100 : 0;
  const snfPct = total > 0 ? (snf / total) * 100 : 0;
  const pdPct = total > 0 ? (pd / total) * 100 : 0;

  geCharts['donutSaidas'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: total > 0 ? [nf, snf, pd] : [0.1],
        backgroundColor: ['#00D47E', '#FFB800', '#3D8EF0', '#1E2430'],
        borderWidth: 0
      }]
    },
    options: {
      cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { animateRotate: true, duration: 1000 }
    }
  });
  
  setElText('ge-nf-pct-sai', `${nfPct.toFixed(0)}%`);
  
  const legend = document.getElementById('ge-nf-legend-sai');
  if (legend) {
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-dot" style="background:var(--green)"></div>
        <div class="legend-info">
          <div class="legend-name">Com NF</div>
          <div class="legend-val">${fmt(nf)}</div>
        </div>
        <span class="legend-pct">${nfPct.toFixed(0)}%</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:var(--yellow)"></div>
        <div class="legend-info">
          <div class="legend-name">Sem NF</div>
          <div class="legend-val">${fmt(snf)}</div>
        </div>
        <span class="legend-pct">${snfPct.toFixed(0)}%</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:var(--blue)"></div>
        <div class="legend-info">
          <div class="legend-name">Por Empréstimo</div>
          <div class="legend-val">${fmt(pd)}</div>
        </div>
        <span class="legend-pct">${pdPct.toFixed(0)}%</span>
      </div>
    `;
  }
}



// ─── Helpers UI ───

function setElVal(id, val) { 
  const el = document.getElementById(id); 
  if (el) el.textContent = fmt(val); 
}
function setElText(id, txt) { 
  const el = document.getElementById(id); 
  if (el) el.textContent = txt; 
}
function setElStyle(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}
function setDiff(changeId, compareId, curr, prev) {
  const cEl = document.getElementById(changeId);
  const compEl = document.getElementById(compareId);
  if (!cEl || !compEl) return;
  
  const diff = curr - prev;
  const pct = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);
  
  cEl.textContent = `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(0)}%`;
  cEl.className = `s-change ${pct >= 0 ? 'up' : 'down'}`;
  compEl.textContent = `vs ${fmt(prev)} anterior`;
}

function destroyChart(id) {
  if (geCharts[id]) { geCharts[id].destroy(); delete geCharts[id]; }
}
