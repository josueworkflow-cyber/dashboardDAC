/* ═══════════════════════════════════════════════
   comercial.js — Página Comercial (Funil de Vendas)
   Pipeline, Kanban Board, Drag-and-Drop, Drawer
   ═══════════════════════════════════════════════ */

// ─── Estado ───

let COMERCIAL = [];
let comercialFilter = { search: '', vendedor: '' };
let draggingCardId = null;

const COMERCIAL_STATUSES = [
  { key: 'orcamento',  label: 'Orçamento',          value: 'Orçamento',           color: '#3B82F6' },
  { key: 'negociacao', label: 'Negociação',          value: 'Negociação',          color: '#F59E0B' },
  { key: 'aprovado',   label: 'Aprovado',            value: 'Aprovado',            color: '#8B5CF6' },
  { key: 'enviado',    label: 'Enviado ao Estoque',  value: 'Enviado ao Estoque',  color: '#06B6D4' },
  { key: 'finalizado', label: 'Finalizado',          value: 'Finalizado',          color: '#10B981' },
  { key: 'cancelado',  label: 'Cancelado',           value: 'Cancelado',           color: '#6B7280' }
];

// ─── Inicialização ───

function initComercial() {
  renderPipeline();
  renderKanban();
}

// ─── Pipeline Visual ───

function renderPipeline() {
  const container = document.getElementById('comercial-pipeline');
  if (!container) return;

  const filtered = getFilteredComercial();

  container.innerHTML = COMERCIAL_STATUSES
    .filter(s => s.key !== 'cancelado' && s.key !== 'finalizado')
    .map(status => {
      const items = filtered.filter(o => o.status === status.value);
      const count = items.length;
      const totalValue = items.reduce((sum, o) => sum + (parseFloat(o.valor) || 0), 0);

      return `
        <div class="pipeline-stage" onclick="filterKanbanByStatus('${status.value}')">
          <div class="pipeline-stage-top" style="background:${status.color};"></div>
          <div class="pipeline-stage-label">${status.label}</div>
          <div class="pipeline-stage-count">${count}</div>
          <div class="pipeline-stage-value">${fmt(totalValue)}</div>
        </div>`;
    }).join('');
}

// ─── Kanban Board ───

function renderKanban() {
  const container = document.getElementById('kanban-board');
  if (!container) return;

  const filtered = getFilteredComercial();
  populateVendedorFilter();

  const KANBAN_STATUSES = COMERCIAL_STATUSES.filter(s => s.key !== 'finalizado' && s.key !== 'cancelado');

  container.innerHTML = KANBAN_STATUSES.map(status => {
    const items = filtered.filter(o => o.status === status.value);

    return `
      <div class="kanban-column">
        <div class="kanban-col-header bg-${status.key}">
          <span class="kanban-col-title">${status.label}</span>
          <div class="kanban-col-header-content">
            <span></span>
            <span class="kanban-col-count">${items.length}</span>
          </div>
        </div>
        <div class="kanban-col-body"
             data-status="${status.value}"
             ondragover="handleDragOver(event)"
             ondragleave="handleDragLeave(event)"
             ondrop="handleDrop(event, '${status.value}')">
          ${items.length === 0
            ? '<div class="kanban-empty">Nenhum orçamento</div>'
            : items.map(o => renderCard(o, status.key)).join('')
          }
        </div>
      </div>`;
  }).join('');
}

function renderCard(orc, statusKey) {
  const daysDiff = getDaysInStatus(orc);
  const daysClass = daysDiff >= 5 ? 'alert' : '';
  const daysLabel = daysDiff === 0 ? 'Hoje' : `${daysDiff}d`;

  return `
    <div class="kanban-card border-${statusKey}"
         draggable="true"
         data-id="${orc.id}"
         ondragstart="handleDragStart(event, '${orc.id}')"
         ondragend="handleDragEnd(event)"
         onclick="openDrawer('editar', ${orc.id})">
      <div class="kanban-card-actions">
        ${statusKey !== 'enviado' && statusKey !== 'finalizado' ? `
          <button class="kanban-card-action" onclick="event.stopPropagation(); advanceStatus(${orc.id})" title="Avançar">➡</button>
        ` : ''}
        ${statusKey === 'aprovado' ? `
          <button class="kanban-card-action" onclick="event.stopPropagation(); enviarParaEstoque(${orc.id})" title="Enviar ao Estoque">📦</button>
        ` : ''}
        ${statusKey !== 'cancelado' ? `
          <button class="kanban-card-action action-cancel" onclick="event.stopPropagation(); cancelarOrcamento(${orc.id})" title="Cancelar">✕</button>
        ` : ''}
      </div>
      <div class="kanban-card-header">
        <span class="kanban-card-number">${orc.numero_orcamento || '—'}</span>
        <span class="kanban-card-days ${daysClass}">${daysLabel}</span>
      </div>
      <div class="kanban-card-client" title="${orc.cliente || ''}">${orc.cliente || 'Cliente não informado'}</div>
      <div class="kanban-card-value">${fmt(orc.valor)}</div>
      <div class="kanban-card-footer">
        <span class="kanban-card-vendor">👤 ${orc.vendedor || '—'}</span>
        <span class="kanban-card-date">${orc.data || '—'}</span>
      </div>
    </div>`;
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

  // Enviar ao estoque
  if (newStatus === 'Enviado ao Estoque') {
    await enviarParaEstoque(orc.id);
    return;
  }

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

// ─── API: Avançar status ───

function advanceStatus(id) {
  const orc = COMERCIAL.find(o => String(o.id) === String(id));
  if (!orc) return;

  const order = ['Orçamento', 'Negociação', 'Aprovado', 'Enviado ao Estoque', 'Finalizado'];
  const currentIdx = order.indexOf(orc.status);
  if (currentIdx === -1 || currentIdx >= order.length - 1) return;

  const nextStatus = order[currentIdx + 1];

  if (nextStatus === 'Enviado ao Estoque') {
    enviarParaEstoque(id);
    return;
  }

  updateOrcamentoStatus(id, nextStatus);
}

// ─── API: Cancelar ───

async function cancelarOrcamento(id) {
  const orc = COMERCIAL.find(o => String(o.id) === String(id));
  if (!orc) return;
  await updateOrcamentoStatus(id, 'Cancelado');
}

// ─── API: Enviar para Estoque ───

async function enviarParaEstoque(id) {
  const orc = COMERCIAL.find(o => String(o.id) === String(id));
  if (!orc) return;

  if (orc.status === 'Enviado ao Estoque') {
    showComercialToast('⚠ Este orçamento já foi enviado ao estoque.', 'err');
    return;
  }

  try {
    const r = await authFetch(`${API}/comercial/${id}/enviar-estoque`, { method: 'POST' });
    const data = await r.json();
    if (r.ok && data.success) {
      showComercialToast(`✓ ${data.message}`, 'ok');
      await loadData();
    } else {
      showComercialToast('❌ ' + (data.error || 'Erro ao enviar.'), 'err');
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

  // Reset form
  document.getElementById('df-cliente').value = '';
  document.getElementById('df-valor').value = '';
  document.getElementById('df-data').value = toIso(new Date());
  document.getElementById('df-pagamento').value = '';
  document.getElementById('df-forma').value = '';
  document.getElementById('df-parcela').value = '';
  document.getElementById('df-modo').selectedIndex = 0;
  document.getElementById('df-vendedor').value = '';
  document.getElementById('df-status').value = 'Orçamento';
  document.getElementById('df-id').value = '';

  if (mode === 'editar' && id) {
    const orc = COMERCIAL.find(o => String(o.id) === String(id));
    if (!orc) return;

    title.textContent = `EDITAR ${orc.numero_orcamento}`;
    deleteBtn.style.display = 'inline-flex';
    submitBtn.textContent = 'Salvar Alterações';
    statusField.style.display = 'block';

    document.getElementById('df-id').value = orc.id;
    document.getElementById('df-cliente').value = orc.cliente || '';
    document.getElementById('df-valor').value = orc.valor || '';
    document.getElementById('df-data').value = parseBrToIso(orc.data) || toIso(new Date());
    document.getElementById('df-pagamento').value = orc.pagamento || '';
    document.getElementById('df-forma').value = orc.forma_pagamento || '';
    document.getElementById('df-parcela').value = orc.parcela || '';
    document.getElementById('df-vendedor').value = orc.vendedor || '';
    document.getElementById('df-status').value = orc.status || 'Orçamento';

    // Set modo emissao
    const modoSelect = document.getElementById('df-modo');
    const modoVal = (orc.modo_emissao || '').trim();
    const modoOpts = Array.from(modoSelect.options).map(o => o.value);
    if (modoOpts.includes(modoVal)) {
      modoSelect.value = modoVal;
    } else {
      modoSelect.selectedIndex = 0;
    }
  } else {
    title.textContent = 'NOVO ORÇAMENTO';
    deleteBtn.style.display = 'none';
    submitBtn.textContent = 'Criar Orçamento';
    statusField.style.display = 'none';
  }

  overlay.classList.add('open');
  panel.classList.add('open');

  // Focus first field
  setTimeout(() => document.getElementById('df-cliente').focus(), 300);
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
  const status = document.getElementById('df-status').value;

  if (!cliente || !valorRaw) {
    showComercialToast('Preencha os campos obrigatórios: Cliente e Valor.', 'err');
    return;
  }

  const valor = parseVal(valorRaw);
  if (valor <= 0) {
    showComercialToast('O valor deve ser um número positivo.', 'err');
    return;
  }

  // Converte data ISO para BR
  function isoToBr(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  const body = {
    cliente,
    valor,
    data: isoToBr(dataIso),
    pagamento,
    forma_pagamento: forma,
    parcela,
    modo_emissao: modo,
    vendedor,
    status
  };

  const btn = document.getElementById('drawer-submit');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const isEdit = !!id;
    const url = isEdit ? `${API}/comercial/${id}` : `${API}/comercial`;
    const method = isEdit ? 'PUT' : 'POST';

    const r = await authFetch(url, {
      method,
      body: JSON.stringify(body)
    });
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
  btn.textContent = id ? 'Salvar Alterações' : 'Criar Orçamento';
}

// ─── Drawer: Delete ───

async function deleteOrcamento() {
  const id = document.getElementById('df-id').value;
  if (!id) return;

  const orc = COMERCIAL.find(o => String(o.id) === String(id));
  const label = orc ? `${orc.numero_orcamento} (${orc.cliente})` : `#${id}`;
  const ok = confirm(`Excluir permanentemente o orçamento ${label}?`);
  if (!ok) return;

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

  if (comercialFilter.search) {
    const s = comercialFilter.search.toLowerCase();
    rows = rows.filter(o =>
      (o.cliente || '').toLowerCase().includes(s) ||
      (o.numero_orcamento || '').toLowerCase().includes(s) ||
      (o.vendedor || '').toLowerCase().includes(s)
    );
  }

  if (comercialFilter.vendedor) {
    rows = rows.filter(o => o.vendedor === comercialFilter.vendedor);
  }

  return rows;
}

function filterComercial() {
  comercialFilter.search = (document.getElementById('comercialSearch')?.value || '').trim();
  comercialFilter.vendedor = document.getElementById('comercialVendedor')?.value || '';
  renderPipeline();
  renderKanban();
}

function filterKanbanByStatus(status) {
  // Scroll to the kanban column
  const cols = document.querySelectorAll('.kanban-col-body');
  cols.forEach(col => {
    if (col.dataset.status === status) {
      col.closest('.kanban-column').scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
  });
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
