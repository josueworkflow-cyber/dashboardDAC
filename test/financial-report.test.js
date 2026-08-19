'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { jsPDF } = require('jspdf');
const { autoTable } = require('jspdf-autotable');
const report = require('../public/js/financial-report-pdf');

const FIXED_NOW = new Date('2026-08-06T15:00:00.000Z');

function entry(overrides = {}) {
  return {
    categoria: 'Produtos Hospitalares',
    observacoes: 'Venda de materiais',
    cliente: 'Hospital São José',
    valor: '1.234,56',
    valor_pago: '0',
    status: 'Pendente',
    data_vencimento: '10/08/2026',
    conta_bancaria: 'Banco do Brasil',
    forma_pagamento: 'Boleto',
    modo_emissao: 'Nota fiscal',
    parcela_ref: '',
    ...overrides
  };
}

function exit(overrides = {}) {
  return {
    categoria: 'Fornecedores',
    observacoes: 'Compra de materiais',
    fornecedor: 'Distribuidora Médica',
    valor: '950,00',
    valor_pago: '0',
    status: 'Pendente',
    data_vencimento: '12/08/2026',
    conta_bancaria: 'Itaú',
    forma_pagamento: 'PIX',
    modo_emissao: 'Recibo',
    parcela_ref: '',
    ...overrides
  };
}

function serializableModel(model) {
  return {
    variant: model.variant,
    title: model.title,
    filename: model.filename,
    rows: model.rows,
    columns: model.columns.map(({ key, header, width, align }) => ({ key, header, width, align })),
    summary: model.summary,
    period: model.period,
    filterDescription: model.filterDescription,
    emittedAt: model.emittedAt,
    referenceIso: model.referenceIso
  };
}

test('parseMoney aceita números e formatos monetários BR/US', () => {
  assert.equal(report.parseMoney(1234.56), 1234.56);
  assert.equal(report.parseMoney('R$ 1.234,56'), 1234.56);
  assert.equal(report.parseMoney('1,234.56'), 1234.56);
  assert.equal(report.parseMoney('(2.500,10)'), -2500.10);
  assert.equal(report.parseMoney('1.234'), 1234);
  assert.equal(report.parseMoney('inválido'), 0);
});

test('valor efetivo usa o pagamento real mesmo quando supera o valor original', () => {
  const overpaid = entry({ valor: '100,00', valor_pago: '130,00', status: 'Pago' });
  const legacyPaid = entry({ valor: '100,00', valor_pago: '0', status: 'Pago' });

  assert.equal(report.getEffectiveValue(overpaid), 130);
  assert.equal(report.getEffectiveValue(legacyPaid), 100);

  const [group] = report.consolidateRows([
    entry({ valor: '60,00', valor_pago: '75,00', status: 'Pago', parcela_ref: '1/2 [PRC-OVERPAID]' }),
    entry({ valor: '40,00', valor_pago: '55,00', status: 'Pago', parcela_ref: '2/2 [PRC-OVERPAID]' })
  ]);
  assert.equal(group.valor, 100);
  assert.equal(group.valor_pago, 130);
  assert.equal(group.status, 'Pago');
  assert.equal(report.getEffectiveValue(group), 130);
});

test('saldo em aberto considera somente itens realmente pendentes', () => {
  assert.equal(report.getRemainingValue(entry({ valor: '100,00', valor_pago: '0', status: 'Pago' })), 0);
  assert.equal(report.getRemainingValue(entry({ valor: '100,00', valor_pago: '130,00', status: 'Pago' })), 0);
  assert.equal(report.getRemainingValue(entry({ valor: '100,00', valor_pago: '0', status: 'Cancelado' })), 0);

  const [group] = report.consolidateRows([
    entry({ valor: '100,00', valor_pago: '130,00', status: 'Pago', parcela_ref: '1/2 [PRC-CREDITO]' }),
    entry({ valor: '100,00', valor_pago: '0', status: 'Pendente', parcela_ref: '2/2 [PRC-CREDITO]' })
  ]);
  assert.equal(report.getRemainingValue(group), 100);
  assert.equal(group.status, 'Parcial');
});

test('filtros de busca, tipo, categoria, período e status usam uma única regra', () => {
  const rows = report.filterRows({
    entradas: [
      entry({ cliente: 'Hospital São José', data_vencimento: '05/08/2026' }),
      entry({ cliente: 'Clínica Central', data_vencimento: '10/08/2026' })
    ],
    saidas: [exit({ fornecedor: 'São José Distribuidora', data_vencimento: '05/08/2026' })],
    filters: {
      type: 'entrada',
      category: 'PRODUTOS HOSPITALARES',
      status: 'vencido',
      search: 'sao jose',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-06'
    },
    now: FIXED_NOW
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]._tipo, 'entrada');
  assert.equal(rows[0].cliente, 'Hospital São José');
});

test('busca por nota fiscal encontra registros por modo_emissao, nota_fiscal e nf', () => {
  const entradas = [
    entry({ cliente: 'Hospital A', modo_emissao: 'NF 54321' }),
    entry({ cliente: 'Hospital B', modo_emissao: 'Pedido 100' }),
    entry({ cliente: 'Hospital C', nota_fiscal: '98765' })
  ];
  const saidas = [
    exit({ fornecedor: 'Fornecedor X', modo_emissao: 'NF 54321-S' }),
    exit({ fornecedor: 'Fornecedor Y', nf: '77889' })
  ];

  // Busca por número da NF
  const matchNum = report.filterRows({ entradas, saidas, filters: { search: '54321' }, now: FIXED_NOW });
  assert.equal(matchNum.length, 2);
  assert.deepEqual(matchNum.map(r => r.cliente || r.fornecedor), ['Fornecedor X', 'Hospital A']);

  // Busca por texto da nota fiscal com prefixo
  const matchPrefix = report.filterRows({ entradas, saidas, filters: { search: 'nf 54321' }, now: FIXED_NOW });
  assert.equal(matchPrefix.length, 2);

  // Busca por campo nota_fiscal direto
  const matchNfField = report.filterRows({ entradas, saidas, filters: { search: '98765' }, now: FIXED_NOW });
  assert.equal(matchNfField.length, 1);
  assert.equal(matchNfField[0].cliente, 'Hospital C');

  // Busca por campo nf legado
  const matchNfShort = report.filterRows({ entradas, saidas, filters: { search: '77889' }, now: FIXED_NOW });
  assert.equal(matchNfShort.length, 1);
  assert.equal(matchNfShort[0].fornecedor, 'Fornecedor Y');
});

test('vencimento usa a data de São Paulo e não marca o próprio dia como atrasado', () => {
  const overdue = report.getStatusInfo(entry({ data_vencimento: '05/08/2026' }), FIXED_NOW);
  const dueToday = report.getStatusInfo(entry({ data_vencimento: '06/08/2026' }), FIXED_NOW);
  assert.equal(overdue.isOverdue, true);
  assert.equal(overdue.label, 'Vencido');
  assert.equal(dueToday.isOverdue, false);
  assert.equal(dueToday.label, 'Pendente');
  assert.equal(report.todayIso(FIXED_NOW), '2026-08-06');
});

test('consolidação de parcelas respeita o período filtrado', () => {
  const parcelas = [
    entry({ valor: '100,00', data_vencimento: '01/08/2026', parcela_ref: '1/3 [PRC-ABC]' }),
    entry({ valor: '200,00', valor_pago: '50,00', status: 'Parcial', data_vencimento: '15/08/2026', parcela_ref: '2/3 [PRC-ABC]' }),
    entry({ valor: '300,00', data_vencimento: '15/09/2026', parcela_ref: '3/3 [PRC-ABC]' })
  ];

  const rows = report.filterRows({
    entradas: parcelas,
    saidas: [],
    filters: { dateFrom: '2026-08-01', dateTo: '2026-08-31' },
    consolidateAll: true,
    kpiFilter: 'receber',
    now: FIXED_NOW
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]._consolidatedCount, 2);
  assert.equal(rows[0].valor, 300);
  assert.equal(rows[0].valor_pago, 50);
  assert.equal(rows[0].status, 'Parcial');
  assert.equal(report.getRemainingValue(rows[0]), 250);
});

test('consolidação preserva parcelas pagas do período e identifica o agrupamento', () => {
  const parcelas = [
    entry({ valor: '100,00', valor_pago: '100,00', status: 'Pago', data_vencimento: '01/08/2026', parcela_ref: '1/3 [PRC-HIST]' }),
    entry({ valor: '100,00', status: 'Pendente', data_vencimento: '10/08/2026', parcela_ref: '2/3 [PRC-HIST]' }),
    entry({ valor: '100,00', status: 'Pendente', data_vencimento: '20/08/2026', parcela_ref: '3/3 [PRC-HIST]' })
  ];

  const rows = report.filterRows({
    entradas: parcelas,
    saidas: [],
    filters: { dateFrom: '2026-08-01', dateTo: '2026-08-31' },
    consolidateAll: true,
    kpiFilter: 'receber',
    now: FIXED_NOW
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].valor, 300);
  assert.equal(rows[0].valor_pago, 100);
  assert.equal(rows[0].status, 'Parcial');
  assert.match(rows[0].parcela_ref, /\[PRC-HIST\]/);
  assert.equal(rows[0]._parcelGroupId, 'PRC-HIST');
  assert.equal(rows[0]._parcelLabel, '1/3');
  assert.equal(rows[0]._consolidatedCount, 3);
  assert.equal(rows[0]._consolidatedOpenCount, 2);
  assert.equal(report.getRemainingValue(rows[0]), 200);
});

test('visões de tela exibem somente o lançamento principal de grupos parcelados', () => {
  const parcelas = Array.from({ length: 5 }, (_, index) => entry({
    cliente: 'Cliente Parcelado',
    valor: '100,00',
    valor_pago: index === 0 ? '100,00' : '0',
    status: index === 0 ? 'Pago' : 'Pendente',
    data_pagamento: index === 0 ? '02/08/2026' : '',
    data_vencimento: `${String(5 + index).padStart(2, '0')}/08/2026`,
    parcela_ref: `${index + 1}/5 [PRC-TELA]`
  }));
  const commonOptions = {
    entradas: [...parcelas, entry({ cliente: 'Cliente Avulso', valor: '50,00' })],
    saidas: [],
    filters: {},
    consolidateAll: true,
    now: FIXED_NOW
  };
  const rows = report.filterRows(commonOptions);
  const group = rows.find(row => row._parcelGroupId === 'PRC-TELA');

  assert.equal(rows.length, 2);
  assert.equal(group.valor, 500);
  assert.equal(group.valor_pago, 100);
  assert.equal(group.status, 'Parcial');
  assert.equal(group.num_parcelas, 5);
  assert.equal(group._parcelLabel, '1/5');
  assert.equal(group.data_pagamento, '02/08/2026');
  assert.equal(report.getRemainingValue(group), 400);

  const partialRows = report.filterRows({
    ...commonOptions,
    filters: { status: 'parcial' }
  });
  assert.equal(partialRows.length, 1);
  assert.equal(partialRows[0]._parcelGroupId, 'PRC-TELA');
});

test('contas a receber separam parcelas vencidas das parcelas futuras do mesmo grupo', () => {
  const parcelas = [
    entry({ valor: '100,00', valor_pago: '100,00', status: 'Pago', data_vencimento: '01/08/2026', parcela_ref: '1/3 [PRC-PRAZO]' }),
    entry({ valor: '100,00', status: 'Pendente', data_vencimento: '05/08/2026', parcela_ref: '2/3 [PRC-PRAZO]' }),
    entry({ valor: '100,00', status: 'Pendente', data_vencimento: '20/08/2026', parcela_ref: '3/3 [PRC-PRAZO]' })
  ];
  const model = report.createModel({ entradas: parcelas, saidas: [], filters: {}, kpiFilter: 'receber', now: FIXED_NOW });
  const summary = Object.fromEntries(model.summary.map(item => [item.label, item.value]));

  assert.equal(model.rows.length, 2);
  assert.equal(summary['TOTAL A RECEBER'], 'R$ 200,00');
  assert.equal(summary['VALORES ATRASADOS'], 'R$ 100,00');
  assert.equal(summary['VALORES NÃO VENCIDOS'], 'R$ 100,00');
});

test('filtro Vencido em Receber inclui somente o saldo das parcelas vencidas', () => {
  const parcelas = [
    entry({ valor: '100,00', status: 'Pendente', data_vencimento: '05/08/2026', parcela_ref: '1/2 [PRC-VENCIDO]' }),
    entry({ valor: '100,00', status: 'Pendente', data_vencimento: '20/08/2026', parcela_ref: '2/2 [PRC-VENCIDO]' })
  ];
  const model = report.createModel({
    entradas: parcelas,
    saidas: [],
    filters: { status: 'vencido' },
    kpiFilter: 'receber',
    now: FIXED_NOW
  });
  const summary = Object.fromEntries(model.summary.map(item => [item.label, item.value]));

  assert.equal(model.rows.length, 1);
  assert.equal(report.getRemainingValue(model.rows[0]), 100);
  assert.equal(summary['TOTAL A RECEBER'], 'R$ 100,00');
  assert.equal(summary['VALORES ATRASADOS'], 'R$ 100,00');
  assert.equal(summary['VALORES NÃO VENCIDOS'], 'R$ 0,00');
});

test('período de Receber usa vencimento mesmo quando há pagamento parcial antigo', () => {
  const rows = report.filterRows({
    entradas: [entry({
      valor: '300,00',
      valor_pago: '100,00',
      status: 'Parcial',
      data_pagamento: '01/08/2026',
      data_vencimento: '20/08/2026'
    })],
    saidas: [],
    filters: { dateFrom: '2026-08-15', dateTo: '2026-08-31' },
    kpiFilter: 'receber',
    now: FIXED_NOW
  });

  assert.equal(rows.length, 1);
  assert.equal(report.getRemainingValue(rows[0]), 200);
});

test('ordenação monetária interpreta valores brasileiros corretamente', () => {
  const rows = report.filterRows({
    entradas: [
      entry({ cliente: 'Menor', valor: '950,00' }),
      entry({ cliente: 'Maior', valor: '1.234,56' })
    ],
    saidas: [],
    filters: {},
    sortColumn: 'valor',
    sortDirection: 'desc',
    now: FIXED_NOW
  });

  assert.deepEqual(rows.map(row => row.cliente), ['Maior', 'Menor']);
});

test('sem coluna selecionada, a ordenação padrão mantém os lançamentos mais recentes primeiro', () => {
  const rows = report.filterRows({
    entradas: [
      entry({ cliente: 'Antigo', data_vencimento: '01/08/2026' }),
      entry({ cliente: 'Recente', data_vencimento: '20/08/2026' })
    ],
    saidas: [],
    filters: {},
    sortColumn: '',
    sortDirection: 'asc',
    now: FIXED_NOW
  });

  assert.deepEqual(rows.map(row => row.cliente), ['Recente', 'Antigo']);
});

test('modelos geral, receber, pagar, entradas e saídas têm títulos e colunas corretos', () => {
  const data = {
    entradas: [entry()],
    saidas: [exit()],
    filters: {},
    now: FIXED_NOW
  };

  const general = report.createModel(data);
  const receivable = report.createModel({ ...data, kpiFilter: 'receber' });
  const payable = report.createModel({ ...data, kpiFilter: 'pagar' });
  const entries = report.createModel({ ...data, kpiFilter: 'entradas' });
  const exits = report.createModel({ ...data, kpiFilter: 'saidas' });
  const entriesByType = report.createModel({ ...data, filters: { type: 'entrada' } });
  const exitsByType = report.createModel({ ...data, filters: { type: 'saida' } });

  assert.equal(general.columns.length, 15);
  assert.equal(receivable.columns.length, 6);
  assert.equal(payable.columns.length, 6);
  assert.deepEqual(receivable.columns.map(column => column.key), [
    'cliente', 'modo_emissao', 'parcelas', 'vencimento', 'valor', 'observacoes'
  ]);
  assert.deepEqual(payable.columns.map(column => column.key), [
    'fornecedor', 'modo_emissao', 'parcelas', 'vencimento', 'valor', 'observacoes'
  ]);
  assert.equal(receivable.title, 'Relatório de Contas a Receber');
  assert.equal(payable.title, 'Relatório de Contas a Pagar');
  assert.equal(entries.title, 'Relatório de Entradas Financeiras');
  assert.equal(exits.title, 'Relatório de Saídas Financeiras');
  assert.equal(entries.rows.length, 1);
  assert.equal(exits.rows.length, 1);
  assert.equal(entriesByType.variant, 'entradas');
  assert.equal(exitsByType.variant, 'saidas');

  const emissionColumn = general.columns.find(column => column.key === 'modo_emissao');
  assert.equal(emissionColumn.value(general.rows.find(row => row._tipo === 'saída')), 'Recibo');
});

test('relatórios de Entradas e Saídas usam KPIs próprios e mostram pagamento legado efetivo', () => {
  const entries = report.createModel({
    entradas: [
      entry({ valor: '100,00', valor_pago: '0', status: 'Pago' }),
      entry({ valor: '200,00', valor_pago: '0', status: 'Pendente' }),
      entry({ valor: '500,00', valor_pago: '0', status: 'Cancelado' })
    ],
    saidas: [],
    filters: {},
    kpiFilter: 'entradas',
    now: FIXED_NOW
  });
  const exits = report.createModel({
    entradas: [],
    saidas: [
      exit({ valor: '80,00', valor_pago: '95,00', status: 'Pago' }),
      exit({ valor: '120,00', status: 'Pendente' })
    ],
    filters: {},
    kpiFilter: 'saidas',
    now: FIXED_NOW
  });
  const entrySummary = Object.fromEntries(entries.summary.map(item => [item.label, item.value]));
  const exitSummary = Object.fromEntries(exits.summary.map(item => [item.label, item.value]));
  const paidColumn = entries.columns.find(column => column.key === 'valor_pago');

  assert.deepEqual(entrySummary, {
    QUANTIDADE: '3 lançamento(s)',
    'VALOR ATIVO': 'R$ 300,00',
    'ENTRADAS EFETIVAS': 'R$ 100,00',
    'A RECEBER': 'R$ 200,00'
  });
  assert.deepEqual(exitSummary, {
    QUANTIDADE: '2 lançamento(s)',
    'VALOR ATIVO': 'R$ 200,00',
    'SAÍDAS EFETIVAS': 'R$ 95,00',
    'A PAGAR': 'R$ 120,00'
  });
  assert.equal(paidColumn.value(entries.rows[0]), 'R$ 100,00');
});

test('o modelo é independente de metadados de viewport mobile ou desktop', () => {
  const common = {
    entradas: [entry(), entry({ cliente: 'Clínica Norte', valor: '500,00' })],
    saidas: [exit()],
    filters: {
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      status: 'pendente',
      statusLabel: 'Pendente'
    },
    sortColumn: 'valor',
    sortDirection: 'desc',
    now: FIXED_NOW
  };

  const desktop = report.createModel({ ...common, viewport: { width: 1440, height: 900 }, device: 'desktop' });
  const mobile = report.createModel({ ...common, viewport: { width: 390, height: 844 }, device: 'mobile' });

  assert.deepEqual(serializableModel(mobile), serializableModel(desktop));
});

test('gerador cria PDF A4 paisagem multipágina sem canvas ou DOM', () => {
  const entradas = Array.from({ length: 140 }, (_, index) => entry({
    cliente: `Hospital ${index + 1}`,
    observacoes: `Lançamento de teste ${index + 1}`,
    data_vencimento: `${String((index % 28) + 1).padStart(2, '0')}/08/2026`,
    parcela_ref: `${index + 1}/140`
  }));
  const model = report.createModel({ entradas, saidas: [], filters: {}, now: FIXED_NOW });
  const result = report.generatePdf(model, { jsPDF, autoTable });

  assert.ok(result.blob.size > 5000);
  assert.ok(result.doc.getNumberOfPages() > 1);
  assert.ok(Math.abs(result.doc.internal.pageSize.getWidth() - 297) < 0.2);
  assert.ok(Math.abs(result.doc.internal.pageSize.getHeight() - 210) < 0.2);
  assert.match(result.filename, /^Relatorio_de_Movimentacoes_Financeiras_2026-08-06\.pdf$/);
});

test('gerador limita relatórios extensos a no máximo 15 páginas', () => {
  const entradas = Array.from({ length: 2000 }, (_, index) => entry({
    cliente: `Hospital ${index + 1}`,
    observacoes: `Lançamento ${index + 1}`,
    data_vencimento: `${String((index % 28) + 1).padStart(2, '0')}/08/2026`
  }));
  const model = report.createModel({ entradas, saidas: [], filters: {}, now: FIXED_NOW });
  const result = report.generatePdf(model, { jsPDF, autoTable });

  assert.equal(model.rows.length, 2000);
  assert.ok(result.doc.getNumberOfPages() <= 15);
  assert.equal(result.reportLimit.isLimited, true);
  assert.equal(result.reportLimit.totalRows, 2000);
  assert.equal(result.reportLimit.displayedRows, report.MAX_REPORT_ROWS);
});

test('todas as variações executam o gerador vetorial', () => {
  const data = {
    entradas: [entry()],
    saidas: [exit()],
    filters: {},
    now: FIXED_NOW
  };

  for (const kpiFilter of [null, 'receber', 'pagar', 'entradas', 'saidas']) {
    const model = report.createModel({ ...data, kpiFilter });
    const result = report.generatePdf(model, { jsPDF, autoTable });
    assert.ok(result.blob.size > 1000, `PDF inválido para ${kpiFilter || 'geral'}`);
    assert.equal(result.doc.getNumberOfPages(), 1);
  }
});

test('valores monetários altos são preservados sem reticências', () => {
  const model = report.createModel({
    entradas: [entry({ valor: '1.234.567.890,12', status: 'Pago' })],
    saidas: [],
    filters: {},
    now: FIXED_NOW
  });
  const result = report.generatePdf(model, { jsPDF, autoTable });
  const valueColumn = model.columns.findIndex(column => column.key === 'valor');
  const cell = result.doc.lastAutoTable.body[0].cells[valueColumn];

  assert.equal(cell.text.join(' '), '+ R$ 1.234.567.890,12');
  assert.ok(cell.styles.fontSize < 5.5);
  assert.ok(cell.styles.fontSize >= 4);
});

test('busca muito longa permanece em uma única linha no cabeçalho', () => {
  const model = report.createModel({
    entradas: [entry()],
    saidas: [],
    filters: { search: 'x'.repeat(1500) },
    now: FIXED_NOW
  });
  const result = report.generatePdf(model, { jsPDF, autoTable });
  const firstPageCommands = result.doc.internal.pages[1].join('\n');

  assert.ok(model.filterDescription.length > 1400);
  assert.equal(firstPageCommands.includes(model.filterDescription), false);
  assert.match(firstPageCommands, /Busca: x+\.\.\./);
});

test('o mesmo modelo produz exatamente os mesmos bytes de PDF', () => {
  const model = report.createModel({
    entradas: [entry()],
    saidas: [exit()],
    filters: { dateFrom: '2026-08-01', dateTo: '2026-08-31' },
    now: FIXED_NOW
  });
  const first = report.generatePdf(model, { jsPDF, autoTable }).doc.output('arraybuffer');
  const second = report.generatePdf(model, { jsPDF, autoTable }).doc.output('arraybuffer');
  const digest = value => createHash('sha256').update(Buffer.from(value)).digest('hex');

  assert.equal(digest(first), digest(second));
});

test('relatório sem lançamentos continua sendo um PDF válido e informativo', () => {
  const model = report.createModel({ entradas: [], saidas: [], filters: {}, now: FIXED_NOW });
  const result = report.generatePdf(model, { jsPDF, autoTable });

  assert.equal(model.rows.length, 0);
  assert.equal(model.summary[0].value, '0 lançamento(s)');
  assert.equal(result.doc.getNumberOfPages(), 1);
  assert.ok(result.blob.size > 1000);
});

test('movimentações financeiras renderizam parcela por parcela e respeitam filtro de datas', () => {
  const parcelas = [
    entry({ cliente: 'Cliente 5x', valor: '200,00', data_vencimento: '10/08/2026', status: 'Pago', valor_pago: '200,00', parcela_ref: '1/5 [PRC-5X]' }),
    entry({ cliente: 'Cliente 5x', valor: '200,00', data_vencimento: '10/09/2026', status: 'Pendente', valor_pago: '0', parcela_ref: '2/5 [PRC-5X]' }),
    entry({ cliente: 'Cliente 5x', valor: '200,00', data_vencimento: '10/10/2026', status: 'Pendente', valor_pago: '0', parcela_ref: '3/5 [PRC-5X]' }),
    entry({ cliente: 'Cliente 5x', valor: '200,00', data_vencimento: '10/11/2026', status: 'Pendente', valor_pago: '0', parcela_ref: '4/5 [PRC-5X]' }),
    entry({ cliente: 'Cliente 5x', valor: '200,00', data_vencimento: '10/12/2026', status: 'Pendente', valor_pago: '0', parcela_ref: '5/5 [PRC-5X]' })
  ];

  // 1. Sem filtro: todas as 5 parcelas aparecem individualmente
  const allRows = report.filterRows({
    entradas: parcelas,
    saidas: [],
    filters: {},
    consolidateAll: false,
    now: FIXED_NOW
  });
  assert.equal(allRows.length, 5);
  assert.deepEqual(allRows.map(r => r.parcela_ref), [
    '5/5 [PRC-5X]',
    '4/5 [PRC-5X]',
    '3/5 [PRC-5X]',
    '2/5 [PRC-5X]',
    '1/5 [PRC-5X]'
  ]);

  // 2. Filtro de data cobrindo apenas setembro/2026: apenas a parcela 2/5 aparece
  const setRows = report.filterRows({
    entradas: parcelas,
    saidas: [],
    filters: { dateFrom: '2026-09-01', dateTo: '2026-09-30' },
    consolidateAll: false,
    now: FIXED_NOW
  });
  assert.equal(setRows.length, 1);
  assert.equal(setRows[0].parcela_ref, '2/5 [PRC-5X]');
  assert.equal(setRows[0].data_vencimento, '10/09/2026');

  // 3. Gestão de dados (com consolidação): agrupa as 5 parcelas em 1 único lançamento de R$ 1.000,00
  const consolidated = report.consolidateRows(parcelas);
  assert.equal(consolidated.length, 1);
  assert.equal(consolidated[0].valor, 1000);
  assert.equal(consolidated[0].valor_pago, 200);
  assert.equal(consolidated[0]._parcelLabel, '1/5');
  assert.equal(consolidated[0].status, 'Parcial');
});

test('filtro de múltiplos status permite selecionar 2 ou mais status (ex: vencidos + pendentes)', () => {
  const entradas = [
    entry({ cliente: 'Cliente Vencido', status: 'Pendente', data_vencimento: '01/08/2026' }), // Vencido
    entry({ cliente: 'Cliente Pendente', status: 'Pendente', data_vencimento: '20/08/2026' }), // Pendente a vencer
    entry({ cliente: 'Cliente Pago', status: 'Pago', valor_pago: '1.234,56', data_pagamento: '05/08/2026' }),
    entry({ cliente: 'Cliente Parcial', status: 'Parcial', valor_pago: '500,00', data_vencimento: '25/08/2026' }),
    entry({ cliente: 'Cliente Cancelado', status: 'Cancelado' })
  ];

  // 1. Filtrando com array: ['vencido', 'pendente']
  const resArray = report.filterRows({
    entradas,
    saidas: [],
    filters: { status: ['vencido', 'pendente'] },
    now: FIXED_NOW
  });
  assert.equal(resArray.length, 2);
  assert.deepEqual(resArray.map(r => r.cliente), ['Cliente Pendente', 'Cliente Vencido']);

  // 2. Filtrando com string separada por vírgula: 'vencido, pendente'
  const resStr = report.filterRows({
    entradas,
    saidas: [],
    filters: { status: 'vencido, pendente' },
    now: FIXED_NOW
  });
  assert.equal(resStr.length, 2);
  assert.deepEqual(resStr.map(r => r.cliente), ['Cliente Pendente', 'Cliente Vencido']);

  // 3. Filtrando com statusList explícito: ['pago', 'parcial']
  const resPagoParcial = report.filterRows({
    entradas,
    saidas: [],
    filters: { statusList: ['pago', 'parcial'] },
    now: FIXED_NOW
  });
  assert.equal(resPagoParcial.length, 2);
  assert.deepEqual(resPagoParcial.map(r => r.cliente), ['Cliente Parcial', 'Cliente Pago']);

  // 4. Modelo de relatório PDF com múltiplos status inclui descrição e dados corretos
  const model = report.createModel({
    entradas,
    saidas: [],
    filters: { status: ['vencido', 'pendente'], statusLabel: 'Vencido, Pendente' },
    now: FIXED_NOW
  });
  assert.equal(model.rows.length, 2);
  assert.match(model.filterDescription, /Status: Vencido, Pendente/);
});
