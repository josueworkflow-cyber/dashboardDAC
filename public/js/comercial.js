/* ═══════════════════════════════════════════════
   comercial.js — Funil Unificado de Pedidos (7 etapas)
   Kanban Board, Drag-and-Drop, Drawer, Footer KPIs
   Compartilhado entre Comercial e Estoque
   ═══════════════════════════════════════════════ */

// ─── Estado ───

let COMERCIAL = [];
let comercialFilter = { vendedor: '', dateFrom: '', dateTo: '' };
let draggingCardId = null;

const COMERCIAL_STATUSES = [
  { key: 'cotacao',    label: 'Orçamento',      value: 'Cotação / Orçamento',   color: '#C41230' },
  { key: 'pedido',     label: 'Pedido',         value: 'Pedido',                color: '#E8533F' },
  { key: 'aprovado',   label: 'Aprovado',       value: 'Aprovado',              color: '#D4A017' },
  { key: 'separacao',  label: 'Separação',      value: 'Estoque / Separação',   color: '#3D8EF0' },
  { key: 'expedido',   label: 'Expedição',      value: 'Expedição / Separado',  color: '#8B5CF6' },
  { key: 'rota',       label: 'Rota',           value: 'Rota de Entrega',       color: '#F59E0B' },
  { key: 'finalizado', label: 'Finalizado',     value: 'Finalizado',            color: '#10B981' }
];

// ─── Badge helpers ───

function getModoBadge(modo) {
  const m = (modo || '').trim().toLowerCase();
  if (m.includes('nota fiscal') || m.includes('nota')) return { label: 'NF', cls: 'badge-nf' };
  if (m.includes('pd')) return { label: 'PD', cls: 'badge-nf' };
  if (m.includes('empr')) return { label: 'EMP', cls: 'badge-nf' };
  return { label: 'NF', cls: 'badge-nf' };
}

// ─── Inicialização ───

function initComercial() {
  // Default: últimos 7 dias
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);

  const fromInput = document.getElementById('comercialDateFrom');
  const toInput = document.getElementById('comercialDateTo');
  if (fromInput && !fromInput.value) fromInput.value = toIso(sevenDaysAgo);
  if (toInput && !toInput.value) toInput.value = toIso(today);

  comercialFilter.dateFrom = fromInput?.value || '';
  comercialFilter.dateTo = toInput?.value || '';

  renderKanban();
  renderFooterKpis();
}

// ─── Kanban Board ───

function getVisibleStatuses() {
  const role = sessionStorage.getItem('dac_role') || 'gestor';
  if (role === 'estoque') {
    return COMERCIAL_STATUSES.filter(s => ['aprovado', 'separacao', 'expedido', 'rota'].includes(s.key));
  }
  return COMERCIAL_STATUSES.filter(s => s.key !== 'finalizado'); // gestor e comercial nao veem a coluna Finalizado
}

function canDrop(role, statusKey) {
  if (role === 'estoque') {
    return ['aprovado', 'separacao', 'expedido', 'rota', 'finalizado'].includes(statusKey);
  }
  return true; // gestor e comercial podem arrastar para qualquer lugar
}

function renderKanban() {
  const container = document.getElementById('kanban-board');
  if (!container) return;

  const filtered = getFilteredComercial();
  const visibleStatuses = getVisibleStatuses();
  const role = sessionStorage.getItem('dac_role') || 'gestor';
  populateVendedorFilter();

  container.innerHTML = visibleStatuses.map(status => {
    const items = filtered.filter(o => o.status === status.value);
    const droppable = canDrop(role, status.key);
    const showAdd = (role !== 'estoque') && ['cotacao', 'pedido'].includes(status.key);

    return `
      <div class="kanban-column">
        <div class="kanban-col-header">
          <div class="kanban-col-header-left">
            <span class="kanban-col-title">${status.label}</span>
            <span class="kanban-col-count">${items.length}</span>
          </div>
          ${showAdd ? `<button class="kanban-col-add" onclick="openDrawerWithStatus('${status.value}')" title="Adicionar">＋</button>` : ''}
        </div>
        <div class="kanban-col-body"
             data-status="${status.value}"
             ${droppable ? `ondragover="handleDragOver(event)"
             ondragleave="handleDragLeave(event)"
             ondrop="handleDrop(event, '${status.value}')"` : ''}>
          ${items.length === 0
            ? '<div class="kanban-empty">Nenhum pedido</div>'
            : items.map(o => renderCard(o, status)).join('')
          }
        </div>
      </div>`;
  }).join('');
}

function renderCard(orc, status) {
  const badge = getModoBadge(orc.modo_emissao);
  const role = sessionStorage.getItem('dac_role') || 'gestor';
  const draggable = canDrop(role, status.key);

  // Número do card: Orçamento mostra ORC, demais mostram NF/Pedido
  const isCotacao = orc.status === 'Cotação / Orçamento';
  const cardNum = isCotacao
    ? `#${orc.ref_orcamento || '—'}`
    : (orc.nota_fiscal || orc.ref_orcamento || '—');

  // Aviso para modo de emissão não preenchido (a partir de Pedido)
  const warningHtml = (orc.status !== 'Cotação / Orçamento' && !orc.modo_emissao)
    ? '<div class="kcard-warning">⚠ Preencher Modo de Emissão</div>'
    : '';

  // Botão mover status (mobile-friendly)
  const visibleStatuses = getVisibleStatuses();
  const otherStatuses = visibleStatuses.filter(s => s.value !== orc.status && canDrop(role, s.key));
  const moveBtn = (otherStatuses.length > 0 && draggable)
    ? `<button class="kcard-move-btn" onclick="event.stopPropagation(); showMoveMenu(event, '${orc.id}')" title="Mover pedido">▶</button>`
    : '';

  return `
    <div class="kanban-card"
         ${draggable ? 'draggable="true"' : ''}
         data-id="${orc.id}"
         ${draggable ? `ondragstart="handleDragStart(event, '${orc.id}')"
         ondragend="handleDragEnd(event)"` : ''}
         onclick="openDrawer('editar', ${orc.id})">
      <div class="kcard-top">
        <span class="kcard-badge ${badge.cls}">${badge.label}</span>
        <span class="kcard-number">${cardNum}</span>
        ${moveBtn}
      </div>
      <div class="kcard-client">${orc.fornecedor || 'Cliente não informado'}</div>
      <div class="kcard-info">
        <span class="kcard-value">${fmt(orc.valor)}</span>
      </div>
      <div class="kcard-vendor">👤 ${orc.vendedor || '—'}</div>
      ${warningHtml}
      <div class="kcard-bottom">
        <span class="kcard-date">📅 ${orc.data || '—'}</span>
      </div>
    </div>`;
}

// Menu popup para mover card (mobile touch)
function showMoveMenu(event, id) {
  event.stopPropagation();
  // Remove menu anterior se existir
  const old = document.getElementById('move-menu-popup');
  if (old) old.remove();

  const role = sessionStorage.getItem('dac_role') || 'gestor';
  const orc = COMERCIAL.find(o => o.id == id);
  if (!orc) return;

  const visibleStatuses = getVisibleStatuses();
  const options = visibleStatuses.filter(s => s.value !== orc.status && canDrop(role, s.key));

  const menu = document.createElement('div');
  menu.id = 'move-menu-popup';
  menu.className = 'move-menu-popup';
  menu.innerHTML = `
    <div class="move-menu-title">Mover para:</div>
    ${options.map(s => `
      <button class="move-menu-option" onclick="event.stopPropagation(); doMoveCard('${id}', '${s.value}')">
        <span class="move-menu-dot" style="background:${s.color}"></span>
        ${s.label}
      </button>
    `).join('')}
  `;

  document.body.appendChild(menu);

  // Posicionar perto do botão
  const rect = event.target.getBoundingClientRect();
  menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';

  // Fechar ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', closeMoveMenu, { once: true });
  }, 10);
}

function closeMoveMenu() {
  const m = document.getElementById('move-menu-popup');
  if (m) m.remove();
}

async function doMoveCard(id, newStatus) {
  closeMoveMenu();
  await updateOrcamentoStatus(id, newStatus);
}

// ─── Footer KPIs ───

function renderFooterKpis() {
  const container = document.getElementById('comercial-footer-kpis');
  if (!container) return;

  const role = sessionStorage.getItem('dac_role') || 'gestor';
  const all = COMERCIAL;
  const filtered = getFilteredComercial();
  const emSeparacao = all.filter(o => o.status === 'Estoque / Separação').length;
  const expedidos = all.filter(o => o.status === 'Expedição / Separado').length;
  const emRota = all.filter(o => o.status === 'Rota de Entrega').length;

  let kpis;
  if (role === 'estoque') {
    kpis = [
      { icon: '📦', label: 'Em Separação', value: String(emSeparacao) },
      { icon: '🚛', label: 'Em Expedição', value: String(expedidos) },
      { icon: '🗺️', label: 'Em Rota', value: String(emRota) }
    ];
  } else {
    const total = filtered.length;
    const cotacao = all.filter(o => o.status === 'Cotação / Orçamento');
    const valorCotacao = cotacao.reduce((s, o) => s + (parseFloat(o.valor) || 0), 0);
    kpis = [
      { icon: '🚚', label: 'Total de Pedidos', value: String(total) },
      { icon: '💰', label: 'Valor em Cotação', value: fmt(valorCotacao) },
      { icon: '📦', label: 'Em Separação', value: String(emSeparacao) },
      { icon: '🚛', label: 'Em Expedição', value: String(expedidos) }
    ];
  }

  container.innerHTML = kpis.map(k => `
    <div class="footer-kpi">
      <span class="footer-kpi-icon">${k.icon}</span>
      <div class="footer-kpi-data">
        <span class="footer-kpi-label">${k.label}</span>
        <span class="footer-kpi-value">${k.value}</span>
      </div>
    </div>
  `).join('');
}

// ─── Drag and Drop ───

function handleDragStart(e, id) {
  draggingCardId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  setTimeout(() => {
    const card = document.querySelector(`.kanban-card[data-id="${id}"]`);
    if (card) card.classList.add('dragging');
  }, 0);
}

function handleDragEnd(e) {
  document.querySelectorAll('.kanban-card.dragging').forEach(c => c.classList.remove('dragging'));
  document.querySelectorAll('.kanban-col-body.drag-over').forEach(c => c.classList.remove('drag-over'));
  draggingCardId = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e, newStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const id = e.dataTransfer.getData('text/plain') || draggingCardId;
  if (!id) return;

  const orc = COMERCIAL.find(o => String(o.id) === String(id));
  if (!orc || orc.status === newStatus) return;

  await updateOrcamentoStatus(orc.id, newStatus);
}

// ─── API: Status update ───

async function updateOrcamentoStatus(id, status) {
  try {
    const r = await authFetch(`${API}/comercial/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    const data = await r.json();
    if (r.ok && data.success) {
      showComercialToast(`✓ ${data.message}`, 'ok');
      await loadData();
    } else {
      showComercialToast('❌ ' + (data.error || 'Erro ao atualizar status.'), 'err');
    }
  } catch (e) {
    showComercialToast('❌ Erro de conexão.', 'err');
  }
}

// ─── Drawer: Abrir/Fechar ───

function openDrawer(mode, id) {
  const overlay = document.getElementById('drawer-overlay');
  const panel = document.getElementById('drawer-panel');
  const title = document.getElementById('drawer-title');
  const deleteBtn = document.getElementById('drawer-delete');
  const submitBtn = document.getElementById('drawer-submit');
  const statusField = document.getElementById('df-status-wrap');
  const role = sessionStorage.getItem('dac_role') || 'gestor';

  // Reset form
  document.getElementById('df-cliente').value = '';
  document.getElementById('df-valor').value = '';
  document.getElementById('df-data').value = toIso(new Date());
  document.getElementById('df-pagamento').value = '';
  document.getElementById('df-forma').value = '';
  document.getElementById('df-parcela').value = '';
  document.getElementById('df-modo').selectedIndex = 0;
  document.getElementById('df-vendedor').value = '';
  document.getElementById('df-observacao').value = '';
  document.getElementById('df-data-vencimento').value = '';
  document.getElementById('df-nf').value = '';
  document.getElementById('df-empresa').value = '';
  document.getElementById('df-status').value = 'Cotação / Orçamento';
  document.getElementById('df-id').value = '';
  document.getElementById('df-orcamento').value = '';

  // Reset required highlights
  document.querySelectorAll('.drawer-body .gfield').forEach(f => f.classList.remove('field-required'));

  if (mode === 'editar' && id) {
    const orc = COMERCIAL.find(o => String(o.id) === String(id));
    if (!orc) return;

    title.textContent = `EDITAR ${orc.ref_orcamento || ''}`;
    deleteBtn.style.display = 'inline-flex';
    submitBtn.textContent = 'Salvar Alterações';
    statusField.style.display = 'block';

    document.getElementById('df-id').value = orc.id;
    document.getElementById('df-cliente').value = orc.fornecedor || '';
    document.getElementById('df-valor').value = orc.valor || '';
    document.getElementById('df-data').value = parseBrToIso(orc.data) || toIso(new Date());
    document.getElementById('df-pagamento').value = orc.pagamento || '';
    document.getElementById('df-forma').value = orc.forma_pagamento || '';
    document.getElementById('df-parcela').value = orc.parcelas || '';
    document.getElementById('df-vendedor').value = orc.vendedor || '';
    document.getElementById('df-observacao').value = orc.observacao || '';
    document.getElementById('df-data-vencimento').value = parseBrToIso(orc.data_vencimento) || '';
    document.getElementById('df-nf').value = orc.nota_fiscal || '';
    document.getElementById('df-empresa').value = orc.empresa || '';
    document.getElementById('df-status').value = orc.status || 'Cotação / Orçamento';
    document.getElementById('df-orcamento').value = orc.ref_orcamento || '';

    const modoSelect = document.getElementById('df-modo');
    const modoVal = (orc.modo_emissao || '').trim();
    const modoOpts = Array.from(modoSelect.options).map(o => o.value);
    if (modoOpts.includes(modoVal)) {
      modoSelect.value = modoVal;
    } else {
      modoSelect.selectedIndex = 0;
    }

    // Apply status-based field visibility
    applyStatusFields(orc.status);

    // Apply modo_emissao field visibility
    onModoEmissaoChange();

    // Highlight required fields for estoque stages
    const estoqueStages = ['Estoque / Separação', 'Expedição / Separado', 'Rota de Entrega', 'Finalizado'];
    if (estoqueStages.includes(orc.status)) {
      if (!orc.nota_fiscal) {
        const nfField = document.getElementById('df-nf')?.closest('.gfield');
        if (nfField) nfField.classList.add('field-required');
      }
      if (!orc.empresa) {
        const empField = document.getElementById('df-empresa')?.closest('.gfield');
        if (empField) empField.classList.add('field-required');
      }
    }

  } else {
    title.textContent = 'NOVO PEDIDO';
    deleteBtn.style.display = 'none';
    submitBtn.textContent = 'Criar Pedido';
    statusField.style.display = 'none';

    // Novo: sempre em Cotação — esconder modo_emissao, NF, empresa; mostrar ref_orcamento
    applyStatusFields('Cotação / Orçamento');
  }

  overlay.classList.add('open');
  panel.classList.add('open');
  setTimeout(() => document.getElementById('df-cliente').focus(), 300);
}

function applyStatusFields(status) {
  const modoWrap = document.getElementById('df-modo-wrap');
  const nfWrap = document.getElementById('df-nf-wrap');
  const empWrap = document.getElementById('df-empresa-wrap');
  const orcWrap = document.getElementById('df-orcamento-wrap');

  // Nº Orçamento sempre visivel
  if (orcWrap) orcWrap.style.display = 'block';

  if (status === 'Cotação / Orçamento') {
    if (modoWrap) modoWrap.style.display = 'none';
    if (nfWrap) nfWrap.style.display = 'none';
    if (empWrap) empWrap.style.display = 'none';
  } else {
    if (modoWrap) modoWrap.style.display = 'block';
    onModoEmissaoChange();
  }
}

function onModoEmissaoChange() {
  const modo = document.getElementById('df-modo')?.value || '';
  const nfWrap = document.getElementById('df-nf-wrap');
  const nfLabel = document.getElementById('df-nf-label');
  const nfInput = document.getElementById('df-nf');
  const empWrap = document.getElementById('df-empresa-wrap');
  const status = document.getElementById('df-status')?.value || '';

  // Só aplica se status NÃO for Cotação / Orçamento
  if (status === 'Cotação / Orçamento') return;

  if (modo === 'Por PD') {
    if (nfLabel) nfLabel.textContent = 'Número do Pedido';
    if (nfInput) nfInput.placeholder = 'Nº do pedido';
    if (nfWrap) nfWrap.style.display = 'block';
    if (empWrap) empWrap.style.display = 'none';
  } else {
    if (nfLabel) nfLabel.textContent = 'Nota Fiscal';
    if (nfInput) nfInput.placeholder = 'Nº da nota fiscal';
    if (nfWrap) nfWrap.style.display = 'block';
    if (empWrap) empWrap.style.display = 'block';
  }
}

function openDrawerWithStatus(status) {
  openDrawer('novo');
  document.getElementById('df-status').value = status;
  applyStatusFields(status);
}

function onStatusChange() {
  const status = document.getElementById('df-status')?.value || '';
  applyStatusFields(status);
}

function closeDrawer() {
  document.getElementById('drawer-overlay').classList.remove('open');
  document.getElementById('drawer-panel').classList.remove('open');
}

// ─── Drawer: Submit ───

async function submitOrcamento() {
  const id = document.getElementById('df-id').value;
  const cliente = document.getElementById('df-cliente').value.trim();
  const valorRaw = document.getElementById('df-valor').value;
  const dataIso = document.getElementById('df-data').value;
  const pagamento = document.getElementById('df-pagamento').value;
  const forma = document.getElementById('df-forma').value;
  const parcela = document.getElementById('df-parcela').value;
  const modo = document.getElementById('df-modo').value;
  const vendedor = document.getElementById('df-vendedor').value.trim();
  const observacao = document.getElementById('df-observacao').value.trim();
  const dataVencIso = document.getElementById('df-data-vencimento').value;
  const nf = document.getElementById('df-nf').value.trim();
  const empresa = document.getElementById('df-empresa').value;
  const status = document.getElementById('df-status').value;
  const orcamento = document.getElementById('df-orcamento').value.trim();

  if (!cliente || !valorRaw) {
    showComercialToast('Preencha os campos obrigatórios: Cliente e Valor.', 'err');
    return;
  }

  const valor = parseVal(valorRaw);
  if (valor <= 0) {
    showComercialToast('O valor deve ser um número positivo.', 'err');
    return;
  }

  function isoToBr(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  const body = {
    cliente, valor,
    fornecedor: cliente,
    data: isoToBr(dataIso),
    pagamento, forma_pagamento: forma,
    parcela, parcelas: parcela,
    modo_emissao: modo,
    vendedor, observacao, status,
    nota_fiscal: nf,
    empresa: empresa,
    data_vencimento: isoToBr(dataVencIso),
    movimentacao: 'Saída',
    ref_orcamento: orcamento
  };

  const btn = document.getElementById('drawer-submit');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const isEdit = !!id;
    const url = isEdit ? `${API}/comercial/${id}` : `${API}/comercial`;
    const method = isEdit ? 'PUT' : 'POST';

    const r = await authFetch(url, { method, body: JSON.stringify(body) });
    const data = await r.json();

    if (r.ok && data.success) {
      showComercialToast(`✓ ${data.message}`, 'ok');
      closeDrawer();
      await loadData();
    } else {
      showComercialToast('❌ ' + (data.error || 'Erro ao salvar.'), 'err');
    }
  } catch (e) {
    showComercialToast('❌ Erro de conexão.', 'err');
  }

  btn.disabled = false;
  btn.textContent = id ? 'Salvar Alterações' : 'Criar Pedido';
}

// ─── Drawer: Delete ───

async function deleteOrcamento() {
  const id = document.getElementById('df-id').value;
  if (!id) return;

  try {
    const r = await authFetch(`${API}/comercial/${id}`, { method: 'DELETE' });
    const data = await r.json();
    if (r.ok && data.success) {
      showComercialToast(`✓ ${data.message}`, 'ok');
      closeDrawer();
      await loadData();
    } else {
      showComercialToast('❌ ' + (data.error || 'Erro ao excluir.'), 'err');
    }
  } catch (e) {
    showComercialToast('❌ Erro de conexão.', 'err');
  }
}

// ─── Filtros ───

function getFilteredComercial() {
  let rows = [...COMERCIAL];

  if (comercialFilter.vendedor) {
    rows = rows.filter(o => o.vendedor === comercialFilter.vendedor);
  }

  // Filtro de data
  if (comercialFilter.dateFrom || comercialFilter.dateTo) {
    rows = rows.filter(o => {
      const d = parseDate(o.data);
      if (!d) return false;
      if (comercialFilter.dateFrom) {
        const from = new Date(comercialFilter.dateFrom + 'T00:00:00');
        if (d < from) return false;
      }
      if (comercialFilter.dateTo) {
        const to = new Date(comercialFilter.dateTo + 'T23:59:59');
        if (d > to) return false;
      }
      return true;
    });
  }

  return rows;
}

function filterComercial() {
  comercialFilter.vendedor = document.getElementById('comercialVendedor')?.value || '';
  comercialFilter.dateFrom = document.getElementById('comercialDateFrom')?.value || '';
  comercialFilter.dateTo = document.getElementById('comercialDateTo')?.value || '';
  renderKanban();
  renderFooterKpis();
}

function populateVendedorFilter() {
  const sel = document.getElementById('comercialVendedor');
  if (!sel) return;
  const current = sel.value;
  const vendedores = [...new Set(COMERCIAL.map(o => o.vendedor).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todos Vendedores</option>' +
    vendedores.map(v => `<option value="${v}">${v}</option>`).join('');
  sel.value = current;
}

// ─── Histórico de Pedidos ───

function initHistoricoPedidos() {
  // Default: últimos 7 dias
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);

  const fromInput = document.getElementById('historicoDateFrom');
  const toInput = document.getElementById('historicoDateTo');
  if (fromInput && !fromInput.value) fromInput.value = toIso(sevenDaysAgo);
  if (toInput && !toInput.value) toInput.value = toIso(today);

  renderHistoricoTable();
  renderHistoricoKpis();
}

function renderHistoricoKpis() {
  const container = document.getElementById('historico-kpis');
  if (!container) return;

  const all = COMERCIAL;
  const total = all.length;
  const cotacao = all.filter(o => o.status === 'Cotação / Orçamento').length;
  const aprovados = all.filter(o => o.status === 'Aprovado').length;
  const finalizados = all.filter(o => o.status === 'Finalizado').length;
  const valorTotal = all.reduce((s, o) => s + (parseFloat(o.valor) || 0), 0);

  container.innerHTML = `
    <div class="gbadge"><span class="gbadge-label">Total de Pedidos</span><span class="gbadge-val">${total}</span></div>
    <div class="gbadge"><span class="gbadge-label">Em Cotação</span><span class="gbadge-val">${cotacao}</span></div>
    <div class="gbadge"><span class="gbadge-label">Aprovados</span><span class="gbadge-val tg">${aprovados}</span></div>
    <div class="gbadge"><span class="gbadge-label">Finalizados</span><span class="gbadge-val tg">${finalizados}</span></div>
    <div class="gbadge"><span class="gbadge-label">Valor Total</span><span class="gbadge-val">${fmt(valorTotal)}</span></div>
  `;
}

function renderHistoricoTable() {
  const vendedorFiltro = document.getElementById('historicoVendedor')?.value || '';
  const dateFrom = document.getElementById('historicoDateFrom')?.value || '';
  const dateTo = document.getElementById('historicoDateTo')?.value || '';
  const tbody = document.getElementById('tbHistorico');
  const vazio = document.getElementById('historicoVazio');
  if (!tbody) return;

  // Populate vendedor filter
  const sel = document.getElementById('historicoVendedor');
  if (sel) {
    const current = sel.value;
    const vendedores = [...new Set(COMERCIAL.map(o => o.vendedor).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Todos Vendedores</option>' +
      vendedores.map(v => `<option value="${v}">${v}</option>`).join('');
    sel.value = current;
  }

  let rows = [...COMERCIAL];

  if (vendedorFiltro) {
    rows = rows.filter(o => o.vendedor === vendedorFiltro);
  }

  // Date filter
  if (dateFrom || dateTo) {
    rows = rows.filter(o => {
      const d = parseDate(o.data);
      if (!d) return false;
      if (dateFrom) {
        const from = new Date(dateFrom + 'T00:00:00');
        if (d < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo + 'T23:59:59');
        if (d > to) return false;
      }
      return true;
    });
  }

  // Sort by date descending
  rows.sort((a, b) => {
    const da = parseDate(a.data);
    const db = parseDate(b.data);
    if (!da || !db) return 0;
    return db - da;
  });

  if (rows.length === 0) {
    tbody.innerHTML = '';
    if (vazio) vazio.style.display = 'block';
    return;
  }

  if (vazio) vazio.style.display = 'none';

  tbody.innerHTML = rows.map(o => {
    const badge = getModoBadge(o.modo_emissao);
    const statusCls = o.status === 'Finalizado' ? 'status-finalizado'
                    : o.status === 'Aprovado' ? 'status-enviado'
                    : '';
    return `<tr>
      <td>
        <button onclick="openDrawer('editar', ${o.id})" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:16px;" title="Editar Pedido">✎</button>
      </td>
      <td><span class="kcard-badge ${badge.cls}" style="font-size:9px;padding:2px 6px;">${badge.label}</span> ${o.ref_orcamento || '—'}</td>
      <td>${o.fornecedor || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:600;">${fmt(o.valor)}</td>
      <td>${o.data || '—'}</td>
      <td>${o.pagamento || '—'}</td>
      <td>${o.forma_pagamento || '—'}</td>
      <td>${o.parcelas || '—'}</td>
      <td>${o.vendedor || '—'}</td>
      <td><span class="${statusCls}" style="font-weight:600;font-size:11px;">${o.status || '—'}</span></td>
      <td style="font-size:11px;">${o.data_vencimento || '—'}</td>
      <td style="font-size:11px;">${o.nota_fiscal || '—'}</td>
      <td style="font-size:11px;">${o.empresa || '—'}</td>
      <td style="max-width:200px;white-space:pre-wrap;font-size:11px;">${o.observacao || '—'}</td>
    </tr>`;
  }).join('');
}

// ─── Helpers ───

function getDaysInStatus(orc) {
  const d = parseDate(orc.data);
  if (!d) return 0;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now - d) / (1000 * 60 * 60 * 24)));
}

function showComercialToast(msg, type) {
  let toast = document.getElementById('comercialToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'comercialToast';
    toast.className = 'gestao-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `gestao-toast ${type}`;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 4000);
}
