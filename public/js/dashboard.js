/* ═══════════════════════════════════════════════
   dashboard.js — Gráficos:
   KPIs, Indicadores de Saúde,
   Sparklines de contas e filtros
   ═══════════════════════════════════════════════ */

// ─── Estado Global dos KPIs ───
let currentKpiFilter = 'geral';

function setKpiFilter(period, btn) {
  currentKpiFilter = period;
  document.querySelectorAll('.kpi-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderKpis();
}

// ─── População dos filtros ───

function populateFilters() {
  const eCl = document.getElementById('eCliente');
  const eFp = document.getElementById('eForma');
  const sCat = document.getElementById('sCat');
  const sForn = document.getElementById('sForn');
  const pECl = eCl.value, pEFp = eFp.value, pSCat = sCat.value, pSForn = sForn.value;

  eCl.innerHTML = '<option value="">Todos Clientes</option>' +
    [...new Set(ENT.map(e => e.cliente).filter(Boolean))].sort().map(c => `<option>${c}</option>`).join('');
  eFp.innerHTML = '<option value="">Todas Formas</option>' +
    [...new Set(ENT.map(e => e.forma_pagamento).filter(Boolean))].sort().map(f => `<option>${f}</option>`).join('');
  sCat.innerHTML = '<option value="">Todas Categorias</option>' +
    [...new Set(SAI.map(s => s.categoria).filter(Boolean))].sort().map(c => `<option>${c}</option>`).join('');
  sForn.innerHTML = '<option value="">Todos Fornecedores</option>' +
    [...new Set(SAI.map(s => s.fornecedor).filter(Boolean))].sort().map(f => `<option>${f}</option>`).join('');

  eCl.value = pECl; eFp.value = pEFp; sCat.value = pSCat; sForn.value = pSForn;
}

// ─── Indicadores de Saúde Financeira ───

function renderIndicadores() {
  const now = new Date();
  const mesAtual = now.getMonth(), anoAtual = now.getFullYear();
  const nomeMeses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const isMes = (item, mes, ano) => {
    const d = parseDate(item.data_pagamento || item.data_vencimento);
    return d && d.getMonth() === mes && d.getFullYear() === ano;
  };
  const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
  const anoMesAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;

  const entMes = ENT.filter(e => isMes(e, mesAtual, anoAtual));
  const saiMes = SAI.filter(s => isMes(s, mesAtual, anoAtual));
  const totalEntMes = entMes.reduce((s, e) => s + getEffectiveValue(e), 0);
  const totalSaiMes = saiMes.reduce((s, e) => s + getEffectiveValue(e), 0);

  const entMesAnt = ENT.filter(e => isMes(e, mesAnterior, anoMesAnterior));
  const saiMesAnt = SAI.filter(s => isMes(s, mesAnterior, anoMesAnterior));
  const totalEntMesAnt = entMesAnt.reduce((s, e) => s + getEffectiveValue(e), 0);
  const totalSaiMesAnt = saiMesAnt.reduce((s, e) => s + getEffectiveValue(e), 0);

  // 1. Margem Operacional
  const margemAtual = totalEntMes > 0 ? ((totalEntMes - totalSaiMes) / totalEntMes) * 100 : 0;
  const margemAnterior = totalEntMesAnt > 0 ? ((totalEntMesAnt - totalSaiMesAnt) / totalEntMesAnt) * 100 : 0;
  const diffMargem = margemAtual - margemAnterior;
  const margemArrow = diffMargem >= 0 ? '▲' : '▼';
  const margemSub = totalEntMesAnt > 0
    ? `${margemArrow} ${diffMargem >= 0 ? '+' : ''}${diffMargem.toFixed(1)}pp vs mês ant.`
    : '● Sem dados do mês anterior';
  const margemSubClass = diffMargem >= 0 ? 'sub-g' : 'sub-r';

  // 2. Inadiplência (usa valor restante para parciais)
  const inadimplentes = ENT.filter(e => {
    if (!e.status || e.status === 'Pago') return false;
    const venc = parseDate(e.data_vencimento);
    return venc && venc < now;
  });
  const totalInadimplencia = inadimplentes.reduce((s, e) => {
    const val = parseFloat(e.valor || 0);
    const pago = parseFloat(e.valor_pago || 0);
    return s + Math.max(0, val - pago);
  }, 0);
  const totalFaturamento = ENT.reduce((s, e) => s + getEffectiveValue(e), 0);
  const pctInadimplencia = totalFaturamento > 0 ? ((totalInadimplencia / totalFaturamento) * 100).toFixed(1) : '0,0';
  const inadSubClass = totalInadimplencia === 0 ? 'sub-g' : (parseFloat(pctInadimplencia) > 5 ? 'sub-r' : 'sub-y');
  const inadSub = totalInadimplencia === 0 ? '✓ Nenhuma inadimplência' : `● ${pctInadimplencia}% do faturamento`;

  // 3. Contas a Receber (usa valor restante para parciais)
  const contasReceber = ENT.filter(e => e.status && e.status !== 'Pago');
  const totalReceber = contasReceber.reduce((s, e) => {
    const val = parseFloat(e.valor || 0);
    const pago = parseFloat(e.valor_pago || 0);
    return s + Math.max(0, val - pago);
  }, 0);
  const receberSub = contasReceber.length > 0
    ? `● ${contasReceber.length} boleto${contasReceber.length > 1 ? 's' : ''} pendente${contasReceber.length > 1 ? 's' : ''}`
    : '✓ Nenhum pendente';
  const receberSubClass = contasReceber.length === 0 ? 'sub-g' : 'sub-y';

  // 4. Contas a Pagar (usa valor restante para parciais)
  const contasPagar = SAI.filter(s => s.status && s.status !== 'Pago');
  const totalPagar = contasPagar.reduce((s, e) => {
    const val = parseFloat(e.valor || 0);
    const pago = parseFloat(e.valor_pago || 0);
    return s + Math.max(0, val - pago);
  }, 0);
  let pagarSub = '✓ Tudo em dia';
  let pagarSubClass = 'sub-g';
  if (contasPagar.length > 0) {
    const vencimentos = contasPagar.map(s => parseDate(s.data_vencimento)).filter(Boolean).sort((a, b) => a - b);
    if (vencimentos.length > 0) {
      const diasAteVenc = Math.ceil((vencimentos[0] - now) / (1000 * 60 * 60 * 24));
      pagarSub = diasAteVenc <= 0
        ? `⚠ ${contasPagar.length} vencida${contasPagar.length > 1 ? 's' : ''}`
        : `● Vence em ${diasAteVenc} dia${diasAteVenc > 1 ? 's' : ''}`;
      pagarSubClass = diasAteVenc <= 3 ? 'sub-r' : 'sub-y';
    } else {
      pagarSub = `● ${contasPagar.length} pendente${contasPagar.length > 1 ? 's' : ''}`;
      pagarSubClass = 'sub-y';
    }
  }

  // 5. EBITDA Estimado
  const ebitda = totalEntMes - totalSaiMes;
  const margemEbitda = totalEntMes > 0 ? ((ebitda / totalEntMes) * 100).toFixed(1) : '0,0';
  const ebitdaArrow = ebitda >= 0 ? '▲' : '▼';
  const ebitdaSubClass = ebitda >= 0 ? 'sub-g' : 'sub-r';

  // 6. Despesas Fixas
  const isDespesaFixa = s => s.categoria !== 'ENTRADA DE MERCADORIA';
  const despFixasMes = saiMes.filter(isDespesaFixa).reduce((s, e) => s + getEffectiveValue(e), 0);
  const despFixasMesAnt = saiMesAnt.filter(isDespesaFixa).reduce((s, e) => s + getEffectiveValue(e), 0);
  const diffDesp = despFixasMesAnt > 0 ? ((despFixasMes - despFixasMesAnt) / despFixasMesAnt * 100).toFixed(1) : 0;
  const despArrow = parseFloat(diffDesp) > 0 ? '▼' : '▲';
  const despSubClass = parseFloat(diffDesp) > 0 ? 'sub-r' : 'sub-g';
  const despSub = despFixasMesAnt > 0
    ? `${despArrow} ${parseFloat(diffDesp) > 0 ? '+' : ''}${diffDesp}% vs mês ant.`
    : '● Sem dados do mês anterior';

  // 7. Clientes Ativos (últimos 90 dias)
  const limite90d = new Date(now); limite90d.setDate(limite90d.getDate() - 90);
  const clientesAtivos = new Set();
  const clientesMesAtual = new Set();
  const clientesMesAnterior = new Set();
  ENT.forEach(e => {
    const d = parseDate(e.data_pagamento || e.data_vencimento);
    if (d && d >= limite90d && e.cliente) clientesAtivos.add(e.cliente);
    if (d && d.getMonth() === mesAtual && d.getFullYear() === anoAtual && e.cliente) clientesMesAtual.add(e.cliente);
    if (d && d.getMonth() === mesAnterior && d.getFullYear() === anoMesAnterior && e.cliente) clientesMesAnterior.add(e.cliente);
  });
  const novos = [...clientesMesAtual].filter(c => !clientesMesAnterior.has(c));
  const cliSub = novos.length > 0
    ? `▲ +${novos.length} novo${novos.length > 1 ? 's' : ''} em ${nomeMeses[mesAtual]}/${String(anoAtual).slice(2)}`
    : `● Sem novos em ${nomeMeses[mesAtual]}/${String(anoAtual).slice(2)}`;
  const cliSubClass = novos.length > 0 ? 'sub-g' : 'sub-y';

  const indicadores = [
    { label: 'Margem Operacional', val: margemAtual.toFixed(1).replace('.', ',') + '%', sub: margemSub, subClass: margemSubClass, tip: 'Relação entre o lucro operacional e a receita líquida. Indica a eficiência operacional antes de impostos e juros.' },
    { label: 'Inadimplência', val: fmt(totalInadimplencia), sub: inadSub, subClass: inadSubClass, tip: 'Valor total de faturas não pagas na data de vencimento em relação ao faturamento total do período.' },
    { label: 'Contas a receber', val: fmt(totalReceber), sub: receberSub, subClass: receberSubClass, tip: 'Soma de todos os valores que a empresa tem a receber de clientes no curto e médio prazo.' },
    { label: 'Contas a pagar', val: fmt(totalPagar), sub: pagarSub, subClass: pagarSubClass, tip: 'Soma de todas as obrigações e boletos que precisam ser pagos aos fornecedores nos próximos dias.' },
    { label: 'EBITDA estimado', val: fmt(ebitda), sub: `${ebitdaArrow} Margem ${margemEbitda.replace('.', ',')}%`, subClass: ebitdaSubClass, tip: 'Lucro antes de juros, impostos, depreciação e amortização. Mostra a geração de caixa operacional da empresa.' },
    { label: 'Despesas fixas', val: fmt(despFixasMes), sub: despSub, subClass: despSubClass, tip: 'Custos que não variam com o volume de atendimento (aluguel, folha base, sistemas).' },
    { label: 'Clientes ativos', val: String(clientesAtivos.size), sub: cliSub, subClass: cliSubClass, tip: 'Total de clientes (hospitais/clínicas) que transacionaram com a empresa nos últimos 90 dias.' }
  ];

  document.getElementById('indContainer').innerHTML = indicadores.map(item => `
    <div class="ind-card">
      <div class="ind-tip">${item.tip}</div>
      <div class="ind-label">
        ${item.label}
        <span class="ind-info">i</span>
      </div>
      <div class="ind-val">${item.val}</div>
      <div class="ind-sub ${item.subClass}">${item.sub}</div>
    </div>
  `).join('');
}

// ─── Sparklines por Conta Bancária ───

let sparkCharts = [];

function renderContaSparklines() {
  const container = document.getElementById('contaSparkContainer');
  sparkCharts.forEach(c => c.destroy());
  sparkCharts = [];

  const now = new Date(), cut = new Date(now);
  cut.setDate(cut.getDate() - 30);
  const contaMap = {};

  const addToMap = (arr, isEnt) => {
    arr.forEach(item => {
      const d = parseDate(item.data_pagamento || item.data_vencimento);
      if (!d) return;
      d.setHours(0, 0, 0, 0);
      if (d < cut) return;
      const conta = item.conta_bancaria || 'Sem Conta';
      if (!contaMap[conta]) contaMap[conta] = { total: 0, days: {} };
      const key = toIso(d);
      if (!contaMap[conta].days[key]) contaMap[conta].days[key] = 0;
      const effVal = getEffectiveValue(item);
      if (isEnt) { contaMap[conta].days[key] += effVal; contaMap[conta].total += effVal; }
      else { contaMap[conta].days[key] -= effVal; contaMap[conta].total -= effVal; }
    });
  };
  addToMap(ENT, true);
  addToMap(SAI, false);

  const dayKeys = [];
  for (let i = 30; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    dayKeys.push(toIso(d));
  }

  const contas = Object.entries(contaMap).sort((a, b) => b[1].total - a[1].total);
  if (contas.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px;">Nenhuma conta bancária encontrada</div>';
    return;
  }

  let html = '<div class="spark-grid">';
  contas.forEach(([conta, info], idx) => {
    const saldo = info.total;
    const saldoColor = saldo >= 0 ? '#4ADE80' : '#C41230';
    html += `
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;align-items:center;gap:16px;height:100%;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:var(--muted);font-weight:600;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${conta}</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;color:${saldoColor};">${fmt(saldo)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px;">Saldo 30 dias</div>
        </div>
        <div style="width:100px;height:50px;flex:0 0 100px;">
          <canvas id="spark_${idx}" style="width:100%;height:100%;"></canvas>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;

  contas.forEach(([conta, info], idx) => {
    const el = document.getElementById('spark_' + idx);
    if (!el) return;
    const data = dayKeys.map(k => info.days[k] || 0);
    const sc = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: dayKeys.map(() => ''),
        datasets: [{
          data,
          backgroundColor: data.map(v => v >= 0 ? 'rgba(74,222,128,.6)' : 'rgba(196,18,48,.6)'),
          borderRadius: 2, barPercentage: 0.8, categoryPercentage: 0.9
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 600 }
      }
    });
    sparkCharts.push(sc);
  });
}

// ─── Filtro de meses para Evolução de Despesas ───

function populateGeneralMonthFilters() {
  const months = new Set();
  const addMonths = (arr) => arr.forEach(item => {
    const d = parseDate(item.data_pagamento || item.data_vencimento);
    if (d) {
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      months.add(k);
    }
  });
  
  addMonths(ENT);
  addMonths(SAI);
  
  const sorted = [...months].sort().reverse();
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const monthHtml = sorted.map(m => {
    const [y, mo] = m.split('-');
    return `<option value="${m}">${nomes[parseInt(mo) - 1]}/${y}</option>`;
  }).join('');

  const ids = ['recClienteMes', 'saiCatMes', 'recFormaMes', 'despMes'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const current = el.value;
      el.innerHTML = (id === 'despMes' ? '<option value="0">Geral</option>' : '<option value="0">Todos</option>') + monthHtml;
      el.value = current;
    }
  });
}

// ─── Atualização dos KPIs Globais ───

function renderKpis() {
  const container = document.getElementById('dashKpis');
  if (!container) return;

  const now = new Date();
  const mesAtual = now.getMonth();
  const anoAtual = now.getFullYear();

  let fEnt = ENT;
  let fSai = SAI;

  if (currentKpiFilter === 'mensal') {
    fEnt = ENT.filter(e => {
      const d = parseDate(e.data_pagamento || e.data_vencimento);
      return d && d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    });
    fSai = SAI.filter(s => {
      const d = parseDate(s.data_pagamento || s.data_vencimento);
      return d && d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    });
  } else if (currentKpiFilter === 'anual') {
    fEnt = ENT.filter(e => {
      const d = parseDate(e.data_pagamento || e.data_vencimento);
      return d && d.getFullYear() === anoAtual;
    });
    fSai = SAI.filter(s => {
      const d = parseDate(s.data_pagamento || s.data_vencimento);
      return d && d.getFullYear() === anoAtual;
    });
  }

  const totalEnt = fEnt.reduce((acc, e) => acc + getEffectiveValue(e), 0);
  const totalSai = fSai.reduce((acc, s) => acc + getEffectiveValue(s), 0);
  const saldo = totalEnt - totalSai;
  const sColor = saldo >= 0 ? 'var(--green)' : 'var(--red)';

  container.innerHTML = `
    <div class="kbox">
      <div class="kc" style="display:flex;align-items:center;justify-content:space-between;padding:26px 24px;">
        <div>
          <div class="kc-l">Receitas Totais</div>
          <div class="kc-v" style="color:var(--green);font-size:28px;margin-top:8px;">${fmt(totalEnt)}</div>
        </div>
        <div style="width:48px;height:48px;border-radius:12px;background:rgba(74,222,128,.1);display:flex;align-items:center;justify-content:center;color:#4ADE80;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
        </div>
      </div>
    </div>
    <div class="kbox">
      <div class="kc" style="display:flex;align-items:center;justify-content:space-between;padding:26px 24px;">
        <div>
          <div class="kc-l">Despesas Totais</div>
          <div class="kc-v" style="color:var(--red);font-size:28px;margin-top:8px;">${fmt(totalSai)}</div>
        </div>
        <div style="width:48px;height:48px;border-radius:12px;background:rgba(196,18,48,.1);display:flex;align-items:center;justify-content:center;color:var(--red);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline><polyline points="16 17 22 17 22 11"></polyline></svg>
        </div>
      </div>
    </div>
    <div class="kbox">
      <div class="kc" style="display:flex;align-items:center;justify-content:space-between;padding:26px 24px;">
        <div>
          <div class="kc-l">Saldo Geral</div>
          <div class="kc-v" style="color:${sColor};font-size:28px;margin-top:8px;">${fmt(saldo)}</div>
        </div>
        <div style="width:48px;height:48px;border-radius:12px;background:${saldo >= 0 ? 'rgba(74,222,128,.1)' : 'rgba(196,18,48,.1)'};display:flex;align-items:center;justify-content:center;color:${sColor};">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        </div>
      </div>
    </div>
  `;
}

// ─── Feed de Notícias Inteligentes ───

function renderSmartNewsFeed() {
  const container = document.getElementById('smartNewsFeed');
  if (!container) return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let news = [];

  // Função auxiliar para data exata amanhã
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 1. Maior receita de hoje
  const entHoje = ENT.filter(e => {
    const d = parseDate(e.data_pagamento || e.data_vencimento);
    return d && d >= today && d < tomorrow;
  });
  if (entHoje.length > 0) {
    const maxEnt = entHoje.reduce((max, e) => getEffectiveValue(e) > getEffectiveValue(max) ? e : max, entHoje[0]);
    if (getEffectiveValue(maxEnt) > 0) {
      news.push({
        icon: '💰',
        title: 'Maior Entrada do Dia',
        desc: `Recebimento de <b>${maxEnt.cliente || 'Cliente não informado'}</b> no valor de <span style="color:#4ADE80;font-weight:600">${fmt(getEffectiveValue(maxEnt))}</span>.`
      });
    }
  }

  // 2. Maior despesa de hoje
  const saiHoje = SAI.filter(s => {
    const dPag = parseDate(s.data_pagamento);
    const dVenc = parseDate(s.data_vencimento);
    const isTodayPag = dPag && dPag >= today && dPag < tomorrow;
    const isTodayVenc = dVenc && dVenc >= today && dVenc < tomorrow;
    return isTodayPag || isTodayVenc;
  });
  if (saiHoje.length > 0) {
    const maxSai = saiHoje.reduce((max, s) => getEffectiveValue(s) > getEffectiveValue(max) ? s : max, saiHoje[0]);
    if (getEffectiveValue(maxSai) > 0) {
      news.push({
        icon: '💸',
        title: 'Maior Saída do Dia',
        desc: `Pagamento para <b>${maxSai.fornecedor || maxSai.categoria}</b> de <span style="color:var(--red);font-weight:600">${fmt(getEffectiveValue(maxSai))}</span>.`
      });
    }
  }

  // 3. Contas vencendo hoje
  const pagarHoje = SAI.filter(s => {
    if (s.status === 'Pago') return false;
    const venc = parseDate(s.data_vencimento);
    if (!venc) return false;
    venc.setHours(0,0,0,0);
    return venc.getTime() === today.getTime();
  });
  if (pagarHoje.length > 0) {
    const totalPagarHoje = pagarHoje.reduce((acc, s) => acc + getEffectiveValue(s), 0);
    news.push({
      icon: '🔔',
      title: 'Vencimentos de Hoje',
      desc: `Você tem <b>${pagarHoje.length}</b> conta(s) vencendo hoje, totalizando <span style="color:var(--accent2);font-weight:600">${fmt(totalPagarHoje)}</span>.`
    });
  }

  // 4. Inadimplência ou Atrasos de Recebimento
  const atrasadas = ENT.filter(e => {
    if (e.status === 'Pago') return false;
    const venc = parseDate(e.data_vencimento);
    if (!venc) return false;
    venc.setHours(0,0,0,0);
    return venc < today;
  });
  if (atrasadas.length > 0) {
    const totalAtraso = atrasadas.reduce((acc, e) => {
      const val = parseFloat(e.valor || 0);
      const pago = parseFloat(e.valor_pago || 0);
      return acc + Math.max(0, val - pago);
    }, 0);
    news.push({
      icon: '⚠️',
      title: 'Atenção a Recebimentos',
      desc: `Há <b>${atrasadas.length}</b> recebimento(s) em atraso, somando <span style="color:var(--red);font-weight:600">${fmt(totalAtraso)}</span>.`
    });
  } else if (ENT.length > 0) {
    news.push({
      icon: '✅',
      title: 'Inadimplência Zero',
      desc: `Excelente! Todos os seus recebimentos vencidos até hoje estão constando como pagos.`
    });
  }

  // 5. Boletos a pagar atrasados
  const pagAtrasadas = SAI.filter(s => {
    if (s.status === 'Pago') return false;
    const venc = parseDate(s.data_vencimento);
    if (!venc) return false;
    venc.setHours(0,0,0,0);
    return venc < today;
  });
  if (pagAtrasadas.length > 0) {
    const totalPagAtraso = pagAtrasadas.reduce((acc, s) => {
      const val = parseFloat(s.valor || 0);
      const pago = parseFloat(s.valor_pago || 0);
      return acc + Math.max(0, val - pago);
    }, 0);
    news.push({
      icon: '🚨',
      title: 'Despesas Atrasadas',
      desc: `Atenção! Existem <b>${pagAtrasadas.length}</b> despesa(s) em atraso, totalizando <span style="color:var(--red);font-weight:600">${fmt(totalPagAtraso)}</span>.`
    });
  }

  // 6. Resumo do Mês Atual
  const mesAtual = now.getMonth();
  const anoAtual = now.getFullYear();
  const entMes = ENT.filter(e => {
    const d = parseDate(e.data_pagamento || e.data_vencimento);
    return d && d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  }).reduce((acc, e) => acc + getEffectiveValue(e), 0);
  const saiMes = SAI.filter(s => {
    const d = parseDate(s.data_pagamento || s.data_vencimento);
    return d && d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  }).reduce((acc, s) => acc + getEffectiveValue(s), 0);
  
  const saldoMes = entMes - saiMes;
  if (entMes > 0 || saiMes > 0) {
    const corSaldo = saldoMes >= 0 ? '#4ADE80' : 'var(--red)';
    news.push({
      icon: '📊',
      title: 'Balanço Parcial do Mês',
      desc: `Até o momento, o saldo deste mês é de <span style="color:${corSaldo};font-weight:600">${fmt(saldoMes)}</span>.`
    });
  }

  // Se não tiver notícias suficientes, colocar uma default
  if (news.length === 0) {
    news.push({
      icon: '🌱',
      title: 'Tudo tranquilo',
      desc: 'Continue registrando suas movimentações para gerar novos insights inteligentes.'
    });
  }

  // Randomizar o array
  for (let i = news.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [news[i], news[j]] = [news[j], news[i]];
  }

  // Pegar os primeiros 4 no máximo
  const selectedNews = news.slice(0, 4);

  container.innerHTML = selectedNews.map(n => `
    <div style="display:flex;gap:12px;background:var(--card2);padding:14px;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;animation:fuUp .3s ease both;">
      <div style="font-size:24px;line-height:1;">${n.icon}</div>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--text-bright);margin-bottom:4px;">${n.title}</div>
        <div style="font-size:12px;color:var(--muted2);line-height:1.4;">${n.desc}</div>
      </div>
    </div>
  `).join('');
}
