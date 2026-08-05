/* ═══════════════════════════════════════════════
   movimentacoes-financeiras.js — Unificação ENTRADAS + SAÍDAS
   com KPIs clicáveis e colunas dinâmicas
   ═══════════════════════════════════════════════ */

let currentMfKpiFilter = null;

async function initMovimentacoesFinanceiras() {
  document.getElementById('mfDateFrom').value = '';
  document.getElementById('mfDateTo').value = '';
  currentMfKpiFilter = null;
  renderMovimentacoesFinanceiras();
}

function toggleMfKpiFilter(filterKey) {
  if (currentMfKpiFilter === filterKey) {
    currentMfKpiFilter = null;
  } else {
    currentMfKpiFilter = filterKey;
  }
  renderMovimentacoesFinanceiras();
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
    } else if (currentMfKpiFilter === 'pagar') {
      rows = rows.filter(r => (r._tipo === 'saída' || !(r.movimentacao || '').toLowerCase().includes('entrada')) && r.status !== 'Pago' && r.status !== 'Cancelado');
    } else if (currentMfKpiFilter === 'entradas') {
      rows = rows.filter(r => r._tipo === 'entrada' || (r.movimentacao || '').toLowerCase().includes('entrada'));
    } else if (currentMfKpiFilter === 'saidas') {
      rows = rows.filter(r => r._tipo === 'saída' || !(r.movimentacao || '').toLowerCase().includes('entrada'));
    }

    const tbody = document.getElementById('tbMovFinanceiras');
    const thead = document.getElementById('thMovFinanceiras');
    if (!tbody) return;

    // Ordenar por data (mais recente primeiro)
    rows.sort((a, b) => {
      const da = parseDate(a.data_pagamento || a.data_vencimento || a.data) || new Date(0);
      const db = parseDate(b.data_pagamento || b.data_vencimento || b.data) || new Date(0);
      return db - da;
    });

    // Atualizar cabeçalho dinâmico (<thead>)
    if (thead) {
      if (currentMfKpiFilter === 'receber') {
        thead.innerHTML = `<tr>
          <th>Tipo</th>
          <th>Categoria</th>
          <th>Observações</th>
          <th>Cliente</th>
          <th>Status</th>
          <th>Valor Total</th>
          <th>Valor a Receber</th>
          <th>Parcelas</th>
          <th>Vencimento</th>
          <th>Conta Bancária</th>
          <th>Forma Pgto</th>
        </tr>`;
      } else if (currentMfKpiFilter === 'pagar') {
        thead.innerHTML = `<tr>
          <th>Tipo</th>
          <th>Categoria</th>
          <th>Observações</th>
          <th>Fornecedor</th>
          <th>Status</th>
          <th>Valor Total</th>
          <th>Valor a Pagar</th>
          <th>Parcelas</th>
          <th>Vencimento</th>
          <th>Conta Bancária</th>
          <th>Forma Pgto</th>
        </tr>`;
      } else {
        thead.innerHTML = `<tr>
          <th>Tipo</th>
          <th>Categoria</th>
          <th>Observações</th>
          <th>Valor</th>
          <th>Fornecedor/Cliente</th>
          <th>Conta Bancária</th>
          <th>Vencimento</th>
          <th>Pagamento</th>
          <th>Forma</th>
          <th>Status</th>
          <th>Modo de Emissão</th>
          <th>Parcelas</th>
          <th>Valor Pago</th>
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
      const stClass = r.status === 'Pago' ? 'sp' : r.status === 'Cancelado' ? 'so' : r.status === 'Parcial' ? 'sy' : 'sn';
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
          <td><span class="stag ${stClass}">${r.status || 'Pendente'}</span></td>
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
          <td><span class="stag ${stClass}">${r.status || 'Pendente'}</span></td>
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
        <td><span class="stag ${stClass}">${r.status || 'Pendente'}</span></td>
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

  const actEnt = currentMfKpiFilter === 'entradas' ? 'active-kpi' : '';
  const actSai = currentMfKpiFilter === 'saidas' ? 'active-kpi' : '';
  const actSaldo = currentMfKpiFilter === 'saldo' ? 'active-kpi' : '';
  const actRec = currentMfKpiFilter === 'receber' ? 'active-kpi' : '';
  const actPag = currentMfKpiFilter === 'pagar' ? 'active-kpi' : '';

  kpiWrap.innerHTML = `
    <div class="gbadge kpi-clickable ${actEnt}" onclick="toggleMfKpiFilter('entradas')" title="Filtrar Entradas">
      <span class="gbadge-label">ENTRADAS</span>
      <span class="gbadge-val tg">${fmt(totalEnt)}</span>
    </div>
    <div class="gbadge kpi-clickable ${actSai}" onclick="toggleMfKpiFilter('saidas')" title="Filtrar Saídas">
      <span class="gbadge-label">SAÍDAS</span>
      <span class="gbadge-val tr">${fmt(totalSai)}</span>
    </div>
    <div class="gbadge kpi-clickable ${actSaldo}" onclick="toggleMfKpiFilter('saldo')" title="Ver Todos">
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
