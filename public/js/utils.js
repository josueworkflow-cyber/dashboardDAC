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

// Retorna o valor efetivo de um lançamento respeitando o status:
// - Cancelado / Pendente → 0 (não entra nos cálculos)
// - Parcial → valor_pago (somente o que já foi pago)
// - Pago (ou sem status) → valor integral
function getEffectiveValue(r) {
  const status = (r.status || '').trim().toLowerCase();
  if (status === 'cancelado' || status === 'pendente') return 0;
  if (status === 'parcial') return parseVal(r.valor_pago);
  return parseVal(r.valor);
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
