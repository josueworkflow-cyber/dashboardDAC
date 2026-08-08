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
    kpiFilter: 'receber',
    now: FIXED_NOW
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].valor, 300);
  assert.equal(rows[0].valor_pago, 100);
  assert.equal(rows[0].status, 'Parcial');
  assert.match(rows[0].parcela_ref, /\[PRC-HIST\]/);
  assert.equal(rows[0]._parcelGroupId, 'PRC-HIST');
  assert.equal(rows[0]._parcelLabel, '3 parcelas');
  assert.equal(rows[0]._consolidatedCount, 3);
  assert.equal(rows[0]._consolidatedOpenCount, 2);
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
  assert.equal(receivable.columns.length, 12);
  assert.equal(payable.columns.length, 12);
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
