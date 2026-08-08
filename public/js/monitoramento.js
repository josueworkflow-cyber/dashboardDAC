/* ═══════════════════════════════════════════════
   monitoramento.js — Página Monitoramento
   Filtro DAC/Pulse via campo nota_fiscal:
   "Emitida pela DAC" / "Emitida pela Pulse" / "Sem NF"
   ═══════════════════════════════════════════════ */

// ─── Estado do filtro ───
let monitorFilter = 'DAC'; // 'DAC' ou 'PULSE'

// ─── Instâncias de Chart.js ───
let monDesempenhoChart = null;
let monDespVarChart = null;
let monEntradasNFChart = null;
let monEntradasPieChart = null;
let monTransporteChart = null;
// ─── Estado do Accordion ───
let monOpenWeeks = new Set(JSON.parse(localStorage.getItem('mon_open_weeks') || '[]'));

function saveOpenWeeks() {
  localStorage.setItem('mon_open_weeks', JSON.stringify([...monOpenWeeks]));
}

// ─── Plugins para Efeito 3D e Centro do Doughnut ───

const monPieShadow = {
  id: 'monPieShadow',
  beforeDraw(chart) {
    if (!chart || !chart.chartArea) return;
    const { ctx } = chart;
    const { top, left, width, height } = chart.chartArea;
    const x = left + width / 2;
    const y = top + height / 2;
    const meta = chart.getDatasetMeta(0);
    const outerRadius = meta?.data?.[0]?.outerRadius || 0;
    if (outerRadius === 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 4, y + 4, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fill();
    ctx.restore();
  }
};

const monCenterText = {
  id: 'monCenterText',
  afterDraw(chart) {
    if (!chart || !chart.config?.options?.plugins?.monCenterText) return;
    const { ctx, width, height } = chart;
    const opts = chart.config.options.plugins.monCenterText;
    if (typeof opts.total !== 'number' || !opts.teto) return;
    const total = opts.total;
    const teto = opts.teto;
    const pct = ((total / teto) * 100).toFixed(0);
    
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const centerX = width / 2;
    const centerY = height / 2;

    // Percentual
    ctx.font = 'bold 24px "JetBrains Mono"';
    ctx.fillStyle = total > teto ? '#FF4D4D' : '#4ADE80';
    ctx.fillText(pct + '%', centerX, centerY - 5);

    // Texto Auxiliar
    ctx.font = '700 9px "DM Sans"';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('DO TETO', centerX, centerY + 15);
    
    ctx.restore();
  }
};

// ─── Tetos anuais ───
const TETO_DAC = 2500000;
const TETO_PULSE = 750000;

const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ─── Inicialização ───

function initMonitoramento() {
  if (typeof ENT === 'undefined' || typeof SAI === 'undefined') return;

  const currentMonth = new Date().getMonth();
  
  const monthSelect = document.getElementById('monMesFilterNF');
  if (monthSelect && (monthSelect.value === "" || monthSelect.getAttribute('data-init') !== 'true')) {
    monthSelect.value = ""; // Padrão: Todos os meses
    monthSelect.setAttribute('data-init', 'true');
  }

  const transportMonthSelect = document.getElementById('monMesFilterTransporte');
  if (transportMonthSelect && (transportMonthSelect.value === "" || transportMonthSelect.getAttribute('data-init') !== 'true')) {
    transportMonthSelect.value = ""; // Padrão: Todos os meses
    transportMonthSelect.setAttribute('data-init', 'true');
  }

  const despVarMonthSelect = document.getElementById('monMesFilterDespVar');
  if (despVarMonthSelect && (despVarMonthSelect.value === "" || despVarMonthSelect.getAttribute('data-init') !== 'true')) {
    despVarMonthSelect.value = ""; // Padrão: Todos
    despVarMonthSelect.setAttribute('data-init', 'true');
  }

  const desempenhoMonthSelect = document.getElementById('monMesFilterDesempenho');
  if (desempenhoMonthSelect && (desempenhoMonthSelect.value === "" || desempenhoMonthSelect.getAttribute('data-init') !== 'true')) {
    desempenhoMonthSelect.value = ""; // Padrão: Anual
    desempenhoMonthSelect.setAttribute('data-init', 'true');
  }

  renderMonitoramento();
}

function updateMonitoramentoNF() {
  monShowAllWeeks = false; // Reseta para visão compacta ao trocar mês
  renderTabelaSemanalNF();
  renderEntradasNFChart();
  renderEntradasPieChart();
}

function renderMonitoramento() {
  renderTabelaSemanalNF();
  renderEntradasNFChart();
  renderEntradasPieChart();
  renderAcompanhamentoAnual();
  renderDesempenhoVendas();
  renderDespesasVariaveis();
  renderTransporteTerceirizado();
}

// ─── Filtro Global ───

function setMonitorFilter(tipo, btn) {
  monitorFilter = String(tipo).toUpperCase();
  const empSelect = document.getElementById('monEmpresaFilterNF');
  if (empSelect) {
    empSelect.value = monitorFilter === 'PULSE' ? 'PULSE' : 'DAC';
  }
  document.querySelectorAll('.mon-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMonitoramento();
}

// ─── Classificação por Empresa (DAC / PULSE) e Modo de Emissão ───

function classifyEmpresa(entry) {
  if (!entry) return 'OUTROS';
  const emp = String(entry.empresa || '').trim().toUpperCase();
  if (emp.includes('DAC')) return 'DAC';
  if (emp.includes('PULSE')) return 'PULSE';

  // Fallback para campos legados
  const modo = String(entry.modo_emissao || entry.nota_fiscal || '').trim().toUpperCase();
  if (modo.includes('DAC')) return 'DAC';
  if (modo.includes('PULSE')) return 'PULSE';

  return 'OUTROS';
}

function isDACEntry(entry) {
  const cls = classifyEmpresa(entry);
  return cls === 'DAC' || cls === 'OUTROS';
}

function isPulseEntry(entry) {
  return classifyEmpresa(entry) === 'PULSE';
}

function isNotaFiscal(entry) {
  if (!entry) return false;
  const modo = String(entry.modo_emissao || entry.nota_fiscal || '').trim().toUpperCase();

  if (!modo) return false;

  // Se for qualquer variação de Pedido, PD, Sem NF, Orçamento ou Sem Nota
  const isPedidoOrSemNf = (
    modo === 'PD' ||
    modo.includes('PEDIDO') ||
    modo.includes('PD') ||
    modo.includes('SEM NF') ||
    modo.includes('S/ NF') ||
    modo.includes('S/NF') ||
    modo.includes('SEM NOTA') ||
    modo.includes('ORÇAMENTO') ||
    modo.includes('ORCAMENTO')
  );

  if (isPedidoOrSemNf) {
    return false;
  }

  // É Nota Fiscal apenas se contiver indicativo válido de NF/Emissão
  return (
    modo.includes('NOTA FISCAL') ||
    modo.includes('NF') ||
    modo.includes('EMITIDA') ||
    modo.includes('NFE') ||
    modo.includes('NFSE') ||
    modo.includes('EMISSAO') ||
    modo.includes('EMISSÃO')
  );
}

function isPorPD(entry) {
  if (!entry) return false;
  const modo = String(entry.modo_emissao || entry.nota_fiscal || '').trim().toUpperCase();
  if (!modo) return true;
  if (isNotaFiscal(entry)) return false;
  return true;
}

function getFilteredEntradasBlock1() {
  if (typeof ENT === 'undefined' || ENT.length === 0) return [];

  const empFiltro = document.getElementById('monEmpresaFilterNF')?.value || monitorFilter || 'DAC';
  const tipoFiltro = document.getElementById('monTipoFilterNF')?.value || 'ambos';

  return ENT.filter(e => {
    // 1. Filtro por Empresa (DAC / PULSE / Ambos)
    if (empFiltro === 'DAC' && !isDACEntry(e)) return false;
    if (empFiltro === 'PULSE' && !isPulseEntry(e)) return false;

    // 2. Filtro por Tipo de Emissão (Com NF / Por PD / Ambos)
    if (tipoFiltro === 'nf' && !isNotaFiscal(e)) return false;
    if (tipoFiltro === 'pd' && !isPorPD(e)) return false;

    return true;
  });
}

function getFilteredEntradas() {
  if (typeof ENT === 'undefined' || ENT.length === 0) return [];
  return ENT.filter(e => {
    if (monitorFilter === 'DAC') return isDACEntry(e);
    if (monitorFilter === 'PULSE') return isPulseEntry(e);
    return true;
  });
}

function getFilteredEntradasNF() {
  return getFilteredEntradas().filter(isNotaFiscal);
}

function getFilteredSaidas() {
  if (typeof SAI === 'undefined' || SAI.length === 0) return [];
  return SAI.filter(s => {
    if (monitorFilter === 'DAC') return isDACEntry(s);
    if (monitorFilter === 'PULSE') return isPulseEntry(s);
    return true;
  });
}

// ─── Helpers de semanas ───

function getWeekOfMonth(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  
  // Encontrar o primeiro sábado do mês
  const firstDayOfMonth = new Date(year, month, 1);
  const daysToFirstSaturday = 6 - firstDayOfMonth.getDay();
  const firstSaturdayDate = 1 + daysToFirstSaturday;
  
  const dayOfMonth = d.getDate();
  
  // Se o dia for até o primeiro sábado, é Semana 1
  if (dayOfMonth <= firstSaturdayDate) {
    return 1;
  }
  
  // Caso contrário, calcula as semanas seguintes a partir do primeiro domingo
  return Math.ceil((dayOfMonth - firstSaturdayDate) / 7) + 1;
}

function getWeekLabel(weekNum, month, year) {
  return `Semana ${weekNum} — ${MESES_NOMES[month]} ${year}`;
}

function groupByWeek(items) {
  const groups = {};
  items.forEach(item => {
    const d = parseDate(item.data_pagamento || item.data_vencimento);
    if (!d) return;
    const month = d.getMonth();
    const year = d.getFullYear();
    const week = getWeekOfMonth(d);
    const key = `${year}-${String(month).padStart(2, '0')}-W${week}`;
    if (!groups[key]) groups[key] = { label: getWeekLabel(week, month, year), items: [], month, year, week, key };
    groups[key].items.push(item);
  });
  return Object.values(groups).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    return a.week - b.week;
  });
}

// ─── Tabela Semanal COM NF (DAC ou Pulse filtrado) ───

function getWeekDateRange(weekNum, month, year) {
  let start = null;
  let end = null;
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    if (getWeekOfMonth(d) === weekNum) {
      if (!start) start = day;
      end = day;
    }
  }
  if (!start) return "";
  const zeroPad = (n) => String(n).padStart(2, '0');
  return `${zeroPad(start)}/${zeroPad(month + 1)} a ${zeroPad(end)}/${zeroPad(month + 1)}`;
}

function toggleWeekSection(headerEl, key) {
  const body = headerEl.nextElementSibling;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  
  if (isHidden) {
    headerEl.parentElement.classList.add('is-open');
    if (key) monOpenWeeks.add(key);
  } else {
    headerEl.parentElement.classList.remove('is-open');
    if (key) monOpenWeeks.delete(key);
  }
  saveOpenWeeks();

  const icon = headerEl.querySelector('.toggle-icon');
  if (icon) icon.textContent = isHidden ? '▾' : '▸';

  // Verifica se tem algum aberto para destravar o layout da página
  const pgContainer = document.getElementById('p-monitoramento');
  if (pgContainer) {
    // Timeout curto garante que a UI já processou o display: block
    setTimeout(() => {
      const anyOpen = Array.from(document.querySelectorAll('.week-body')).some(el => el.style.display === 'block');
      if (anyOpen) {
        pgContainer.classList.add('allow-scroll');
      } else {
        pgContainer.classList.remove('allow-scroll');
      }
    }, 10);
  }
}

// Estado: mostrar todas as semanas
let monShowAllWeeks = false;

function toggleWeeksNF() {
  monShowAllWeeks = !monShowAllWeeks;
  renderTabelaSemanalNF();
  const pg = document.getElementById('p-monitoramento');
  if (pg) {
    if (monShowAllWeeks) {
      pg.classList.add('allow-scroll');
    } else {
      pg.classList.remove('allow-scroll');
    }
  }
}

function renderTabelaSemanalNF() {
  const container = document.getElementById('monTabelaNF');
  if (!container) return;

  const mesFiltro = document.getElementById('monMesFilterNF')?.value || '';

  let entradas = getFilteredEntradasBlock1();

  if (mesFiltro !== '') {
    const targetMonth = parseInt(mesFiltro, 10);
    const anoAtual = new Date().getFullYear();
    entradas = entradas.filter(e => {
      const d = parseDate(e.data_pagamento || e.data_vencimento || e.data || e.data_emissao);
      return d && d.getMonth() === targetMonth && d.getFullYear() === anoAtual;
    });
  }

  const weeks = groupByWeek(entradas);

  if (weeks.length === 0) {
    container.innerHTML = '<div class="mon-empty">Nenhuma entrada encontrada para os filtros selecionados</div>';
    return;
  }

  // Determinar a semana atual
  const now = new Date();
  const currentWeekNum = getWeekOfMonth(now);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const currentKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}-W${currentWeekNum}`;

  // Filtrar: semana atual ou todas
  let visibleWeeks;
  if (monShowAllWeeks) {
    visibleWeeks = weeks;
  } else {
    const currentWeek = weeks.find(g => g.key === currentKey);
    visibleWeeks = currentWeek ? [currentWeek] : [weeks[weeks.length - 1]];
  }

  let html = '';
  visibleWeeks.forEach(group => {
    const totalSemana = group.items.reduce((s, e) => s + getEffectiveValue(e), 0);
    const dateRange = getWeekDateRange(group.week, group.month, group.year);
    const isOpen = monOpenWeeks.has(group.key);
    
    html += `
      <div class="week-section ${isOpen ? 'is-open' : ''}">
        <div class="week-header week-toggle" onclick="toggleWeekSection(this, '${group.key}')" style="cursor:pointer; padding:7px 12px; font-size:11px; margin-bottom:4px;">
          <span><span class="toggle-icon" style="margin-right:6px; display:inline-block; width:10px;">${isOpen ? '▾' : '▸'}</span>Sem ${group.week} (${dateRange})</span>
          <span class="week-total" style="font-size:12px;">${fmt(totalSemana)}</span>
        </div>
        <div class="week-body" style="display:${isOpen ? 'block' : 'none'}; margin-bottom:4px;">
          <div class="tw" style="max-height:none; overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th style="padding:6px 8px;">Cliente</th>
                  <th style="padding:6px 8px;">Valor</th>
                  <th style="padding:6px 8px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${group.items.map(e => `
                  <tr>
                    <td style="font-size:10px; padding:5px 8px;">${e.cliente || '—'}</td>
                    <td class="tg" style="padding:5px 8px; font-size:11px;">${fmt(getEffectiveValue(e))}</td>
                    <td style="padding:5px 8px;"><span class="st ${(e.status || '').toLowerCase() === 'pago' ? 'sg' : 'sp'}">${e.status || '—'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  });

  // Botão de toggle: expandir ou colapsar
  if (weeks.length > 1) {
    const btnLabel = monShowAllWeeks
      ? '▲ Apenas semana atual'
      : `▼ Todas as semanas (${weeks.length})`;
    html += `
      <div style="text-align:center; padding:6px 0 2px;">
        <button onclick="toggleWeeksNF()" style="background:none; border:1px solid var(--border); color:var(--muted); font-size:10px; font-weight:600; font-family:'DM Sans',sans-serif; padding:5px 14px; border-radius:6px; cursor:pointer; transition:all .2s;"
          onmouseover="this.style.borderColor='var(--red)'; this.style.color='var(--text)'"
          onmouseout="this.style.borderColor='var(--border)'; this.style.color='var(--muted)'">
          ${btnLabel}
        </button>
      </div>`;
  }

  container.innerHTML = html;
}

// ─── Gráfico Semanal Entradas com NF ───

function renderEntradasNFChart() {
  const canvas = document.getElementById('monEntradasNFChart');
  if (!canvas) return;

  const mesFiltro = document.getElementById('monMesFilterNF')?.value || '';
  let entradas = getFilteredEntradasBlock1();
  const anoAtual = new Date().getFullYear();

  if (mesFiltro !== '') {
    const targetMonth = parseInt(mesFiltro, 10);
    entradas = entradas.filter(e => {
      const d = parseDate(e.data_pagamento || e.data_vencimento || e.data || e.data_emissao);
      return d && d.getMonth() === targetMonth && d.getFullYear() === anoAtual;
    });
  }

  // Agrupa por semana
  const weekTotals = {};
  entradas.forEach(e => {
    const d = parseDate(e.data_pagamento || e.data_vencimento);
    if (!d) return;
    const week = getWeekOfMonth(d);
    weekTotals[week] = (weekTotals[week] || 0) + getEffectiveValue(e);
  });

  const weekNums = Object.keys(weekTotals).map(Number).sort((a, b) => a - b);
  const labels = weekNums.map(w => 'Sem ' + w);
  const data = weekNums.map(w => weekTotals[w]);

  if (monEntradasNFChart) monEntradasNFChart.destroy();

  monEntradasNFChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Entradas NF',
        data: data,
        backgroundColor: data.map((v, i) => {
          if (i === 0) return '#4ADE8099';
          return v >= data[i - 1] ? '#4ADE8099' : '#C4123099';
        }),
        borderColor: data.map((v, i) => {
          if (i === 0) return '#4ADE80';
          return v >= data[i - 1] ? '#4ADE80' : '#C41230';
        }),
        borderWidth: 1,
        borderRadius: 5,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          yAlign: 'top',
          callbacks: { label: function(c) { return fmt(c.parsed.y); } }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: 'rgba(255,255,255,.03)' },
          ticks: { callback: function(v) { return 'R$ ' + (v / 1000).toFixed(0) + 'k'; }, font: { family: "'JetBrains Mono'" } }
        }
      }
    }
  });
}

// ─── Gráfico Pizza Entradas (Total vs Teto) ───

function renderEntradasPieChart() {
  const canvas = document.getElementById('monEntradasPieChart');
  if (!canvas) return;

  const pieWrap = document.getElementById('monEntradasPieWrap') || canvas.parentElement;
  const tipoFiltro = document.getElementById('monTipoFilterNF')?.value || 'ambos';

  // O gráfico doughnut de teto só deve ser exibido quando o filtro de emissão for 'Com NF' ('nf')
  if (tipoFiltro !== 'nf') {
    if (pieWrap) pieWrap.style.display = 'none';
    if (monEntradasPieChart) {
      monEntradasPieChart.destroy();
      monEntradasPieChart = null;
    }
    return;
  }

  if (pieWrap) pieWrap.style.display = 'block';

  const ctx = canvas.getContext('2d');
  const mesFiltro = document.getElementById('monMesFilterNF')?.value || '';
  const empFiltro = document.getElementById('monEmpresaFilterNF')?.value || monitorFilter || 'DAC';
  const tetoAnual = empFiltro === 'PULSE' ? TETO_PULSE : TETO_DAC;
  const tetoMensal = tetoAnual / 12;

  let entradas = getFilteredEntradasBlock1();
  const now = new Date();
  const anoAtual = now.getFullYear();
  const targetMonth = mesFiltro !== '' ? parseInt(mesFiltro, 10) : now.getMonth();

  entradas = entradas.filter(e => {
    const d = parseDate(e.data_pagamento || e.data_vencimento || e.data || e.data_emissao);
    return d && d.getMonth() === targetMonth && d.getFullYear() === anoAtual;
  });

  const totalMensal = entradas.reduce((s, e) => s + getEffectiveValue(e), 0);
  const restanteTeto = Math.max(0, tetoMensal - totalMensal);
  const overflow = Math.max(0, totalMensal - tetoMensal);

  // Gradiante para o preenchimento
  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  if (totalMensal > tetoMensal) {
    grad.addColorStop(0, '#FF4D4D');
    grad.addColorStop(1, '#C41230');
  } else {
    grad.addColorStop(0, '#4ADE80');
    grad.addColorStop(1, '#16803C');
  }

  if (monEntradasPieChart) monEntradasPieChart.destroy();

  monEntradasPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Realizado', 'Disponível'],
      datasets: [{
        data: [totalMensal, restanteTeto],
        backgroundColor: [grad, 'rgba(255,255,255,0.03)'],
        borderColor: ['rgba(255,255,255,0.1)', 'transparent'],
        borderWidth: 1,
        hoverOffset: 4
      }]
    },
    plugins: [monPieShadow, monCenterText],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      layout: {
        padding: 8
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          yAlign: 'top',
          callbacks: {
            label: (c) => ` ${c.label}: ${fmt(c.parsed)}`
          }
        },
        monCenterText: { total: totalMensal, teto: tetoMensal }
      }
    }
  });
}

// ─── Acompanhamento Anual ───

function renderAcompanhamentoAnual() {
  const container = document.getElementById('monAnual');
  if (!container) return;

  const teto = monitorFilter === 'DAC' ? TETO_DAC : TETO_PULSE;
  const entradas = getFilteredEntradasNF();
  const now = new Date();
  const anoAtual = now.getFullYear();

  const mesesData = {};
  for (let m = 0; m < 12; m++) mesesData[m] = 0;

  entradas.forEach(e => {
    const d = parseDate(e.data_pagamento || e.data_vencimento);
    if (!d || d.getFullYear() !== anoAtual) return;
    mesesData[d.getMonth()] += getEffectiveValue(e);
  });

  let totalAnual = 0;
  for (let m = 0; m < 12; m++) totalAnual += mesesData[m];
  let pctAnual = Math.min((totalAnual / teto) * 100, 100);

  let html = `
    <div class="annual-summary">
      <div class="annual-summary-left">
        <div class="annual-summary-label">Total Anual ${anoAtual}</div>
        <div class="annual-summary-value">${fmt(totalAnual)}</div>
      </div>
      <div class="annual-summary-right">
        <div class="annual-summary-label">Teto ${monitorFilter}</div>
        <div class="annual-summary-value" style="color:var(--muted);">${fmt(teto)}</div>
      </div>
    </div>
    <div class="progress-bar annual-progress">
      <div class="progress-fill ${pctAnual >= 100 ? 'over' : ''}" style="width:${pctAnual}%;">
        <span>${pctAnual.toFixed(1)}%</span>
      </div>
    </div>
    <div class="annual-grid">`;

  for (let m = 0; m < 12; m++) {
    const valor = mesesData[m];
    const tetoMes = teto / 12;
    const pctMes = tetoMes > 0 ? Math.min((valor / tetoMes) * 100, 100) : 0;
    const isAtual = m === now.getMonth();

    html += `
      <div class="annual-card ${isAtual ? 'current' : ''}">
        <div class="annual-card-month">${MESES_CURTOS[m]}</div>
        <div class="annual-card-value ${valor > 0 ? 'tg' : ''}">${valor > 0 ? fmt(valor) : '—'}</div>
        <div class="progress-bar small">
          <div class="progress-fill ${pctMes >= 100 ? 'over' : ''}" style="width:${pctMes}%;"></div>
        </div>
      </div>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

// ─── Gráfico Desempenho de Vendas ───

function renderDesempenhoVendas() {
  const canvas = document.getElementById('monDesempenhoCanvas');
  if (!canvas) return;

  const mesFiltro = document.getElementById('monMesFilterDesempenho')?.value || '';
  const empresaFiltro = document.getElementById('monEmpresaFilterDesempenho')?.value || 'ambos';
  const now = new Date();
  const anoAtual = now.getFullYear();

  let labels = [];
  let entData = [];
  let saiData = [];

  const filterEntry = (e) => {
    if (empresaFiltro === 'DAC') return isDACEntry(e);
    if (empresaFiltro === 'PULSE') return isPulseEntry(e);
    return true; // 'ambos' inclui tudo (inclusive sem NF)
  };

  if (mesFiltro === '') {
    // Visão Anual (por meses)
    labels = MESES_CURTOS;
    entData = new Array(12).fill(0);
    saiData = new Array(12).fill(0);

    ENT.forEach(e => {
      const d = parseDate(e.data_pagamento || e.data_vencimento);
      if (!d || d.getFullYear() !== anoAtual) return;
      if (filterEntry(e)) entData[d.getMonth()] += getEffectiveValue(e);
    });

    SAI.forEach(s => {
      const d = parseDate(s.data_pagamento || s.data_vencimento);
      if (!d || d.getFullYear() !== anoAtual) return;
      if (filterEntry(s)) saiData[d.getMonth()] += getEffectiveValue(s);
    });
  } else {
    // Visão Mensal (por semanas)
    const targetMonth = parseInt(mesFiltro);
    labels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Semana 5'];
    entData = new Array(5).fill(0);
    saiData = new Array(5).fill(0);

    ENT.forEach(e => {
      const d = parseDate(e.data_pagamento || e.data_vencimento);
      if (!d || d.getFullYear() !== anoAtual || d.getMonth() !== targetMonth) return;
      
      const week = getWeekOfMonth(d);
      if (week >= 1 && week <= 5) {
        if (filterEntry(e)) entData[week - 1] += getEffectiveValue(e);
      }
    });

    SAI.forEach(s => {
      const d = parseDate(s.data_pagamento || s.data_vencimento);
      if (!d || d.getFullYear() !== anoAtual || d.getMonth() !== targetMonth) return;
      
      const week = getWeekOfMonth(d);
      if (week >= 1 && week <= 5) {
        if (filterEntry(s)) saiData[week - 1] += getEffectiveValue(s);
      }
    });
  }

  if (monDesempenhoChart) monDesempenhoChart.destroy();
  var plugins = typeof shadow3D !== 'undefined' ? [shadow3D] : [];

  monDesempenhoChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Entradas', data: entData, backgroundColor: '#4ADE8099', borderColor: '#4ADE80', borderWidth: 1, borderRadius: 5, barPercentage: 0.7, categoryPercentage: 0.6 },
        { label: 'Saídas', data: saiData, backgroundColor: '#C4123099', borderColor: '#C41230', borderWidth: 1, borderRadius: 5, barPercentage: 0.7, categoryPercentage: 0.6 }
      ]
    },
    plugins: plugins,
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: {
          yAlign: 'top',
          callbacks: { label: function(c) { return c.dataset.label + ': ' + fmt(c.parsed.y); } }
        }
      },
      scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { callback: function(v) { return 'R$ ' + (v / 1000).toFixed(0) + 'k'; }, font: { family: "'JetBrains Mono'" } } } }
    }
  });
}

// ─── Helper de Valor Monetário ───
function getValOrEffective(s) {
  if (!s) return 0;
  const status = String(s.status || '').trim().toLowerCase();
  if (status === 'cancelado') return 0;
  const eff = typeof getEffectiveValue === 'function' ? getEffectiveValue(s) : 0;
  if (eff > 0) return eff;
  return typeof parseVal === 'function' ? parseVal(s.valor || s.valor_pago) : (parseFloat(s.valor) || 0);
}

// ─── Helper de Categoria para Transporte Terceirizado / Logística ───
function isTransporteCategory(categoria) {
  const cat = String(categoria || '').trim().toUpperCase();
  return (
    cat.includes('LOGIST') ||
    cat.includes('LOGÍST') ||
    cat.includes('TRANSPORTE') ||
    cat.includes('TERCEIRI') ||
    cat.includes('TERCERI') ||
    cat.includes('FRETE') ||
    cat.includes('DELIVERY') ||
    cat.includes('ENTREGA') ||
    cat.includes('MOTORISTA') ||
    cat.includes('CARRETEIRO')
  );
}

// ─── Gráfico Despesas Variáveis ───

function renderDespesasVariaveis() {
  var canvas = document.getElementById('monDespVarCanvas');
  if (!canvas) return;

  const mesFiltro = document.getElementById('monMesFilterDespVar')?.value || '';
  var saidas = getFilteredSaidas();

  if (mesFiltro !== '') {
    const targetMonth = parseInt(mesFiltro, 10);
    saidas = saidas.filter(s => {
      const d = parseDate(s.data_pagamento || s.data_vencimento || s.data || s.data_emissao);
      return d && d.getMonth() === targetMonth;
    });
  }

  var catMap = {};
  saidas.forEach(function(s) {
    var cat = (s.categoria || 'Outros').trim();
    const val = getValOrEffective(s);
    if (val > 0) {
      catMap[cat] = (catMap[cat] || 0) + val;
    }
  });

  var sorted = Object.entries(catMap).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
  var labels = sorted.map(function(item) { return item[0].length > 20 ? item[0].substring(0, 18) + '…' : item[0]; });
  var data = sorted.map(function(item) { return item[1]; });

  if (monDespVarChart) monDespVarChart.destroy();
  var plugins = typeof shadow3D !== 'undefined' ? [shadow3D] : [];

  monDespVarChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['Sem lançamentos'],
      datasets: [{
        label: 'Despesas',
        data: data.length > 0 ? data : [0],
        backgroundColor: (data.length > 0 ? data : [0]).map(function(_, i) { return PALETTE_SOBER[i % PALETTE_SOBER.length] + 'CC'; }),
        borderColor: (data.length > 0 ? data : [0]).map(function(_, i) { return PALETTE_SOBER[i % PALETTE_SOBER.length]; }),
        borderWidth: 1,
        borderRadius: 5,
        barPercentage: 0.6
      }]
    },
    plugins: plugins,
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          yAlign: 'top',
          callbacks: { label: function(c) { return fmt(c.parsed.y); } }
        }
      },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } }, y: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { callback: function(v) { return 'R$ ' + (v / 1000).toFixed(0) + 'k'; }, font: { family: "'JetBrains Mono'" } } } }
    }
  });
}

// ─── Transporte Terceirizado (Logística) ───

function renderTransporteTerceirizado() {
  var container = document.getElementById('monTransporte');
  if (!container) return;

  const mesFiltro = document.getElementById('monMesFilterTransporte')?.value || '';
  var saidas = getFilteredSaidas();

  // Filtra por categoria de logística, transporte ou frete
  var logisticaItems = saidas.filter(function(s) {
    return isTransporteCategory(s.categoria);
  });

  // Total geral acumulado
  var totalLogistica = logisticaItems.reduce(function(s, e) { return s + getValOrEffective(e); }, 0);

  var logisticaMes = logisticaItems;
  var labelMes = 'Acumulado Total';

  if (mesFiltro !== '') {
    const targetMonth = parseInt(mesFiltro, 10);
    logisticaMes = logisticaItems.filter(function(s) {
      var d = parseDate(s.data_pagamento || s.data_vencimento || s.data || s.data_emissao);
      return d && d.getMonth() === targetMonth;
    });
    labelMes = (MESES_NOMES[targetMonth] || 'Mês Selecionado');
  }

  var totalMes = logisticaMes.reduce(function(s, e) { return s + getValOrEffective(e); }, 0);

  container.innerHTML =
    '<div class="transport-summary">' +
      '<div class="transport-icon">🚛</div>' +
      '<div class="transport-info">' +
        '<div class="transport-label">Total (' + labelMes + ')</div>' +
        '<div class="transport-value">' + fmt(totalMes) + '</div>' +
        '<div class="transport-count">' + logisticaMes.length + ' lançamento(s) · Acumulado: ' + fmt(totalLogistica) + '</div>' +
      '</div>' +
    '</div>';

  // Gráfico por fornecedor
  renderTransporteChart(logisticaMes);
}

function renderTransporteChart(items) {
  var canvas = document.getElementById('monTransporteChart');
  if (!canvas) return;

  // Agrupa por fornecedor
  var fornecedorMap = {};
  items.forEach(function(s) {
    var forn = String(s.fornecedor || '').trim() || 'Sem Fornecedor';
    var val = getValOrEffective(s);
    if (val > 0) {
      fornecedorMap[forn] = (fornecedorMap[forn] || 0) + val;
    }
  });

  // Ordena do maior para menor
  var sorted = Object.entries(fornecedorMap).sort(function(a, b) { return b[1] - a[1]; });
  var labels = sorted.map(function(item) { return item[0].length > 18 ? item[0].substring(0, 16) + '…' : item[0]; });
  var data = sorted.map(function(item) { return item[1]; });

  if (monTransporteChart) monTransporteChart.destroy();
  var plugins = typeof shadow3D !== 'undefined' ? [shadow3D] : [];

  monTransporteChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['Sem lançamentos'],
      datasets: [{
        label: 'Logística',
        data: data.length > 0 ? data : [0],
        backgroundColor: (data.length > 0 ? data : [0]).map(function(_, i) { return PALETTE_SOBER[i % PALETTE_SOBER.length] + 'CC'; }),
        borderColor: (data.length > 0 ? data : [0]).map(function(_, i) { return PALETTE_SOBER[i % PALETTE_SOBER.length]; }),
        borderWidth: 1,
        borderRadius: 5,
        barPercentage: 0.6
      }]
    },
    plugins: plugins,
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          yAlign: 'top',
          callbacks: { label: function(c) { return c.label + ': ' + fmt(c.parsed.y); } }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
        y: {
          grid: { color: 'rgba(255,255,255,.03)' },
          ticks: { callback: function(v) { return 'R$ ' + (v / 1000).toFixed(0) + 'k'; }, font: { family: "'JetBrains Mono'" } }
        }
      }
    }
  });
}
