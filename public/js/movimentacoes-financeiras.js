/* ═══════════════════════════════════════════════
   movimentacoes-financeiras.js — Unificação ENTRADAS + SAÍDAS
   com KPIs clicáveis, colunas dinâmicas e ordenação interativa por cabeçalho
   ═══════════════════════════════════════════════ */

let currentMfKpiFilter = null;
let currentMfSortCol = null;
let currentMfSortDir = 'asc';

async function initMovimentacoesFinanceiras() {
  document.getElementById('mfDateFrom').value = '';
  document.getElementById('mfDateTo').value = '';
  const catEl = document.getElementById('mfCategoria');
  if (catEl) catEl.value = '';
  const stEl = document.getElementById('mfStatus');
  if (stEl) stEl.value = '';
  currentMfKpiFilter = null;
  currentMfSortCol = null;
  currentMfSortDir = 'asc';
  populateMfCategorias();
  renderMovimentacoesFinanceiras();
}

function populateMfCategorias() {
  const select = document.getElementById('mfCategoria');
  if (!select) return;
  const currentVal = select.value;
  const tipoFilter = document.getElementById('mfTipo') ? document.getElementById('mfTipo').value : '';

  const allRawCats = [];
  if (!tipoFilter || tipoFilter === 'entrada') {
    if (Array.isArray(ENT)) ENT.forEach(r => { if (r.categoria) allRawCats.push(r.categoria); });
  }
  if (!tipoFilter || tipoFilter === 'saída' || tipoFilter === 'saida') {
    if (Array.isArray(SAI)) SAI.forEach(r => { if (r.categoria) allRawCats.push(r.categoria); });
  }

  const catMap = new Map(); // norm -> clean display
  allRawCats.forEach(cat => {
    if (!cat) return;
    const cleanLabel = cat.toString()
      .replace(/[\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[.,;:\s]+$/, '')
      .replace(/^[.,;:\s]+/, '')
      .trim();
    if (!cleanLabel) return;
    const norm = normalizeString(cleanLabel);
    if (!catMap.has(norm)) {
      catMap.set(norm, cleanLabel); // Mantém a primeira capitalização limpa sem ponto no final
    }
  });

  const sortedNormKeys = Array.from(catMap.keys()).sort((a, b) => {
    return catMap.get(a).localeCompare(catMap.get(b), 'pt-BR', { sensitivity: 'base' });
  });

  select.innerHTML = '<option value="">Todas as Categorias</option>' +
    sortedNormKeys.map(norm => `<option value="${norm}">${catMap.get(norm)}</option>`).join('');

  if (currentVal && sortedNormKeys.includes(currentVal)) {
    select.value = currentVal;
  } else {
    select.value = '';
  }
}

function toggleMfKpiFilter(filterKey) {
  if (currentMfKpiFilter === filterKey) {
    currentMfKpiFilter = null;
  } else {
    currentMfKpiFilter = filterKey;
  }
  renderMovimentacoesFinanceiras();
}

function toggleMfSort(colKey) {
  if (currentMfSortCol === colKey) {
    currentMfSortDir = currentMfSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    currentMfSortCol = colKey;
    // Padrão desc para valores monetários, asc para textos e datas
    currentMfSortDir = (colKey.includes('valor') || colKey.includes('aReceber') || colKey.includes('aPagar')) ? 'desc' : 'asc';
  }
  renderMovimentacoesFinanceiras();
}

function getSortIconHtml(colKey) {
  if (currentMfSortCol !== colKey) return '<span class="sort-icon">↕</span>';
  return currentMfSortDir === 'asc'
    ? '<span class="sort-icon" style="color:var(--accent);font-weight:bold;">▲</span>'
    : '<span class="sort-icon" style="color:var(--accent);font-weight:bold;">▼</span>';
}

function getSortValue(r, colKey) {
  switch (colKey) {
    case 'tipo':
      return r._tipo || r.movimentacao || '';
    case 'categoria':
      return r.categoria || '';
    case 'observacoes':
      return r.observacoes || '';
    case 'cliente':
      return r.cliente || r.fornecedor || '';
    case 'fornecedor':
      return r.fornecedor || r.cliente || '';
    case 'status':
      return (r.status || '').toLowerCase();
    case 'valor':
      return parseFloat(r.valor) || 0;
    case 'aReceber':
    case 'aPagar':
      return Math.max(0, (parseFloat(r.valor) || 0) - (parseFloat(r.valor_pago) || 0));
    case 'valor_pago':
      return parseFloat(r.valor_pago) || 0;
    case 'vencimento':
      return parseDate(r.data_vencimento) || new Date(0);
    case 'pagamento':
      return parseDate(r.data_pagamento) || new Date(0);
    case 'conta_bancaria':
      return r.conta_bancaria || '';
    case 'forma_pagamento':
      return r.forma_pagamento || '';
    case 'modo_emissao':
      return r.nota_fiscal || r.modo_emissao || '';
    case 'parcelas':
      return r.parcela_ref || '';
    default:
      return '';
  }
}

function setMfPeriod(p, btn) {
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
  
  document.getElementById('mfDateFrom').value = from;
  document.getElementById('mfDateTo').value = to;
  document.querySelectorAll('.mf-period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMovimentacoesFinanceiras();
}

function renderMovimentacoesFinanceiras() {
  try {
    const search = (document.getElementById('mfSearch').value || '').toLowerCase();
    const tipoFilter = document.getElementById('mfTipo').value;
    const catFilter = document.getElementById('mfCategoria') ? document.getElementById('mfCategoria').value : '';
    const statusFilter = document.getElementById('mfStatus') ? document.getElementById('mfStatus').value : '';
    const dateFrom = document.getElementById('mfDateFrom').value;
    const dateTo = document.getElementById('mfDateTo').value;

    // Combinar Entradas e Saídas
    const ents = ENT.map(r => ({ ...r, _tipo: 'entrada' }));
    const sais = SAI.map(r => ({ ...r, _tipo: 'saída' }));
    let rows = [...ents, ...sais];

    // Filtro de Tipo (Entrada/Saída)
    if (tipoFilter) {
      rows = rows.filter(r => r._tipo === tipoFilter);
    }

    // Filtro de Categoria
    if (catFilter) {
      rows = rows.filter(r => normalizeString(r.categoria) === catFilter);
    }

    // Filtro de Status
    if (statusFilter) {
      rows = rows.filter(r => {
        const st = (r.status || 'Pendente').trim().toLowerCase();
        let isOverdue = false;
        if (r.data_vencimento && st !== 'pago' && st !== 'cancelado') {
          const venc = parseDate(r.data_vencimento);
          if (venc) {
            venc.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (venc < today) isOverdue = true;
          }
        }

        if (statusFilter === 'pago') return st === 'pago';
        if (statusFilter === 'vencido') return isOverdue;
        if (statusFilter === 'pendente') return st === 'pendente' && !isOverdue;
        if (statusFilter === 'parcial') return st.includes('parcial');
        if (statusFilter === 'cancelado') return st === 'cancelado';
        return true;
      });
    }

    // Filtro de Busca
    if (search) {
      rows = rows.filter(r => 
        (r.cliente || '').toLowerCase().includes(search) ||
        (r.fornecedor || '').toLowerCase().includes(search) ||
        (r.observacoes || '').toLowerCase().includes(search) ||
        (r.categoria || '').toLowerCase().includes(search)
      );
    }

    // Filtro de Período
    if (dateFrom || dateTo) {
      rows = rows.filter(r => {
        const dIso = parseBrToIso(r.data_pagamento || r.data_vencimento || r.data);
        if (!dIso) return false;
        if (dateFrom && dIso < dateFrom) return false;
        if (dateTo && dIso > dateTo) return false;
        return true;
      });
    }

    // Filtro por clique no KPI
    if (currentMfKpiFilter === 'receber') {
      rows = rows.filter(r => (r._tipo === 'entrada' || (r.movimentacao || '').toLowerCase().includes('entrada')) && r.status !== 'Pago' && r.status !== 'Cancelado');
      rows = consolidateGroupRows(rows, 'entrada');
    } else if (currentMfKpiFilter === 'pagar') {
      rows = rows.filter(r => (r._tipo === 'saída' || !(r.movimentacao || '').toLowerCase().includes('entrada')) && r.status !== 'Pago' && r.status !== 'Cancelado');
      rows = consolidateGroupRows(rows, 'saida');
    } else if (currentMfKpiFilter === 'entradas') {
      rows = rows.filter(r => r._tipo === 'entrada' || (r.movimentacao || '').toLowerCase().includes('entrada'));
    } else if (currentMfKpiFilter === 'saidas') {
      rows = rows.filter(r => r._tipo === 'saída' || !(r.movimentacao || '').toLowerCase().includes('entrada'));
    }

    const tbody = document.getElementById('tbMovFinanceiras');
    const thead = document.getElementById('thMovFinanceiras');
    if (!tbody) return;

    // Ordenar linhas por coluna selecionada ou padrão (mais recente primeiro)
    if (currentMfSortCol) {
      rows.sort((a, b) => {
        let valA = getSortValue(a, currentMfSortCol);
        let valB = getSortValue(b, currentMfSortCol);

        let res = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          res = valA - valB;
        } else if (valA instanceof Date && valB instanceof Date) {
          res = valA.getTime() - valB.getTime();
        } else {
          res = String(valA || '').localeCompare(String(valB || ''), 'pt-BR', { sensitivity: 'base' });
        }

        return currentMfSortDir === 'asc' ? res : -res;
      });
    } else {
      rows.sort((a, b) => {
        const da = parseDate(a.data_pagamento || a.data_vencimento || a.data) || new Date(0);
        const db = parseDate(b.data_pagamento || b.data_vencimento || b.data) || new Date(0);
        return db - da;
      });
    }

    // Atualizar cabeçalho dinâmico (<thead>) com botões de ordenação
    if (thead) {
      if (currentMfKpiFilter === 'receber') {
        thead.innerHTML = `<tr>
          <th class="th-sortable ${currentMfSortCol === 'tipo' ? 'active-sort' : ''}" onclick="toggleMfSort('tipo')">Tipo ${getSortIconHtml('tipo')}</th>
          <th class="th-sortable ${currentMfSortCol === 'categoria' ? 'active-sort' : ''}" onclick="toggleMfSort('categoria')">Categoria ${getSortIconHtml('categoria')}</th>
          <th class="th-sortable ${currentMfSortCol === 'observacoes' ? 'active-sort' : ''}" onclick="toggleMfSort('observacoes')">Observações ${getSortIconHtml('observacoes')}</th>
          <th class="th-sortable ${currentMfSortCol === 'cliente' ? 'active-sort' : ''}" onclick="toggleMfSort('cliente')">Cliente ${getSortIconHtml('cliente')}</th>
          <th class="th-sortable ${currentMfSortCol === 'status' ? 'active-sort' : ''}" onclick="toggleMfSort('status')">Status ${getSortIconHtml('status')}</th>
          <th class="th-sortable ${currentMfSortCol === 'valor' ? 'active-sort' : ''}" onclick="toggleMfSort('valor')">Valor Total ${getSortIconHtml('valor')}</th>
          <th class="th-sortable ${currentMfSortCol === 'aReceber' ? 'active-sort' : ''}" onclick="toggleMfSort('aReceber')">Valor a Receber ${getSortIconHtml('aReceber')}</th>
          <th class="th-sortable ${currentMfSortCol === 'parcelas' ? 'active-sort' : ''}" onclick="toggleMfSort('parcelas')">Parcelas ${getSortIconHtml('parcelas')}</th>
          <th class="th-sortable ${currentMfSortCol === 'vencimento' ? 'active-sort' : ''}" onclick="toggleMfSort('vencimento')">Vencimento ${getSortIconHtml('vencimento')}</th>
          <th class="th-sortable ${currentMfSortCol === 'conta_bancaria' ? 'active-sort' : ''}" onclick="toggleMfSort('conta_bancaria')">Conta Bancária ${getSortIconHtml('conta_bancaria')}</th>
          <th class="th-sortable ${currentMfSortCol === 'forma_pagamento' ? 'active-sort' : ''}" onclick="toggleMfSort('forma_pagamento')">Forma Pgto ${getSortIconHtml('forma_pagamento')}</th>
        </tr>`;
      } else if (currentMfKpiFilter === 'pagar') {
        thead.innerHTML = `<tr>
          <th class="th-sortable ${currentMfSortCol === 'tipo' ? 'active-sort' : ''}" onclick="toggleMfSort('tipo')">Tipo ${getSortIconHtml('tipo')}</th>
          <th class="th-sortable ${currentMfSortCol === 'categoria' ? 'active-sort' : ''}" onclick="toggleMfSort('categoria')">Categoria ${getSortIconHtml('categoria')}</th>
          <th class="th-sortable ${currentMfSortCol === 'observacoes' ? 'active-sort' : ''}" onclick="toggleMfSort('observacoes')">Observações ${getSortIconHtml('observacoes')}</th>
          <th class="th-sortable ${currentMfSortCol === 'fornecedor' ? 'active-sort' : ''}" onclick="toggleMfSort('fornecedor')">Fornecedor ${getSortIconHtml('fornecedor')}</th>
          <th class="th-sortable ${currentMfSortCol === 'status' ? 'active-sort' : ''}" onclick="toggleMfSort('status')">Status ${getSortIconHtml('status')}</th>
          <th class="th-sortable ${currentMfSortCol === 'valor' ? 'active-sort' : ''}" onclick="toggleMfSort('valor')">Valor Total ${getSortIconHtml('valor')}</th>
          <th class="th-sortable ${currentMfSortCol === 'aPagar' ? 'active-sort' : ''}" onclick="toggleMfSort('aPagar')">Valor a Pagar ${getSortIconHtml('aPagar')}</th>
          <th class="th-sortable ${currentMfSortCol === 'parcelas' ? 'active-sort' : ''}" onclick="toggleMfSort('parcelas')">Parcelas ${getSortIconHtml('parcelas')}</th>
          <th class="th-sortable ${currentMfSortCol === 'vencimento' ? 'active-sort' : ''}" onclick="toggleMfSort('vencimento')">Vencimento ${getSortIconHtml('vencimento')}</th>
          <th class="th-sortable ${currentMfSortCol === 'conta_bancaria' ? 'active-sort' : ''}" onclick="toggleMfSort('conta_bancaria')">Conta Bancária ${getSortIconHtml('conta_bancaria')}</th>
          <th class="th-sortable ${currentMfSortCol === 'forma_pagamento' ? 'active-sort' : ''}" onclick="toggleMfSort('forma_pagamento')">Forma Pgto ${getSortIconHtml('forma_pagamento')}</th>
        </tr>`;
      } else {
        thead.innerHTML = `<tr>
          <th class="th-sortable ${currentMfSortCol === 'tipo' ? 'active-sort' : ''}" onclick="toggleMfSort('tipo')">Tipo ${getSortIconHtml('tipo')}</th>
          <th class="th-sortable ${currentMfSortCol === 'categoria' ? 'active-sort' : ''}" onclick="toggleMfSort('categoria')">Categoria ${getSortIconHtml('categoria')}</th>
          <th class="th-sortable ${currentMfSortCol === 'observacoes' ? 'active-sort' : ''}" onclick="toggleMfSort('observacoes')">Observações ${getSortIconHtml('observacoes')}</th>
          <th class="th-sortable ${currentMfSortCol === 'valor' ? 'active-sort' : ''}" onclick="toggleMfSort('valor')">Valor ${getSortIconHtml('valor')}</th>
          <th class="th-sortable ${currentMfSortCol === 'cliente' ? 'active-sort' : ''}" onclick="toggleMfSort('cliente')">Fornecedor/Cliente ${getSortIconHtml('cliente')}</th>
          <th class="th-sortable ${currentMfSortCol === 'conta_bancaria' ? 'active-sort' : ''}" onclick="toggleMfSort('conta_bancaria')">Conta Bancária ${getSortIconHtml('conta_bancaria')}</th>
          <th class="th-sortable ${currentMfSortCol === 'vencimento' ? 'active-sort' : ''}" onclick="toggleMfSort('vencimento')">Vencimento ${getSortIconHtml('vencimento')}</th>
          <th class="th-sortable ${currentMfSortCol === 'pagamento' ? 'active-sort' : ''}" onclick="toggleMfSort('pagamento')">Pagamento ${getSortIconHtml('pagamento')}</th>
          <th class="th-sortable ${currentMfSortCol === 'forma_pagamento' ? 'active-sort' : ''}" onclick="toggleMfSort('forma_pagamento')">Forma ${getSortIconHtml('forma_pagamento')}</th>
          <th class="th-sortable ${currentMfSortCol === 'status' ? 'active-sort' : ''}" onclick="toggleMfSort('status')">Status ${getSortIconHtml('status')}</th>
          <th class="th-sortable ${currentMfSortCol === 'modo_emissao' ? 'active-sort' : ''}" onclick="toggleMfSort('modo_emissao')">Modo de Emissão ${getSortIconHtml('modo_emissao')}</th>
          <th class="th-sortable ${currentMfSortCol === 'parcelas' ? 'active-sort' : ''}" onclick="toggleMfSort('parcelas')">Parcelas ${getSortIconHtml('parcelas')}</th>
          <th class="th-sortable ${currentMfSortCol === 'valor_pago' ? 'active-sort' : ''}" onclick="toggleMfSort('valor_pago')">Valor Pago ${getSortIconHtml('valor_pago')}</th>
        </tr>`;
      }
    }

    if (rows.length === 0) {
      tbody.innerHTML = '';
      document.getElementById('mfVazio').style.display = 'block';
      updateMfKpis(rows);
      return;
    }
    document.getElementById('mfVazio').style.display = 'none';

    tbody.innerHTML = rows.map(r => {
      const isEnt = r._tipo === 'entrada';
      const movTag = isEnt ? `<span class="stag sp">Entrada</span>` : `<span class="stag so">Saída</span>`;
      const valColor = isEnt ? '#4ADE80' : 'var(--red)';
      const valSign = isEnt ? '+' : '-';
      const statusBadge = typeof renderStatusBadge === 'function' ? renderStatusBadge(r) : `<span class="stag sn">${r.status || 'Pendente'}</span>`;
      const person = isEnt ? (r.cliente || '—') : (r.fornecedor || '—');

      if (currentMfKpiFilter === 'receber') {
        const valTotal = parseFloat(r.valor) || 0;
        const valPago = parseFloat(r.valor_pago) || 0;
        const aReceber = Math.max(0, valTotal - valPago);
        return `<tr>
          <td>${movTag}</td>
          <td><span class="stag cby" style="font-size:10px;">${r.categoria || '—'}</span></td>
          <td style="font-size:10px;opacity:0.8;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.observacoes || ''}">${r.observacoes || '—'}</td>
          <td style="font-size:11px; font-weight:600;">${r.cliente || r.fornecedor || '—'}</td>
          <td>${statusBadge}</td>
          <td class="mono" style="font-weight:600;">${fmt(valTotal)}</td>
          <td class="mono" style="color:#4ADE80;font-weight:700;">+ ${fmt(aReceber)}</td>
          <td>${typeof renderParcelaBadge === 'function' ? renderParcelaBadge(r) : (r.parcela_ref || '—')}</td>
          <td style="font-size:11px;">${r.data_vencimento || '—'}</td>
          <td style="font-size:11px;color:var(--muted);">${r.conta_bancaria || '—'}</td>
          <td style="font-size:11px;color:var(--muted);">${r.forma_pagamento || '—'}</td>
        </tr>`;
      } else if (currentMfKpiFilter === 'pagar') {
        const valTotal = parseFloat(r.valor) || 0;
        const valPago = parseFloat(r.valor_pago) || 0;
        const aPagar = Math.max(0, valTotal - valPago);
        return `<tr>
          <td>${movTag}</td>
          <td><span class="stag cby" style="font-size:10px;">${r.categoria || '—'}</span></td>
          <td style="font-size:10px;opacity:0.8;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.observacoes || ''}">${r.observacoes || '—'}</td>
          <td style="font-size:11px; font-weight:600;">${r.fornecedor || r.cliente || '—'}</td>
          <td>${statusBadge}</td>
          <td class="mono" style="font-weight:600;">${fmt(valTotal)}</td>
          <td class="mono" style="color:var(--red);font-weight:700;">- ${fmt(aPagar)}</td>
          <td>${typeof renderParcelaBadge === 'function' ? renderParcelaBadge(r) : (r.parcela_ref || '—')}</td>
          <td style="font-size:11px;">${r.data_vencimento || '—'}</td>
          <td style="font-size:11px;color:var(--muted);">${r.conta_bancaria || '—'}</td>
          <td style="font-size:11px;color:var(--muted);">${r.forma_pagamento || '—'}</td>
        </tr>`;
      }

      // Renderização padrão (Visão Geral de 13 colunas)
      return `<tr>
        <td>${movTag}</td>
        <td><span class="stag cby" style="font-size:10px;">${r.categoria || '—'}</span></td>
        <td style="font-size:10px;opacity:0.8;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.observacoes || ''}">${r.observacoes || '—'}</td>
        <td class="mono" style="color:${valColor};font-weight:700;">${valSign} ${fmt(r.valor)}</td>
        <td style="font-size:11px; font-weight:600;">${person}</td>
        <td style="font-size:11px;color:var(--muted);">${r.conta_bancaria || '—'}</td>
        <td style="font-size:11px;">${r.data_vencimento || '—'}</td>
        <td style="font-size:11px;">${r.data_pagamento || '—'}</td>
        <td style="font-size:11px;color:var(--muted);">${r.forma_pagamento || '—'}</td>
        <td>${statusBadge}</td>
        <td style="font-size:10px;color:var(--accent2);">${isEnt ? (r.nota_fiscal || '—') : '—'}</td>
        <td>${typeof renderParcelaBadge === 'function' ? renderParcelaBadge(r) : (r.parcela_ref || '—')}</td>
        <td class="mono" style="font-size:11px;">${fmt(r.valor_pago || 0)}</td>
      </tr>`;
    }).join('');

    // Atualizar KPIs
    updateMfKpis(rows);

  } catch (err) {
    console.error('❌ Erro ao renderizar Movimentações Financeiras:', err);
  }
}

// ─── Consolidação de linhas do mesmo grupo em Contas a Receber / Contas a Pagar ───

function consolidateGroupRows(filteredRows, targetTipo) {
  const allTargetRows = (targetTipo === 'entrada' ? ENT : SAI).map(r => ({ ...r, _tipo: targetTipo }));
  const groupsMap = new Map();
  const result = [];

  // Mapear todas as linhas originais por grupoId se existir
  allTargetRows.forEach(r => {
    const ref = r.parcela_ref || '';
    const match = ref.match(/\[(PRC-[^\]]+)\]/);
    if (match) {
      const gId = match[1];
      if (!groupsMap.has(gId)) {
        groupsMap.set(gId, []);
      }
      groupsMap.get(gId).push(r);
    }
  });

  const processedGroups = new Set();

  filteredRows.forEach(r => {
    const ref = r.parcela_ref || '';
    const match = ref.match(/\[(PRC-[^\]]+)\]/);
    if (match) {
      const gId = match[1];
      if (processedGroups.has(gId)) return;
      processedGroups.add(gId);

      const groupItems = groupsMap.get(gId) || [r];
      let totalValor = 0;
      let totalPago = 0;
      let proxVenc = '';
      let earliestDate = null;
      let hasPaid = false;
      let hasPending = false;

      groupItems.forEach(item => {
        const v = parseFloat(item.valor) || 0;
        const vp = parseFloat(item.valor_pago) || 0;
        totalValor += v;

        if (item.status === 'Pago') {
          totalPago += (vp > 0 ? vp : v);
          hasPaid = true;
        } else {
          hasPending = true;
          totalPago += vp;
          if (item.data_vencimento) {
            const dt = parseBrToIso(item.data_vencimento);
            if (dt && (!earliestDate || dt < earliestDate)) {
              earliestDate = dt;
              proxVenc = item.data_vencimento;
            }
          }
        }
      });

      const consolidatedStatus = (hasPaid && hasPending) ? 'Parcial' : (hasPending ? 'Pendente' : 'Pago');
      const baseItem = groupItems.find(x => x.status !== 'Pago') || groupItems[0];

      result.push({
        ...baseItem,
        valor: totalValor,
        valor_pago: totalPago,
        status: consolidatedStatus,
        data_vencimento: proxVenc || baseItem.data_vencimento || '—'
      });
    } else {
      result.push(r);
    }
  });

  return result;
}

function updateMfKpis(rows) {
  const kpiWrap = document.getElementById('mfKpis');
  if (!kpiWrap) return;

  // Usar lista completa de Entradas e Saídas sem o filtro do KPI atual para manter os valores nos cards
  const ents = ENT.map(r => ({ ...r, _tipo: 'entrada' }));
  const sais = SAI.map(r => ({ ...r, _tipo: 'saída' }));
  const allRows = [...ents, ...sais];

  const totalEnt = allRows.filter(r => r._tipo === 'entrada').reduce((acc, r) => acc + getEffectiveValue(r), 0);
  const totalSai = allRows.filter(r => r._tipo === 'saída').reduce((acc, r) => acc + getEffectiveValue(r), 0);
  const saldo = totalEnt - totalSai;

  const pendReceber = allRows.filter(r => r._tipo === 'entrada' && r.status !== 'Pago' && r.status !== 'Cancelado');
  const totalReceber = pendReceber.reduce((s, r) => s + Math.max(0, (parseFloat(r.valor) || 0) - (parseFloat(r.valor_pago) || 0)), 0);
  const receberSub = pendReceber.length > 0 
    ? `● ${pendReceber.length} pendente${pendReceber.length > 1 ? 's' : ''}` 
    : '✓ Nenhum pendente';
  const receberSubClass = pendReceber.length === 0 ? 'sub-g' : 'sub-y';

  const pendPagar = allRows.filter(r => r._tipo === 'saída' && r.status !== 'Pago' && r.status !== 'Cancelado');
  const totalPagar = pendPagar.reduce((s, r) => s + Math.max(0, (parseFloat(r.valor) || 0) - (parseFloat(r.valor_pago) || 0)), 0);
  
  let pagarSub = '✓ Tudo em dia';
  let pagarSubClass = 'sub-g';
  if (pendPagar.length > 0) {
    const now = new Date();
    now.setHours(0,0,0,0);
    
    const itemsComVenc = pendPagar.map(r => ({ ...r, _venc: parseDate(r.data_vencimento) })).filter(r => r._venc);
    const vencidas = itemsComVenc.filter(r => {
      r._venc.setHours(0,0,0,0);
      return r._venc < now;
    }).length;
    
    const venceHoje = itemsComVenc.filter(r => {
      r._venc.setHours(0,0,0,0);
      return r._venc.getTime() === now.getTime();
    }).length;

    if (vencidas > 0) {
      pagarSub = `⚠ ${vencidas} vencida${vencidas > 1 ? 's' : ''}`;
      pagarSubClass = 'sub-r';
    } else if (venceHoje > 0) {
      pagarSub = `⚠ ${venceHoje} vence${venceHoje > 1 ? 'm' : ''} hoje`;
      pagarSubClass = 'sub-r';
    } else {
      pagarSub = `● ${pendPagar.length} pendente${pendPagar.length > 1 ? 's' : ''}`;
      pagarSubClass = 'sub-y';
    }
  }

  const actRec = currentMfKpiFilter === 'receber' ? 'active-kpi' : '';
  const actPag = currentMfKpiFilter === 'pagar' ? 'active-kpi' : '';

  kpiWrap.innerHTML = `
    <div class="gbadge">
      <span class="gbadge-label">ENTRADAS</span>
      <span class="gbadge-val tg">${fmt(totalEnt)}</span>
    </div>
    <div class="gbadge">
      <span class="gbadge-label">SAÍDAS</span>
      <span class="gbadge-val tr">${fmt(totalSai)}</span>
    </div>
    <div class="gbadge">
      <span class="gbadge-label">SALDO</span>
      <span class="gbadge-val ${saldo >= 0 ? 'tg' : 'tr'}">${fmt(saldo)}</span>
    </div>
    <div class="gbadge kpi-clickable ${actRec}" onclick="toggleMfKpiFilter('receber')" title="Filtrar Contas a Receber">
      <span class="gbadge-label">C. A RECEBER</span>
      <span class="gbadge-val ty">${fmt(totalReceber)}</span>
      <span class="gbadge-sub ${receberSubClass}">${receberSub}</span>
    </div>
    <div class="gbadge kpi-clickable ${actPag}" onclick="toggleMfKpiFilter('pagar')" title="Filtrar Contas a Pagar">
      <span class="gbadge-label">C. A PAGAR</span>
      <span class="gbadge-val tr">${fmt(totalPagar)}</span>
      <span class="gbadge-sub ${pagarSubClass}">${pagarSub}</span>
    </div>
  `;
}

// ─── Emissão de Relatório PDF de Altíssimo Padrão ───

function gerarRelatorioPDF() {
  try {
    // 1. Obter linhas atualmente filtradas e visíveis na tela
    const search = (document.getElementById('mfSearch').value || '').toLowerCase();
    const tipoFilter = document.getElementById('mfTipo').value;
    const catFilter = document.getElementById('mfCategoria') ? document.getElementById('mfCategoria').value : '';
    const statusFilter = document.getElementById('mfStatus') ? document.getElementById('mfStatus').value : '';
    const dateFrom = document.getElementById('mfDateFrom').value;
    const dateTo = document.getElementById('mfDateTo').value;

    const ents = ENT.map(r => ({ ...r, _tipo: 'entrada' }));
    const sais = SAI.map(r => ({ ...r, _tipo: 'saída' }));
    let rows = [...ents, ...sais];

    if (tipoFilter) {
      rows = rows.filter(r => r._tipo === tipoFilter);
    }
    if (catFilter) {
      rows = rows.filter(r => normalizeString(r.categoria) === catFilter);
    }
    if (statusFilter) {
      rows = rows.filter(r => {
        const st = (r.status || 'Pendente').trim().toLowerCase();
        let isOverdue = false;
        if (r.data_vencimento && st !== 'pago' && st !== 'cancelado') {
          const venc = parseDate(r.data_vencimento);
          if (venc) {
            venc.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (venc < today) isOverdue = true;
          }
        }
        if (statusFilter === 'pago') return st === 'pago';
        if (statusFilter === 'vencido') return isOverdue;
        if (statusFilter === 'pendente') return st === 'pendente' && !isOverdue;
        if (statusFilter === 'parcial') return st.includes('parcial');
        if (statusFilter === 'cancelado') return st === 'cancelado';
        return true;
      });
    }
    if (search) {
      rows = rows.filter(r => 
        (r.cliente || '').toLowerCase().includes(search) ||
        (r.fornecedor || '').toLowerCase().includes(search) ||
        (r.observacoes || '').toLowerCase().includes(search) ||
        (r.categoria || '').toLowerCase().includes(search)
      );
    }
    if (dateFrom || dateTo) {
      rows = rows.filter(r => {
        const dIso = parseBrToIso(r.data_pagamento || r.data_vencimento || r.data);
        if (!dIso) return false;
        if (dateFrom && dIso < dateFrom) return false;
        if (dateTo && dIso > dateTo) return false;
        return true;
      });
    }

    if (currentMfKpiFilter === 'receber') {
      rows = rows.filter(r => (r._tipo === 'entrada' || (r.movimentacao || '').toLowerCase().includes('entrada')) && r.status !== 'Pago' && r.status !== 'Cancelado');
      rows = consolidateGroupRows(rows, 'entrada');
    } else if (currentMfKpiFilter === 'pagar') {
      rows = rows.filter(r => (r._tipo === 'saída' || !(r.movimentacao || '').toLowerCase().includes('entrada')) && r.status !== 'Pago' && r.status !== 'Cancelado');
      rows = consolidateGroupRows(rows, 'saida');
    }

    if (currentMfSortCol) {
      rows.sort((a, b) => {
        let valA = getSortValue(a, currentMfSortCol);
        let valB = getSortValue(b, currentMfSortCol);
        let res = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          res = valA - valB;
        } else if (valA instanceof Date && valB instanceof Date) {
          res = valA.getTime() - valB.getTime();
        } else {
          res = String(valA || '').localeCompare(String(valB || ''), 'pt-BR', { sensitivity: 'base' });
        }
        return currentMfSortDir === 'asc' ? res : -res;
      });
    } else {
      rows.sort((a, b) => {
        const da = parseDate(a.data_pagamento || a.data_vencimento || a.data) || new Date(0);
        const db = parseDate(b.data_pagamento || b.data_vencimento || b.data) || new Date(0);
        return db - da;
      });
    }

    // 2. Determinar título, período e métricas do resumo executivo (1 bloco único)
    let tituloRelatorio = 'Relatório de Movimentações Financeiras';
    if (currentMfKpiFilter === 'receber') tituloRelatorio = 'Relatório de Contas a Receber';
    else if (currentMfKpiFilter === 'pagar') tituloRelatorio = 'Relatório de Contas a Pagar';

    let periodoStr = 'Todo o Histórico';
    if (dateFrom && dateTo) {
      const fBr = dateFrom.split('-').reverse().join('/');
      const tBr = dateTo.split('-').reverse().join('/');
      periodoStr = `${fBr} a ${tBr}`;
    } else if (dateFrom) {
      periodoStr = `A partir de ${dateFrom.split('-').reverse().join('/')}`;
    } else if (dateTo) {
      periodoStr = `Até ${dateTo.split('-').reverse().join('/')}`;
    }

    const dataHoraEmissao = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

    // Métricas para 1 bloco único
    let summaryHtml = '';
    if (currentMfKpiFilter === 'receber') {
      const totalReceber = rows.reduce((s, r) => s + Math.max(0, (parseFloat(r.valor) || 0) - (parseFloat(r.valor_pago) || 0)), 0);
      const pendReceber = rows.filter(r => r.status !== 'Pago');
      const now = new Date(); now.setHours(0,0,0,0);
      const atrasados = pendReceber.filter(r => {
        if (!r.data_vencimento) return false;
        const v = parseDate(r.data_vencimento);
        return v && v < now;
      }).reduce((s, r) => s + Math.max(0, (parseFloat(r.valor) || 0) - (parseFloat(r.valor_pago) || 0)), 0);
      const futuros = totalReceber - atrasados;

      summaryHtml = `
        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-left:5px solid #c41230; border-radius:6px; padding:14px 18px; margin-bottom:22px; display:grid; grid-template-columns:repeat(4,1fr); gap:16px;">
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Quantidade</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#0f172a;">${rows.length} Lançamento(s)</span></div>
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Valor Total a Receber</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#16a34a;">${fmt(totalReceber)}</span></div>
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Recebimentos Atrasados</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#c41230;">${fmt(atrasados)}</span></div>
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Recebimentos Futuros</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#d97706;">${fmt(futuros)}</span></div>
        </div>
      `;
    } else if (currentMfKpiFilter === 'pagar') {
      const totalPagar = rows.reduce((s, r) => s + Math.max(0, (parseFloat(r.valor) || 0) - (parseFloat(r.valor_pago) || 0)), 0);
      const pendPagar = rows.filter(r => r.status !== 'Pago');
      const now = new Date(); now.setHours(0,0,0,0);
      const atrasados = pendPagar.filter(r => {
        if (!r.data_vencimento) return false;
        const v = parseDate(r.data_vencimento);
        return v && v < now;
      }).reduce((s, r) => s + Math.max(0, (parseFloat(r.valor) || 0) - (parseFloat(r.valor_pago) || 0)), 0);
      const futuros = totalPagar - atrasados;

      summaryHtml = `
        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-left:5px solid #c41230; border-radius:6px; padding:14px 18px; margin-bottom:22px; display:grid; grid-template-columns:repeat(4,1fr); gap:16px;">
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Quantidade</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#0f172a;">${rows.length} Lançamento(s)</span></div>
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Valor Total a Pagar</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#c41230;">${fmt(totalPagar)}</span></div>
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Pagamentos Atrasados</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#c41230;">${fmt(atrasados)}</span></div>
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Pagamentos Futuros</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#d97706;">${fmt(futuros)}</span></div>
        </div>
      `;
    } else {
      const totEnt = rows.filter(r => r._tipo === 'entrada').reduce((s, r) => s + getEffectiveValue(r), 0);
      const totSai = rows.filter(r => r._tipo === 'saída').reduce((s, r) => s + getEffectiveValue(r), 0);
      const saldo = totEnt - totSai;

      summaryHtml = `
        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-left:5px solid #c41230; border-radius:6px; padding:14px 18px; margin-bottom:22px; display:grid; grid-template-columns:repeat(4,1fr); gap:16px;">
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Quantidade</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#0f172a;">${rows.length} Lançamento(s)</span></div>
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Total Entradas</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#16a34a;">${fmt(totEnt)}</span></div>
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Total Saídas</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#c41230;">${fmt(totSai)}</span></div>
          <div><span style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase;">Saldo Efetivo</span><br><span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:${saldo >= 0 ? '#16a34a' : '#c41230'};">${fmt(saldo)}</span></div>
        </div>
      `;
    }

    // 3. Obter cabeçalhos exatos visíveis na tela (11 ou 13 colunas)
    const theadEl = document.getElementById('thMovFinanceiras');
    let tableHeadersHtml = '';
    if (theadEl && theadEl.firstElementChild) {
      const ths = Array.from(theadEl.firstElementChild.children);
      tableHeadersHtml = ths.map(th => {
        const cleanText = th.innerText.replace(/[↕▲▼]/g, '').trim();
        const isNum = cleanText.toLowerCase().includes('valor');
        return `<th style="background:#c41230; color:#ffffff; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; padding:9px 8px; text-align:${isNum ? 'right' : 'left'}; border:1px solid #a10e27; font-size:9px;">${cleanText}</th>`;
      }).join('');
    }

    // 4. Renderizar linhas exatas correspondentes com alternância de tons cinza
    const tableRowsHtml = rows.map((r, idx) => {
      const isEnt = r._tipo === 'entrada';
      const movTag = isEnt ? `<span style="color:#16a34a; font-weight:700;">Entrada</span>` : `<span style="color:#c41230; font-weight:700;">Saída</span>`;
      const valColor = isEnt ? '#16a34a' : '#c41230';
      const valSign = isEnt ? '+' : '-';
      const statusBadge = typeof renderStatusBadge === 'function' ? renderStatusBadge(r) : r.status;
      const person = isEnt ? (r.cliente || '—') : (r.fornecedor || '—');
      const bg = idx % 2 === 0 ? '#ffffff' : '#f1f5f9';

      if (currentMfKpiFilter === 'receber') {
        const valTotal = parseFloat(r.valor) || 0;
        const valPago = parseFloat(r.valor_pago) || 0;
        const aReceber = Math.max(0, valTotal - valPago);
        return `<tr style="background:${bg};">
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${movTag}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.categoria || '—'}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1; max-width:130px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.observacoes || '—'}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;"><strong>${r.cliente || r.fornecedor || '—'}</strong></td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${statusBadge}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1; font-family:'JetBrains Mono',monospace; text-align:right;">${fmt(valTotal)}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1; font-family:'JetBrains Mono',monospace; text-align:right; color:#16a34a; font-weight:700;">+ ${fmt(aReceber)}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.parcela_ref || '1/1'}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.data_vencimento || '—'}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.conta_bancaria || '—'}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.forma_pagamento || '—'}</td>
        </tr>`;
      } else if (currentMfKpiFilter === 'pagar') {
        const valTotal = parseFloat(r.valor) || 0;
        const valPago = parseFloat(r.valor_pago) || 0;
        const aPagar = Math.max(0, valTotal - valPago);
        return `<tr style="background:${bg};">
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${movTag}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.categoria || '—'}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1; max-width:130px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.observacoes || '—'}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;"><strong>${r.fornecedor || r.cliente || '—'}</strong></td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${statusBadge}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1; font-family:'JetBrains Mono',monospace; text-align:right;">${fmt(valTotal)}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1; font-family:'JetBrains Mono',monospace; text-align:right; color:#c41230; font-weight:700;">- ${fmt(aPagar)}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.parcela_ref || '1/1'}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.data_vencimento || '—'}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.conta_bancaria || '—'}</td>
          <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.forma_pagamento || '—'}</td>
        </tr>`;
      }

      // Visão Geral de 13 Colunas
      return `<tr style="background:${bg};">
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${movTag}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.categoria || '—'}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1; max-width:130px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.observacoes || '—'}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1; font-family:'JetBrains Mono',monospace; text-align:right; color:${valColor}; font-weight:700;">${valSign} ${fmt(r.valor)}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;"><strong>${person}</strong></td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.conta_bancaria || '—'}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.data_vencimento || '—'}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.data_pagamento || '—'}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.forma_pagamento || '—'}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${statusBadge}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${isEnt ? (r.nota_fiscal || '—') : '—'}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1;">${r.parcela_ref || '1/1'}</td>
        <td style="padding:7px 8px; border-bottom:1px solid #cbd5e1; font-family:'JetBrains Mono',monospace; text-align:right;">${fmt(r.valor_pago || 0)}</td>
      </tr>`;
    }).join('');

    // 5. Montar container HTML do relatório para conversão PDF
    const printContainer = document.createElement('div');
    printContainer.style.fontFamily = "'DM Sans', sans-serif";
    printContainer.style.color = '#0f172a';
    printContainer.style.background = '#ffffff';
    printContainer.style.padding = '24px';
    printContainer.style.width = '100%';
    printContainer.style.boxSizing = 'border-box';

    printContainer.innerHTML = `
      <!-- Cabeçalho -->
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #c41230; padding-bottom:16px; margin-bottom:20px;">
        <div>
          <img src="/LOGOTIPO PRINCIPAL.png" alt="DAC Hospitalar" style="height:44px; width:auto; display:block;">
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px; font-weight:700; color:#0f172a; text-transform:uppercase;">${tituloRelatorio}</div>
          <div style="font-size:10px; color:#64748b; margin-top:3px;">Emissão: <b>${dataHoraEmissao}</b> | Período: <b>${periodoStr}</b></div>
        </div>
      </div>

      <!-- Resumo Executivo em 1 Bloco Único -->
      ${summaryHtml}

      <!-- Tabela -->
      <div style="width:100%; overflow-x:auto; margin-bottom:20px;">
        <table style="width:100%; border-collapse:collapse; font-size:9.5px;">
          <thead>
            <tr>${tableHeadersHtml}</tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>

      <!-- Rodapé -->
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #cbd5e1; padding-top:12px; font-size:9px; color:#64748b;">
        <div>DAC Hospitalar — Gestão Financeira</div>
        <div>Documento gerado automaticamente</div>
      </div>
    `;

    // 6. Gerar PDF usando html2pdf se disponível ou janela de impressão como fallback
    if (typeof html2pdf !== 'undefined') {
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `${tituloRelatorio.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
      };

      html2pdf().set(opt).from(printContainer).save();
    } else {
      const win = window.open('', '_blank');
      win.document.write(`<html><head><title>${tituloRelatorio}</title></head><body>${printContainer.innerHTML}</body></html>`);
      win.document.close();
      win.focus();
      win.print();
    }
  } catch (err) {
    console.error('❌ Erro ao gerar relatório PDF:', err);
    alert('Ocorreu um erro ao emitir o relatório. Por favor, tente novamente.');
  }
}
