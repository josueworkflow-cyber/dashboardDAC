/* ═══════════════════════════════════════════════
   estoque.js — Página "Gestão de Estoque":
   tabela, abas, formulário de lançamento,
   sincronização com aba 'Estoque' do Sheets
   ═══════════════════════════════════════════════ */

let estoqueTab = 'todos';
let currentEstoqueEditId = null;

// ─── Inicialização da página ───

async function initEstoque() {
  document.getElementById('ef-data').value = toIso(new Date());

  // Listener para troca dinâmica de label (Fornecedor/Cliente)
  const movSelect = document.getElementById('ef-mov');
  const fornLabel = document.getElementById('ef-forn-label');
  if (movSelect && fornLabel) {
    movSelect.addEventListener('change', () => {
      fornLabel.textContent = movSelect.value === 'Saída' ? 'Cliente *' : 'Fornecedor *';
      updateModoEmissaoOptions();
    });
  }
  
  updateModoEmissaoOptions();

  // Restaura filtros salvos
  const saved = JSON.parse(localStorage.getItem('estoque_filters') || '{}');
  if (saved.search) document.getElementById('estoqueSearch').value = saved.search;
  if (saved.mes) document.getElementById('estoqueMesFiltro').value = saved.mes;
  if (saved.data) document.getElementById('estoqueDataFiltro').value = saved.data;
  if (saved.aba) {
    estoqueTab = saved.aba;
    const tabs = document.querySelectorAll('#p-estoque .gtab');
    tabs.forEach(t => {
      t.classList.remove('on');
      if (normalizeString(t.textContent) === normalizeString(estoqueTab)) {
        t.classList.add('on');
      }
    });
  }

  // Se não houver filtro de mês salvo, mantém como "Anual" (vazio) ou recupera o salvo
  if (saved.mes !== undefined && saved.mes !== null && saved.mes !== '') {
    document.getElementById('estoqueMesFiltro').value = saved.mes;
  } else {
    document.getElementById('estoqueMesFiltro').value = ''; // Padrão: Anual
  }

  renderEstoqueTable();
}

// ─── Sincronização de Filtros ───

function handleEstoqueMesChange() {
  document.getElementById('estoqueDataFiltro').value = '';
  renderEstoqueTable();
}

function handleEstoqueDataChange() {
  const dateVal = document.getElementById('estoqueDataFiltro').value;
  if (dateVal) {
    const d = new Date(dateVal + 'T12:00:00');
    if (!isNaN(d.getTime())) {
      document.getElementById('estoqueMesFiltro').value = d.getMonth();
    }
  }
  renderEstoqueTable();
}

// ─── Tabela e Filtros ───

function renderEstoqueTable() {
  const search = (document.getElementById('estoqueSearch').value || '').toLowerCase();
  const mesFiltro = document.getElementById('estoqueMesFiltro').value;
  const dateFiltro = document.getElementById('estoqueDataFiltro').value;
  
  let rows = [...ESTQ];

  // Filtro de Aba
  if (estoqueTab === 'entradas') rows = rows.filter(r => normalizeString(r.movimentacao).includes('ENTRADA'));
  else if (estoqueTab === 'saidas') rows = rows.filter(r => normalizeString(r.movimentacao).includes('SAIDA'));
  else if (estoqueTab === 'pendentes') rows = rows.filter(r => !r.nota_fiscal && !r.empresa);

  // Filtro de Busca
  if (search) rows = rows.filter(r =>
    (r.fornecedor || '').toLowerCase().includes(search) ||
    (r.nota_fiscal || '').toLowerCase().includes(search) ||
    (r.empresa || '').toLowerCase().includes(search)
  );

  // Salva filtros atuais
  localStorage.setItem('estoque_filters', JSON.stringify({
    search: document.getElementById('estoqueSearch').value,
    mes: mesFiltro,
    data: dateFiltro,
    aba: estoqueTab
  }));

  // Filtro de Mês
  if (mesFiltro !== '') {
    const mesNum = parseInt(mesFiltro, 10);
    const year = new Date().getFullYear();
    rows = rows.filter(r => {
      const d = parseDate(r.data);
      if (!d) return false;
      return d.getMonth() === mesNum && d.getFullYear() === year;
    });
  }

  // Filtro de Data Específica
  if (dateFiltro) {
    rows = rows.filter(r => {
      const dIso = parseBrToIso(r.data);
      return dIso === dateFiltro;
    });
  }

  const tbody = document.getElementById('tbEstoque');
  const vazio = document.getElementById('estoqueVazio');

  if (!rows.length) {
    tbody.innerHTML = '';
    vazio.style.display = 'block';
    renderEstoqueBadges(rows);
    return;
  }
  vazio.style.display = 'none';

  tbody.innerHTML = rows.map((r, i) => {
    const isEnt = (r.movimentacao || '').toLowerCase().includes('entrada');
    const movTag = isEnt ? `<span class="stag so">Entrada</span>` : `<span class="stag sp">Saída</span>`;
    const valColor = isEnt ? 'var(--red)' : '#4ADE80';
    const valSign = isEnt ? '-' : '+';

    return `<tr>
      <td>
        <button onclick="editEstoqueLancamento('${r.id}')" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:16px;" title="Editar Lançamento">✎</button>
      </td>
      <td>${movTag}</td>
      <td style="font-size:11px;">${r.fornecedor || '—'}</td>
      <td class="mono" style="color:${valColor};font-weight:700;">${valSign} ${fmt(r.valor)}</td>
      <td style="font-size:11px;">${r.data || '—'}</td>
      <td style="font-size:11px;color:var(--muted);">${r.pagamento || '—'}</td>
      <td style="font-size:10px;color:var(--accent2);">${r.nota_fiscal || '—'}</td>
      <td style="font-size:11px;">${r.parcelas || '—'}</td>
      <td style="font-size:11px;color:var(--muted);">${r.empresa || '—'}</td>
      <td style="font-size:11px;color:var(--muted);">${r.forma_pagamento || '—'}</td>
      <td style="font-size:10px;opacity:0.8;">${r.modo_emissao || '—'}</td>
    </tr>`;
  }).join('');

  renderEstoqueBadges(rows);
}

// ─── Badges de resumo ───

function renderEstoqueBadges(rows) {
  if (!rows) return;

  const validRows = rows;
  const entRows = validRows.filter(r => (r.movimentacao || '').toLowerCase().includes('entrada'));
  const saiRows = validRows.filter(r => !entRows.includes(r));

  const totalEnt = entRows.reduce((sum, r) => sum + (parseFloat(r.valor) || 0), 0);
  const totalSai = saiRows.reduce((sum, r) => sum + (parseFloat(r.valor) || 0), 0);

  document.getElementById('eb-total').textContent = fmt(totalSai - totalEnt);
  document.getElementById('eb-ent').textContent = fmt(totalEnt);
  document.getElementById('eb-sai').textContent = fmt(totalSai);
}

// ─── Trocar aba ───

function setEstoqueTab(tab, el) {
  estoqueTab = tab;
  document.querySelectorAll('#p-estoque .gtab').forEach(t => t.classList.remove('on'));
  if (el) el.classList.add('on');
  renderEstoqueTable();
}

// ─── Resetar formulário ───

function resetEstoqueForm() {
  currentEstoqueEditId = null;

  const title = document.getElementById('ef-title');
  if (title) title.innerHTML = '<span style="color:var(--red);">＋</span> Novo Lançamento de Estoque';
  
  document.getElementById('ef-submit').textContent = 'Confirmar e Sincronizar';
  document.getElementById('ef-delete').style.display = 'none';

  document.getElementById('ef-mov').value = 'Entrada';
  if (document.getElementById('ef-forn-label')) {
    document.getElementById('ef-forn-label').textContent = 'Fornecedor *';
  }
  document.getElementById('ef-forn').value = '';
  document.getElementById('ef-val').value = '';
  document.getElementById('ef-data').value = toIso(new Date());
  document.getElementById('ef-pagamento').value = '';
  document.getElementById('ef-nf').value = '';
  document.getElementById('ef-modo-emissao').selectedIndex = 0;
  document.getElementById('ef-parcelas').value = '';
  document.getElementById('ef-empresa').value = '';
  document.getElementById('ef-forma').value = '';
}

// ─── Atualiza opções do Modo de Emissão conforme Movimentação ───

function updateModoEmissaoOptions() {
  const mov = document.getElementById('ef-mov').value;
  const sel = document.getElementById('ef-modo-emissao');
  if (!sel) return;

  const currentVal = sel.value;
  let options = ['Com Nota Fiscal', 'Por PD', 'Por Empréstimo'];

  sel.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join('');
  
  // Tenta manter o valor se ele existir nas novas opções
  if (options.includes(currentVal)) {
    sel.value = currentVal;
  }
}

// ─── Submeter lançamento ───

async function submitEstoque() {
  const mov = document.getElementById('ef-mov').value;
  const val = document.getElementById('ef-val').value;
  const data = document.getElementById('ef-data').value;

  if (!mov || !val || !data) {
    showEstoqueToast('Preencha os campos obrigatórios: Movimentação, Valor e Data.', 'err');
    return;
  }

  const valorNum = parseVal(val);
  if (valorNum <= 0) {
    showEstoqueToast('O valor deve ser um número positivo.', 'err');
    return;
  }

  const btn = document.getElementById('ef-submit');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  function isoToBr(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  const body = {
    isEstoque: true,
    movimentacao: mov,
    fornecedor: document.getElementById('ef-forn').value,
    valor: valorNum,
    data: isoToBr(data),
    pagamento: document.getElementById('ef-pagamento').value,
    nota_fiscal: document.getElementById('ef-nf').value,
    modo_emissao: document.getElementById('ef-modo-emissao').value,
    parcelas: document.getElementById('ef-parcelas').value,
    empresa: document.getElementById('ef-empresa').value,
    forma_pagamento: document.getElementById('ef-forma').value
  };

  try {
    const isEdit = !!currentEstoqueEditId;
    const url = isEdit ? `${API}/lancamento/estoque/${currentEstoqueEditId}` : `${API}/lancamento`;
    const method = isEdit ? 'PUT' : 'POST';

    const r = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
      body: JSON.stringify(body)
    });
    const resData = await r.json();
    if (r.ok && resData.success) {
      showEstoqueToast('✓ ' + resData.message, 'ok');
      resetEstoqueForm();
      setTimeout(loadData, 1500);
    } else {
      showEstoqueToast('❌ ' + (resData.error || 'Erro ao enviar lançamento.'), 'err');
    }
  } catch (e) {
    showEstoqueToast('❌ Erro de conexão com o servidor.', 'err');
  }

  btn.disabled = false;
  btn.textContent = 'Confirmar e Sincronizar';
}

// ─── Toast de feedback ───

function showEstoqueToast(msg, type) {
  let toast = document.getElementById('estoqueToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'estoqueToast';
    toast.className = 'gestao-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `gestao-toast ${type}`;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// ─── Edição e Exclusão ───

function editEstoqueLancamento(id) {
  const r = ESTQ.find(x => String(x.id) === String(id));
  if (!r) return;

  currentEstoqueEditId = r.id;

  const title = document.getElementById('ef-title');
  if (title) title.innerHTML = '<span style="color:#FACC15;">✏️ Editando Lançamento de Estoque</span>';

  document.getElementById('ef-submit').textContent = 'Salvar Alterações';
  document.getElementById('ef-delete').style.display = 'inline-block';

  // Helper para select
  const setSelectByText = (id, val) => {
    const el = document.getElementById(id);
    const opts = Array.from(el.options).map(o => o.value);
    const match = opts.find(o => o.toLowerCase() === (val || '').toLowerCase());
    if (match) el.value = match;
    else el.value = '';
  };

  const movType = normalizeString(r.movimentacao).includes('SAIDA') ? 'Saída' : 'Entrada';
  document.getElementById('ef-mov').value = movType;
  updateModoEmissaoOptions();
  
  if (document.getElementById('ef-forn-label')) {
    document.getElementById('ef-forn-label').textContent = movType === 'Saída' ? 'Cliente *' : 'Fornecedor *';
  }
  document.getElementById('ef-forn').value = r.fornecedor || '';
  document.getElementById('ef-val').value = r.valor || '';
  document.getElementById('ef-data').value = parseBrToIso(r.data) || '';
  setSelectByText('ef-pagamento', r.pagamento);
  document.getElementById('ef-nf').value = r.nota_fiscal || '';
  if (r.modo_emissao) {
    setSelectByText('ef-modo-emissao', r.modo_emissao);
  }
  document.getElementById('ef-parcelas').value = r.parcelas || '';
  setSelectByText('ef-empresa', r.empresa);
  setSelectByText('ef-forma', r.forma_pagamento);

  const wrap = document.querySelector('#p-estoque .gestao-form-wrap');
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

async function deleteEstoqueLancamento() {
  if (!currentEstoqueEditId) return;
  const isOk = confirm('⚠️ Tem certeza que deseja excluir este lançamento de estoque permanentemente?');
  if (!isOk) return;

  try {
    const r = await fetch(`${API}/lancamento/estoque/${currentEstoqueEditId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN }
    });
    const data = await r.json();
    if (r.ok && data.success) {
      showEstoqueToast('✓ Lançamento excluído.', 'ok');
      resetEstoqueForm();
      setTimeout(loadData, 1000);
    } else {
      showEstoqueToast('❌ ' + (data.error || 'Erro ao excluir.'), 'err');
    }
  } catch (e) {
    showEstoqueToast('❌ Erro de conexão.', 'err');
  }
}
