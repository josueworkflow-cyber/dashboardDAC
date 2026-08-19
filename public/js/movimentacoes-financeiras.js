/* ═══════════════════════════════════════════════
   movimentacoes-financeiras.js — Unificação ENTRADAS + SAÍDAS
   com KPIs clicáveis, colunas dinâmicas e ordenação interativa por cabeçalho
   ═══════════════════════════════════════════════ */

let currentMfKpiFilter = null;
let currentMfSortCol = null;
let currentMfSortDir = 'asc';

async function initMovimentacoesFinanceiras() {
  const dFrom = document.getElementById('mfDateFrom');
  if (dFrom) dFrom.value = '';
  const dTo = document.getElementById('mfDateTo');
  if (dTo) dTo.value = '';
  const catEl = document.getElementById('mfCategoria');
  if (catEl) catEl.value = '';
  const stEl = document.getElementById('mfStatus');
  if (stEl) stEl.value = '';
  const searchEl = document.getElementById('mfSearch');
  if (searchEl) searchEl.value = '';
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

    if (filterKey === 'receber' || filterKey === 'pagar') {
      const dateFrom = document.getElementById('mfDateFrom');
      const dateTo = document.getElementById('mfDateTo');
      if (dateFrom) dateFrom.value = DacFinancialReport.todayIso(new Date());
      if (dateTo) dateTo.value = '';
    }
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

function getMfFilterState() {
  const typeElement = document.getElementById('mfTipo');
  const categoryElement = document.getElementById('mfCategoria');
  const statusElement = document.getElementById('mfStatus');

  return {
    search: (document.getElementById('mfSearch')?.value || '').trim(),
    type: typeElement?.value || '',
    typeLabel: typeElement?.selectedOptions?.[0]?.textContent?.trim() || '',
    category: categoryElement?.value || '',
    categoryLabel: categoryElement?.selectedOptions?.[0]?.textContent?.trim() || '',
    status: statusElement?.value || '',
    statusLabel: statusElement?.selectedOptions?.[0]?.textContent?.trim() || '',
    dateFrom: document.getElementById('mfDateFrom')?.value || '',
    dateTo: document.getElementById('mfDateTo')?.value || ''
  };
}

function getFilteredMfRows(filters, now) {
  if (typeof DacFinancialReport === 'undefined') {
    throw new Error('Módulo de relatórios financeiros não carregado.');
  }

  return DacFinancialReport.filterRows({
    entradas: Array.isArray(ENT) ? ENT : [],
    saidas: Array.isArray(SAI) ? SAI : [],
    filters: filters || getMfFilterState(),
    kpiFilter: currentMfKpiFilter,
    consolidateAll: false,
    sortColumn: currentMfSortCol,
    sortDirection: currentMfSortDir,
    now: now || new Date()
  });
}

function renderMfStatusBadge(row, referenceDate) {
  const info = DacFinancialReport.getStatusInfo(row, referenceDate);
  if (info.status === 'pago') return '<span class="stag sp">Pago</span>';
  if (info.status === 'cancelado') return '<span class="stag so">Cancelado</span>';
  if (info.isOverdue) {
    const label = info.status === 'parcial' ? 'Parcial Vencido' : 'Vencido';
    return `<span class="stag so" style="display:inline-flex;align-items:center;gap:3px;" title="Vencimento ultrapassado!">⚠️ ${label}</span>`;
  }
  if (info.status === 'parcial') return '<span class="stag sy">Parcial</span>';
  return '<span class="stag sn">Pendente</span>';
}

function getMfVariant(filters) {
  if (currentMfKpiFilter === 'receber') return 'receber';
  if (currentMfKpiFilter === 'pagar') return 'pagar';
  const typeNorm = (filters?.type || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (typeNorm === 'entrada') return 'entradas';
  if (typeNorm === 'saida') return 'saidas';
  return 'geral';
}

function renderMovimentacoesFinanceiras() {
  try {
    // Esta mesma função pura também alimenta o PDF. Assim os filtros, a
    // consolidação e a ordenação são idênticos em qualquer viewport.
    const referenceNow = new Date();
    const filters = getMfFilterState();
    const rows = getFilteredMfRows(filters, referenceNow);
    const variant = getMfVariant(filters);

    const tbody = document.getElementById('tbMovFinanceiras');
    const thead = document.getElementById('thMovFinanceiras');
    if (!tbody) return;

    // Atualizar cabeçalho dinâmico (<thead>) com botões de ordenação
    if (thead) {
      if (variant === 'receber') {
        thead.innerHTML = `<tr>
          <th class="th-sortable ${currentMfSortCol === 'cliente' ? 'active-sort' : ''}" onclick="toggleMfSort('cliente')">Cliente ${getSortIconHtml('cliente')}</th>
          <th class="th-sortable ${currentMfSortCol === 'modo_emissao' ? 'active-sort' : ''}" onclick="toggleMfSort('modo_emissao')">Nota Fiscal ${getSortIconHtml('modo_emissao')}</th>
          <th class="th-sortable ${currentMfSortCol === 'parcelas' ? 'active-sort' : ''}" onclick="toggleMfSort('parcelas')">Parcela ${getSortIconHtml('parcelas')}</th>
          <th class="th-sortable ${currentMfSortCol === 'vencimento' ? 'active-sort' : ''}" onclick="toggleMfSort('vencimento')">Vencimento ${getSortIconHtml('vencimento')}</th>
          <th class="th-sortable ${currentMfSortCol === 'valor' ? 'active-sort' : ''}" onclick="toggleMfSort('valor')">Valor ${getSortIconHtml('valor')}</th>
          <th class="th-sortable ${currentMfSortCol === 'observacoes' ? 'active-sort' : ''}" onclick="toggleMfSort('observacoes')" style="width:24%;">Observações ${getSortIconHtml('observacoes')}</th>
        </tr>`;
      } else if (variant === 'pagar') {
        thead.innerHTML = `<tr>
          <th class="th-sortable ${currentMfSortCol === 'fornecedor' ? 'active-sort' : ''}" onclick="toggleMfSort('fornecedor')">Fornecedor ${getSortIconHtml('fornecedor')}</th>
          <th class="th-sortable ${currentMfSortCol === 'modo_emissao' ? 'active-sort' : ''}" onclick="toggleMfSort('modo_emissao')">Nota Fiscal ${getSortIconHtml('modo_emissao')}</th>
          <th class="th-sortable ${currentMfSortCol === 'parcelas' ? 'active-sort' : ''}" onclick="toggleMfSort('parcelas')">Parcela ${getSortIconHtml('parcelas')}</th>
          <th class="th-sortable ${currentMfSortCol === 'vencimento' ? 'active-sort' : ''}" onclick="toggleMfSort('vencimento')">Vencimento ${getSortIconHtml('vencimento')}</th>
          <th class="th-sortable ${currentMfSortCol === 'valor' ? 'active-sort' : ''}" onclick="toggleMfSort('valor')">Valor ${getSortIconHtml('valor')}</th>
          <th class="th-sortable ${currentMfSortCol === 'observacoes' ? 'active-sort' : ''}" onclick="toggleMfSort('observacoes')" style="width:24%;">Observações ${getSortIconHtml('observacoes')}</th>
        </tr>`;
      } else {
        const personHeader = variant === 'entradas' ? 'Cliente' : (variant === 'saidas' ? 'Fornecedor' : 'Fornecedor/Cliente');
        const personSortKey = variant === 'saidas' ? 'fornecedor' : 'cliente';
        thead.innerHTML = `<tr>
          <th class="th-sortable ${currentMfSortCol === 'tipo' ? 'active-sort' : ''}" onclick="toggleMfSort('tipo')">Tipo ${getSortIconHtml('tipo')}</th>
          <th class="th-sortable ${currentMfSortCol === 'categoria' ? 'active-sort' : ''}" onclick="toggleMfSort('categoria')">Categoria ${getSortIconHtml('categoria')}</th>
          <th class="th-sortable ${currentMfSortCol === personSortKey ? 'active-sort' : ''}" onclick="toggleMfSort('${personSortKey}')">${personHeader} ${getSortIconHtml(personSortKey)}</th>
          <th class="th-sortable ${currentMfSortCol === 'valor' ? 'active-sort' : ''}" onclick="toggleMfSort('valor')">Valor ${getSortIconHtml('valor')}</th>
          <th class="th-sortable ${currentMfSortCol === 'modo_emissao' ? 'active-sort' : ''}" onclick="toggleMfSort('modo_emissao')">NF / Pedido ${getSortIconHtml('modo_emissao')}</th>
          <th class="th-sortable ${currentMfSortCol === 'empresa' ? 'active-sort' : ''}" onclick="toggleMfSort('empresa')">Empresa ${getSortIconHtml('empresa')}</th>
          <th class="th-sortable ${currentMfSortCol === 'data_emissao' ? 'active-sort' : ''}" onclick="toggleMfSort('data_emissao')">Data da Emissão ${getSortIconHtml('data_emissao')}</th>
          <th class="th-sortable ${currentMfSortCol === 'status' ? 'active-sort' : ''}" onclick="toggleMfSort('status')">Status ${getSortIconHtml('status')}</th>
          <th class="th-sortable ${currentMfSortCol === 'vencimento' ? 'active-sort' : ''}" onclick="toggleMfSort('vencimento')">Vencimento ${getSortIconHtml('vencimento')}</th>
          <th class="th-sortable ${currentMfSortCol === 'conta_bancaria' ? 'active-sort' : ''}" onclick="toggleMfSort('conta_bancaria')">Conta Bancária ${getSortIconHtml('conta_bancaria')}</th>
          <th class="th-sortable ${currentMfSortCol === 'valor_pago' ? 'active-sort' : ''}" onclick="toggleMfSort('valor_pago')">Valor Pago ${getSortIconHtml('valor_pago')}</th>
          <th class="th-sortable ${currentMfSortCol === 'parcelas' ? 'active-sort' : ''}" onclick="toggleMfSort('parcelas')">Parcelas ${getSortIconHtml('parcelas')}</th>
          <th class="th-sortable ${currentMfSortCol === 'forma_pagamento' ? 'active-sort' : ''}" onclick="toggleMfSort('forma_pagamento')">Forma de Pagamento ${getSortIconHtml('forma_pagamento')}</th>
          <th class="th-sortable ${currentMfSortCol === 'pagamento' ? 'active-sort' : ''}" onclick="toggleMfSort('pagamento')">Pagamento ${getSortIconHtml('pagamento')}</th>
          <th class="th-sortable ${currentMfSortCol === 'observacoes' ? 'active-sort' : ''}" onclick="toggleMfSort('observacoes')">Observações ${getSortIconHtml('observacoes')}</th>
        </tr>`;
      }
    }

    if (rows.length === 0) {
      tbody.innerHTML = '';
      document.getElementById('mfVazio').style.display = 'block';
      updateMfKpis(referenceNow, 0);
      return;
    }
    document.getElementById('mfVazio').style.display = 'none';

    tbody.innerHTML = rows.map(r => {
      const isEnt = r._tipo === 'entrada';
      const movTag = isEnt ? `<span class="stag sp">Entrada</span>` : `<span class="stag so">Saída</span>`;
      const valColor = isEnt ? '#4ADE80' : 'var(--red)';
      const valSign = isEnt ? '+' : '-';
      const statusBadge = renderMfStatusBadge(r, referenceNow);
      const person = isEnt ? (r.cliente || '—') : (r.fornecedor || '—');
      const docModo = r.modo_emissao || r.nota_fiscal || r.nf || '—';

      if (variant === 'receber') {
        const valTotal = DacFinancialReport.parseMoney(r.valor);
        return `<tr>
          <td style="font-size:11px; font-weight:600;">${r.cliente || r.fornecedor || '—'}</td>
          <td style="font-size:10px;color:var(--accent2);">${docModo}</td>
          <td>${typeof renderParcelaBadge === 'function' ? renderParcelaBadge(r) : (r._parcelLabel || r.parcela_ref || '—')}</td>
          <td style="font-size:11px;">${r.data_vencimento || '—'}</td>
          <td class="mono" style="color:#4ADE80;font-weight:700;">${fmt(valTotal)}</td>
          <td style="font-size:10px;opacity:0.8;width:24%;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.observacoes || ''}">${r.observacoes || '—'}</td>
        </tr>`;
      } else if (variant === 'pagar') {
        const valTotal = DacFinancialReport.parseMoney(r.valor);
        return `<tr>
          <td style="font-size:11px; font-weight:600;">${r.fornecedor || r.cliente || '—'}</td>
          <td style="font-size:10px;color:var(--accent2);">${docModo}</td>
          <td>${typeof renderParcelaBadge === 'function' ? renderParcelaBadge(r) : (r._parcelLabel || r.parcela_ref || '—')}</td>
          <td style="font-size:11px;">${r.data_vencimento || '—'}</td>
          <td class="mono" style="color:var(--red);font-weight:700;">${fmt(valTotal)}</td>
          <td style="font-size:10px;opacity:0.8;width:24%;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.observacoes || ''}">${r.observacoes || '—'}</td>
        </tr>`;
      }

      // Renderização padrão (15 colunas na nova ordem)
      return `<tr>
        <td>${movTag}</td>
        <td><span class="stag cby" style="font-size:10px;">${r.categoria || '—'}</span></td>
        <td style="font-size:11px; font-weight:600;">${person}</td>
        <td class="mono" style="color:${valColor};font-weight:700;">${valSign} ${fmt(r.valor)}</td>
        <td style="font-size:10px;color:var(--accent2);">${docModo}</td>
        <td><span class="stag" style="background:rgba(255,255,255,0.06);color:#E2E8F0;font-size:10px;font-weight:600;">${r.empresa || 'DAC'}</span></td>
        <td style="font-size:11px;color:var(--muted);">${r.data_emissao || '—'}</td>
        <td>${statusBadge}</td>
        <td style="font-size:11px;">${r.data_vencimento || '—'}</td>
        <td style="font-size:11px;color:var(--muted);">${r.conta_bancaria || '—'}</td>
        <td class="mono" style="font-size:11px;">${fmt(r.valor_pago || 0)}</td>
        <td>${typeof renderParcelaBadge === 'function' ? renderParcelaBadge(r) : (r._parcelLabel || r.parcela_ref || '—')}</td>
        <td style="font-size:11px;color:var(--muted);">${r.forma_pagamento || '—'}</td>
        <td style="font-size:11px;">${r.data_pagamento || '—'}</td>
        <td style="font-size:10px;opacity:0.8;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.observacoes || ''}">${r.observacoes || '—'}</td>
      </tr>`;
    }).join('');

    // Atualizar KPIs com a quantidade de lançamentos renderizados
    updateMfKpis(referenceNow, rows.length);

  } catch (err) {
    console.error('❌ Erro ao renderizar Movimentações Financeiras:', err);
  }
}

function updateMfKpis(referenceDate, renderedCount) {
  const kpiWrap = document.getElementById('mfKpis');
  if (!kpiWrap) return;

  // Os cards respeitam os filtros da página, mas ignoram somente o KPI clicado.
  // Isso mantém os totais dos cards alinhados ao conteúdo exibido e ao PDF.
  const referenceNow = referenceDate instanceof Date ? referenceDate : new Date();
  const baseReportOptions = {
    entradas: Array.isArray(ENT) ? ENT : [],
    saidas: Array.isArray(SAI) ? SAI : [],
    filters: getMfFilterState(),
    consolidateAll: false,
    sortColumn: '',
    sortDirection: 'desc',
    now: referenceNow
  };
  const allRows = DacFinancialReport.filterRows({ ...baseReportOptions, kpiFilter: null });
  const pendReceber = DacFinancialReport.filterRows({ ...baseReportOptions, kpiFilter: 'receber' });
  const pendPagar = DacFinancialReport.filterRows({ ...baseReportOptions, kpiFilter: 'pagar' });

  const totalEnt = allRows.filter(r => r._tipo === 'entrada').reduce((acc, r) => acc + DacFinancialReport.getEffectiveValue(r), 0);
  const totalSai = allRows.filter(r => r._tipo === 'saída').reduce((acc, r) => acc + DacFinancialReport.getEffectiveValue(r), 0);
  const saldo = totalEnt - totalSai;

  const totalReceber = pendReceber.reduce((s, r) => s + DacFinancialReport.getRemainingValue(r), 0);
  const receberSub = pendReceber.length > 0 
    ? `● ${pendReceber.length} pendente${pendReceber.length > 1 ? 's' : ''}` 
    : '✓ Nenhum pendente';
  const receberSubClass = pendReceber.length === 0 ? 'sub-g' : 'sub-y';

  const totalPagar = pendPagar.reduce((s, r) => s + DacFinancialReport.getRemainingValue(r), 0);
  
  let pagarSub = '✓ Tudo em dia';
  let pagarSubClass = 'sub-g';
  if (pendPagar.length > 0) {
    const referenceIso = DacFinancialReport.todayIso(referenceNow);
    const vencidas = pendPagar.filter(r => DacFinancialReport.getStatusInfo(r, referenceIso).isOverdue).length;
    const venceHoje = pendPagar.filter(r => DacFinancialReport.dateToIso(r.data_vencimento) === referenceIso).length;

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

  const count = typeof renderedCount === 'number' ? renderedCount : allRows.length;
  const countSub = count === 1 ? '1 registro' : `${count} registros`;

  const actRec = currentMfKpiFilter === 'receber' ? 'active-kpi' : '';
  const actPag = currentMfKpiFilter === 'pagar' ? 'active-kpi' : '';

  kpiWrap.innerHTML = `
    <div class="gbadge">
      <span class="gbadge-label">LANÇAMENTOS</span>
      <span class="gbadge-val" style="color:var(--text-bright);">${count}</span>
      <span class="gbadge-sub" style="color:var(--muted);font-weight:500;">${countSub}</span>
    </div>
    <div class="gbadge">
      <span class="gbadge-label">ENTRADAS EFETIVAS</span>
      <span class="gbadge-val tg">${fmt(totalEnt)}</span>
    </div>
    <div class="gbadge">
      <span class="gbadge-label">SAÍDAS EFETIVAS</span>
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

// ─── Helper: Carregar a Logo Oficial como Base64 Data URI ───
let cachedLogoBase64;
let logoBase64Promise;

async function getLogoBase64() {
  if (cachedLogoBase64 !== undefined) return cachedLogoBase64;
  if (logoBase64Promise) return logoBase64Promise;

  logoBase64Promise = (async () => {
    try {
      const res = await fetch('/LOGOTIPO PRINCIPAL.png');
      if (!res.ok) throw new Error(`Logo indisponível (${res.status})`);
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      cachedLogoBase64 = dataUrl;
      return dataUrl;
    } catch (error) {
      // Não memoriza uma falha transitória; uma próxima emissão pode tentar novamente.
      return null;
    } finally {
      logoBase64Promise = null;
    }
  })();

  return logoBase64Promise;
}

// Antecipar a leitura evita perder a ativação de compartilhamento no primeiro toque mobile.
void getLogoBase64();

// ─── Entrega do mesmo Blob no desktop e no mobile ───

function shouldUseNativePdfShare() {
  const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const mobileUserAgent = Boolean(
    navigator.userAgentData?.mobile
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
  );
  return coarsePointer || mobileUserAgent;
}

function downloadPdfBlob(blob, filename) {
  if (!blob || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Este navegador não oferece suporte ao download do PDF.');
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

async function deliverFinancialReportPdf(pdfResult) {
  const canCreateFile = typeof File === 'function';
  const pdfFile = canCreateFile
    ? new File([pdfResult.blob], pdfResult.filename, { type: 'application/pdf' })
    : null;

  if (
    shouldUseNativePdfShare()
    && pdfFile
    && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
  ) {
    let canShareFile = false;
    try {
      canShareFile = navigator.canShare({ files: [pdfFile] });
    } catch (error) {
      canShareFile = false;
    }

    if (canShareFile) {
      try {
        await navigator.share({
          title: pdfResult.model.title,
          files: [pdfFile]
        });
        return 'shared';
      } catch (error) {
        if (error && error.name === 'AbortError') {
          return 'cancelled';
        }
        console.warn('Compartilhamento indisponível; usando download do PDF.', error);
      }
    }
  }

  downloadPdfBlob(pdfResult.blob, pdfResult.filename);
  return 'downloaded';
}

// ─── Emissão vetorial do relatório financeiro ───

async function gerarRelatorioPDF(clickEvent) {
  const btn = clickEvent?.currentTarget || null;
  const originalBtnHtml = btn ? btn.innerHTML : '';

  try {
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '⏳ Gerando PDF...';
      btn.style.opacity = '0.7';
    }

    if (typeof DacFinancialReport === 'undefined') {
      throw new Error('Módulo de relatórios financeiros não carregado.');
    }

    const now = new Date();
    const filters = getMfFilterState();
    const model = DacFinancialReport.createModel({
      entradas: Array.isArray(ENT) ? ENT : [],
      saidas: Array.isArray(SAI) ? SAI : [],
      filters,
      kpiFilter: currentMfKpiFilter,
      consolidateAll: false,
      sortColumn: currentMfSortCol,
      sortDirection: currentMfSortDir,
      now
    });

    const logoDataUrl = cachedLogoBase64 !== undefined
      ? cachedLogoBase64
      : await getLogoBase64();
    const pdfResult = DacFinancialReport.generatePdf(model, { logoDataUrl });
    await deliverFinancialReportPdf(pdfResult);
  } catch (error) {
    console.error('❌ Erro ao gerar relatório PDF:', error);
    const message = error && error.message
      ? error.message
      : 'Ocorreu um erro ao emitir o relatório. Tente novamente.';
    alert(message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.innerHTML = originalBtnHtml;
      btn.style.opacity = '1';
    }
  }
}
