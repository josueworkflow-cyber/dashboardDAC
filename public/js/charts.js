/* ═══════════════════════════════════════════════
   charts.js — Todos os gráficos:
   Fluxo de Caixa, Receita por Cliente,
   Crescimento, Evolução de Despesas,
   Receita por Forma, Saídas por Categoria
   ═══════════════════════════════════════════════ */

// ─── Plugin: sombra 3D nas barras ───
const shadow3D = {
  id: 'shadow3D',
  beforeDatasetsDraw(chart) {
    const { ctx: c, data: cd, scales: { x, y } } = chart;
    const ds = cd.datasets[0];
    if (!ds || ds.data.length === 0) return;
    // Calcula largura da barra de forma segura (evita NaN/Infinity com 1 item)
    let bw;
    if (ds.data.length > 1) {
      bw = x.getPixelForValue(1) - x.getPixelForValue(0);
    } else {
      bw = (x.right - x.left) * 0.6;
    }
    if (!isFinite(bw) || bw <= 0) return;
    c.save();
    ds.data.forEach((val, i) => {
      const bx = x.getPixelForValue(i);
      const by = y.getPixelForValue(val);
      const bb = y.getPixelForValue(0);
      const aw = bw * 0.6;
      c.fillStyle = 'rgba(0,0,0,.2)';
      c.beginPath();
      c.moveTo(bx - aw / 2, bb);
      c.lineTo(bx - aw / 2 + 5, bb - 5);
      c.lineTo(bx + aw / 2 + 5, bb - 5);
      c.lineTo(bx + aw / 2 + 5, by - 5);
      c.lineTo(bx + aw / 2, by);
      c.lineTo(bx + aw / 2, bb);
      c.closePath();
      c.fill();
    });
    c.restore();
  }
};

// ─── Plugins 3D para Doughnut de Conta Bancária ───

const contaDistShadow = {
  id: 'contaDistShadow',
  beforeDraw(chart) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    if (!meta.data || meta.data.length === 0) return;
    const arc = meta.data[0];
    if (!arc || !arc.outerRadius) return;
    const { x, y } = arc;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 5, y + 5, arc.outerRadius + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.restore();
  }
};

const contaDistCenter = {
  id: 'contaDistCenter',
  afterDraw(chart) {
    const opts = chart.config.options.plugins.contaDistCenter;
    if (!opts) return;
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = width / 2;
    const cy = height / 2;
    // Total
    ctx.font = 'bold 16px "JetBrains Mono"';
    ctx.fillStyle = '#D4D4DA';
    ctx.fillText(opts.totalLabel, cx, cy - 6);
    // Subtitle
    ctx.font = '700 8px "DM Sans"';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('TOTAL', cx, cy + 12);
    ctx.restore();
  }
};

// Cores exclusivas para cada conta bancária
const CONTA_COLORS = {
  'Inter':      { bg: '#FF6A00', border: '#FF8C33' },
  'Cora':       { bg: '#7C3AED', border: '#9F67F5' },
  'Bradesco':   { bg: '#C41230', border: '#E8334F' },
  'Santander':  { bg: '#EC0000', border: '#FF3333' },
  'DAC':        { bg: '#1B3A6B', border: '#2A5C8A' },
};
const CONTA_FALLBACK = ['#16803C', '#0E7490', '#B45309', '#4A4A5A', '#9F1239'];

// ─── Distribuição por Conta Bancária ───
let contaDistChart = null;

function renderContaDistribuicao() {
  const tipo = document.getElementById('contaDistTipo').value;
  const canvas = document.getElementById('contaDistCanvas');
  const legendEl = document.getElementById('contaDistLegend');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Agrega por conta bancária
  const contaMap = {};
  const addItems = (items) => {
    items.forEach(item => {
      const conta = (item.conta_bancaria || item.conta || '').trim();
      if (!conta) return;
      contaMap[conta] = (contaMap[conta] || 0) + getEffectiveValue(item);
    });
  };

  if (tipo === 'entradas' || tipo === 'ambos') addItems(ENT);
  if (tipo === 'saidas' || tipo === 'ambos') addItems(SAI);

  const sorted = Object.entries(contaMap).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([l]) => l);
  const data = sorted.map(([, v]) => v);
  const total = data.reduce((s, v) => s + v, 0);

  // Cores
  let fallbackIdx = 0;
  const bgColors = labels.map(l => {
    if (CONTA_COLORS[l]) return CONTA_COLORS[l].bg + 'CC';
    return CONTA_FALLBACK[fallbackIdx++ % CONTA_FALLBACK.length] + 'CC';
  });
  fallbackIdx = 0;
  const borderColors = labels.map(l => {
    if (CONTA_COLORS[l]) return CONTA_COLORS[l].border;
    return CONTA_FALLBACK[fallbackIdx++ % CONTA_FALLBACK.length];
  });

  // Legenda customizada
  if (legendEl) {
    legendEl.innerHTML = labels.map((label, i) => {
      const pct = total > 0 ? ((data[i] / total) * 100).toFixed(1) : '0.0';
      const color = CONTA_COLORS[label] ? CONTA_COLORS[label].bg : CONTA_FALLBACK[i % CONTA_FALLBACK.length];
      return `
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:10px;height:10px;border-radius:3px;background:${color};flex-shrink:0;box-shadow:0 2px 6px ${color}44;"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
              <div style="flex:1;height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${color};border-radius:2px;transition:width .6s ease;"></div>
              </div>
              <span style="font-size:10px;font-family:'JetBrains Mono';color:var(--muted);min-width:36px;text-align:right;">${pct}%</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Formata total
  const totalLabel = total >= 1000000
    ? 'R$ ' + (total / 1000000).toFixed(1) + 'M'
    : total >= 1000
      ? 'R$ ' + (total / 1000).toFixed(0) + 'k'
      : fmt(total);

  if (contaDistChart) contaDistChart.destroy();

  contaDistChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        hoverOffset: 8,
        spacing: 2
      }]
    },
    plugins: [contaDistShadow, contaDistCenter],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      layout: { padding: 8 },
      animation: {
        animateRotate: true,
        duration: 800,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => {
              const pct = total > 0 ? ((c.parsed / total) * 100).toFixed(1) : '0.0';
              return ` ${c.label}: ${fmt(c.parsed)} (${pct}%)`;
            }
          }
        },
        contaDistCenter: { totalLabel }
      }
    }
  });
}

let saiCatChart = null;

function renderSaidasCategoriaChart() {
  const mes = document.getElementById('saiCatMes').value;
  const periodo = parseInt(document.getElementById('saiCatPeriodo').value);
  const ctx = document.getElementById('saiCatCanvas').getContext('2d');
  
  let rows = SAI;
  if (mes !== '0') {
    rows = rows.filter(s => {
      const d = parseDate(s.data_pagamento || s.data_vencimento);
      return d && (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')) === mes;
    });
  } else {
    rows = filterByPeriodo(SAI, periodo);
  }

  const catMap = {};
  rows.forEach(s => {
    const cat = s.categoria || 'Outros';
    catMap[cat] = (catMap[cat] || 0) + getEffectiveValue(s);
  });

  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([l]) => l.length > 22 ? l.substring(0, 20) + '…' : l);
  const data = sorted.map(([, v]) => v);

  if (saiCatChart) saiCatChart.destroy();
  saiCatChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Saídas', data, backgroundColor: data.map((_, i) => PALETTE_SOBER[i % PALETTE_SOBER.length] + 'CC'), borderColor: data.map((_, i) => PALETTE_SOBER[i % PALETTE_SOBER.length]), borderWidth: 1, borderRadius: 5, borderSkipped: false, barPercentage: 0.6 }] },
    plugins: [shadow3D],
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } }, y: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k', font: { family: "'JetBrains Mono'" } } } }
    }
  });
}

// ─── Fluxo de Caixa ───
let fluxoChart = null;

function renderFluxoChart() {
  const periodo = parseInt(document.getElementById('fluxoPeriodo').value);
  const tipo = document.getElementById('fluxoTipo').value;
  const ctx = document.getElementById('fluxoCanvas').getContext('2d');
  const dayMap = {};

  const add = (arr, isEnt) => arr.forEach(item => {
    const d = parseDate(item.data_pagamento || item.data_vencimento);
    if (!d) return;
    const key = toIso(d);
    if (!dayMap[key]) dayMap[key] = { ent: 0, sai: 0 };
    const effVal = getEffectiveValue(item);
    if (isEnt) dayMap[key].ent += effVal;
    else dayMap[key].sai += effVal;
  });
  add(ENT, true);
  add(SAI, false);

  let days = Object.keys(dayMap).sort();
  if (periodo > 0) {
    const cut = new Date(); cut.setDate(cut.getDate() - periodo);
    days = days.filter(d => d >= toIso(cut));
  }

  const labels = days.map(d => { const p = d.split('-'); return p[2] + '/' + p[1]; });
  const datasets = [];

  if (tipo === 'entradas' || tipo === 'ambos') datasets.push({ label: 'Entradas', data: days.map(d => dayMap[d].ent), borderColor: '#16803C', backgroundColor: 'rgba(22,128,60,.08)', fill: true, tension: .4, borderWidth: 2, pointRadius: 2, pointHoverRadius: 5, pointBackgroundColor: '#16803C' });
  if (tipo === 'saidas' || tipo === 'ambos') datasets.push({ label: 'Saídas', data: days.map(d => dayMap[d].sai), borderColor: '#C41230', backgroundColor: 'rgba(196,18,48,.06)', fill: true, tension: .4, borderWidth: 2, pointRadius: 2, pointHoverRadius: 5, pointBackgroundColor: '#C41230' });
  if (tipo === 'saldo') {
    let acum = 0;
    datasets.push({ label: 'Saldo Acumulado', data: days.map(d => { acum += dayMap[d].ent - dayMap[d].sai; return acum; }), borderColor: '#1B3A6B', backgroundColor: 'rgba(27,58,107,.06)', fill: true, tension: .4, borderWidth: 2, pointRadius: 2, pointHoverRadius: 5, pointBackgroundColor: '#1B3A6B' });
  }

  if (fluxoChart) fluxoChart.destroy();
  fluxoChart = new Chart(ctx, {
    type: 'line', data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmt(c.parsed.y) } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.02)' }, ticks: { maxRotation: 45, font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k', font: { family: "'JetBrains Mono'" } } }
      }
    }
  });
}

// ─── Receita por Cliente ───
let recClienteChart = null;

function renderReceitaClienteChart() {
  const mes = document.getElementById('recClienteMes').value;
  const topN = parseInt(document.getElementById('recClienteTop').value);
  const order = document.getElementById('recClienteOrder').value;
  const ctx = document.getElementById('recClienteCanvas').getContext('2d');
  
  let rows = ENT;
  if (mes !== '0') {
    rows = rows.filter(e => {
      const d = parseDate(e.data_pagamento || e.data_vencimento);
      return d && (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')) === mes;
    });
  }

  const cm = {};
  rows.forEach(e => { const c = e.cliente || '—'; cm[c] = (cm[c] || 0) + getEffectiveValue(e); });
  let sorted = Object.entries(cm).sort((a, b) => order === 'desc' ? b[1] - a[1] : a[1] - b[1]);
  if (topN > 0) sorted = sorted.slice(0, topN);
  const labels = sorted.map(([n]) => n.length > 18 ? n.substring(0, 16) + '…' : n);
  const data = sorted.map(([, v]) => v);

  if (recClienteChart) recClienteChart.destroy();
  recClienteChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Receita', data, backgroundColor: data.map((_, i) => PALETTE_SOBER[i % PALETTE_SOBER.length] + 'CC'), borderColor: data.map((_, i) => PALETTE_SOBER[i % PALETTE_SOBER.length]), borderWidth: 1, borderRadius: 5, borderSkipped: false, barPercentage: 0.6 }] },
    plugins: [shadow3D],
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } }, y: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k', font: { family: "'JetBrains Mono'" } } } }
    }
  });
}

// ─── Crescimento de Receita ───
let crescChart = null;

function renderCrescimento() {
  const periodo = document.getElementById('crescPeriodo').value;
  const ctx = document.getElementById('crescCanvas').getContext('2d');
  const now = new Date();
  let currentStart, prevStart, prevEnd;

  if (periodo === 'semanal') {
    currentStart = new Date(now); currentStart.setDate(now.getDate() - 6);
    prevEnd = new Date(currentStart); prevEnd.setDate(prevEnd.getDate() - 1);
    prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - 6);
  } else {
    currentStart = new Date(now); currentStart.setDate(now.getDate() - 29);
    prevEnd = new Date(currentStart); prevEnd.setDate(prevEnd.getDate() - 1);
    prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - 29);
  }

  const sumR = (arr, from, to) => arr.reduce((s, e) => {
    const d = parseDate(e.data_pagamento || e.data_vencimento);
    if (!d) return s;
    return d >= from && d <= to ? s + getEffectiveValue(e) : s;
  }, 0);

  const currentRev = sumR(ENT, currentStart, now);
  const prevRev = sumR(ENT, prevStart, prevEnd);
  const growthPct = prevRev > 0 ? ((currentRev - prevRev) / prevRev * 100) : (currentRev > 0 ? 100 : 0);
  const arrow = growthPct >= 0 ? '▲' : '▼';
  const color = growthPct >= 0 ? '#16803C' : '#C41230';

  document.getElementById('crescStats').innerHTML = `
    <div style="display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap;">
      <div>
        <div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Variação</div>
        <div style="font-size:30px;font-weight:700;font-family:'JetBrains Mono';color:${color};margin-top:4px;">${arrow} ${Math.abs(growthPct).toFixed(1)}%</div>
      </div>
      <div>
        <div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:1px;text-transform:uppercase;">Período Atual</div>
        <div class="mono" style="font-size:15px;font-weight:600;color:#16803C;margin-top:4px;">${fmt(currentRev)}</div>
      </div>
      <div>
        <div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:1px;text-transform:uppercase;">Período Anterior</div>
        <div class="mono" style="font-size:15px;font-weight:600;color:var(--muted);margin-top:4px;">${fmt(prevRev)}</div>
      </div>
    </div>`;

  const monthMap = {};
  ENT.forEach(e => {
    const d = parseDate(e.data_pagamento || e.data_vencimento);
    if (!d) return;
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    monthMap[k] = (monthMap[k] || 0) + getEffectiveValue(e);
  });
  const sortedMonths = Object.keys(monthMap).sort().slice(-7);
  const labels = sortedMonths.map(m => { const [, mo] = m.split('-'); return ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][parseInt(mo) - 1]; });
  const data = sortedMonths.map(m => monthMap[m]);

  if (crescChart) crescChart.destroy();
  crescChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: '#C41230', backgroundColor: 'rgba(196,18,48,.06)', fill: true, tension: .4, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: '#C41230', pointBorderColor: '#141419', pointBorderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
      scales: { x: { grid: { display: false } }, y: { display: false } }
    }
  });
}

// ─── Evolução das Despesas ───
let despChart = null;

function renderEvolucaoDespesas() {
  const mesFilter = document.getElementById('despMes').value;
  const ctx = document.getElementById('despCanvas').getContext('2d');
  const dayMap = {};

  SAI.forEach(s => {
    const d = parseDate(s.data_pagamento || s.data_vencimento);
    if (!d) return;
    if (mesFilter !== '0') {
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (k !== mesFilter) return;
    }
    const key = toIso(d);
    dayMap[key] = (dayMap[key] || 0) + getEffectiveValue(s);
  });

  let days = Object.keys(dayMap).sort();
  if (mesFilter === '0') {
    const cut = new Date(); cut.setDate(cut.getDate() - 90);
    days = days.filter(d => d >= toIso(cut));
  }

  const labels = days.map(d => { const p = d.split('-'); return p[2] + '/' + p[1]; });
  const data = days.map(d => dayMap[d]);

  if (despChart) despChart.destroy();
  despChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Despesas', data, borderColor: '#C41230', backgroundColor: 'rgba(196,18,48,.08)', fill: true, tension: .4, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#C41230', pointBorderColor: '#141419', pointBorderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => 'Despesa: ' + fmt(c.parsed.y) } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.02)' }, ticks: { maxRotation: 45, font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k', font: { family: "'JetBrains Mono'" } } }
      }
    }
  });
}

// ─── Receita por Forma de Pagamento ───
let recFormaChart = null;

function renderReceitaFormaPagamento() {
  const mes = document.getElementById('recFormaMes').value;
  const periodo = parseInt(document.getElementById('recFormaPeriodo').value);
  const ctx = document.getElementById('recFormaCanvas').getContext('2d');
  
  let rows = ENT;
  if (mes !== '0') {
    rows = rows.filter(e => {
      const d = parseDate(e.data_pagamento || e.data_vencimento);
      return d && (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')) === mes;
    });
  } else {
    rows = filterByPeriodo(ENT, periodo);
  }

  const fm = {};
  rows.forEach(e => { const f = e.forma_pagamento || 'Outros'; fm[f] = (fm[f] || 0) + getEffectiveValue(e); });
  const sorted = Object.entries(fm).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([l]) => l);
  const data = sorted.map(([, v]) => v);

  if (recFormaChart) recFormaChart.destroy();
  recFormaChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Receita', data, backgroundColor: data.map((_, i) => PALETTE_SOBER[i % PALETTE_SOBER.length] + 'CC'), borderColor: data.map((_, i) => PALETTE_SOBER[i % PALETTE_SOBER.length]), borderWidth: 1, borderRadius: 5, borderSkipped: false, barPercentage: 0.6 }] },
    plugins: [shadow3D],
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k', font: { family: "'JetBrains Mono'" } } } }
    }
  });
}
