/* ═══════════════════════════════════════════════
/* ═══════════════════════════════════════════════
   gestao.js — Página "Gestão de Dados":
   tabela, abas, formulário de lançamento,
   exportação CSV e toasts de feedback
   ═══════════════════════════════════════════════ */

let gestaoTab = 'todos';
let gestaoConfig = { webhookConfigured: false, devMode: true };
let currentEditId = null;
let currentEditTipo = null;
let currentEditContext = null;
let currentFormModalidade = 'Pago';

// ─── Helper: gera badge de parcela para tabelas ───

function renderParcelaBadge(r) {
  const ref = String(r.parcela_ref || '').trim();
  const groupMatch = ref.match(/\[(PRC-[^\]]+)\]/i);
  const grupoId = r._parcelGroupId || (groupMatch ? groupMatch[1] : null);
  const tipo = r._tipo || (r.movimentacao && normalizeString(r.movimentacao).includes('ENTRADA') ? 'entrada' : 'saida');

  let label = r._parcelLabel;
  if (!label && ref) {
    const cleanRef = ref.replace(/\[PRC-[^\]]+\]/gi, '').trim();
    if (cleanRef) label = cleanRef;
  }
  if (!label && typeof getParcelaLabel === 'function') {
    label = getParcelaLabel(r);
  }

  if (!label || label === '—' || label === '-') {
    return '<span style="color:var(--muted);font-size:11px;">—</span>';
  }

  return `
    <button onclick="${grupoId ? `abrirModalGrupo('${grupoId}', '${tipo}', event)` : ''}" 
            class="filter-btn" style="font-size:11px; padding:4px 9px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;" 
            title="Ver parcelas e vencimentos">
      <span>📋</span> ${label}
    </button>
  `;
}

// ─── Modais de Pagamento e Grupo ───

let currentPayId = null;
let currentPayTipo = null;
let currentPayWasPaid = false;
let currentActiveGrupoId = null;
let currentActiveGrupoTipo = null;

function abrirModalPagar(id, tipo, e) {
  if (e) e.stopPropagation();
  const rows = tipo === 'entrada' ? ENT : SAI;
  const r = rows.find(x => String(x.id) === String(id));
  if (!r) return;

  currentPayId = id;
  currentPayTipo = tipo;
  currentPayWasPaid = String(r.status || '').trim().toLowerCase() === 'pago';

  document.getElementById('mpp-info-desc').textContent = r.categoria || 'Sem categoria';
  document.getElementById('mpp-info-ref').textContent = r.parcela_ref || 'Parcela Única';
  document.getElementById('mpp-valor-orig').value = fmt(r.valor);
  document.getElementById('mpp-valor-pago').value = fmt(
    currentPayWasPaid ? getEffectiveValue(r) : r.valor
  );
  document.getElementById('mpp-data-pag').value = currentPayWasPaid
    ? (parseBrToIso(r.data_pagamento) || toIso(new Date()))
    : toIso(new Date());
  document.getElementById('mpp-recalcular').checked = false;
  document.getElementById('mpp-recalcular-wrap').style.display = currentPayWasPaid ? 'none' : 'flex';
  document.getElementById('mpp-title').textContent = currentPayWasPaid ? 'Editar Pagamento da Parcela' : 'Pagar Parcela';
  document.getElementById('mpp-submit').textContent = currentPayWasPaid ? 'Salvar Ajuste' : 'Confirmar Pagamento';

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
  if (!(valor > 0)) return alert('Informe um valor pago maior que zero.');

  btn.disabled = true;
  btn.textContent = 'Processando...';

  try {
    const r = await fetch(`${API}/lancamento/pagar-parcela/${currentPayTipo}/${currentPayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
      body: JSON.stringify({
        valor_pago: valor,
        data_pagamento: isoToBr(data),
        recalcular: currentPayWasPaid ? false : recalcular
      })
    });

    if (r.ok) {
      showGestaoToast(currentPayWasPaid ? '✓ Pagamento ajustado!' : '✓ Pagamento registrado!', 'ok');
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
    btn.textContent = currentPayWasPaid ? 'Salvar Ajuste' : 'Confirmar Pagamento';
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
        const val = parseVal(row.valor) || 0;
        totalGeral += val;
        totalPago += typeof getEffectiveValue === 'function'
          ? getEffectiveValue(row)
          : (parseFloat(row.valor_pago) || 0);

        const statusBadge = typeof renderStatusBadge === 'function' ? renderStatusBadge(row) : `<span class="stag sn">${row.status}</span>`;
        const statusNormalizado = String(row.status || '').trim().toLowerCase();
        const btnPagar = statusNormalizado === 'pago'
          ? `<button onclick="abrirModalPagar('${row.id}', '${tipo}', event)" class="gbtn gbtn-cancel" style="padding:3px 8px; font-size:10px; border-radius:5px; white-space:nowrap;">✏️ Editar</button>`
          : statusNormalizado === 'cancelado'
            ? '<span style="color:var(--muted); font-size:11px;">—</span>'
            : `<button onclick="abrirModalPagar('${row.id}', '${tipo}', event)" class="gbtn gbtn-submit" style="padding:3px 8px; font-size:10px; border-radius:5px; white-space:nowrap;">💰 Pagar</button>`;

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

      const pct = Math.min(100, Math.max(0, Math.round((totalPago / totalGeral) * 100) || 0));
      progressWrap.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:10px; margin-bottom:4px; color:var(--muted);">
          <span>Progresso: ${pct}%</span>
          <span>Pago: ${fmt(totalPago)} • Lançado: ${fmt(totalGeral)}</span>
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

  const hoje = toIso(new Date());
  document.getElementById('gf-dvenc').value = hoje;
  const dataPagamentoInicial = document.getElementById('gf-dpag');
  if (dataPagamentoInicial && !dataPagamentoInicial.value) dataPagamentoInicial.value = hoje;
  currentFormModalidade = document.getElementById('gf-status').value;
  toggleParcelaFields({ skipCards: true });

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

  // Mostra campo Nota Fiscal / Pedido para Entradas e Saídas
  const nfWrap = document.getElementById('gf-nf-wrap');
  if (nfWrap) nfWrap.style.display = '';
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
  const consolidar = sourceRows => typeof DacFinancialReport !== 'undefined'
    ? DacFinancialReport.consolidateRows(sourceRows)
    : sourceRows;
  const entradasConsolidadas = consolidar(entradas);
  const saidasConsolidadas = consolidar(saidas);
  let rows = [...entradasConsolidadas, ...saidasConsolidadas];
  if (gestaoTab === 'entradas') rows = entradasConsolidadas;
  else if (gestaoTab === 'saidas') rows = saidasConsolidadas;
  else if (gestaoTab === 'pendentes') rows = rows.filter(r => {
    const status = String(r.status || '').trim().toLowerCase();
    return status && status !== 'pago' && status !== 'cancelado';
  });
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
  const searchInput = (document.getElementById('gestaoSearch').value || '').trim();
  const catFiltro = document.getElementById('gestaoCatFiltro').value;
  const mesFiltro = document.getElementById('gestaoMesFiltro').value;
  const dateFiltro = document.getElementById('gestaoDataFiltro').value;
  let rows = getGestaoRows();

  if (searchInput) {
    const searchTerms = searchInput.split(/\s+/).map(t => normalizeString(t)).filter(Boolean);
    rows = rows.filter(r => {
      const isEnt = r._tipo === 'entrada' || (r.movimentacao || '').toLowerCase().includes('entrada');
      const movStr = isEnt ? 'Entrada' : 'Saída';
      const fornecedorStr = r.cliente || r.fornecedor || '';
      const fmtVal = typeof fmt === 'function' ? fmt(r.valor) : String(r.valor || '');
      const fmtValPago = typeof fmt === 'function' ? fmt(r.valor_pago || 0) : String(r.valor_pago || '');
      const statusText = r.status || 'Pendente';

      const searchables = [
        r.id,
        r.empresa,
        r._tipo,
        r.movimentacao,
        movStr,
        r.categoria,
        r.modo_emissao,
        r.ref_orcamento,
        r.nf,
        r.nota_fiscal,
        r.cliente,
        r.fornecedor,
        fornecedorStr,
        r.conta_bancaria,
        r.conta,
        r.forma_pagamento,
        r.forma,
        r.status,
        statusText,
        r.data_vencimento,
        r.data_pagamento,
        r.data_emissao,
        r.observacoes,
        r.obs,
        r.parcela_str,
        r.parcela,
        r.num_parcela,
        r.valor != null ? String(r.valor) : '',
        fmtVal,
        r.valor_pago != null ? String(r.valor_pago) : '',
        fmtValPago,
      ];

      for (const key in r) {
        if (r[key] != null && typeof r[key] !== 'object' && typeof r[key] !== 'function') {
          searchables.push(String(r[key]));
        }
      }

      const combinedText = normalizeString(searchables.join(' '));
      return searchTerms.every(term => combinedText.includes(term));
    });
  }
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
        <button onclick="editLancamento('${r.id}', '${r._tipo}')" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:16px;" title="Editar Lançamento">✎</button>
      </td>
      <td><span class="stag" style="background:rgba(255,255,255,0.06);color:#E2E8F0;font-size:10px;font-weight:600;">${r.empresa || 'DAC'}</span></td>
      <td>${movTag}</td>
      <td><span class="stag cby">${r.categoria || '—'}</span></td>
      <td style="font-size:11px;color:var(--accent2);">${r.modo_emissao || '—'}</td>
      <td class="mono" style="color:${valColor};font-weight:700;">${valSign} ${fmt(r.valor)}</td>
      <td style="font-size:11px;">${fornecedor}</td>
      <td style="font-size:11px;color:var(--muted);">${r.conta_bancaria || '—'}</td>
      <td style="font-size:11px;">${r.data_vencimento || '—'}</td>
      <td style="font-size:11px;">${r.data_pagamento || '—'}</td>
      <td style="font-size:11px;color:var(--muted);">${r.data_emissao || '—'}</td>
      <td style="font-size:11px;color:var(--muted);">${r.forma_pagamento || '—'}</td>
      <td>${statusHtml}</td>
      <td>${renderParcelaBadge(r)}</td>
      <td class="mono" style="font-size:11px;">${fmt(r.valor_pago || 0)}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;" title="${r.observacoes || ''}">${r.observacoes || '—'}</td>
    </tr>`;
  }).join('');

  renderGestaoBadges(rows);
}

// ─── Badges de resumo (dinâmico com filtros) ───

function renderGestaoBadges(rows) {
  if (!rows) return;

  const label1 = document.getElementById('gb-ent-label');
  const label2 = document.getElementById('gb-sai-label');
  const label3 = document.getElementById('gb-total-label');
  const val1 = document.getElementById('gb-ent');
  const val2 = document.getElementById('gb-sai');
  const val3 = document.getElementById('gb-total');

  if (gestaoTab === 'pendentes') {
    if (label1) label1.textContent = 'Contas a Receber';
    if (label2) label2.textContent = 'Contas a Pagar';
    if (label3) label3.textContent = 'Vencidos';

    // Pega todas as entradas/saídas pendentes/parciais da base completa para KPIs precisos
    const allRows = [...(typeof ENT !== 'undefined' ? ENT : []), ...(typeof SAI !== 'undefined' ? SAI : [])];
    const pendentes = allRows.filter(r => {
      const st = (r.status || '').trim().toLowerCase();
      return st === 'pendente' || st === 'parcial' || (st !== 'pago' && st !== 'cancelado');
    });

    const entPend = pendentes.filter(r => 
      r._tipo === 'entrada' || (r.movimentacao || '').toLowerCase().includes('entrada')
    );
    const saiPend = pendentes.filter(r => !entPend.includes(r));

    const totalReceber = entPend.reduce((sum, r) => sum + Math.max(0, parseVal(r.valor) - parseVal(r.valor_pago)), 0);
    const totalPagar = saiPend.reduce((sum, r) => sum + Math.max(0, parseVal(r.valor) - parseVal(r.valor_pago)), 0);

    // Vencidos (vencimento estritamente anterior a hoje)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalVencidos = pendentes.filter(r => {
      if (!r.data_vencimento) return false;
      const venc = parseDate(r.data_vencimento);
      if (!venc) return false;
      venc.setHours(0, 0, 0, 0);
      return venc < today;
    }).reduce((sum, r) => sum + Math.max(0, parseVal(r.valor) - parseVal(r.valor_pago)), 0);

    if (val1) {
      val1.textContent = fmt(totalReceber);
      val1.className = 'gbadge-val tg';
    }
    if (val2) {
      val2.textContent = fmt(totalPagar);
      val2.className = 'gbadge-val tr';
    }
    if (val3) {
      val3.textContent = fmt(totalVencidos);
      val3.className = 'gbadge-val ' + (totalVencidos > 0 ? 'tr' : 'tg');
    }
  } else {
    if (label1) label1.textContent = 'Total Entradas';
    if (label2) label2.textContent = 'Total Saídas';
    if (label3) label3.textContent = 'Saldo Total';

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
    const saldo = totalEnt - totalSai;

    if (val1) {
      val1.textContent = fmt(totalEnt);
      val1.className = 'gbadge-val tg';
    }
    if (val2) {
      val2.textContent = fmt(totalSai);
      val2.className = 'gbadge-val tr';
    }
    if (val3) {
      val3.textContent = fmt(saldo);
      val3.className = 'gbadge-val ' + (saldo >= 0 ? 'tg' : 'tr');
    }
  }
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
  currentEditContext = null;
  currentFormModalidade = 'Pago';

  const title = document.getElementById('gf-title');
  if (title) {
    title.innerHTML = '<span style="color:var(--red);">＋</span> Novo Lançamento\n            <span style="margin-left:auto;font-family:\'DM Sans\',sans-serif;font-size:11px;font-weight:400;letter-spacing:0;color:var(--muted);">Os\n              campos serão enviados ao Google Sheets</span>';
  }
  
  document.getElementById('gf-submit').textContent = 'Confirmar e Sincronizar';
  document.getElementById('gf-delete').style.display = 'none';
  document.querySelectorAll('option[data-gestao-temporaria="true"]').forEach(option => option.remove());

  document.getElementById('gf-mov').value = 'Entrada';
  updateGestaoCategorias();
  document.getElementById('gf-forn').value = '';
  document.getElementById('gf-val').value = '';
  document.getElementById('gf-conta').value = '';
  document.getElementById('gf-forma').value = '';
  if (document.getElementById('gf-demissao')) document.getElementById('gf-demissao').value = toIso(new Date());
  document.getElementById('gf-dvenc').value = toIso(new Date());
  document.getElementById('gf-dpag').value = toIso(new Date());
  document.getElementById('gf-status').value = 'Pago';
  if (document.getElementById('gf-empresa')) document.getElementById('gf-empresa').value = 'DAC';
  document.getElementById('gf-nf').value = '';
  document.getElementById('gf-obs').value = '';
  document.getElementById('gf-parcelas').value = '';
  document.getElementById('gf-parcelas-list').innerHTML = '';
  document.getElementById('gf-valorpago').value = '';
  document.getElementById('gf-valorrestante').value = '';
  const intervaloPadrao = document.querySelector('input[name="gf-intervalo"][value="30"]');
  if (intervaloPadrao) intervaloPadrao.checked = true;
  toggleParcelaFields({ skipCards: true });
}

function toggleParcelaFields(options = {}) {
  const status = document.getElementById('gf-status').value;
  if (!options.skipCards && currentEditContext?.grupoMistoComCancelado) {
    currentEditContext.modalidadeEscolhidaExplicitamente = true;
  }
  const isParcial = status === 'Parcial';
  const isPendente = status === 'Pendente';
  const isPago = status === 'Pago';
  const isParcelado = status === 'Parcelado';
  const isCancelado = status === 'Cancelado';
  const modalidadeMudou = status !== currentFormModalidade;

  const dvencWrap = document.getElementById('gf-dvenc-wrap');
  const dpagWrap = document.getElementById('gf-dpag-wrap');
  const valorPagoWrap = document.getElementById('gf-valorpago-wrap');
  const valorRestanteWrap = document.getElementById('gf-valorrestante-wrap');
  const dpagInput = document.getElementById('gf-dpag');

  if (dvencWrap) dvencWrap.style.display = (isParcial || isParcelado) ? 'none' : 'block';
  if (dpagWrap) dpagWrap.style.display = (isPendente || isParcelado || isCancelado) ? 'none' : 'block';
  if (valorPagoWrap) valorPagoWrap.style.display = (isPago || isParcial) ? 'block' : 'none';
  if (valorRestanteWrap) valorRestanteWrap.style.display = isParcial ? 'block' : 'none';

  if (isParcial) {
    if (!options.skipCards && dpagInput && !dpagInput.value) dpagInput.value = toIso(new Date());
    calcValorRestante(!options.skipCards);
  } else if (isPendente || isParcelado || isCancelado) {
    if (dpagInput) dpagInput.value = '';
  } else if (isPago) {
    if (!options.skipCards && dpagInput && !dpagInput.value) dpagInput.value = toIso(new Date());
    calcValorRestante(false);
  }

  // Exibe o configurador de parcelas no Parcial e no Parcelado
  document.querySelectorAll('.gf-parcela-field').forEach(el => {
    el.style.display = (isParcial || isParcelado) ? 'block' : 'none';
  });

  if ((isParcial || isParcelado) && !options.skipCards) {
    const cardsAtuais = document.querySelectorAll('#gf-parcelas-list .parcela-card').length;
    const parcelasInput = document.getElementById('gf-parcelas');
    const maximoParcelas = isParcial ? 47 : 48;
    parcelasInput.max = String(maximoParcelas);
    let quantidade = parseInt(parcelasInput.value, 10) || cardsAtuais;
    quantidade = isParcelado ? Math.max(2, quantidade) : Math.max(1, quantidade);
    quantidade = Math.min(maximoParcelas, quantidade);
    parcelasInput.value = quantidade;

    if (modalidadeMudou || cardsAtuais === 0 || cardsAtuais !== quantidade) {
      gerarParcelasCards({ forceRedistribute: modalidadeMudou });
    }
  }

  currentFormModalidade = status;
}

function gerarParcelasCards(options = {}) {
  const parcelasInput = document.getElementById('gf-parcelas');
  const list = document.getElementById('gf-parcelas-list');
  if (!list || !parcelasInput) return;

  const intervalEl = document.querySelector('input[name="gf-intervalo"]:checked');
  const interval = intervalEl ? intervalEl.value : '30';
  const status = document.getElementById('gf-status').value;
  const maximoParcelas = status === 'Parcial' ? 47 : 48;
  const num = Math.min(maximoParcelas, parseInt(parcelasInput.value, 10) || 0);
  parcelasInput.max = String(maximoParcelas);
  if (num > 0) parcelasInput.value = String(num);
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

  const existentes = Array.from(list.querySelectorAll('.parcela-card')).map(card => ({
    valor: parseVal(card.querySelector('.pc-val')?.value) || 0,
    data_vencimento: card.querySelector('.pc-date')?.value || ''
  }));
  const valores = dividirValorEmParcelas(baseVal, num);
  const redistribuirValores = Boolean(options.forceRedistribute) || interval !== 'custom' || existentes.length !== num;
  const itens = [];

  for (let i = 0; i < num; i++) {
    let dataVenc = baseDate;
    if (interval === 'custom' && existentes[i]) {
      dataVenc = existentes[i].data_vencimento || baseDate;
    } else if (baseDate && interval !== 'custom') {
      const d = new Date(baseDate + 'T12:00:00');
      const passo = status === 'Parcial' ? i + 1 : i;
      if (interval === '30') d.setDate(d.getDate() + (passo * 30));
      else if (interval === '15') d.setDate(d.getDate() + (passo * 15));
      else if (interval === '7') d.setDate(d.getDate() + (passo * 7));
      dataVenc = toIso(d);
    }

    itens.push({
      valor: !redistribuirValores && existentes[i] ? existentes[i].valor : valores[i],
      data_vencimento: dataVenc
    });
  }

  hidratarParcelasCards(itens, status);
}

function dividirValorEmParcelas(valor, quantidade) {
  if (!quantidade || quantidade <= 0) return [];
  const totalCentavos = Math.max(0, Math.round((Number(valor) || 0) * 100));
  const baseCentavos = Math.floor(totalCentavos / quantidade);
  const sobraCentavos = totalCentavos - (baseCentavos * quantidade);
  return Array.from({ length: quantidade }, (_, index) =>
    (baseCentavos + (index === quantidade - 1 ? sobraCentavos : 0)) / 100
  );
}

function hidratarParcelasCards(itens, modalidade) {
  const list = document.getElementById('gf-parcelas-list');
  const parcelasInput = document.getElementById('gf-parcelas');
  if (!list || !parcelasInput) return;

  const parcelas = Array.isArray(itens) ? itens : [];
  parcelasInput.value = parcelas.length || '';
  list.innerHTML = parcelas.map((item, index) => {
    const numero = index + 1;
    const rotulo = modalidade === 'Parcial'
      ? `Parcela Futura ${numero}/${parcelas.length}`
      : `Parcela ${numero}/${parcelas.length}`;
    return `
      <div class="parcela-card" data-index="${numero}">
        <div class="pc-head">${rotulo}</div>
        <div class="pc-body">
          <input type="text" class="pc-val" value="${fmt(item.valor || 0)}" oninput="this.value = fmtInput(this.value)" placeholder="Valor">
          <input type="date" class="pc-date" value="${item.data_vencimento || ''}" title="Data de Vencimento da Parcela">
        </div>
      </div>
    `;
  }).join('');
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
    if (interval === '30') d.setDate(d.getDate() + (i * 30));
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

  const cards = document.querySelectorAll('#gf-parcelas-list .parcela-card');
  if (cards.length === 0) return;
  const valores = dividirValorEmParcelas(baseVal, cards.length);

  cards.forEach((card, i) => {
    const input = card.querySelector('.pc-val');
    input.value = fmt(valores[i]);
  });

  recalcularDatasSubsequentes();
}

function fmtInput(v) {
  return fmt(parseVal(v));
}

function calcValorRestante(redistribuir = true) {
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
  if (status === 'Parcial' && redistribuir) {
    distribuirIgual();
  }
}

function onValorTotalChange() {
  const status = document.getElementById('gf-status').value;
  if (status === 'Parcial') calcValorRestante(true);
  else if (status === 'Parcelado') distribuirIgual();
  else if (status === 'Pago') {
    calcValorRestante(false);
  }
}

// ─── Submeter lançamento ───

function valorEmCentavos(valor) {
  return Math.round((Number(valor) || 0) * 100);
}

function dataIsoValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor || '')) return false;
  const data = new Date(`${valor}T12:00:00`);
  return !Number.isNaN(data.getTime()) && toIso(data) === valor;
}

function lerCamposComunsGestao() {
  const dataEmissao = document.getElementById('gf-demissao')?.value || '';
  return {
    movimentacao: document.getElementById('gf-mov').value,
    categoria: document.getElementById('gf-cat').value,
    observacoes: document.getElementById('gf-obs').value,
    fornecedor: document.getElementById('gf-forn').value,
    conta_bancaria: document.getElementById('gf-conta').value,
    forma_pagamento: document.getElementById('gf-forma').value,
    empresa: document.getElementById('gf-empresa')?.value || 'DAC',
    modo_emissao: document.getElementById('gf-nf').value || '',
    data_emissao: dataEmissao ? isoToBr(dataEmissao) : ''
  };
}

function lerParcelasPendentesDoForm() {
  return Array.from(document.querySelectorAll('#gf-parcelas-list .parcela-card')).map(card => ({
    valor: parseVal(card.querySelector('.pc-val')?.value) || 0,
    valor_pago: 0,
    status: 'Pendente',
    data_vencimento: card.querySelector('.pc-date')?.value || '',
    data_pagamento: ''
  }));
}

function copiarItemPagoExistente(item) {
  return {
    valor: item.valor,
    valor_pago: item.valor_pago > 0 ? item.valor_pago : item.valor,
    status: 'Pago',
    data_vencimento: item.data_vencimento,
    data_pagamento: item.data_pagamento
  };
}

function copiarItemCanceladoExistente(item) {
  return {
    valor: item.valor,
    valor_pago: 0,
    status: 'Cancelado',
    data_vencimento: item.data_vencimento,
    data_pagamento: ''
  };
}

function montarConfiguracaoFinanceira() {
  const modalidade = document.getElementById('gf-status').value;
  const valorTotal = parseVal(document.getElementById('gf-val').value) || 0;
  const dataVencimento = document.getElementById('gf-dvenc').value;
  const dataPagamento = document.getElementById('gf-dpag').value;
  const valorPagoInformado = parseVal(document.getElementById('gf-valorpago').value) || 0;
  const contexto = currentEditContext;
  let itens = [];
  let preservaHistoricoPago = false;
  let preservaHistoricoCancelado = false;

  if (modalidade === 'Pago') {
    preservaHistoricoPago = Boolean(
      contexto?.groupId &&
      contexto.modalidadeOriginal === 'Pago' &&
      valorEmCentavos(contexto.valorTotalOriginal) === valorEmCentavos(valorTotal) &&
      valorEmCentavos(contexto.valorPagoOriginal) === valorEmCentavos(valorPagoInformado) &&
      contexto.dataVencimentoOriginal === dataVencimento &&
      contexto.dataPagamentoOriginal === dataPagamento
    );

    if (preservaHistoricoPago) {
      itens = contexto.itens.map(copiarItemPagoExistente);
    } else {
      itens = [{
        valor: valorTotal,
        valor_pago: valorPagoInformado,
        status: 'Pago',
        data_vencimento: dataVencimento,
        data_pagamento: dataPagamento
      }];
    }
  } else if (modalidade === 'Pendente') {
    itens = [{
      valor: valorTotal,
      valor_pago: 0,
      status: modalidade,
      data_vencimento: dataVencimento,
      data_pagamento: ''
    }];
  } else if (modalidade === 'Cancelado') {
    preservaHistoricoCancelado = Boolean(
      contexto?.groupId &&
      contexto.todosCancelados &&
      contexto.modalidadeOriginal === 'Cancelado' &&
      valorEmCentavos(contexto.valorTotalOriginal) === valorEmCentavos(valorTotal) &&
      contexto.dataVencimentoOriginal === dataVencimento
    );
    itens = preservaHistoricoCancelado
      ? contexto.itens.map(copiarItemCanceladoExistente)
      : [{
          valor: valorTotal,
          valor_pago: 0,
          status: 'Cancelado',
          data_vencimento: dataVencimento,
          data_pagamento: ''
        }];
  } else if (modalidade === 'Parcelado') {
    itens = lerParcelasPendentesDoForm();
  } else if (modalidade === 'Parcial') {
    const valorPagoNaoMudou = Boolean(
      contexto?.itensPagos?.length &&
      valorEmCentavos(contexto.valorPagoOriginal) === valorEmCentavos(valorPagoInformado) &&
      contexto.dataPagamentoOriginal === dataPagamento
    );
    const itensPagos = valorPagoNaoMudou
      ? contexto.itensPagos.map(copiarItemPagoExistente)
      : [{
          valor: valorPagoInformado,
          valor_pago: valorPagoInformado,
          status: 'Pago',
          data_vencimento: dataPagamento,
          data_pagamento: dataPagamento
        }];
    itens = [...itensPagos, ...lerParcelasPendentesDoForm()];
  }

  return {
    modalidade,
    valorTotal,
    valorPagoInformado,
    itens,
    preservaHistoricoPago,
    preservaHistoricoCancelado
  };
}

function validarConfiguracaoFinanceira(configuracao) {
  const {
    modalidade,
    valorTotal,
    valorPagoInformado,
    itens,
    preservaHistoricoPago,
    preservaHistoricoCancelado
  } = configuracao;
  const modalidadesValidas = ['Pago', 'Pendente', 'Parcial', 'Parcelado', 'Cancelado'];
  if (!modalidadesValidas.includes(modalidade)) return 'Selecione uma modalidade válida.';
  if (valorEmCentavos(valorTotal) <= 0) return 'O valor total deve ser positivo.';
  if (!Array.isArray(itens) || itens.length === 0) return 'Configure ao menos um item financeiro.';
  if (currentEditContext?.grupoMistoComCancelado && !currentEditContext.modalidadeEscolhidaExplicitamente) {
    return 'Este grupo possui itens cancelados misturados com outros status. Selecione explicitamente a modalidade desejada antes de salvar.';
  }

  if (modalidade === 'Parcelado' && itens.length < 2) {
    return 'Um lançamento parcelado precisa ter pelo menos 2 parcelas pendentes.';
  }
  if (modalidade === 'Parcelado' && itens.length > 48) {
    return 'Um lançamento parcelado pode ter no máximo 48 parcelas.';
  }
  if (modalidade === 'Parcial' && itens.filter(item => item.status === 'Pendente').length > 47) {
    return 'Um lançamento parcial pode ter no máximo 47 parcelas futuras.';
  }
  if (modalidade === 'Parcial' && itens.length > 48) {
    return 'Um lançamento parcial pode ter no máximo 48 itens no total.';
  }
  if (modalidade === 'Parcial' && (
    valorEmCentavos(valorPagoInformado) <= 0 ||
    valorEmCentavos(valorPagoInformado) >= valorEmCentavos(valorTotal)
  )) {
    return 'No modo Parcial, o valor pago deve ser maior que zero e menor que o total.';
  }

  let somaCentavos = 0;
  let quantidadePagos = 0;
  let quantidadePendentes = 0;

  for (let index = 0; index < itens.length; index++) {
    const item = itens[index];
    const numero = index + 1;
    const valorCentavos = valorEmCentavos(item.valor);
    const valorPagoCentavos = valorEmCentavos(item.valor_pago);
    somaCentavos += valorCentavos;

    if (valorCentavos <= 0) return `O valor do item ${numero} deve ser positivo.`;
    if (!dataIsoValida(item.data_vencimento)) return `Informe um vencimento válido para o item ${numero}.`;
    if (!['Pago', 'Pendente', 'Cancelado'].includes(item.status)) {
      return `O item ${numero} possui um status inválido.`;
    }

    if (item.status === 'Pago') {
      quantidadePagos++;
      if (valorPagoCentavos <= 0) return `Informe um valor pago positivo para o item ${numero}.`;
      if (!dataIsoValida(item.data_pagamento)) return `Informe uma data de pagamento válida para o item ${numero}.`;
    } else {
      if (item.status === 'Pendente') quantidadePendentes++;
      if (valorPagoCentavos !== 0 || item.data_pagamento) {
        return `O item ${numero} não pago não pode ter valor ou data de pagamento.`;
      }
    }
  }

  if (somaCentavos !== valorEmCentavos(valorTotal)) {
    return `A soma dos itens (${fmt(somaCentavos / 100)}) deve ser igual ao total (${fmt(valorTotal)}).`;
  }
  if (modalidade === 'Parcelado' && quantidadePendentes !== itens.length) {
    return 'Todas as parcelas de um lançamento Parcelado devem estar pendentes.';
  }
  if (modalidade === 'Parcial' && (quantidadePagos === 0 || quantidadePendentes === 0)) {
    return 'O modo Parcial precisa ter ao menos um item pago e um pendente.';
  }
  if (modalidade === 'Parcial') {
    const totalPago = itens
      .filter(item => item.status === 'Pago')
      .reduce((soma, item) => soma + valorEmCentavos(item.valor_pago), 0);
    if (totalPago !== valorEmCentavos(valorPagoInformado)) {
      return 'Os itens pagos não correspondem ao valor pago informado.';
    }
  }
  if (modalidade === 'Pago') {
    const totalPago = itens.reduce((soma, item) => soma + valorEmCentavos(item.valor_pago), 0);
    if (totalPago !== valorEmCentavos(valorPagoInformado)) {
      return 'Os itens pagos não correspondem ao valor pago informado.';
    }
  }
  if (modalidade === 'Pago' && !preservaHistoricoPago && (itens.length !== 1 || quantidadePagos !== 1)) {
    return 'O modo Pago deve gerar um único item quitado.';
  }
  if (modalidade === 'Pendente' && itens.length !== 1) {
    return `O modo ${modalidade} deve gerar um único item.`;
  }
  if (modalidade === 'Cancelado' && !preservaHistoricoCancelado && itens.length !== 1) {
    return 'O modo Cancelado deve gerar um único item.';
  }

  return '';
}

function serializarItemFinanceiro(item) {
  return {
    valor: Math.round(item.valor * 100) / 100,
    data_vencimento: isoToBr(item.data_vencimento),
    status: item.status,
    valor_pago: Math.round(item.valor_pago * 100) / 100,
    data_pagamento: item.data_pagamento ? isoToBr(item.data_pagamento) : ''
  };
}

async function submitGestao() {
  const btn = document.getElementById('gf-submit');
  if (!btn || btn.disabled) return;

  const camposComuns = lerCamposComunsGestao();
  if (!camposComuns.movimentacao || !camposComuns.categoria || !document.getElementById('gf-val').value) {
    showGestaoToast('Preencha os campos obrigatórios: Movimentação, Categoria e Valor.', 'err');
    return;
  }

  const configuracao = montarConfiguracaoFinanceira();
  const erroValidacao = validarConfiguracaoFinanceira(configuracao);
  if (erroValidacao) {
    showGestaoToast('❌ ' + erroValidacao, 'err');
    return;
  }

  const itens = configuracao.itens.map(serializarItemFinanceiro);
  const isEdit = Boolean(currentEditId);
  let endpoint = `${API}/lancamento`;
  let method = 'POST';
  let body;

  if (isEdit) {
    endpoint = `${API}/lancamento/reconfigurar/${currentEditTipo}/${currentEditId}`;
    method = 'PUT';
    body = {
      ...camposComuns,
      modalidade: configuracao.modalidade,
      valor_total: Math.round(configuracao.valorTotal * 100) / 100,
      itens
    };
  } else if (configuracao.modalidade === 'Parcelado' || configuracao.modalidade === 'Parcial') {
    endpoint = `${API}/lancamento/parcelado`;
    body = {
      ...camposComuns,
      modalidade: configuracao.modalidade,
      valor_total: Math.round(configuracao.valorTotal * 100) / 100,
      parcelas: itens
    };
  } else {
    body = {
      ...camposComuns,
      ...itens[0],
      num_parcelas: 1
    };
  }

  const textoOriginal = btn.textContent;
  let concluido = false;
  btn.disabled = true;
  btn.textContent = isEdit ? 'Salvando Alterações...' : 'Sincronizando...';

  try {
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (response.ok && data.success) {
      concluido = true;
      showGestaoToast('✓ ' + (data.message || 'Lançamento salvo com sucesso.'), 'ok');
      resetGestaoForm();
      setTimeout(loadData, 500);
    } else {
      showGestaoToast('❌ ' + (data.error || 'Erro ao enviar lançamento.'), 'err');
    }
  } catch (e) {
    console.error('Erro ao salvar lançamento:', e);
    showGestaoToast('❌ Erro de conexão com o servidor.', 'err');
  } finally {
    btn.disabled = false;
    if (!concluido) btn.textContent = textoOriginal;
  }
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

function obterGrupoIdLancamento(row) {
  const match = String(row?.parcela_ref || '').match(/\[(PRC-[^\]]+)\]/i);
  return row?._parcelGroupId || (match ? match[1] : null);
}

function obterOrdemParcela(row) {
  const match = String(row?.parcela_ref || '').trim().match(/^(\d+)\//);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function normalizarModalidadeFinanceira(valor, fallback = 'Pendente') {
  const mapa = {
    pago: 'Pago',
    pendente: 'Pendente',
    parcial: 'Parcial',
    parcelado: 'Parcelado',
    cancelado: 'Cancelado'
  };
  const chave = String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return mapa[chave] || fallback;
}

function normalizarItemParaEdicao(row) {
  return {
    id: row.id,
    valor: parseVal(row.valor) || 0,
    valor_pago: parseVal(row.valor_pago) || 0,
    status: normalizarModalidadeFinanceira(row.status),
    data_vencimento: parseBrToIso(row.data_vencimento) || '',
    data_pagamento: parseBrToIso(row.data_pagamento) || '',
    parcela_ref: row.parcela_ref || ''
  };
}

function editLancamento(id, tipo) {
  const todasEntradas = ENT.map(item => ({ ...item, movimentacao: item.movimentacao || 'Entrada', _tipo: 'entrada' }));
  const todasSaidas = SAI.map(item => ({ ...item, movimentacao: item.movimentacao || 'Saída', _tipo: 'saida' }));
  const rows = [...todasEntradas, ...todasSaidas];
  const r = rows.find(x =>
    String(x.id) === String(id) && (!tipo || x._tipo === tipo)
  );
  if (!r) {
    console.warn("Lançamento não encontrado: ", id);
    return;
  }

  currentEditId = r.id;
  currentEditTipo = r._tipo;

  const grupoId = obterGrupoIdLancamento(r);
  const rowsDoTipo = currentEditTipo === 'entrada' ? todasEntradas : todasSaidas;
  const rowsDoGrupo = grupoId
    ? rowsDoTipo
        .filter(item => obterGrupoIdLancamento(item) === grupoId)
        .sort((a, b) => obterOrdemParcela(a) - obterOrdemParcela(b))
    : [r];
  const itens = rowsDoGrupo.map(normalizarItemParaEdicao);
  const itensPagos = itens.filter(item => item.status.toLowerCase() === 'pago');
  const itensCancelados = itens.filter(item => item.status.toLowerCase() === 'cancelado');
  const todosCancelados = itensCancelados.length === itens.length;
  const possuiCancelado = itensCancelados.length > 0;
  const valorTotal = itens.reduce((soma, item) => soma + item.valor, 0);
  const valorPagoGrupo = itensPagos.reduce(
    (soma, item) => soma + (item.valor_pago > 0 ? item.valor_pago : item.valor),
    0
  );

  let modalidade = normalizarModalidadeFinanceira(r.status);
  if (grupoId) {
    if (possuiCancelado) modalidade = 'Cancelado';
    else if (itensPagos.length === 0) modalidade = 'Parcelado';
    else if (itensPagos.length === itens.length) modalidade = 'Pago';
    else modalidade = 'Parcial';
  }
  const ultimoPagoComData = [...itensPagos].reverse().find(item => item.data_pagamento);
  const dataPagamentoRepresentativa = ultimoPagoComData?.data_pagamento || parseBrToIso(r.data_pagamento) || '';
  const dataVencimentoRepresentativa = parseBrToIso(r.data_vencimento) || itens[0]?.data_vencimento || '';
  const valorPagoOriginal = grupoId
    ? valorPagoGrupo
    : (modalidade === 'Pago' ? (parseVal(r.valor_pago) || valorTotal) : (parseVal(r.valor_pago) || 0));

  currentEditContext = {
    groupId: grupoId,
    itens,
    itensPagos,
    todosCancelados,
    grupoMistoComCancelado: possuiCancelado && !todosCancelados,
    modalidadeEscolhidaExplicitamente: false,
    modalidadeOriginal: modalidade,
    valorTotalOriginal: valorTotal,
    valorPagoOriginal,
    dataVencimentoOriginal: dataVencimentoRepresentativa,
    dataPagamentoOriginal: dataPagamentoRepresentativa
  };

  const title = document.getElementById('gf-title');
  if (title) {
    const detalhe = possuiCancelado && !todosCancelados
      ? 'Grupo com status mistos · escolha uma modalidade'
      : (grupoId ? `Grupo parcelado · ${itens.length} itens` : 'Lançamento individual');
    title.innerHTML = `<span style="color:#FACC15;">✏️ Editando Lançamento</span>
            <span style="margin-left:auto;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:400;letter-spacing:0;color:var(--muted);">${detalhe}</span>`;
  }

  document.getElementById('gf-submit').textContent = 'Salvar Alterações';
  document.getElementById('gf-delete').style.display = 'inline-block';

  // Helper para select
  const setSelectByText = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('option[data-gestao-temporaria="true"]').forEach(option => option.remove());
    const valor = String(val || '').trim();
    const match = Array.from(el.options).find(option => option.value.toLowerCase() === valor.toLowerCase());
    if (match) {
      el.value = match.value;
    } else if (valor) {
      const option = document.createElement('option');
      option.value = valor;
      option.textContent = valor;
      option.dataset.gestaoTemporaria = 'true';
      el.appendChild(option);
      el.value = valor;
    } else if (Array.from(el.options).some(option => option.value === '')) {
      el.value = '';
    }
  };

  const isEntrada = (r.movimentacao || (r._tipo === 'entrada' ? 'Entrada' : 'Saída')).toLowerCase().includes('entrada');
  document.getElementById('gf-mov').value = isEntrada ? 'Entrada' : 'Saída';
  updateGestaoCategorias();
  
  setSelectByText('gf-cat', r.categoria);
  document.getElementById('gf-forn').value = r.cliente || r.fornecedor || '';
  document.getElementById('gf-val').value = valorTotal || '';
  setSelectByText('gf-conta', r.conta_bancaria);
  
  const formaStr = r.forma_pagamento && r.forma_pagamento !== '—' ? r.forma_pagamento : '';
  setSelectByText('gf-forma', formaStr);
  
  if (document.getElementById('gf-demissao')) document.getElementById('gf-demissao').value = parseBrToIso(r.data_emissao) || '';
  document.getElementById('gf-dvenc').value = dataVencimentoRepresentativa;
  document.getElementById('gf-dpag').value = dataPagamentoRepresentativa;
  setSelectByText('gf-status', modalidade);
  document.getElementById('gf-obs').value = r.observacoes || '';

  const nfEl = document.getElementById('gf-nf');
  if (nfEl) nfEl.value = r.modo_emissao || '';
  const empEl = document.getElementById('gf-empresa');
  if (empEl) setSelectByText('gf-empresa', r.empresa || 'DAC');

  document.getElementById('gf-parcelas-list').innerHTML = '';
  document.getElementById('gf-parcelas').value = '';
  document.getElementById('gf-valorpago').value = valorPagoOriginal || '';
  document.getElementById('gf-valorrestante').value = fmt(Math.max(0, valorTotal - valorPagoOriginal));
  const intervaloEdicao = document.querySelector(
    `input[name="gf-intervalo"][value="${grupoId && (modalidade === 'Parcial' || modalidade === 'Parcelado') ? 'custom' : '30'}"]`
  );
  if (intervaloEdicao) intervaloEdicao.checked = true;
  currentFormModalidade = modalidade;
  toggleParcelaFields({ skipCards: true });

  if (modalidade === 'Parcial') {
    let itensPendentes;
    if (grupoId) {
      itensPendentes = itens.filter(item => item.status.toLowerCase() !== 'pago');
    } else {
      itensPendentes = [{
        valor: Math.max(0, valorTotal - valorPagoOriginal),
        data_vencimento: dataVencimentoRepresentativa || toIso(new Date())
      }];
    }
    hidratarParcelasCards(itensPendentes, modalidade);
  } else if (modalidade === 'Parcelado') {
    if (grupoId && itens.length >= 2) {
      hidratarParcelasCards(itens, modalidade);
    } else {
      document.getElementById('gf-parcelas').value = 2;
      gerarParcelasCards();
    }
  }

  const wrap = document.querySelector('.gestao-form-wrap');
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

async function deleteGestaoLancamento() {
  if (!currentEditId || !currentEditTipo) return;
  const mensagem = currentEditContext?.groupId
    ? `⚠️ Este lançamento pertence a um grupo com ${currentEditContext.itens.length} itens. A exclusão removerá permanentemente todo o grupo. Deseja continuar?`
    : '⚠️ Tem certeza que deseja excluir este lançamento permanentemente?';
  const isOk = confirm(mensagem);
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
