/* ═══════════════════════════════════════════════
   movimentacao-estoque.js — Relatório de Estoque
   Consulta consolidada da aba 'Estoque'
   ═══════════════════════════════════════════════ */
console.log('✅ movimentacao-estoque.js carregado');

async function initMovimentacaoEstoque() {
  const tbody = document.getElementById('tbMovEstoque');
  if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;">Carregando dados...</td></tr>';

  // Reset de datas se necessário (ex: começar com "Tudo")
  document.getElementById('meDateFrom').value = '';
  document.getElementById('meDateTo').value = '';
  
  renderMovimentacaoEstoque();
}

function setMePeriod(p, btn) {
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
  
  document.getElementById('meDateFrom').value = from;
  document.getElementById('meDateTo').value = to;
  document.querySelectorAll('.me-period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMovimentacaoEstoque();
}

function renderMovimentacaoEstoque() {
  try {
    const search = (document.getElementById('meSearch').value || '').toLowerCase();
    const empFilter = document.getElementById('meEmpresa').value;
    const tipoFilter = document.getElementById('meTipo').value;
    const dateFrom = document.getElementById('meDateFrom').value;
    const dateTo = document.getElementById('meDateTo').value;

    let rows = [...ESTQ];

    // Só mostra itens finalizados (ou sem status = legado)
    rows = rows.filter(r => !r.status || r.status === 'Finalizado');

    // Filtro de Empresa
    if (empFilter) {
      rows = rows.filter(r => normalizeString(r.empresa) === normalizeString(empFilter));
    }

    // Filtro de Tipo (Entrada/Saída)
    if (tipoFilter) {
      const normalizedTipo = normalizeString(tipoFilter);
      rows = rows.filter(r => normalizeString(r.movimentacao).includes(normalizedTipo));
    }

    // Filtro de Busca
    if (search) {
      rows = rows.filter(r => 
        (r.fornecedor || '').toLowerCase().includes(search) ||
        (r.nota_fiscal || '').toLowerCase().includes(search) ||
        (r.observacoes || '').toLowerCase().includes(search)
      );
    }

    // Filtro de Período
    if (dateFrom || dateTo) {
      rows = rows.filter(r => {
        const dIso = parseBrToIso(r.data);
        if (!dIso) return false;
        if (dateFrom && dIso < dateFrom) return false;
        if (dateTo && dIso > dateTo) return false;
        return true;
      });
    }

    const tbody = document.getElementById('tbMovEstoque');
    const vazio = document.getElementById('meVazio');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '';
      vazio.style.display = 'block';
      return;
    }
    vazio.style.display = 'none';

    // Ordenar por data (mais recente primeiro)
    rows.sort((a, b) => {
      const da = parseDate(a.data) || new Date(0);
      const db = parseDate(b.data) || new Date(0);
      return db - da;
    });

    tbody.innerHTML = rows.map(r => {
      const isEnt = normalizeString(r.movimentacao).includes('ENTRADA');
      const movTag = isEnt ? `<span class="stag so">Entrada</span>` : `<span class="stag sp">Saída</span>`;
      const valColor = isEnt ? 'var(--red)' : '#4ADE80';
      const valSign = isEnt ? '-' : '+';

      return `<tr>
        <td>${movTag}</td>
        <td style="font-size:11px;">${r.fornecedor || '—'}</td>
        <td class="mono" style="color:${valColor};font-weight:700;">${valSign} ${fmt(r.valor)}</td>
        <td style="font-size:11px;">${r.data || '—'}</td>
        <td style="font-size:11px;color:var(--muted);">${r.pagamento || '—'}</td>
        <td style="font-size:10px;color:var(--accent2);">${r.nota_fiscal || '—'}</td>
        <td style="font-size:11px;">${r.parcelas || '—'}</td>
        <td style="font-size:11px;color:var(--muted);">${r.empresa || '—'}</td>
        <td style="font-size:11px;">${r.forma_pagamento || '—'}</td>
        <td style="font-size:10px;opacity:0.8;">${r.modo_emissao || '—'}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('❌ Erro ao renderizar Movimentação de Estoque:', err);
  }
}
