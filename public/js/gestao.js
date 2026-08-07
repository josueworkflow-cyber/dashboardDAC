/* ═══════════════════════════════════════════════
   gestao.js — Página "Gestão de Dados":
   tabela, abas, formulário de lançamento,
   exportação CSV e toasts de feedback
   ═══════════════════════════════════════════════ */

let gestaoTab = 'todos';
let gestaoConfig = { webhookConfigured: false, devMode: true };
let currentEditId = null;
let currentEditTipo = null;

// ─── Toggle campos de parcela conforme status ───

function toggleParcelaFields() {
  const status = document.getElementById('gf-status').value;
  const show = status === 'Parcial';
  document.querySelectorAll('.gf-parcela-field').forEach(el => {
    el.style.display = show ? '' : 'none';
  });
  if (show) {
    // Se estiver abrindo agora e o campo de parcelas estiver vazio, limpa a lista
    if (!document.getElementById('gf-parcelas').value) {
      document.getElementById('gf-parcelas-list').innerHTML = '';
    } else {
      gerarParcelasCards();
    }
  }
}

function gerarParcelasCards() {
  const num = parseInt(document.getElementById('gf-parcelas').value, 10) || 0;
  const list = document.getElementById('gf-parcelas-list');
  const interval = document.querySelector('input[name="gf-intervalo"]:checked').value;
  const baseDate = document.getElementById('gf-dvenc').value;
  const baseVal = parseVal(document.getElementById('gf-val').value) || 0;

  if (num <= 0) {
    list.innerHTML = '';
    return;
  }

  // Se o número de parcelas mudou ou é a primeira vez, gera os campos
  const currentCount = list.querySelectorAll('.parcela-card').length;
  
  // Para simplificar, sempre regeramos se for "Auto" (não custom) ou se o número mudou
  if (num !== currentCount || interval !== 'custom') {
    let html = '';
    const valorSugerido = (baseVal / num).toFixed(2);
    
    for (let i = 1; i <= num; i++) {
      let dataVenc = baseDate;
      if (baseDate && interval !== 'custom') {
        const d = new Date(baseDate + 'T12:00:00');
        if (interval === '30') d.setMonth(d.getMonth() + (i - 1));
        else if (interval === '15') d.setDate(d.getDate() + ((i - 1) * 15));
        else if (interval === '7') d.setDate(d.getDate() + ((i - 1) * 7));
        dataVenc = toIso(d);
      }

      html += `
        <div class="parcela-card" data-index="${i}">
          <div class="pc-head">Parcela ${i}/${num}</div>
          <div class="pc-body">
            <input type="text" class="pc-val" value="${fmt(valorSugerido)}" oninput="this.value = fmtInput(this.value)" placeholder="Valor">
            <input type="date" class="pc-date" value="${dataVenc}">
          </div>
        </div>
      `;
    }
    list.innerHTML = html;
  }
}

function distribuirIgual() {
  const baseVal = parseVal(document.getElementById('gf-val').value) || 0;
  const cards = document.querySelectorAll('.parcela-card');
  if (cards.length === 0 || baseVal <= 0) return;

  const valorBase = Math.floor((baseVal / cards.length) * 100) / 100;
  const sobra = Math.round((baseVal - (valorBase * cards.length)) * 100) / 100;

  cards.forEach((card, i) => {
    const input = card.querySelector('.pc-val');
    const valor = i === cards.length - 1 ? (valorBase + sobra) : valorBase;
    input.value = fmt(valor);
  });
}

function fmtInput(v) {
  return fmt(parseVal(v));
}

function calcValorRestante() {
  const valTotal = parseVal(document.getElementById('gf-val').value);
  const valPago = parseVal(document.getElementById('gf-valorpago').value);
  const restante = Math.max(0, valTotal - valPago);
  document.getElementById('gf-valorrestante').value = fmt(restante);
}

// ─── Helper: gera badge de parcela para tabelas ───

function renderParcelaBadge(r) {
  const numParcelas = parseInt(r.num_parcelas, 10) || 0;
  const ref = r.parcela_ref || ''; // Ex: "1/3 [PRC-001]"
  const status = r.status || '';
  const tipo = r._tipo || (r.movimentacao && normalizeString(r.movimentacao).includes('ENTRADA') ? 'entrada' : 'saida');

  const groupMatch = ref.match(/\[(PRC-[^\]]+)\]/);
  const grupoId = r._parcelGroupId || (groupMatch ? groupMatch[1] : null);
  const parcelaNum = r._parcelLabel || (ref ? ref.split(' ')[0] : (status === 'Pago' ? '1/1' : '0/1'));

  if (!grupoId && numParcelas <= 1) {
    return '<span style="color:var(--muted);font-size:11px;">—</span>';
  }

  return `
    <button onclick="${grupoId ? `abrirModalGrupo('${grupoId}', '${tipo}', event)` : ''}" 
            class="filter-btn" style="font-size:11px; padding:4px 9px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;" 
            title="Ver parcelas e vencimentos">
      <span>📋</span> ${parcelaNum}
    </button>
  `;
}

// ─── Modais de Pagamento e Grupo ───

let currentPayId = null;
let currentPayTipo = null;
let currentActiveGrupoId = null;
let currentActiveGrupoTipo = null;

function abrirModalPagar(id, tipo, e) {
  if (e) e.stopPropagation();
  const rows = tipo === 'entrada' ? ENT : SAI;
  const r = rows.find(x => String(x.id) === String(id));
  if (!r) return;

  currentPayId = id;
  currentPayTipo = tipo;

  document.getElementById('mpp-info-desc').textContent = r.categoria || 'Sem categoria';
  document.getElementById('mpp-info-ref').textContent = r.parcela_ref || 'Parcela Única';
  document.getElementById('mpp-valor-orig').value = fmt(r.valor);
  document.getElementById('mpp-valor-pago').value = fmt(r.valor);
  document.getElementById('mpp-data-pag').value = toIso(new Date());
  document.getElementById('mpp-recalcular').checked = true;

  document.getElementById('modalPagarParcela').style.display = 'flex';
}

function fecharModalPagar() {
  document.getElementById('modalPagarParcela').style.display = 'none';
}

async function confirmarPagamentoParcela() {
  const btn = document.getElementById('mpp-submit');
  const valor = parseVal(document.getElementById('mpp-valor-pago').value);
  const data = document.getElementById('mpp-data-pag').value;
  const recalcular = document.getElementById('mpp-recalcular').checked;

  if (!data) return alert('Informe a data do pagamento.');

  btn.disabled = true;
  btn.textContent = 'Processando...';

  try {
    const r = await fetch(`${API}/lancamento/pagar-parcela/${currentPayTipo}/${currentPayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
      body: JSON.stringify({
        valor_pago: valor,
        data_pagamento: isoToBr(data),
        recalcular
      })
    });

    if (r.ok) {
      showGestaoToast('✓ Pagamento registrado!', 'ok');
      fecharModalPagar();
      await loadData();
      if (currentActiveGrupoId && currentActiveGrupoTipo) {
        abrirModalGrupo(currentActiveGrupoId, currentActiveGrupoTipo);
      }
    } else {
      const d = await r.json();
      alert('Erro: ' + (d.error || 'Falha ao processar.'));
    }
  } catch (e) {
    alert('Erro de conexão.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar Pagamento';
  }
}

async function abrirModalGrupo(grupoId, tipo, e) {
  if (e) e.stopPropagation();
  currentActiveGrupoId = grupoId;
  currentActiveGrupoTipo = tipo;

  const modal = document.getElementById('modalGrupoParcelas');
  const body = document.getElementById('mgp-body');
  const header = document.getElementById('mgp-header');
  const progressWrap = document.getElementById('mgp-progress-wrap');

  body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Carregando...</td></tr>';
  modal.style.display = 'flex';

  try {
    const r = await fetch(`${API}/lancamento/grupo/${tipo}/${grupoId}`, {
      headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN }
    });
    const data = await r.json();

    if (r.ok && data.parcelas && data.parcelas.length > 0) {
      const p = data.parcelas;
      header.innerHTML = `
        <div style="font-size:16px; font-weight:700; color:var(--accent);">${p[0].categoria}</div>
        <div style="font-size:12px; color:var(--muted);">${p[0].cliente || p[0].fornecedor || ''} • ID: ${grupoId}</div>
      `;

      let totalGeral = 0;
      let totalPago = 0;
      
      body.innerHTML = p.map(row => {
        const val = parseFloat(row.valor) || 0;
        const pago = parseFloat(row.valor_pago) || 0;
        totalGeral += val;
        if (row.status === 'Pago') totalPago += val;

        const statusBadge = typeof renderStatusBadge === 'function' ? renderStatusBadge(row) : `<span class="stag sn">${row.status}</span>`;
        const btnPagar = row.status !== 'Pago'
          ? `<button onclick="abrirModalPagar('${row.id}', '${tipo}', event)" class="gbtn gbtn-submit" style="padding:3px 8px; font-size:10px; border-radius:5px; white-space:nowrap;">💰 Pagar</button>`
          : `<span style="color:#4ADE80; font-size:11px; font-weight:600;">✓ Pago</span>`;

        return `
          <tr>
            <td><strong>${row.parcela_ref ? row.parcela_ref.split(' ')[0] : '1/1'}</strong></td>
            <td>${row.data_vencimento || '—'}</td>
            <td class="mono">${fmt(val)}</td>
            <td>${statusBadge}</td>
            <td>${row.data_pagamento || '—'}</td>
            <td>${btnPagar}</td>
          </tr>
        `;
      }).join('');

      const pct = Math.round((totalPago / totalGeral) * 100) || 0;
      progressWrap.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:10px; margin-bottom:4px; color:var(--muted);">
          <span>Progresso: ${pct}%</span>
          <span>${fmt(totalPago)} de ${fmt(totalGeral)}</span>
        </div>
        <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden;">
          <div style="width:${pct}%; height:100%; background:var(--accent); border-radius:3px; transition:width 0.5s;"></div>
        </div>
      `;
    } else {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhuma parcela encontrada.</td></tr>';
    }
  } catch (err) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--red);">Erro ao carregar dados.</td></tr>';
  }
}

function fecharModalGrupo() {
  currentActiveGrupoId = null;
  currentActiveGrupoTipo = null;
  document.getElementById('modalGrupoParcelas').style.display = 'none';
}

function isoToBr(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ─── Inicialização da página ───

async function initGestao() {
  try {
    const r = await fetch(API + '/config', { headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN } });
    if (r.ok) gestaoConfig = await r.json();
  } catch (e) { }

  const alertEl = document.getElementById('gestaoAlert');
  const alertMsg = document.getElementById('gestaoAlertMsg');

  if (alertEl && alertMsg) {
    alertMsg.textContent = '📊 Modo Google Sheets ativo — lançamentos são gravados diretamente na planilha.';
    alertEl.style.background = 'rgba(74,222,128,.08)';
    alertEl.style.borderColor = 'rgba(74,222,128,.15)';
  }

  document.getElementById('gf-dvenc').value = toIso(new Date());

  const gbSync = document.getElementById('gb-sync');
  if (gbSync) gbSync.textContent = document.getElementById('lsync').textContent || '—';

  // Restaura filtros salvos
  const saved = JSON.parse(localStorage.getItem('gestao_filters') || '{}');
  if (saved.search) document.getElementById('gestaoSearch').value = saved.search;
  if (saved.mes) document.getElementById('gestaoMesFiltro').value = saved.mes;
  if (saved.data) document.getElementById('gestaoDataFiltro').value = saved.data;
  if (saved.aba) {
    gestaoTab = saved.aba;
    const tabs = document.querySelectorAll('.gtab');
    tabs.forEach(t => {
      t.classList.remove('on');
      if (normalizeString(t.textContent) === normalizeString(gestaoTab)) {
        t.classList.add('on');
      }
    });
  }

  updateGestaoCategorias();
  populateGestaoCatFiltro();

  // Seleciona a categoria após popular a lista
  if (saved.cat) document.getElementById('gestaoCatFiltro').value = saved.cat;

  // Se não houver filtro de mês salvo, seleciona o atual por padrão
  if (saved.mes === undefined || saved.mes === null) {
    document.getElementById('gestaoMesFiltro').value = new Date().getMonth();
  } else {
    document.getElementById('gestaoMesFiltro').value = saved.mes;
  }

  renderGestaoTable();
}


// ─── Atualiza as categorias do form conforme Movimentação ───

function updateGestaoCategorias() {
  const mov = document.getElementById('gf-mov').value;
  const cats = mov === 'Entrada' ? CATS_ENTRADA : CATS_SAIDA;
  const sel = document.getElementById('gf-cat');
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');

  // Mostra campo Nota Fiscal apenas para Entradas
  const nfWrap = document.getElementById('gf-nf-wrap');
  if (nfWrap) nfWrap.style.display = mov === 'Entrada' ? '' : 'none';
}

// ─── Popula filtro de categorias da tabela ───

function populateGestaoCatFiltro() {
  const allRawCats = [...ENT.map(e => e.categoria), ...SAI.map(s => s.categoria)].filter(Boolean);
  const catMap = new Map(); // normalized -> original
  allRawCats.forEach(cat => {
    const norm = normalizeString(cat);
    if (!catMap.has(norm)) {
      catMap.set(norm, cat); // Mantém a primeira capitalização encontrada
    }
  });

  const sortedNormKeys = Array.from(catMap.keys()).sort();
  const sel = document.getElementById('gestaoCatFiltro');
  sel.innerHTML = '<option value="">Todas categorias</option>' +
    sortedNormKeys.map(norm => {
      const display = catMap.get(norm);
      return `<option value="${norm}">${display}</option>`;
    }).join('');
}

// ─── Retorna linhas da tabela conforme aba ativa ───

function getGestaoRows() {
  const entradas = ENT.map(e => ({ ...e, movimentacao: e.movimentacao || 'Entrada', _tipo: 'entrada' }));
  const saidas = SAI.map(s => ({ ...s, movimentacao: s.movimentacao || 'Saída', _tipo: 'saida' }));
  let rows = [...entradas, ...saidas];
  if (gestaoTab === 'entradas') rows = entradas;
  else if (gestaoTab === 'saidas') rows = saidas;
  else if (gestaoTab === 'pendentes') rows = rows.filter(r => r.status && r.status !== 'Pago');
  return rows;
}

// ─── Sincronização de Filtros ───

function handleGestaoMesChange() {
  document.getElementById('gestaoDataFiltro').value = '';
  renderGestaoTable();
}

function handleGestaoDataChange() {
  const dateVal = document.getElementById('gestaoDataFiltro').value;
  if (dateVal) {
    const d = new Date(dateVal + 'T12:00:00'); // evita problemas com fuso
    if (!isNaN(d.getTime())) {
      document.getElementById('gestaoMesFiltro').value = d.getMonth();
    }
  }
  renderGestaoTable();
}

// ─── Renderiza tabela principal ───

function renderGestaoTable() {
  const search = (document.getElementById('gestaoSearch').value || '').toLowerCase();
  const catFiltro = document.getElementById('gestaoCatFiltro').value;
  const mesFiltro = document.getElementById('gestaoMesFiltro').value;
  const dateFiltro = document.getElementById('gestaoDataFiltro').value;
  let rows = getGestaoRows();

  if (search) rows = rows.filter(r =>
    (r.categoria || '').toLowerCase().includes(search) ||
    (r.observacoes || '').toLowerCase().includes(search) ||
    (r.cliente || r.fornecedor || '').toLowerCase().includes(search)
  );
  if (catFiltro) rows = rows.filter(r => normalizeString(r.categoria) === catFiltro);

  // Salva filtros atuais
  localStorage.setItem('gestao_filters', JSON.stringify({
    search: document.getElementById('gestaoSearch').value,
    cat: catFiltro,
    mes: mesFiltro,
    data: dateFiltro,
    aba: gestaoTab
  }));
  
  if (mesFiltro !== 'all') {
    const mesNum = parseInt(mesFiltro, 10);
    const year = new Date().getFullYear(); // Considera o ano atual por padrão
    rows = rows.filter(r => {
      const d = parseDate(r.data_pagamento || r.data_vencimento);
      if (!d) return false;
      return d.getMonth() === mesNum && d.getFullYear() === year;
    });
  }

  if (dateFiltro) {
    rows = rows.filter(r => {
      const dPag = parseBrToIso(r.data_pagamento);
      const dVenc = parseBrToIso(r.data_vencimento);
      return dPag === dateFiltro || dVenc === dateFiltro;
    });
  }

  const tbody = document.getElementById('tbGestao');
  const vazio = document.getElementById('gestaoVazio');

  if (!rows.length) {
    tbody.innerHTML = '';
    vazio.style.display = 'block';
    return;
  }
  vazio.style.display = 'none';

  tbody.innerHTML = rows.map((r, i) => {
    const isEnt = r._tipo === 'entrada' || (r.movimentacao || '').toLowerCase().includes('entrada');
    const movTag = isEnt ? `<span class="stag sp">Entrada</span>` : `<span class="stag so">Saída</span>`;
    const valColor = isEnt ? '#4ADE80' : 'var(--red)';
    const valSign = isEnt ? '+' : '-';
    const stClass = r.status === 'Pago' ? 'sp' : r.status === 'Cancelado' ? 'so' : r.status === 'Parcial' ? 'sy' : 'sn';
    const fornecedor = r.cliente || r.fornecedor || '—';

    // Alerta para pendentes vencidos
    let statusHtml = typeof renderStatusBadge === 'function' ? renderStatusBadge(r) : `<span class="stag ${stClass}">${r.status || 'Pendente'}</span>`;

    return `<tr>
      <td>
        <button onclick="editLancamento('${r.id}')" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:16px;" title="Editar Lançamento">✎</button>
      </td>
      <td>${movTag}</td>
      <td><span class="stag cby">${r.categoria || '—'}</span></td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;" title="${r.observacoes || ''}">${r.observacoes || '—'}</td>
      <td class="mono" style="color:${valColor};font-weight:700;">${valSign} ${fmt(r.valor)}</td>
      <td style="font-size:11px;">${fornecedor}</td>
      <td style="font-size:11px;color:var(--muted);">${r.conta_bancaria || '—'}</td>
      <td style="font-size:11px;">${r.data_vencimento || '—'}</td>
      <td style="font-size:11px;">${r.data_pagamento || '—'}</td>
      <td style="font-size:11px;color:var(--muted);">${r.forma_pagamento || '—'}</td>
      <td>${statusHtml}</td>
      <td>${renderParcelaBadge(r)}</td>
      <td>${isEnt ? (r.modo_emissao || '—') : '—'}</td>
    </tr>`;
  }).join('');

  renderGestaoBadges(rows);
}

// ─── Badges de resumo (dinâmico com filtros) ───

function renderGestaoBadges(rows) {
  if (!rows) return;

  const validRows = rows.filter(r => {
    const st = (r.status || '').trim().toLowerCase();
    return st !== 'cancelado';
  });

  const entRows = validRows.filter(r => 
    r._tipo === 'entrada' || (r.movimentacao || '').toLowerCase().includes('entrada')
  );
  const saiRows = validRows.filter(r => !entRows.includes(r));

  const totalEnt = entRows.reduce((sum, r) => sum + getEffectiveValue(r), 0);
  const totalSai = saiRows.reduce((sum, r) => sum + getEffectiveValue(r), 0);

  document.getElementById('gb-total').textContent = fmt(totalEnt - totalSai);
  document.getElementById('gb-ent').textContent = fmt(totalEnt);
  document.getElementById('gb-sai').textContent = fmt(totalSai);
}

// ─── Trocar aba ───

function setGestaoTab(tab, el) {
  gestaoTab = tab;
  document.querySelectorAll('.gtab').forEach(t => t.classList.remove('on'));
  if (el) el.classList.add('on');
  
  const catFiltro = document.getElementById('gestaoCatFiltro');
  if (tab === 'entradas') {
    catFiltro.style.display = 'none';
    catFiltro.value = '';
  } else {
    catFiltro.style.display = 'inline-block';
  }
  
  renderGestaoTable();
}

// ─── Resetar formulário ───

function resetGestaoForm() {
  currentEditId = null;
  currentEditTipo = null;

  const title = document.getElementById('gf-title');
  if (title) {
    title.innerHTML = '<span style="color:var(--red);">＋</span> Novo Lançamento\n            <span style="margin-left:auto;font-family:\'DM Sans\',sans-serif;font-size:11px;font-weight:400;letter-spacing:0;color:var(--muted);">Os\n              campos serão enviados ao Google Sheets</span>';
  }
  
  document.getElementById('gf-submit').textContent = 'Confirmar e Sincronizar';
  document.getElementById('gf-delete').style.display = 'none';

  document.getElementById('gf-mov').value = 'Entrada';
  updateGestaoCategorias();
  document.getElementById('gf-forn').value = '';
  document.getElementById('gf-val').value = '';
  document.getElementById('gf-conta').value = '';
  document.getElementById('gf-forma').value = '';
  document.getElementById('gf-dvenc').value = toIso(new Date());
  document.getElementById('gf-dpag').value = toIso(new Date());
  document.getElementById('gf-status').value = 'Pago';
  document.getElementById('gf-obs').value = '';
  document.getElementById('gf-nf').selectedIndex = 0;
  document.getElementById('gf-parcelas').value = '';
  document.getElementById('gf-parcelas-list').innerHTML = '';
  toggleParcelaFields();
}

function toggleParcelaFields() {
  const status = document.getElementById('gf-status').value;
  const isParcial = status === 'Parcial';
  const isPendente = status === 'Pendente';
  const isPago = status === 'Pago';
  const isParcelado = status === 'Parcelado';

  const dvencWrap = document.getElementById('gf-dvenc-wrap');
  const dpagWrap = document.getElementById('gf-dpag-wrap');
  const valorPagoWrap = document.getElementById('gf-valorpago-wrap');
  const valorRestanteWrap = document.getElementById('gf-valorrestante-wrap');
  const dpagInput = document.getElementById('gf-dpag');

  if (dvencWrap) dvencWrap.style.display = (isParcial || isParcelado) ? 'none' : 'block';
  if (dpagWrap) dpagWrap.style.display = (isPendente || isParcelado) ? 'none' : 'block';
  if (valorPagoWrap) valorPagoWrap.style.display = isParcial ? 'block' : 'none';
  if (valorRestanteWrap) valorRestanteWrap.style.display = isParcial ? 'block' : 'none';

  if (isParcial) {
    calcValorRestante();
    if (dpagInput && !dpagInput.value) dpagInput.value = toIso(new Date());
  } else if (isPendente) {
    if (dpagInput) dpagInput.value = '';
  } else if (isPago) {
    if (dpagInput && !dpagInput.value) dpagInput.value = toIso(new Date());
  }

  // Exibe o configurador de parcelas no Parcial e no Parcelado
  document.querySelectorAll('.gf-parcela-field').forEach(el => {
    el.style.display = (isParcial || isParcelado) ? 'block' : 'none';
  });

  if (isParcial || isParcelado) {
    gerarParcelasCards();
  }
}

function gerarParcelasCards() {
  const num = parseInt(document.getElementById('gf-parcelas').value, 10) || 0;
  const list = document.getElementById('gf-parcelas-list');
  if (!list) return;

  const intervalEl = document.querySelector('input[name="gf-intervalo"]:checked');
  const interval = intervalEl ? intervalEl.value : '30';
  const status = document.getElementById('gf-status').value;
  const dpag = document.getElementById('gf-dpag').value || toIso(new Date());
  const baseDate = status === 'Parcial' ? dpag : (document.getElementById('gf-dvenc').value || toIso(new Date()));
  
  let baseVal = 0;
  if (status === 'Parcial') {
    const valTotal = parseVal(document.getElementById('gf-val').value) || 0;
    const valPago = parseVal(document.getElementById('gf-valorpago').value) || 0;
    baseVal = Math.max(0, valTotal - valPago);
  } else {
    baseVal = parseVal(document.getElementById('gf-val').value) || 0;
  }

  if (num <= 0) {
    list.innerHTML = '';
    return;
  }

  const currentCount = list.querySelectorAll('.parcela-card').length;
  if (num !== currentCount || interval !== 'custom') {
    let html = '';
    const valorSugerido = (baseVal / num).toFixed(2);
    
    for (let i = 1; i <= num; i++) {
      let dataVenc = baseDate;
      if (baseDate && interval !== 'custom') {
        const d = new Date(baseDate + 'T12:00:00');
        if (interval === '30') d.setMonth(d.getMonth() + (status === 'Parcial' ? i : i - 1));
        else if (interval === '15') d.setDate(d.getDate() + ((status === 'Parcial' ? i : i - 1) * 15));
        else if (interval === '7') d.setDate(d.getDate() + ((status === 'Parcial' ? i : i - 1) * 7));
        dataVenc = toIso(d);
      }

      const rotuloParcela = status === 'Parcial' ? `Parcela Futura ${i}/${num}` : `Parcela ${i}/${num}`;

      html += `
        <div class="parcela-card" data-index="${i}">
          <div class="pc-head">${rotuloParcela}</div>
          <div class="pc-body">
            <input type="text" class="pc-val" value="${fmt(valorSugerido)}" oninput="this.value = fmtInput(this.value)" placeholder="Valor">
            <input type="date" class="pc-date" value="${dataVenc}" title="Data de Vencimento da Parcela">
          </div>
        </div>
      `;
    }
    list.innerHTML = html;
  }
}

function recalcularDatasSubsequentes() {
  const cards = document.querySelectorAll('.parcela-card');
  if (cards.length <= 1) return;

  const intervalEl = document.querySelector('input[name="gf-intervalo"]:checked');
  const interval = intervalEl ? intervalEl.value : '30';
  if (interval === 'custom') return;

  const card1Date = cards[0].querySelector('.pc-date').value;
  if (!card1Date) return;

  cards.forEach((card, i) => {
    if (i === 0) return;
    const d = new Date(card1Date + 'T12:00:00');
    if (interval === '30') d.setMonth(d.getMonth() + i);
    else if (interval === '15') d.setDate(d.getDate() + (i * 15));
    else if (interval === '7') d.setDate(d.getDate() + (i * 7));
    card.querySelector('.pc-date').value = toIso(d);
  });
}

function distribuirIgual() {
  const status = document.getElementById('gf-status').value;
  let baseVal = 0;
  if (status === 'Parcial') {
    const valTotal = parseVal(document.getElementById('gf-val').value) || 0;
    const valPago = parseVal(document.getElementById('gf-valorpago').value) || 0;
    baseVal = Math.max(0, valTotal - valPago);
  } else {
    baseVal = parseVal(document.getElementById('gf-val').value) || 0;
  }

  const cards = document.querySelectorAll('.parcela-card');
  if (cards.length === 0 || baseVal <= 0) return;

  const valorBase = Math.floor((baseVal / cards.length) * 100) / 100;
  const sobra = Math.round((baseVal - (valorBase * cards.length)) * 100) / 100;

  cards.forEach((card, i) => {
    const input = card.querySelector('.pc-val');
    const valor = i === cards.length - 1 ? (valorBase + sobra) : valorBase;
    input.value = fmt(valor);
  });

  recalcularDatasSubsequentes();
}

function fmtInput(v) {
  return fmt(parseVal(v));
}

function calcValorRestante() {
  const valTotalEl = document.getElementById('gf-val');
  const valPagoEl = document.getElementById('gf-valorpago');
  const restanteEl = document.getElementById('gf-valorrestante');
  if (!valTotalEl || !valPagoEl || !restanteEl) return;

  const valTotal = parseVal(valTotalEl.value) || 0;
  const valPago = parseVal(valPagoEl.value) || 0;
  const restante = Math.max(0, valTotal - valPago);
  restanteEl.value = fmt(restante);

  // Recalcular sugestão das parcelas se estiver em modo Parcial
  const status = document.getElementById('gf-status').value;
  if (status === 'Parcial') {
    const cards = document.querySelectorAll('.parcela-card');
    if (cards.length > 0) {
      const valorBase = Math.floor((restante / cards.length) * 100) / 100;
      const sobra = Math.round((restante - (valorBase * cards.length)) * 100) / 100;
      cards.forEach((card, i) => {
        const input = card.querySelector('.pc-val');
        if (input) input.value = fmt(i === cards.length - 1 ? (valorBase + sobra) : valorBase);
      });
    }
  }
}

// ─── Submeter lançamento ───

async function submitGestao() {
  const mov = document.getElementById('gf-mov').value;
  const cat = document.getElementById('gf-cat').value;
  const val = document.getElementById('gf-val').value;
  const dvenc = document.getElementById('gf-dvenc').value;
  const status = document.getElementById('gf-status').value;
  const dpag = document.getElementById('gf-dpag').value;

  if (!mov || !cat || !val) {
    showGestaoToast('Preencha os campos obrigatórios: Movimentação, Categoria e Valor.', 'err');
    return;
  }

  // Se o status exigir vencimento geral (Pendente ou Pago)
  if ((status === 'Pendente' || status === 'Pago') && !dvenc) {
    showGestaoToast('Preencha a Data de Vencimento.', 'err');
    return;
  }

  // Validação do valor monetário
  const valorNum = parseVal(val);
  if (valorNum <= 0) {
    showGestaoToast('O valor deve ser um número positivo.', 'err');
    return;
  }

  const cards = document.querySelectorAll('.parcela-card');
  const grupoId = `PRC-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

  let body;
  let endpoint = `${API}/lancamento`;

  if (status === 'Parcelado' && cards.length > 0) {
    const numParcelas = cards.length;
    const parcelasData = Array.from(cards).map((card, idx) => {
      const valorParcela = parseVal(card.querySelector('.pc-val').value);
      const dataVenc = card.querySelector('.pc-date').value;
      return {
        valor: valorParcela,
        data_vencimento: isoToBr(dataVenc),
        data_pagamento: '',
        valor_pago: 0,
        parcela_ref: `${idx + 1}/${numParcelas} [${grupoId}]`,
        status: 'Pendente'
      };
    });

    body = {
      movimentacao: mov,
      categoria: cat,
      observacoes: document.getElementById('gf-obs').value,
      fornecedor: document.getElementById('gf-forn').value,
      conta_bancaria: document.getElementById('gf-conta').value,
      forma_pagamento: document.getElementById('gf-forma').value,
      modo_emissao: mov === 'Entrada' ? (document.getElementById('gf-nf').value || '') : '',
      parcelas: parcelasData
    };
    endpoint = `${API}/lancamento/parcelado`;
  } else if (status === 'Parcial') {
    const valPago = parseVal(document.getElementById('gf-valorpago').value) || 0;
    const restante = Math.max(0, valorNum - valPago);
    const totalItens = cards.length > 0 ? (cards.length + 1) : 2;

    const parcelasData = [];

    // 1. Entrada de Hoje (Quitada)
    parcelasData.push({
      valor: valPago,
      valor_pago: valPago,
      status: 'Pago',
      data_vencimento: isoToBr(dpag || toIso(new Date())),
      data_pagamento: isoToBr(dpag || toIso(new Date())),
      parcela_ref: `1/${totalItens} [${grupoId}]`
    });

    // 2. Parcelas Futuras Pendentes (com vencimentos individuais)
    if (cards.length > 0) {
      cards.forEach((card, idx) => {
        const vParc = parseVal(card.querySelector('.pc-val').value);
        const dVencParc = card.querySelector('.pc-date').value;
        parcelasData.push({
          valor: vParc,
          valor_pago: 0,
          status: 'Pendente',
          data_vencimento: isoToBr(dVencParc),
          data_pagamento: '',
          parcela_ref: `${idx + 2}/${totalItens} [${grupoId}]`
        });
      });
    } else if (restante > 0) {
      // Se não gerou cards, grava 1 parcela pendente para o saldo restante
      parcelasData.push({
        valor: restante,
        valor_pago: 0,
        status: 'Pendente',
        data_vencimento: isoToBr(dpag || toIso(new Date())),
        data_pagamento: '',
        parcela_ref: `2/2 [${grupoId}]`
      });
    }

    body = {
      movimentacao: mov,
      categoria: cat,
      observacoes: document.getElementById('gf-obs').value,
      fornecedor: document.getElementById('gf-forn').value,
      conta_bancaria: document.getElementById('gf-conta').value,
      forma_pagamento: document.getElementById('gf-forma').value,
      modo_emissao: mov === 'Entrada' ? (document.getElementById('gf-nf').value || '') : '',
      parcelas: parcelasData
    };
    endpoint = `${API}/lancamento/parcelado`;
  } else {
    // Modo simples: Pendente ou Pago
    let valorPagoFinal = status === 'Pago' ? valorNum : 0;
    let dataPagamentoFinal = status === 'Pago' && dpag ? isoToBr(dpag) : '';

    body = {
      movimentacao: mov,
      categoria: cat,
      observacoes: document.getElementById('gf-obs').value,
      fornecedor: document.getElementById('gf-forn').value,
      valor: valorNum,
      conta_bancaria: document.getElementById('gf-conta').value,
      data_vencimento: isoToBr(dvenc),
      data_pagamento: dataPagamentoFinal,
      forma_pagamento: document.getElementById('gf-forma').value,
      status: status,
      num_parcelas: 1,
      valor_pago: valorPagoFinal,
      modo_emissao: mov === 'Entrada' ? (document.getElementById('gf-nf').value || '') : ''
    };
  }

  try {
    const isEdit = !!currentEditId;
    const url = isEdit ? `${API}/lancamento/${currentEditTipo}/${currentEditId}` : endpoint;
    const method = isEdit ? 'PUT' : 'POST';

    const r = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (r.ok && data.success) {
      showGestaoToast('✓ ' + data.message, 'ok');
      resetGestaoForm();
      setTimeout(loadData, 1500);
    } else {
      showGestaoToast('❌ ' + (data.error || 'Erro ao enviar lançamento.'), 'err');
    }
  } catch (e) {
    showGestaoToast('❌ Erro de conexão com o servidor.', 'err');
  }

  btn.disabled = false;
  btn.textContent = 'Confirmar e Sincronizar';
}

// ─── Toast de feedback ───

function showGestaoToast(msg, type) {
  let toast = document.getElementById('gestaoToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'gestaoToast';
    toast.className = 'gestao-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `gestao-toast ${type}`;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 4000);
}



// ─── Edição no Formulário e Exclusão ───

function editLancamento(id) {
  const rows = getGestaoRows();
  const r = rows.find(x => String(x.id) === String(id));
  if (!r) {
    console.warn("Lançamento não encontrado: ", id);
    return;
  }

  currentEditId = r.id;
  currentEditTipo = r._tipo;

  const title = document.getElementById('gf-title');
  if (title) {
    title.innerHTML = '<span style="color:#FACC15;">✏️ Editando Lançamento</span>\n            <span style="margin-left:auto;font-family:\'DM Sans\',sans-serif;font-size:11px;font-weight:400;letter-spacing:0;color:var(--muted);">Modo de edição rápida habilitado</span>';
  }

  document.getElementById('gf-submit').textContent = 'Salvar Alterações';
  document.getElementById('gf-delete').style.display = 'inline-block';

  // Helper para select
  const setSelectByText = (id, val) => {
    const el = document.getElementById(id);
    const opts = Array.from(el.options).map(o => o.value);
    const match = opts.find(o => o.toLowerCase() === (val || '').toLowerCase());
    if (match) el.value = match;
  };

  const isEntrada = (r.movimentacao || (r._tipo === 'entrada' ? 'Entrada' : 'Saída')).toLowerCase().includes('entrada');
  document.getElementById('gf-mov').value = isEntrada ? 'Entrada' : 'Saída';
  updateGestaoCategorias();
  
  setSelectByText('gf-cat', r.categoria);
  document.getElementById('gf-forn').value = r.cliente || r.fornecedor || '';
  document.getElementById('gf-val').value = r.valor || '';
  setSelectByText('gf-conta', r.conta_bancaria);
  
  const formaStr = r.forma_pagamento && r.forma_pagamento !== '—' ? r.forma_pagamento : '';
  setSelectByText('gf-forma', formaStr);
  
  document.getElementById('gf-dvenc').value = parseBrToIso(r.data_vencimento) || '';
  document.getElementById('gf-dpag').value = parseBrToIso(r.data_pagamento) || '';
  setSelectByText('gf-status', r.status || 'Pendente');
  document.getElementById('gf-obs').value = r.observacoes || '';
  
  if (isEntrada && r.modo_emissao) {
    setSelectByText('gf-nf', r.modo_emissao);
  }

  // Parcelas
  document.getElementById('gf-parcelas').value = r.num_parcelas || '';
  document.getElementById('gf-valorpago').value = r.valor_pago || '';
  toggleParcelaFields();

  const wrap = document.querySelector('.gestao-form-wrap');
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

async function deleteGestaoLancamento() {
  if (!currentEditId || !currentEditTipo) return;
  const isOk = confirm('⚠️ Tem certeza que deseja excluir este lançamento permanentemente?');
  if (!isOk) return;

  try {
    const r = await fetch(`${API}/lancamento/${currentEditTipo}/${currentEditId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN }
    });
    const data = await r.json();
    if (r.ok && data.success) {
      showGestaoToast('✓ Lançamento excluído com sucesso.', 'ok');
      resetGestaoForm();
      setTimeout(loadData, 1000);
    } else {
      showGestaoToast('❌ ' + (data.error || 'Erro ao excluir.'), 'err');
    }
  } catch (e) {
    showGestaoToast('❌ Erro de conexão.', 'err');
  }
}
