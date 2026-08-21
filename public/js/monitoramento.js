/* ═══════════════════════════════════════════════
   monitoramento.js — Página Monitoramento
   Filtro DAC/Pulse via campo nota_fiscal:
   "Emitida pela DAC" / "Emitida pela Pulse" / "Sem NF"
   ═══════════════════════════════════════════════ */

// ─── Estado do filtro ───
let monitorFilter = 'DAC'; // 'DAC' ou 'PULSE'

// ─── Instâncias de Chart.js ───
let monAcompanhamentoAnualChart = null;
let monDespVarChart = null;
let monEntradasNFChart = null;
let monEntradasPieChart = null;
let monTransporteChart = null;
// ─── Estado do Accordion ───
let monOpenWeeks = new Set(JSON.parse(localStorage.getItem('mon_open_weeks') || '[]'));

function saveOpenWeeks() {
  localStorage.setItem('mon_open_weeks', JSON.stringify([...monOpenWeeks]));
}

// ─── Plugins para Efeito 3D, Centro do Doughnut e Rótulos Anuais ───

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

const monAnualDataLabels = {
  id: 'monAnualDataLabels',
  afterDatasetsDraw(chart) {
    if (!chart || !chart.chartArea) return;
    const { ctx } = chart;
    ctx.save();
    
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta || meta.hidden) return;

      meta.data.forEach((element, index) => {
        const val = dataset.data[index];
        if (val === undefined || val === null || val <= 0) return;

        const { x, y } = element;
        const color = dataset.borderColor || '#D4D4DA';

        // Formatação monetária expressiva e clara
        let text = '';
        if (val >= 1000000) {
          text = 'R$ ' + (val / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + 'M';
        } else if (val >= 1000) {
          text = 'R$ ' + (val / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k';
        } else {
          text = 'R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        ctx.font = '700 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const isSaidas = dataset.label === 'Saídas';
        const hasBoth = chart.data.datasets.length > 1;
        
        // Entradas acima (-22px), Saídas abaixo (+22px) se ambos estiverem no gráfico
        const badgeY = (hasBoth && isSaidas) ? (y + 22) : (y - 22);

        const metrics = ctx.measureText(text);
        const padX = 8;
        const bW = metrics.width + padX * 2;
        const bH = 22;
        const bX = x - bW / 2;
        const bY = badgeY - bH / 2;

        // Fundo escuro com borda e sombra sutil para destaque máximo
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = 'rgba(14, 16, 22, 0.95)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(bX, bY, bW, bH, 5);
        } else {
          ctx.rect(bX, bY, bW, bH);
        }
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, x, badgeY + 0.5);
      });
    });

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

  const currentMonth = String(new Date().getMonth());
  
  const semanalMonthSelect = document.getElementById('monSemanalMesFilter');
  if (semanalMonthSelect && (semanalMonthSelect.value === "" || semanalMonthSelect.getAttribute('data-init') !== 'true')) {
    semanalMonthSelect.value = currentMonth;
    semanalMonthSelect.setAttribute('data-init', 'true');
  }

  const transportMonthSelect = document.getElementById('monMesFilterTransporte');
  if (transportMonthSelect && (transportMonthSelect.value === "" || transportMonthSelect.getAttribute('data-init') !== 'true')) {
    transportMonthSelect.value = currentMonth;
    transportMonthSelect.setAttribute('data-init', 'true');
  }

  const despVarMonthSelect = document.getElementById('monMesFilterDespVar');
  if (despVarMonthSelect && (despVarMonthSelect.value === "" || despVarMonthSelect.getAttribute('data-init') !== 'true')) {
    despVarMonthSelect.value = currentMonth;
    despVarMonthSelect.setAttribute('data-init', 'true');
  }

  renderMonitoramento();
}

function updateMonitoramentoNF() {
  renderAcompanhamentoSemanal();
}

function renderMonitoramento() {
  renderAcompanhamentoSemanal();
  renderDespesasVariaveis();
  renderTransporteTerceirizado();
  renderAcompanhamentoAnualChart();
}

// ─── Filtro Global ───

function setMonitorFilter(tipo, btn) {
  monitorFilter = String(tipo).toUpperCase();
  const empSemanalSelect = document.getElementById('monSemanalEmpresaFilter');
  if (empSemanalSelect) {
    empSemanalSelect.value = monitorFilter === 'PULSE' ? 'PULSE' : (monitorFilter === 'DAC' ? 'DAC' : 'ambos');
  }
  const empAnualSelect = document.getElementById('monAnualEmpresaFilter');
  if (empAnualSelect) {
    empAnualSelect.value = monitorFilter === 'PULSE' ? 'PULSE' : (monitorFilter === 'DAC' ? 'DAC' : 'ambos');
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
  const modo = String(entry.modo_emissao || '').trim().toUpperCase();
  const nf = String(entry.nota_fiscal || entry.nf || '').trim().toUpperCase();
  const obs = String(entry.observacoes || entry.observacao || '').trim().toUpperCase();
  const cat = String(entry.categoria || '').trim().toUpperCase();
  const combined = (modo + ' ' + nf + ' ' + obs + ' ' + cat).trim();

  if (!combined) return false;

  // Se for explicitamente Sem NF, Por PD, Pedido, Recibo, Orçamento, Empréstimo
  if (
    combined.includes('SEM NF') ||
    combined.includes('S/ NF') ||
    combined.includes('S/NF') ||
    combined.includes('SEM NOTA') ||
    combined.includes('S/ NOTA') ||
    combined.includes('POR PD') ||
    combined.includes('POR PEDIDO') ||
    combined.includes('PEDIDO') ||
    combined.includes('ORÇAMENTO') ||
    combined.includes('ORCAMENTO') ||
    combined.includes('RECIBO') ||
    combined.includes('EMPRESTIMO') ||
    combined.includes('EMPRÉSTIMO') ||
    /\bPD\b/.test(combined)
  ) {
    return false;
  }

  // É Nota Fiscal se contiver palavras-chave de NF/Emissão
  const hasNfKeyword = (
    combined.includes('NOTA FISCAL') ||
    combined.includes('COM NOTA') ||
    combined.includes('COM NF') ||
    combined.includes('NFE') ||
    combined.includes('NFSE') ||
    combined.includes('DANFE') ||
    combined.includes('EMITIDA') ||
    combined.includes('EMISSÃO') ||
    combined.includes('EMISSAO') ||
    /\bNF\b/.test(combined)
  );

  if (hasNfKeyword) return true;

  // Se o campo nota_fiscal contém apenas números (ex: "1234") e não é PD puro
  if (/^\d+$/.test(nf) && !modo.includes('PEDIDO') && modo !== 'PD' && !modo.includes('POR PD')) {
    return true;
  }

  return false;
}

function isPorPD(entry) {
  if (!entry) return false;
  // Todo lançamento que não for Nota Fiscal é classificado como Por PD / Sem NF
  return !isNotaFiscal(entry);
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
  if (!body) return;
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

  const pgContainer = document.getElementById('p-monitoramento');
  if (pgContainer) {
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

// ─── Acompanhamento Semanal ───

function renderAcompanhamentoSemanal() {
  const container = document.getElementById('monTabelaSemanal');
  const footerContainer = document.getElementById('monSemanalTotaisFooter');
  if (!container) return;

  const empFiltro = document.getElementById('monSemanalEmpresaFilter')?.value || monitorFilter || 'DAC';
  const fluxoFiltro = document.getElementById('monSemanalFluxoFilter')?.value || 'ambos';
  const emissaoFiltro = document.getElementById('monSemanalEmissaoFilter')?.value || 'ambos';
  const mesFiltro = document.getElementById('monSemanalMesFilter')?.value ?? '';
  const semanaFiltro = document.getElementById('monSemanalSemanaFilter')?.value || 'todas';

  const now = new Date();
  const anoAtual = now.getFullYear();

  const filterEntry = (item) => {
    if (!item) return false;
    // 1. Empresa
    if (empFiltro === 'DAC' && !isDACEntry(item)) return false;
    if (empFiltro === 'PULSE' && !isPulseEntry(item)) return false;

    // 2. Emissão
    if (emissaoFiltro === 'nf' && !isNotaFiscal(item)) return false;
    if (emissaoFiltro === 'pd' && !isPorPD(item)) return false;

    return true;
  };

  const rawItems = [];

  // Coleta Entradas
  if ((fluxoFiltro === 'ambos' || fluxoFiltro === 'entradas') && typeof ENT !== 'undefined' && Array.isArray(ENT)) {
    ENT.forEach(e => {
      if (!filterEntry(e)) return;
      const d = parseDate(e.data_pagamento || e.data_vencimento || e.data || e.data_emissao || e.pagamento);
      if (!d) return;
      if (mesFiltro !== '' && (d.getMonth() !== parseInt(mesFiltro, 10) || d.getFullYear() !== anoAtual)) return;
      const week = getWeekOfMonth(d);
      if (semanaFiltro !== 'todas' && String(week) !== String(semanaFiltro)) return;

      const val = getValOrEffective(e);
      if (val > 0) {
        rawItems.push({
          item: e,
          type: 'entrada',
          date: d,
          week: week,
          month: d.getMonth(),
          year: d.getFullYear(),
          val: val
        });
      }
    });
  }

  // Coleta Saídas (aba Saídas do Google Sheets)
  if ((fluxoFiltro === 'ambos' || fluxoFiltro === 'saidas') && typeof SAI !== 'undefined' && Array.isArray(SAI)) {
    SAI.forEach(s => {
      if (!filterEntry(s)) return;
      const d = parseDate(s.data_pagamento || s.data_vencimento || s.data_emissao || s.data || s.pagamento);
      if (!d) return;
      if (mesFiltro !== '' && (d.getMonth() !== parseInt(mesFiltro, 10) || d.getFullYear() !== anoAtual)) return;
      const week = getWeekOfMonth(d);
      if (semanaFiltro !== 'todas' && String(week) !== String(semanaFiltro)) return;

      const val = getValOrEffective(s);
      if (val > 0) {
        rawItems.push({
          item: s,
          type: 'saida',
          date: d,
          week: week,
          month: d.getMonth(),
          year: d.getFullYear(),
          val: val
        });
      }
    });
  }

  // Agrupa por semana
  const groupsMap = {};
  rawItems.forEach(entry => {
    const key = `${entry.year}-${String(entry.month).padStart(2, '0')}-W${entry.week}`;
    if (!groupsMap[key]) {
      groupsMap[key] = {
        label: getWeekLabel(entry.week, entry.month, entry.year),
        week: entry.week,
        month: entry.month,
        year: entry.year,
        key: key,
        entries: [],
        totalEntradas: 0,
        totalSaidas: 0
      };
    }
    groupsMap[key].entries.push(entry);
    if (entry.type === 'entrada') {
      groupsMap[key].totalEntradas += entry.val;
    } else {
      groupsMap[key].totalSaidas += entry.val;
    }
  });

  const sortedGroups = Object.values(groupsMap).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    return a.week - b.week;
  });

  let totalGeralEntradas = 0;
  let totalGeralSaidas = 0;

  sortedGroups.forEach(g => {
    totalGeralEntradas += g.totalEntradas;
    totalGeralSaidas += g.totalSaidas;
  });

  const saldoGeral = totalGeralEntradas - totalGeralSaidas;

  // Renderiza tabela / semanas
  if (sortedGroups.length === 0) {
    container.innerHTML = '<div class="mon-empty" style="padding: 24px 10px; font-size: 12px;">Nenhum lançamento encontrado para os filtros selecionados</div>';
  } else {
    let html = '';
    sortedGroups.forEach((group) => {
      const dateRange = getWeekDateRange(group.week, group.month, group.year);
      const isOpen = monOpenWeeks.has(group.key) || semanaFiltro !== 'todas' || sortedGroups.length === 1;

      let subtotalHeader = '';
      if (fluxoFiltro === 'ambos') {
        subtotalHeader = `
          <span style="color:#4ADE80; margin-right:8px;">Ent: ${fmt(group.totalEntradas)}</span>
          <span style="color:#F87171;">Sai: ${fmt(group.totalSaidas)}</span>
        `;
      } else if (fluxoFiltro === 'entradas') {
        subtotalHeader = `<span style="color:#4ADE80;">Total: ${fmt(group.totalEntradas)}</span>`;
      } else {
        subtotalHeader = `<span style="color:#F87171;">Total: ${fmt(group.totalSaidas)}</span>`;
      }

      html += `
        <div class="week-section ${isOpen ? 'is-open' : ''}">
          <div class="week-header week-toggle" onclick="toggleWeekSection(this, '${group.key}')" title="Clique para expandir/recolher">
            <span style="display:flex; align-items:center; gap:6px;">
              <span class="toggle-icon" style="display:inline-block; width:10px; color:var(--muted);">${isOpen ? '▾' : '▸'}</span>
              <strong style="color:var(--text-bright);">Sem ${group.week}</strong>
              <span style="color:var(--muted); font-size:11.5px; font-weight:500;">(${dateRange})</span>
            </span>
            <div class="week-total">${subtotalHeader}</div>
          </div>
          <div class="week-body" style="display:${isOpen ? 'block' : 'none'};">
            <div class="tw" style="max-height:none; overflow-x:auto;">
              <table style="width:100%;">
                <thead>
                  <tr>
                    <th style="font-size:11px; font-weight:700;">Pessoa / Razão</th>
                    <th style="font-size:11px; font-weight:700; width:95px; text-align:center;">Tipo & Doc</th>
                    <th style="font-size:11px; font-weight:700; text-align:right; width:110px;">Valor</th>
                    <th style="font-size:11px; font-weight:700; width:75px; text-align:center;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${group.entries.map(e => {
                    const it = e.item;
                    const isEnt = e.type === 'entrada';
                    const docTag = isNotaFiscal(it) ? 'NF' : 'PD';
                    const name = it.cliente || it.fornecedor || '—';
                    const st = it.status || '—';
                    const isPago = String(st).toLowerCase() === 'pago';

                    return `
                      <tr>
                        <td style="font-size:12px; font-weight:500; color:var(--text);">${name}</td>
                        <td style="text-align:center;">
                          <span class="${isEnt ? 'badge-tipo-ent' : 'badge-tipo-sai'}">${isEnt ? '↓ Ent' : '↑ Sai'}</span>
                          <span class="badge-emissao">${docTag}</span>
                        </td>
                        <td style="text-align:right; font-family:'JetBrains Mono',monospace; font-size:12.5px; font-weight:700; color:${isEnt ? '#4ADE80' : '#F87171'};">
                          ${isEnt ? '+' : '-'} ${fmt(e.val)}
                        </td>
                        <td style="text-align:center;">
                          <span class="st ${isPago ? 'sg' : 'sp'}" style="font-size:10px; padding:2px 6px;">${st}</span>
                        </td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
    });

    container.innerHTML = html;
  }

  // Renderiza Totais no Rodapé
  if (footerContainer) {
    footerContainer.innerHTML = `
      <div class="mon-semanal-totals">
        <div class="mon-total-box ent">
          <div class="mon-total-label">Total Entradas</div>
          <div class="mon-total-val" style="color:#4ADE80;">${fmt(totalGeralEntradas)}</div>
        </div>
        <div class="mon-total-box sai">
          <div class="mon-total-label">Total Saídas</div>
          <div class="mon-total-val" style="color:#F87171;">${fmt(totalGeralSaidas)}</div>
        </div>
        <div class="mon-total-box bal">
          <div class="mon-total-label">Saldo do Período</div>
          <div class="mon-total-val" style="color:${saldoGeral >= 0 ? '#4ADE80' : '#F87171'};">${fmt(saldoGeral)}</div>
        </div>
      </div>
    `;
  }
}

// ─── Acompanhamento Anual Unificado (Gráfico em Linha com Marcadores e Rótulos) ───

function renderAcompanhamentoAnualChart() {
  const canvas = document.getElementById('monAcompanhamentoAnualCanvas');
  if (!canvas) return;

  const empFiltro = document.getElementById('monAnualEmpresaFilter')?.value || 'ambos';
  const fluxoFiltro = document.getElementById('monAnualFluxoFilter')?.value || 'ambos';
  const emissaoFiltro = document.getElementById('monAnualEmissaoFilter')?.value || 'ambos';

  const now = new Date();
  let anoAtual = now.getFullYear();

  // Se não houver lançamentos em ENT ou SAI no ano corrente, verifica o ano dos lançamentos existentes
  const allYears = [];
  if (typeof ENT !== 'undefined' && Array.isArray(ENT)) {
    ENT.forEach(e => {
      const d = parseDate(e.data_pagamento || e.data_vencimento || e.data_emissao || e.data || e.pagamento);
      if (d && !isNaN(d.getTime())) allYears.push(d.getFullYear());
    });
  }
  if (typeof SAI !== 'undefined' && Array.isArray(SAI)) {
    SAI.forEach(s => {
      const d = parseDate(s.data_pagamento || s.data_vencimento || s.data_emissao || s.data || s.pagamento);
      if (d && !isNaN(d.getTime())) allYears.push(d.getFullYear());
    });
  }
  if (allYears.length > 0 && !allYears.includes(anoAtual)) {
    anoAtual = Math.max(...allYears);
  }

  const filterEntry = (item) => {
    if (!item) return false;
    // 1. Filtro Empresa
    if (empFiltro === 'DAC' && !isDACEntry(item)) return false;
    if (empFiltro === 'PULSE' && !isPulseEntry(item)) return false;

    // 2. Filtro Emissão
    if (emissaoFiltro === 'nf' && !isNotaFiscal(item)) return false;
    if (emissaoFiltro === 'pd' && !isPorPD(item)) return false;

    return true;
  };

  const entradasMes = new Array(12).fill(0);
  const saidasMes = new Array(12).fill(0);

  // 1. Entradas (aba Entradas do Google Sheets)
  if (typeof ENT !== 'undefined' && Array.isArray(ENT)) {
    ENT.forEach(e => {
      const d = parseDate(e.data_pagamento || e.data_vencimento || e.data_emissao || e.data || e.pagamento);
      if (!d || d.getFullYear() !== anoAtual) return;
      if (filterEntry(e)) {
        entradasMes[d.getMonth()] += getValOrEffective(e);
      }
    });
  }

  // 2. Saídas (aba Saídas do Google Sheets)
  if (typeof SAI !== 'undefined' && Array.isArray(SAI)) {
    SAI.forEach(s => {
      const d = parseDate(s.data_pagamento || s.data_vencimento || s.data_emissao || s.data || s.pagamento);
      if (!d || d.getFullYear() !== anoAtual) return;
      if (filterEntry(s)) {
        saidasMes[d.getMonth()] += getValOrEffective(s);
      }
    });
  }

  const ctx = canvas.getContext('2d');

  // Gradientes sutis para as curvas
  const gradEntradas = ctx.createLinearGradient(0, 0, 0, 260);
  gradEntradas.addColorStop(0, 'rgba(74, 222, 128, 0.22)');
  gradEntradas.addColorStop(1, 'rgba(74, 222, 128, 0.00)');

  const gradSaidas = ctx.createLinearGradient(0, 0, 0, 260);
  gradSaidas.addColorStop(0, 'rgba(196, 18, 48, 0.22)');
  gradSaidas.addColorStop(1, 'rgba(196, 18, 48, 0.00)');

  const datasets = [];

  const isMobile = window.innerWidth <= 900 || ('ontouchstart' in window && window.innerWidth <= 1024);
  const hoverRadius = isMobile ? 7.5 : 10.5;

  if (fluxoFiltro === 'ambos' || fluxoFiltro === 'entradas') {
    datasets.push({
      label: 'Entradas',
      data: entradasMes,
      borderColor: '#4ADE80',
      backgroundColor: gradEntradas,
      borderWidth: 3.5,
      tension: 0.35,
      fill: true,
      pointStyle: 'rectRot',
      pointRadius: 7.5,
      pointHoverRadius: hoverRadius,
      pointBackgroundColor: '#4ADE80',
      pointBorderColor: '#0B0B10',
      pointBorderWidth: 2,
      order: 1
    });
  }

  if (fluxoFiltro === 'ambos' || fluxoFiltro === 'saidas') {
    datasets.push({
      label: 'Saídas',
      data: saidasMes,
      borderColor: '#C41230',
      backgroundColor: gradSaidas,
      borderWidth: 3.5,
      tension: 0.35,
      fill: true,
      pointStyle: 'rectRot',
      pointRadius: 7.5,
      pointHoverRadius: hoverRadius,
      pointBackgroundColor: '#C41230',
      pointBorderColor: '#0B0B10',
      pointBorderWidth: 2,
      order: 2
    });
  }

  if (monAcompanhamentoAnualChart) {
    monAcompanhamentoAnualChart.destroy();
    monAcompanhamentoAnualChart = null;
  }

  monAcompanhamentoAnualChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MESES_NOMES,
      datasets: datasets
    },
    plugins: [monAnualDataLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      events: isMobile ? [] : ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
      interaction: isMobile ? { mode: null } : {
        mode: 'index',
        intersect: false
      },
      hover: isMobile ? { mode: null } : {
        mode: 'index',
        intersect: false
      },
      layout: {
        padding: {
          top: 36,
          bottom: 6,
          left: 12,
          right: 18
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            pointStyle: 'rectRot',
            boxWidth: 10,
            boxHeight: 10,
            padding: 14,
            font: {
              family: "'DM Sans', sans-serif",
              size: 11,
              weight: '600'
            },
            color: '#D4D4DA'
          }
        },
        tooltip: {
          enabled: !isMobile,
          backgroundColor: 'rgba(20, 20, 25, 0.95)',
          titleFont: { family: "'DM Sans', sans-serif", size: 12, weight: '700' },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
          padding: 12,
          cornerRadius: 8,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: ${fmt(context.parsed.y)}`;
            },
            afterBody: function(contexts) {
              if (fluxoFiltro === 'ambos' && contexts.length >= 2) {
                const entVal = entradasMes[contexts[0].dataIndex] || 0;
                const saiVal = saidasMes[contexts[0].dataIndex] || 0;
                const saldo = entVal - saiVal;
                return `\n Saldo Líquido: ${fmt(saldo)}`;
              }
              return '';
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)',
            drawTicks: false
          },
          ticks: {
            color: '#8A8A96',
            font: { family: "'DM Sans', sans-serif", size: 11, weight: '500' },
            padding: 8
          }
        },
        y: {
          beginAtZero: true,
          grace: '15%',
          grid: {
            color: 'rgba(255, 255, 255, 0.03)'
          },
          ticks: {
            color: '#5A5A6A',
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            callback: function(v) {
              if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1) + 'M';
              if (v >= 1000) return 'R$ ' + (v / 1000).toFixed(0) + 'k';
              return 'R$ ' + v;
            },
            padding: 8
          }
        }
      }
    }
  });

  // Auto-scroll horizontal suave para centralizar o mês atual em telas menores
  const scrollWrap = document.querySelector('.mon-chart-scroll-wrap');
  if (scrollWrap && scrollWrap.scrollWidth > scrollWrap.clientWidth) {
    const currentMonthIndex = new Date().getMonth();
    const scrollTarget = Math.max(0, (scrollWrap.scrollWidth / 12) * (currentMonthIndex - 1.2));
    setTimeout(() => {
      scrollWrap.scrollTo({ left: scrollTarget, behavior: 'smooth' });
    }, 150);
  }
}

// ─── Helper de Valor Monetário ───
function getValOrEffective(s) {
  if (!s) return 0;
  const status = String(s.status || '').trim().toLowerCase();
  if (status === 'cancelado') return 0;

  // 1. Linha consolidada de parcelas
  if (s._groupItems && Array.isArray(s._groupItems) && s._groupItems.length > 0) {
    const sumGroup = s._groupItems.reduce((acc, item) => {
      if (!item) return acc;
      const st = String(item.status || '').trim().toLowerCase();
      if (st === 'cancelado') return acc;
      const vp = typeof parseVal === 'function' ? parseVal(item.valor_pago) : (parseFloat(item.valor_pago) || 0);
      const v = typeof parseVal === 'function' ? parseVal(item.valor) : (parseFloat(item.valor) || 0);
      return acc + (vp > 0 ? vp : v);
    }, 0);
    if (sumGroup > 0) return sumGroup;
  }

  // 2. Se getEffectiveValue retornar valor positivo (status pago/parcial)
  if (typeof getEffectiveValue === 'function') {
    const eff = getEffectiveValue(s);
    if (eff > 0) return eff;
  }

  // 3. Fallback: valor_pago ou valor nominal se não cancelado
  const valorPago = typeof parseVal === 'function' ? parseVal(s.valor_pago) : (parseFloat(s.valor_pago) || 0);
  const valor = typeof parseVal === 'function' ? parseVal(s.valor) : (parseFloat(s.valor) || 0);

  if (status === 'pago') return valorPago > 0 ? valorPago : valor;
  if (status === 'parcial') return valorPago > 0 ? valorPago : valor;

  return valorPago > 0 ? valorPago : (valor > 0 ? valor : 0);
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
