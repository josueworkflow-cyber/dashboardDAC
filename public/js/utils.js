/* ═══════════════════════════════════════════════
   utils.js — Funções utilitárias puras
   (formatação, datas, ranges)
   ═══════════════════════════════════════════════ */

// Formata número como moeda BRL
function fmt(v) {
  return 'R$ ' + parseVal(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Converte string de data (dd/mm/yyyy ou yyyy-mm-dd) para Date
function parseDate(str) {
  if (!str) return null;
  // Handle "dd/mm/yyyy"
  if (typeof str.includes === 'function' && str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  // Try to avoid timezone shift for YYYY-MM-DD
  if (typeof str.includes === 'function' && str.includes('-')) {
    const p = str.split('T')[0].split('-');
    if (p.length === 3) {
      return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    }
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

// Converte Date para string no formato yyyy-mm-dd
function toIso(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// Converte Date para string no formato dd/mm/yyyy
function fmtBr(d) {
  return String(d.getDate()).padStart(2, '0') + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    d.getFullYear();
}

// Verifica se uma data (string) está dentro de um range [from, to]
function isInRange(str, from, to) {
  const d = parseDate(str);
  if (!d) return false;
  d.setHours(0, 0, 0, 0);
  return d >= new Date(from + 'T00:00:00') && d <= new Date(to + 'T23:59:59');
}

// Filtra array de transações por período (em dias). Se periodo <= 0, retorna tudo.
function filterByPeriodo(rows, periodo) {
  if (periodo <= 0) return rows;
  const now = new Date();
  const cut = new Date(now);
  cut.setDate(cut.getDate() - periodo);
  return rows.filter(item => {
    const d = parseDate(item.data_pagamento || item.data_vencimento);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    cut.setHours(0, 0, 0, 0);
    now.setHours(23, 59, 59, 999);
    return d >= cut && d <= now;
  });
}

/**
 * Retorna o valor efetivo pago de um lançamento ou parcela:
 * - Se r._groupItems (linha consolidada), soma o valor dos itens com status 'Pago' (ou valor_pago parcial)
 * - Se for lançamento/parcela individual:
 *   - Status 'Pago': valor_pago (se informado) ou valor integral
 *   - Status 'Parcial': valor_pago
 *   - Outros status (Pendente, Cancelado, etc.): 0
 */
function getPaidValue(r) {
  if (!r) return 0;

  // 1. Linha consolidada de grupo de parcelas
  if (r._groupItems && Array.isArray(r._groupItems) && r._groupItems.length > 0) {
    return r._groupItems.reduce((sum, item) => {
      if (!item) return sum;
      const st = String(item.status || '').trim().toLowerCase();
      if (st === 'pago') {
        const val = parseVal(item.valor_pago) || parseVal(item.valor);
        return sum + val;
      }
      if (st === 'parcial') {
        return sum + parseVal(item.valor_pago);
      }
      return sum;
    }, 0);
  }

  // 2. Lançamento/parcela individual
  const status = String(r.status || '').trim().toLowerCase();
  if (status === 'pago') {
    const valPago = parseVal(r.valor_pago);
    if (valPago > 0) return valPago;
    return parseVal(r.valor);
  }

  if (status === 'parcial') {
    return parseVal(r.valor_pago);
  }

  return 0;
}

function getEffectiveValue(r) {
  return getPaidValue(r);
}

// Converte data BR (dd/mm/yyyy) para ISO (yyyy-mm-dd)
function parseBrToIso(br) {
  if (!br) return '';
  if (!br.includes('/')) {
    if (br.includes('T')) return br.split('T')[0];
    if (br.includes(' ')) return br.split(' ')[0];
    return br;
  }
  let [d, m, y] = br.split('/');
  if (y && y.includes(' ')) y = y.split(' ')[0];
  if (d && m && y) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return br;
}

// Converte string de valor (BR ou US) para number
function parseVal(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  let s = String(v).replace('R$', '').replace(/\s/g, '');
  if (s.includes(',')) {
    // Formato BR: ponto é milhar (opcional), vírgula é decimal
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Normaliza string para comparação (remove acentos, espaços invisíveis/NBSP, converte para maiúsculas e remove pontuações das pontas)
function normalizeString(str) {
  if (!str) return '';
  return str.toString()
    .replace(/[\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:\s]+$/, '')
    .replace(/^[.,;:\s]+/, '')
    .trim();
}

// Renderiza badge visual de status detectando automaticamente se está Vencido
function renderStatusBadge(r) {
  if (!r) return '<span class="stag sn">Pendente</span>';
  const status = (r.status || 'Pendente').trim();

  if (status === 'Pago') {
    return `<span class="stag sp">Pago</span>`;
  }
  if (status === 'Cancelado') {
    return `<span class="stag so">Cancelado</span>`;
  }

  // Verificar se está vencido (vencimento < hoje)
  let isOverdue = false;
  if (r.data_vencimento) {
    const venc = parseDate(r.data_vencimento);
    if (venc) {
      venc.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (venc < today) {
        isOverdue = true;
      }
    }
  }

  if (isOverdue) {
    if (status === 'Parcial') {
      return `<span class="stag so" style="display:inline-flex;align-items:center;gap:3px;" title="Vencimento ultrapassado!">⚠️ Parcial Vencido</span>`;
    }
    return `<span class="stag so" style="display:inline-flex;align-items:center;gap:3px;" title="Vencimento ultrapassado!">⚠️ Vencido</span>`;
  }

  if (status === 'Parcial') {
    return `<span class="stag sy">Parcial</span>`;
  }

  return `<span class="stag sn">${status || 'Pendente'}</span>`;
}

/**
 * Retorna o rótulo da parcela no formato "X/Y"
 * X = quantidade de parcelas já pagas
 * Y = total de parcelas
 */
function getParcelaLabel(r) {
  if (!r) return null;

  // 1. Se r tem _groupItems (linha consolidada pelo relatório financeiro),
  // calcula diretamente a partir dos itens do grupo.
  if (r._groupItems && Array.isArray(r._groupItems) && r._groupItems.length > 0) {
    const totalItems = r._groupItems.length;
    const paidItems = r._groupItems.filter(item => String(item.status || '').trim().toLowerCase() === 'pago').length;
    return `${paidItems}/${totalItems}`;
  }

  // 2. Se r tem _parcelLabel e ele já está formatado como X/Y, usa-o
  if (r._parcelLabel && /^\d+\/\d+$/.test(String(r._parcelLabel).trim())) {
    return String(r._parcelLabel).trim();
  }

  const ref = String(r.parcela_ref || '').trim();
  const groupMatch = ref.match(/\[(PRC-[^\]]+)\]/i);
  const grupoId = r._parcelGroupId || (groupMatch ? groupMatch[1] : null);

  let totalCount = parseInt(r.num_parcelas, 10) || 0;
  if (!totalCount && ref) {
    const slashMatch = ref.split(' ')[0].match(/\/(\d+)/);
    if (slashMatch) totalCount = parseInt(slashMatch[1], 10);
  }

  // Se não pertence a um grupo e o total de parcelas <= 1, não é parcelado
  if (!grupoId && totalCount <= 1) {
    return null;
  }

  if (!totalCount) totalCount = 1;

  // Busca todos os lançamentos do mesmo grupo no estado global (ENT e SAI) para contar os pagos
  let paidCount = 0;
  if (grupoId && typeof ENT !== 'undefined' && typeof SAI !== 'undefined') {
    const allRows = [...(ENT || []), ...(SAI || [])];
    const groupRows = allRows.filter(item => {
      const g = item._parcelGroupId || (item.parcela_ref && item.parcela_ref.match(/\[(PRC-[^\]]+)\]/i)?.[1]);
      return g === grupoId;
    });

    if (groupRows.length > 0) {
      paidCount = groupRows.filter(item => String(item.status || '').trim().toLowerCase() === 'pago').length;
      if (groupRows.length > totalCount) totalCount = groupRows.length;
    } else {
      paidCount = String(r.status || '').trim().toLowerCase() === 'pago' ? 1 : 0;
    }
  } else {
    paidCount = String(r.status || '').trim().toLowerCase() === 'pago' ? 1 : 0;
  }

  return `${paidCount}/${totalCount}`;
}

/**
 * Helper global para renderizar a badge de parcela com ícone 📋 e X/Y
 */
function renderParcelaBadge(r) {
  const label = getParcelaLabel(r);
  if (!label) {
    return '<span style="color:var(--muted);font-size:11px;">—</span>';
  }

  const ref = String(r.parcela_ref || '').trim();
  const groupMatch = ref.match(/\[(PRC-[^\]]+)\]/i);
  const grupoId = r._parcelGroupId || (groupMatch ? groupMatch[1] : null);
  const tipo = r._tipo || (r.movimentacao && normalizeString(r.movimentacao).includes('ENTRADA') ? 'entrada' : 'saida');

  return `
    <button onclick="${grupoId ? `abrirModalGrupo('${grupoId}', '${tipo}', event)` : ''}" 
            class="filter-btn" style="font-size:11px; padding:4px 9px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;" 
            title="Ver parcelas e vencimentos">
      <span>📋</span> ${label}
    </button>
  `;
}
