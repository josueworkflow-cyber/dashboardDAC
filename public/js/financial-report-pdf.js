/*
 * financial-report-pdf.js
 * Modelo e gerador vetorial dos relatórios de Movimentações Financeiras.
 *
 * O arquivo não depende do DOM nem do viewport para montar o conteúdo. A mesma
 * lista filtrada alimenta a tabela da tela e o PDF, evitando diferenças entre
 * desktop e mobile.
 */
(function exposeFinancialReport(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.DacFinancialReport = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFinancialReportApi() {
  'use strict';

  const REPORT_TIME_ZONE = 'America/Sao_Paulo';
  const PLACEHOLDER = '-';
  const TOTAL_PAGES_TOKEN = '{total_pages_count_string}';
  const COLORS = {
    red: [196, 18, 48],
    darkRed: [161, 14, 39],
    green: [22, 163, 74],
    amber: [180, 83, 9],
    slate: [15, 23, 42],
    muted: [100, 116, 139],
    border: [203, 213, 225],
    light: [248, 250, 252],
    stripe: [241, 245, 249],
    white: [255, 255, 255]
  };

  function parseMoney(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (value === null || value === undefined || value === '') return 0;

    let text = String(value)
      .replace(/R\$/gi, '')
      .replace(/[\s\u00a0]/g, '')
      .replace(/[^0-9,().+-]/g, '');

    const isParenthesizedNegative = /^\(.*\)$/.test(text);
    text = text.replace(/[()]/g, '');

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');

    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) {
        text = text.replace(/\./g, '').replace(',', '.');
      } else {
        text = text.replace(/,/g, '');
      }
    } else if (lastComma >= 0) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(text)) {
      text = text.replace(/\./g, '');
    }

    const parsed = Number.parseFloat(text);
    if (!Number.isFinite(parsed)) return 0;
    return isParenthesizedNegative ? -Math.abs(parsed) : parsed;
  }

  function normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/[\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/^[.,;:\s]+|[.,;:\s]+$/g, '')
      .trim();
  }

  function cleanPdfText(value, fallback) {
    if (value === null || value === undefined || value === '') {
      return fallback === undefined ? PLACEHOLDER : fallback;
    }

    const cleaned = String(value)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/[\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || (fallback === undefined ? PLACEHOLDER : fallback);
  }

  function getZonedParts(value) {
    const date = value instanceof Date ? value : new Date(value === undefined ? Date.now() : value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

    try {
      const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: REPORT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      });
      const parts = formatter.formatToParts(safeDate);
      const result = {};
      parts.forEach(part => {
        if (part.type !== 'literal') result[part.type] = part.value;
      });
      return result;
    } catch (error) {
      return {
        year: String(safeDate.getFullYear()),
        month: String(safeDate.getMonth() + 1).padStart(2, '0'),
        day: String(safeDate.getDate()).padStart(2, '0'),
        hour: String(safeDate.getHours()).padStart(2, '0'),
        minute: String(safeDate.getMinutes()).padStart(2, '0')
      };
    }
  }

  function todayIso(value) {
    const parts = getZonedParts(value);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function formatEmissionDate(value) {
    const parts = getZonedParts(value);
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
  }

  function dateToIso(value) {
    if (!value) return '';

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return '';
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    const text = String(value).trim();
    const brMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (brMatch) {
      return `${brMatch[3]}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`;
    }

    const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : dateToIso(parsed);
  }

  function normalizeType(value) {
    const normalized = normalizeText(value);
    if (normalized.includes('ENTRADA')) return 'entrada';
    if (normalized.includes('SAIDA')) return 'saída';
    return '';
  }

  function normalizedStatus(row) {
    return normalizeText(row && row.status ? row.status : 'Pendente').toLowerCase();
  }

  function getStatusInfo(row, referenceDate) {
    const status = normalizedStatus(row);
    const dueDate = dateToIso(row && row.data_vencimento);
    const referenceIso = typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
      ? referenceDate
      : todayIso(referenceDate);
    const isClosed = status === 'pago' || status === 'cancelado';
    const isOverdue = Boolean(dueDate && !isClosed && dueDate < referenceIso);

    let label = cleanPdfText(row && row.status ? row.status : 'Pendente', 'Pendente');
    if (status === 'pago') label = 'Pago';
    else if (status === 'cancelado') label = 'Cancelado';
    else if (status === 'parcial' && isOverdue) label = 'Parcial vencido';
    else if (isOverdue) label = 'Vencido';
    else if (status === 'parcial') label = 'Parcial';
    else if (status === 'pendente') label = 'Pendente';

    return { status, dueDate, isClosed, isOverdue, label };
  }

  function isOpenRow(row) {
    const status = normalizedStatus(row);
    return status !== 'pago' && status !== 'cancelado';
  }

  function getEffectiveValue(row) {
    const status = normalizedStatus(row);
    if (status === 'cancelado' || status === 'pendente') return 0;
    if (status === 'parcial') return parseMoney(row && row.valor_pago);
    return parseMoney(row && row.valor);
  }

  function getRemainingValue(row) {
    return Math.max(0, parseMoney(row && row.valor) - parseMoney(row && row.valor_pago));
  }

  function getParcelGroupId(row) {
    const match = String(row && row.parcela_ref ? row.parcela_ref : '').match(/\[(PRC-[^\]]+)\]/i);
    return match ? match[1].toUpperCase() : '';
  }

  function cleanParcelReference(value) {
    const cleaned = String(value || '')
      .replace(/\[PRC-[^\]]+\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || PLACEHOLDER;
  }

  function consolidateRows(filteredRows) {
    const groups = new Map();
    const seenGroups = new Set();

    filteredRows.forEach(row => {
      const groupId = getParcelGroupId(row);
      if (!groupId) return;
      if (!groups.has(groupId)) groups.set(groupId, []);
      groups.get(groupId).push(row);
    });

    const result = [];
    filteredRows.forEach(row => {
      const groupId = getParcelGroupId(row);
      if (!groupId) {
        result.push(row);
        return;
      }
      if (seenGroups.has(groupId)) return;
      seenGroups.add(groupId);

      const items = groups.get(groupId) || [row];
      const activeItems = items.filter(item => normalizedStatus(item) !== 'cancelado');
      const openItems = activeItems.filter(item => isOpenRow(item));
      const baseItem = openItems[0] || activeItems[0] || items[0];
      const totalValue = activeItems.reduce((sum, item) => sum + parseMoney(item.valor), 0);
      const totalPaid = activeItems.reduce((sum, item) => {
        const paid = parseMoney(item.valor_pago);
        return sum + (normalizedStatus(item) === 'pago' && paid <= 0 ? parseMoney(item.valor) : paid);
      }, 0);
      const pendingDates = openItems
        .map(item => ({ iso: dateToIso(item.data_vencimento), display: item.data_vencimento }))
        .filter(item => item.iso)
        .sort((a, b) => a.iso.localeCompare(b.iso));

      const remaining = Math.max(0, totalValue - totalPaid);
      const consolidatedStatus = activeItems.length === 0
        ? 'Cancelado'
        : remaining <= 0.005
        ? 'Pago'
        : totalPaid > 0.005 ? 'Parcial' : 'Pendente';

      result.push({
        ...baseItem,
        valor: totalValue,
        valor_pago: totalPaid,
        status: consolidatedStatus,
        data_vencimento: pendingDates.length ? pendingDates[0].display : (baseItem.data_vencimento || ''),
        _parcelGroupId: groupId,
        _parcelLabel: items.length > 1 ? `${items.length} parcelas` : cleanParcelReference(baseItem.parcela_ref),
        _consolidatedCount: items.length,
        _consolidatedOpenCount: openItems.length
      });
    });

    return result;
  }

  function getSortValue(row, column) {
    switch (column) {
      case 'tipo': return row._tipo || normalizeType(row.movimentacao);
      case 'categoria': return normalizeText(row.categoria);
      case 'observacoes': return normalizeText(row.observacoes);
      case 'cliente': return normalizeText(row.cliente || row.fornecedor);
      case 'fornecedor': return normalizeText(row.fornecedor || row.cliente);
      case 'status': return normalizedStatus(row);
      case 'valor': return parseMoney(row.valor);
      case 'aReceber':
      case 'aPagar': return getRemainingValue(row);
      case 'valor_pago': return parseMoney(row.valor_pago);
      case 'vencimento': return dateToIso(row.data_vencimento);
      case 'pagamento': return dateToIso(row.data_pagamento);
      case 'data_emissao': return dateToIso(row.data_emissao);
      case 'conta_bancaria': return normalizeText(row.conta_bancaria);
      case 'forma_pagamento': return normalizeText(row.forma_pagamento);
      case 'modo_emissao': return normalizeText(row.modo_emissao || row.nota_fiscal);
      case 'empresa': return normalizeText(row.empresa);
      case 'parcelas': return normalizeText(row._parcelLabel || cleanParcelReference(row.parcela_ref));
      default: return '';
    }
  }

  function sortRows(rows, sortColumn, sortDirection) {
    // Sem coluna escolhida, preserva o comportamento da tela: mais recentes primeiro.
    const direction = sortColumn ? (sortDirection === 'asc' ? 1 : -1) : -1;
    const indexedRows = rows.map((row, index) => ({ row, index }));

    indexedRows.sort((left, right) => {
      const a = sortColumn
        ? getSortValue(left.row, sortColumn)
        : dateToIso(left.row.data_pagamento || left.row.data_vencimento || left.row.data);
      const b = sortColumn
        ? getSortValue(right.row, sortColumn)
        : dateToIso(right.row.data_pagamento || right.row.data_vencimento || right.row.data);

      let comparison = 0;
      if (typeof a === 'number' && typeof b === 'number') {
        comparison = a - b;
      } else {
        comparison = String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
      }

      if (comparison === 0) return left.index - right.index;
      return comparison * direction;
    });

    return indexedRows.map(item => item.row);
  }

  function filterRows(options) {
    const settings = options || {};
    const filters = settings.filters || {};
    const referenceIso = todayIso(settings.now);
    const entradas = Array.isArray(settings.entradas) ? settings.entradas : [];
    const saidas = Array.isArray(settings.saidas) ? settings.saidas : [];
    const typeFilter = normalizeType(filters.type);
    const categoryFilter = normalizeText(filters.category);
    const statusFilter = normalizeText(filters.status).toLowerCase();
    const searchFilter = normalizeText(filters.search);
    const dateFrom = dateToIso(filters.dateFrom);
    const dateTo = dateToIso(filters.dateTo);
    const kpiFilter = normalizeText(settings.kpiFilter).toLowerCase();

    let rows = [
      ...entradas.map(row => ({ ...row, _tipo: 'entrada' })),
      ...saidas.map(row => ({ ...row, _tipo: 'saída' }))
    ];

    if (typeFilter) {
      rows = rows.filter(row => row._tipo === typeFilter);
    }

    if (categoryFilter) {
      rows = rows.filter(row => normalizeText(row.categoria) === categoryFilter);
    }

    const filterByStatus = sourceRows => {
      if (!statusFilter) return sourceRows;
      return sourceRows.filter(row => {
        const info = getStatusInfo(row, referenceIso);
        if (statusFilter === 'pago') return info.status === 'pago';
        if (statusFilter === 'vencido') return info.isOverdue;
        if (statusFilter === 'pendente') return info.status === 'pendente' && !info.isOverdue;
        if (statusFilter === 'parcial') return info.status === 'parcial';
        if (statusFilter === 'cancelado') return info.status === 'cancelado';
        return true;
      });
    };

    if (searchFilter) {
      rows = rows.filter(row => [
        row.cliente,
        row.fornecedor,
        row.observacoes,
        row.categoria
      ].some(value => normalizeText(value).includes(searchFilter)));
    }

    if (dateFrom || dateTo) {
      rows = rows.filter(row => {
        const rowDate = dateToIso(row.data_pagamento || row.data_vencimento || row.data);
        if (!rowDate) return false;
        if (dateFrom && rowDate < dateFrom) return false;
        if (dateTo && rowDate > dateTo) return false;
        return true;
      });
    }

    if (kpiFilter === 'receber') {
      rows = consolidateRows(rows.filter(row => row._tipo === 'entrada'))
        .filter(row => isOpenRow(row));
      rows = filterByStatus(rows);
    } else if (kpiFilter === 'pagar') {
      rows = consolidateRows(rows.filter(row => row._tipo === 'saída'))
        .filter(row => isOpenRow(row));
      rows = filterByStatus(rows);
    } else if (kpiFilter === 'entradas') {
      rows = filterByStatus(rows.filter(row => row._tipo === 'entrada'));
    } else if (kpiFilter === 'saidas') {
      rows = filterByStatus(rows.filter(row => row._tipo === 'saída'));
    } else {
      rows = filterByStatus(rows);
    }

    return sortRows(rows, settings.sortColumn || '', settings.sortDirection || 'desc');
  }

  function formatCurrency(value) {
    const formatted = parseMoney(value).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `R$ ${formatted}`.replace(/\u00a0/g, ' ');
  }

  function formatPeriod(filters) {
    const dateFrom = dateToIso(filters && filters.dateFrom);
    const dateTo = dateToIso(filters && filters.dateTo);
    const toBr = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';

    if (dateFrom && dateTo) return `${toBr(dateFrom)} a ${toBr(dateTo)}`;
    if (dateFrom) return `A partir de ${toBr(dateFrom)}`;
    if (dateTo) return `Até ${toBr(dateTo)}`;
    return 'Todo o histórico';
  }

  function formatFilterDescription(filters) {
    const source = filters || {};
    const details = [];
    if (source.type) details.push(`Tipo: ${cleanPdfText(source.typeLabel || source.type)}`);
    if (source.category) details.push(`Categoria: ${cleanPdfText(source.categoryLabel || source.category)}`);
    if (source.status) details.push(`Status: ${cleanPdfText(source.statusLabel || source.status)}`);
    if (source.search) details.push(`Busca: ${cleanPdfText(source.search)}`);
    return details.length ? details.join(' | ') : 'Sem filtros adicionais';
  }

  function getVariant(kpiFilter, filters) {
    const normalized = normalizeText(kpiFilter).toLowerCase();
    if (normalized === 'receber') return 'receber';
    if (normalized === 'pagar') return 'pagar';
    if (normalized === 'entradas') return 'entradas';
    if (normalized === 'saidas') return 'saidas';
    const filteredType = normalizeType(filters && filters.type);
    if (filteredType === 'entrada') return 'entradas';
    if (filteredType === 'saída') return 'saidas';
    return 'geral';
  }

  function getTitle(variant) {
    if (variant === 'receber') return 'Relatório de Contas a Receber';
    if (variant === 'pagar') return 'Relatório de Contas a Pagar';
    if (variant === 'entradas') return 'Relatório de Entradas Financeiras';
    if (variant === 'saidas') return 'Relatório de Saídas Financeiras';
    return 'Relatório de Movimentações Financeiras';
  }

  function getColumns(variant, referenceIso) {
    const valueCell = (row, sign) => `${sign || ''}${sign ? ' ' : ''}${formatCurrency(row.valor)}`;
    const person = row => row._tipo === 'entrada' ? row.cliente : row.fornecedor;

    if (variant === 'receber') {
      return [
        { key: 'tipo', header: 'TIPO', width: 14, align: 'center', value: () => 'Entrada' },
        { key: 'categoria', header: 'CATEGORIA', width: 22, align: 'center', value: row => cleanPdfText(row.categoria) },
        { key: 'cliente', header: 'CLIENTE', width: 32, align: 'left', value: row => cleanPdfText(row.cliente || row.fornecedor) },
        { key: 'status', header: 'STATUS', width: 20, align: 'center', value: row => getStatusInfo(row, referenceIso).label },
        { key: 'valor', header: 'VALOR TOTAL', width: 24, align: 'right', value: row => formatCurrency(row.valor) },
        { key: 'data_emissao', header: 'DATA EMISSÃO', width: 22, align: 'center', value: row => cleanPdfText(row.data_emissao) },
        { key: 'restante', header: 'A RECEBER', width: 24, align: 'right', value: row => formatCurrency(getRemainingValue(row)) },
        { key: 'modo_emissao', header: 'NF / PEDIDO', width: 18, align: 'center', value: row => cleanPdfText(row.modo_emissao || row.nota_fiscal) },
        { key: 'vencimento', header: 'VENCIMENTO', width: 20, align: 'center', value: row => cleanPdfText(row.data_vencimento) },
        { key: 'parcelas', header: 'PARCELAS', width: 16, align: 'center', value: row => row._parcelLabel || cleanParcelReference(row.parcela_ref) },
        { key: 'forma', header: 'FORMA DE PAGAMENTO', width: 30, align: 'center', value: row => cleanPdfText(row.forma_pagamento) },
        { key: 'observacoes', header: 'OBSERVAÇÕES', width: 32, align: 'left', value: row => cleanPdfText(row.observacoes) }
      ];
    }

    if (variant === 'pagar') {
      return [
        { key: 'tipo', header: 'TIPO', width: 14, align: 'center', value: () => 'Saída' },
        { key: 'categoria', header: 'CATEGORIA', width: 22, align: 'center', value: row => cleanPdfText(row.categoria) },
        { key: 'fornecedor', header: 'FORNECEDOR', width: 32, align: 'left', value: row => cleanPdfText(row.fornecedor || row.cliente) },
        { key: 'status', header: 'STATUS', width: 20, align: 'center', value: row => getStatusInfo(row, referenceIso).label },
        { key: 'valor', header: 'VALOR TOTAL', width: 24, align: 'right', value: row => formatCurrency(row.valor) },
        { key: 'data_emissao', header: 'DATA EMISSÃO', width: 22, align: 'center', value: row => cleanPdfText(row.data_emissao) },
        { key: 'restante', header: 'A PAGAR', width: 24, align: 'right', value: row => formatCurrency(getRemainingValue(row)) },
        { key: 'modo_emissao', header: 'NF / PEDIDO', width: 18, align: 'center', value: row => cleanPdfText(row.modo_emissao || row.nota_fiscal) },
        { key: 'vencimento', header: 'VENCIMENTO', width: 20, align: 'center', value: row => cleanPdfText(row.data_vencimento) },
        { key: 'parcelas', header: 'PARCELAS', width: 16, align: 'center', value: row => row._parcelLabel || cleanParcelReference(row.parcela_ref) },
        { key: 'forma', header: 'FORMA DE PAGAMENTO', width: 30, align: 'center', value: row => cleanPdfText(row.forma_pagamento) },
        { key: 'observacoes', header: 'OBSERVAÇÕES', width: 32, align: 'left', value: row => cleanPdfText(row.observacoes) }
      ];
    }

    const isEntradasVariant = variant === 'entradas';
    const isSaidasVariant = variant === 'saidas';
    const personHeader = isEntradasVariant ? 'CLIENTE' : (isSaidasVariant ? 'FORNECEDOR' : 'FORNECEDOR/CLIENTE');

    return [
      { key: 'tipo', header: 'TIPO', width: 14, align: 'center', value: row => row._tipo === 'entrada' ? 'Entrada' : 'Saída' },
      { key: 'categoria', header: 'CATEGORIA', width: 20, align: 'center', value: row => cleanPdfText(row.categoria) },
      { key: 'pessoa', header: personHeader, width: 28, align: 'left', value: row => cleanPdfText(person(row)) },
      { key: 'valor', header: 'VALOR', width: 20, align: 'right', value: row => valueCell(row, row._tipo === 'entrada' ? '+' : '-') },
      { key: 'modo_emissao', header: 'NF / PEDIDO', width: 16, align: 'center', value: row => cleanPdfText(row.modo_emissao || row.nota_fiscal) },
      { key: 'empresa', header: 'EMPRESA', width: 15, align: 'center', value: row => cleanPdfText(row.empresa, 'DAC') },
      { key: 'data_emissao', header: 'DATA EMISSÃO', width: 18, align: 'center', value: row => cleanPdfText(row.data_emissao) },
      { key: 'status', header: 'STATUS', width: 18, align: 'center', value: row => getStatusInfo(row, referenceIso).label },
      { key: 'vencimento', header: 'VENCIMENTO', width: 18, align: 'center', value: row => cleanPdfText(row.data_vencimento) },
      { key: 'conta', header: 'CONTA BANCÁRIA', width: 22, align: 'center', value: row => cleanPdfText(row.conta_bancaria) },
      { key: 'valor_pago', header: 'VALOR PAGO', width: 20, align: 'right', value: row => formatCurrency(row.valor_pago) },
      { key: 'parcelas', header: 'PARCELAS', width: 14, align: 'center', value: row => row._parcelLabel || cleanParcelReference(row.parcela_ref) },
      { key: 'forma', header: 'FORMA DE PAGAMENTO', width: 24, align: 'center', value: row => cleanPdfText(row.forma_pagamento) },
      { key: 'pagamento', header: 'PAGAMENTO', width: 18, align: 'center', value: row => cleanPdfText(row.data_pagamento) },
      { key: 'observacoes', header: 'OBSERVAÇÕES', width: 26, align: 'left', value: row => cleanPdfText(row.observacoes) }
    ];
  }

  function getSummary(rows, variant, referenceIso) {
    if (variant === 'receber' || variant === 'pagar') {
      const total = rows.reduce((sum, row) => sum + getRemainingValue(row), 0);
      const overdue = rows
        .filter(row => getStatusInfo(row, referenceIso).isOverdue)
        .reduce((sum, row) => sum + getRemainingValue(row), 0);
      const future = Math.max(0, total - overdue);
      const noun = variant === 'receber' ? 'A RECEBER' : 'A PAGAR';
      return [
        { label: 'QUANTIDADE', value: `${rows.length} lançamento(s)`, color: COLORS.slate },
        { label: `TOTAL ${noun}`, value: formatCurrency(total), color: variant === 'receber' ? COLORS.green : COLORS.red },
        { label: 'VALORES ATRASADOS', value: formatCurrency(overdue), color: COLORS.red },
        { label: 'VALORES NÃO VENCIDOS', value: formatCurrency(future), color: COLORS.amber }
      ];
    }

    const totalEntries = rows
      .filter(row => row._tipo === 'entrada')
      .reduce((sum, row) => sum + getEffectiveValue(row), 0);
    const totalExits = rows
      .filter(row => row._tipo === 'saída')
      .reduce((sum, row) => sum + getEffectiveValue(row), 0);
    const balance = totalEntries - totalExits;
    return [
      { label: 'QUANTIDADE', value: `${rows.length} lançamento(s)`, color: COLORS.slate },
      { label: 'ENTRADAS EFETIVAS', value: formatCurrency(totalEntries), color: COLORS.green },
      { label: 'SAÍDAS EFETIVAS', value: formatCurrency(totalExits), color: COLORS.red },
      { label: 'SALDO EFETIVO', value: formatCurrency(balance), color: balance >= 0 ? COLORS.green : COLORS.red }
    ];
  }

  function createStableFileId(value) {
    const text = String(value || 'DAC Financial Report');
    const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
    return seeds.map(seed => {
      let hash = seed >>> 0;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, '0');
    }).join('').toUpperCase();
  }

  function createModel(options) {
    const settings = options || {};
    const requestedNow = settings.now instanceof Date
      ? settings.now
      : new Date(settings.now === undefined ? Date.now() : settings.now);
    const now = Number.isNaN(requestedNow.getTime()) ? new Date() : requestedNow;
    const filters = settings.filters || {};
    const variant = getVariant(settings.kpiFilter, filters);
    const referenceIso = todayIso(now);
    const rows = filterRows({
      entradas: settings.entradas,
      saidas: settings.saidas,
      filters,
      kpiFilter: settings.kpiFilter,
      sortColumn: settings.sortColumn,
      sortDirection: settings.sortDirection,
      now
    });
    const title = getTitle(variant);
    const filenameTitle = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return {
      variant,
      title,
      filename: `${filenameTitle}_${referenceIso}.pdf`,
      rows,
      columns: getColumns(variant, referenceIso),
      summary: getSummary(rows, variant, referenceIso),
      period: formatPeriod(filters),
      filterDescription: formatFilterDescription(filters),
      emittedAt: formatEmissionDate(now),
      createdAtIso: now.toISOString(),
      referenceIso
    };
  }

  function drawCenteredLogo(doc, logoDataUrl, pageWidth) {
    if (!logoDataUrl || !/^data:image\/(png|jpe?g);base64,/i.test(logoDataUrl)) return;

    try {
      const properties = doc.getImageProperties(logoDataUrl);
      const maxWidth = 31;
      const maxHeight = 9;
      const ratio = properties.width / properties.height;
      let width = maxWidth;
      let height = width / ratio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
      doc.addImage(logoDataUrl, properties.fileType || 'PNG', (pageWidth - width) / 2, 5, width, height, undefined, 'FAST');
    } catch (error) {
      // A ausência da logo não pode impedir a emissão do relatório.
    }
  }

  function fitSingleLine(doc, value, maxWidth) {
    const text = cleanPdfText(value);
    if (doc.getTextWidth(text) <= maxWidth) return text;

    const suffix = '...';
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const candidate = `${text.slice(0, middle).trimEnd()}${suffix}`;
      if (doc.getTextWidth(candidate) <= maxWidth) low = middle;
      else high = middle - 1;
    }
    return `${text.slice(0, low).trimEnd()}${suffix}`;
  }

  function drawHeader(doc, model, logoDataUrl, includeSummary) {
    const pageWidth = doc.internal.pageSize.getWidth();
    drawCenteredLogo(doc, logoDataUrl, pageWidth);

    doc.setTextColor(...COLORS.slate);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(cleanPdfText(model.title), pageWidth / 2, 17.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.muted);
    doc.setFontSize(6.4);
    doc.text(`Emissão: ${model.emittedAt} | Período: ${model.period}`, pageWidth / 2, 22, { align: 'center' });
    doc.text(fitSingleLine(doc, model.filterDescription, pageWidth - 20), pageWidth / 2, 25.8, { align: 'center' });

    doc.setDrawColor(...COLORS.red);
    doc.setLineWidth(0.8);
    doc.line(9, 29, pageWidth - 9, 29);

    if (!includeSummary) return;

    const margin = 9;
    const gap = 2;
    const availableWidth = pageWidth - (margin * 2);
    const cardWidth = (availableWidth - (gap * 3)) / 4;
    const top = 32;
    const height = 13;

    model.summary.forEach((item, index) => {
      const x = margin + index * (cardWidth + gap);
      doc.setFillColor(...COLORS.light);
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.25);
      doc.roundedRect(x, top, cardWidth, height, 1.2, 1.2, 'FD');
      doc.setFillColor(...COLORS.red);
      doc.rect(x, top, 1.3, height, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.muted);
      doc.setFontSize(5.4);
      doc.text(cleanPdfText(item.label), x + 4, top + 4.3);

      doc.setTextColor(...item.color);
      doc.setFontSize(8.2);
      doc.text(cleanPdfText(item.value), x + 4, top + 9.6, { maxWidth: cardWidth - 6 });
    });
  }

  function drawFooter(doc, pageNumber) {
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.25);
    doc.line(9, height - 8.5, width - 9, height - 8.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(...COLORS.muted);
    doc.text('DAC Hospitalar - Gestão Financeira', 9, height - 4.8);
    doc.text(`Página ${pageNumber} de ${TOTAL_PAGES_TOKEN}`, width - 9, height - 4.8, { align: 'right' });
  }

  function generatePdf(model, dependencies) {
    const deps = dependencies || {};
    const JsPdf = deps.jsPDF || (typeof globalThis !== 'undefined' && globalThis.jspdf && globalThis.jspdf.jsPDF);

    if (typeof JsPdf !== 'function') {
      throw new Error('Biblioteca jsPDF não disponível. Recarregue a página e tente novamente.');
    }

    const doc = new JsPdf({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true,
      putOnlyUsedFonts: true,
      precision: 2
    });

    doc.setProperties({
      title: cleanPdfText(model.title),
      subject: 'Relatório financeiro da DAC Hospitalar',
      author: 'DAC Hospitalar',
      creator: 'DAC Dashboard'
    });
    if (model.createdAtIso && typeof doc.setCreationDate === 'function') {
      doc.setCreationDate(new Date(model.createdAtIso));
    }
    if (typeof doc.setFileId === 'function') {
      doc.setFileId(createStableFileId(JSON.stringify({
        title: model.title,
        emittedAt: model.emittedAt,
        filters: model.filterDescription,
        rows: model.rows
      })));
    }

    const runAutoTable = typeof deps.autoTable === 'function'
      ? deps.autoTable
      : (targetDoc, options) => {
          if (typeof targetDoc.autoTable !== 'function') {
            throw new Error('Plugin de tabelas do PDF não disponível. Recarregue a página e tente novamente.');
          }
          targetDoc.autoTable(options);
        };

    const head = [model.columns.map(column => column.header)];
    const body = model.rows.map(row => model.columns.map(column => cleanPdfText(column.value(row))));
    const columnStyles = {};
    const tableFontSize = model.variant === 'geral' || model.variant === 'entradas' || model.variant === 'saidas' ? 5.5 : 6.2;
    model.columns.forEach((column, index) => {
      columnStyles[index] = {
        cellWidth: column.width,
        halign: column.align || 'center'
      };
    });

    runAutoTable(doc, {
      head,
      body,
      startY: 48.5,
      margin: { top: 32, right: 9, bottom: 12, left: 9 },
      tableWidth: 279,
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: tableFontSize,
        cellPadding: { top: 1.8, right: 1.2, bottom: 1.8, left: 1.2 },
        overflow: 'ellipsize',
        valign: 'middle',
        textColor: COLORS.slate,
        lineColor: COLORS.border,
        lineWidth: 0.15,
        minCellHeight: 5.5
      },
      headStyles: {
        fillColor: COLORS.red,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: model.variant === 'geral' || model.variant === 'entradas' || model.variant === 'saidas' ? 5.2 : 5.8,
        halign: 'center',
        valign: 'middle',
        lineColor: COLORS.darkRed,
        lineWidth: 0.2,
        cellPadding: { top: 2.1, right: 0.8, bottom: 2.1, left: 0.8 }
      },
      alternateRowStyles: { fillColor: COLORS.stripe },
      columnStyles,
      didDrawPage: data => {
        drawHeader(doc, model, deps.logoDataUrl, data.pageNumber === 1);
        drawFooter(doc, data.pageNumber);
      },
      didParseCell: data => {
        if (data.section !== 'body') return;
        const row = model.rows[data.row.index];
        const column = model.columns[data.column.index];
        if (!row || !column) return;

        const isMoneyColumn = column.key === 'valor'
          || column.key === 'restante'
          || column.key === 'valor_pago';
        if (isMoneyColumn) {
          const cellText = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text || '');
          const availableWidth = Math.max(1, column.width - 2.4);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(tableFontSize);
          const measuredWidth = doc.getTextWidth(cellText);
          if (measuredWidth > availableWidth) {
            data.cell.styles.fontSize = Math.max(4, tableFontSize * (availableWidth / measuredWidth));
          }
          data.cell.styles.overflow = 'linebreak';
        }

        if (column.key === 'tipo') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = row._tipo === 'entrada' ? COLORS.green : COLORS.red;
        } else if (column.key === 'valor' || column.key === 'restante') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = row._tipo === 'entrada' ? COLORS.green : COLORS.red;
        } else if (column.key === 'valor_pago') {
          data.cell.styles.fontStyle = 'bold';
        } else if (column.key === 'status') {
          const status = getStatusInfo(row, model.referenceIso);
          data.cell.styles.fontStyle = 'bold';
          if (status.isOverdue || status.status === 'cancelado') data.cell.styles.textColor = COLORS.red;
          else if (status.status === 'pago') data.cell.styles.textColor = COLORS.green;
          else if (status.status === 'parcial') data.cell.styles.textColor = COLORS.amber;
        }
      }
    });

    if (typeof doc.putTotalPages === 'function') {
      doc.putTotalPages(TOTAL_PAGES_TOKEN);
    }

    const blob = doc.output('blob');
    if (!blob || blob.size < 1000) {
      throw new Error('O PDF gerado ficou vazio. Recarregue a página e tente novamente.');
    }

    return { doc, blob, filename: model.filename, model };
  }

  return {
    REPORT_TIME_ZONE,
    cleanParcelReference,
    cleanPdfText,
    consolidateRows,
    createModel,
    dateToIso,
    filterRows,
    formatCurrency,
    generatePdf,
    getEffectiveValue,
    getRemainingValue,
    getStatusInfo,
    normalizeText,
    parseMoney,
    sortRows,
    todayIso
  };
});
