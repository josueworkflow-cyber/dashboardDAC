'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function installModuleStub(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
    children: [],
    paths: []
  };
}

const authPath = require.resolve('../src/auth');
const dbPath = require.resolve('../src/db');
const routePath = require.resolve('../src/routes/lancamento');
const previousAuth = require.cache[authPath];
const previousRoute = require.cache[routePath];
const db = require(dbPath);
const previousGetSheetsModule = db.getSheetsModule;

let activeSheets;
db.getSheetsModule = () => activeSheets;
installModuleStub(authPath, { auth(_req, _res, next) { next(); } });
delete require.cache[routePath];

const { registerLancamentoRoutes } = require('../src/routes/lancamento');
const routes = new Map();
const app = {};
for (const method of ['get', 'post', 'put', 'delete']) {
  app[method] = (path, ...handlers) => {
    routes.set(`${method.toUpperCase()} ${path}`, handlers.at(-1));
  };
}
registerLancamentoRoutes(app);

const reconfigure = routes.get('PUT /api/lancamento/reconfigurar/:tipo/:id');
const createInstallments = routes.get('POST /api/lancamento/parcelado');
const payInstallment = routes.get('PUT /api/lancamento/pagar-parcela/:tipo/:id');
assert.equal(typeof reconfigure, 'function', 'a rota de reconfiguração deve estar registrada');
assert.equal(typeof createInstallments, 'function', 'a rota de criação parcelada deve estar registrada');
assert.equal(typeof payInstallment, 'function', 'a rota de pagamento rápido deve estar registrada');

test.after(() => {
  db.getSheetsModule = previousGetSheetsModule;
  if (previousAuth) require.cache[authPath] = previousAuth;
  else delete require.cache[authPath];
  if (previousRoute) require.cache[routePath] = previousRoute;
  else delete require.cache[routePath];
});

function paidEntry(overrides = {}) {
  return {
    id: 7,
    categoria: 'Venda de produtos',
    modo_emissao: 'Nota fiscal',
    valor: 900,
    cliente: 'Hospital Original',
    conta_bancaria: 'Inter',
    data_vencimento: '10/08/2026',
    data_pagamento: '10/08/2026',
    forma_pagamento: 'PIX',
    status: 'Pago',
    movimentacao: 'Entrada',
    empresa: 'DAC',
    num_parcelas: 1,
    valor_pago: 900,
    parcela_ref: '',
    observacoes: 'Lançamento original',
    data_emissao: '09/08/2026',
    ...overrides
  };
}

function pendingItem(valor = 900, data = '20/08/2026') {
  return {
    valor,
    data_vencimento: data,
    status: 'Pendente',
    valor_pago: 0,
    data_pagamento: ''
  };
}

function paidItem(valor = 900, data = '11/08/2026') {
  return {
    valor,
    data_vencimento: data,
    status: 'Pago',
    valor_pago: valor,
    data_pagamento: data
  };
}

function cancelledItem(valor = 900, data = '20/08/2026') {
  return {
    valor,
    data_vencimento: data,
    status: 'Cancelado',
    valor_pago: 0,
    data_pagamento: ''
  };
}

function validBody(overrides = {}) {
  return {
    movimentacao: 'Entrada',
    categoria: 'Produtos hospitalares',
    fornecedor: 'Hospital Atualizado',
    conta_bancaria: 'Cora',
    forma_pagamento: 'Boleto',
    empresa: 'PULSE',
    modo_emissao: 'Nota fiscal',
    observacoes: 'Cronograma corrigido',
    data_emissao: '2026-08-11',
    modalidade: 'Pendente',
    valor_total: 900,
    itens: [pendingItem()],
    ...overrides
  };
}

function useSheets({ entradas = [paidEntry()], saidas = [] } = {}) {
  const calls = [];
  activeSheets = {
    getCacheData() {
      return structuredClone({ entradas, saidas });
    },
    async replaceRowsAtomic(args) {
      calls.push(structuredClone(args));
      return {
        sourceSheetName: args.sourceSheetName,
        targetSheetName: args.targetSheetName,
        deletedCount: args.sourceIds.length,
        insertedCount: args.rows.length,
        startId: args.targetStartId
      };
    }
  };
  return calls;
}

function useCreateSheets({ entradas = [], saidas = [] } = {}) {
  const calls = [];
  activeSheets = {
    getCacheData() {
      return structuredClone({ entradas, saidas });
    },
    async appendMultipleRows(movimentacao, rows) {
      calls.push({ movimentacao, rows: structuredClone(rows) });
      return {
        sheetName: movimentacao === 'Entrada' ? 'Entradas' : 'Saídas',
        count: rows.length
      };
    }
  };
  return calls;
}

function usePaymentSheets({ entradas = [], saidas = [] } = {}) {
  const state = structuredClone({ entradas, saidas });
  const calls = [];
  activeSheets = {
    getCacheData() {
      return structuredClone(state);
    },
    async updateRow(sheetName, id, updates) {
      calls.push({ sheetName, id, updates: structuredClone(updates) });
      const rows = sheetName === 'Entradas' ? state.entradas : state.saidas;
      const row = rows.find(item => String(item.id) === String(id));
      if (row) Object.assign(row, updates);
      return true;
    }
  };
  return { calls, state };
}

async function invokeRoute(handler, body, params = {}) {
  let payload;
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return value;
    }
  };

  await handler({ body, params }, res);
  return { statusCode: res.statusCode, payload };
}

async function invoke(body, params = { tipo: 'entrada', id: '7' }) {
  return invokeRoute(reconfigure, body, params);
}

test('reconfigura Pago para Pendente e limpa os campos de quitação', async () => {
  const calls = useSheets();
  const response = await invoke(validBody());

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.success, true);
  assert.equal(response.payload.modalidade, 'Pendente');
  assert.equal(response.payload.grupo_id, null);
  assert.equal(calls.length, 1);

  const call = calls[0];
  assert.deepEqual(call.sourceIds, [7]);
  assert.equal(call.sourceSheetName, 'Entradas');
  assert.equal(call.targetSheetName, 'Entradas');
  assert.equal(call.targetStartId, 7);
  assert.deepEqual(call.rows, [
    {
      movimentacao: 'Entrada',
      categoria: 'Produtos hospitalares',
      modo_emissao: 'Nota fiscal',
      cliente: 'Hospital Atualizado',
      fornecedor: 'Hospital Atualizado',
      conta_bancaria: 'Cora',
      forma_pagamento: 'Boleto',
      empresa: 'PULSE',
      observacoes: 'Cronograma corrigido',
      data_emissao: '11/08/2026',
      valor: 900,
      data_vencimento: '20/08/2026',
      data_pagamento: '',
      status: 'Pendente',
      num_parcelas: 1,
      valor_pago: 0,
      parcela_ref: ''
    }
  ]);
});

test('reconfigura Pago para Parcelado, preservando total, ordem e grupo novo', async () => {
  const calls = useSheets();
  const response = await invoke(validBody({
    modalidade: 'Parcelado',
    itens: [
      pendingItem(300, '20/08/2026'),
      pendingItem(300, '20/09/2026'),
      pendingItem(300, '20/10/2026')
    ]
  }));

  assert.equal(response.statusCode, 200);
  assert.match(response.payload.grupo_id, /^PRC-\d{14}-[A-F0-9]{8}$/);
  assert.equal(calls.length, 1);

  const call = calls[0];
  assert.deepEqual(call.sourceIds, [7]);
  assert.equal(call.rows.length, 3);
  assert.deepEqual(call.rows.map(row => row.valor), [300, 300, 300]);
  assert.deepEqual(call.rows.map(row => row.status), ['Pendente', 'Pendente', 'Pendente']);
  assert.deepEqual(call.rows.map(row => row.num_parcelas), [3, 3, 3]);
  assert.deepEqual(call.rows.map(row => row.parcela_ref), [
    `1/3 [${response.payload.grupo_id}]`,
    `2/3 [${response.payload.grupo_id}]`,
    `3/3 [${response.payload.grupo_id}]`
  ]);
});

test('reconfigura grupo originalmente parcelado para Pago e substitui todos os IDs do grupo', async () => {
  const groupId = 'PRC-GRUPO-ORIGINAL';
  const entradas = [
    paidEntry({ id: 3, status: 'Pendente', valor: 100, valor_pago: 0 }),
    paidEntry({ id: 11, status: 'Pago', valor: 300, valor_pago: 300, parcela_ref: `1/3 [${groupId}]` }),
    paidEntry({ id: 12, status: 'Pendente', valor: 300, valor_pago: 0, data_pagamento: '', parcela_ref: `2/3 [${groupId}]` }),
    paidEntry({ id: 13, status: 'Pendente', valor: 300, valor_pago: 0, data_pagamento: '', parcela_ref: `3/3 [${groupId}]` }),
    paidEntry({ id: 14, status: 'Pendente', valor: 50, valor_pago: 0, parcela_ref: '1/2 [PRC-GRUPO-ORIGINAL-OUTRO]' })
  ];
  const calls = useSheets({ entradas });

  const response = await invoke(validBody({
    modalidade: 'Pago',
    itens: [paidItem()]
  }), { tipo: 'entrada', id: '12' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.grupo_id, null);
  assert.equal(calls.length, 1);
  assert.deepEqual([...calls[0].sourceIds].sort((a, b) => a - b), [11, 12, 13]);
  assert.equal(calls[0].targetStartId, 11);
  assert.equal(calls[0].rows.length, 1);
  assert.equal(calls[0].rows[0].status, 'Pago');
  assert.equal(calls[0].rows[0].valor_pago, 900);
  assert.equal(calls[0].rows[0].data_pagamento, '11/08/2026');
  assert.equal(calls[0].rows[0].num_parcelas, 1);
  assert.equal(calls[0].rows[0].parcela_ref, '');
});

test('preserva o identificador do grupo original quando ele continua parcelado', async () => {
  const groupId = 'PRC-GRUPO-MANTIDO';
  const entradas = [
    paidEntry({ id: 21, status: 'Pendente', valor: 300, valor_pago: 0, data_pagamento: '', parcela_ref: `1/3 [${groupId}]` }),
    paidEntry({ id: 22, status: 'Pendente', valor: 300, valor_pago: 0, data_pagamento: '', parcela_ref: `2/3 [${groupId}]` }),
    paidEntry({ id: 23, status: 'Pendente', valor: 300, valor_pago: 0, data_pagamento: '', parcela_ref: `3/3 [${groupId}]` })
  ];
  const calls = useSheets({ entradas });

  const response = await invoke(validBody({
    modalidade: 'Parcelado',
    itens: [pendingItem(450, '20/08/2026'), pendingItem(450, '20/09/2026')]
  }), { tipo: 'entrada', id: '22' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.grupo_id, groupId);
  assert.deepEqual(calls[0].sourceIds, [21, 22, 23]);
  assert.equal(calls[0].targetStartId, 21);
  assert.deepEqual(calls[0].rows.map(row => row.parcela_ref), [
    `1/2 [${groupId}]`,
    `2/2 [${groupId}]`
  ]);
});

test('mantém todas as parcelas de um grupo quitado na modalidade Pago', async () => {
  const groupId = 'PRC-GRUPO-QUITADO';
  const entradas = [
    paidEntry({ id: 31, valor: 300, valor_pago: 320, parcela_ref: `1/3 [${groupId}]` }),
    paidEntry({ id: 32, valor: 300, valor_pago: 300, parcela_ref: `2/3 [${groupId}]` }),
    paidEntry({ id: 33, valor: 300, valor_pago: 310, parcela_ref: `3/3 [${groupId}]` })
  ];
  const calls = useSheets({ entradas });

  const response = await invoke(validBody({
    modalidade: 'Pago',
    itens: [
      { ...paidItem(300, '11/08/2026'), valor_pago: 320 },
      paidItem(300, '11/09/2026'),
      { ...paidItem(300, '11/10/2026'), valor_pago: 310 }
    ]
  }), { tipo: 'entrada', id: '32' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.grupo_id, groupId);
  assert.deepEqual(calls[0].sourceIds, [31, 32, 33]);
  assert.equal(calls[0].targetStartId, 31);
  assert.equal(calls[0].rows.length, 3);
  assert.deepEqual(calls[0].rows.map(row => row.status), ['Pago', 'Pago', 'Pago']);
  assert.deepEqual(calls[0].rows.map(row => row.valor_pago), [320, 300, 310]);
  assert.deepEqual(calls[0].rows.map(row => row.parcela_ref), [
    `1/3 [${groupId}]`,
    `2/3 [${groupId}]`,
    `3/3 [${groupId}]`
  ]);
});

test('aceita e preserva valor pago acima do valor original', async () => {
  const calls = useSheets();
  const response = await invoke(validBody({
    modalidade: 'Pago',
    valor_total: 900,
    itens: [{ ...paidItem(900, '11/08/2026'), valor_pago: 975.5 }]
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(calls[0].rows[0].valor, 900);
  assert.equal(calls[0].rows[0].valor_pago, 975.5);
  assert.equal(calls[0].rows[0].status, 'Pago');
});

test('reconfigura modalidade Parcial com uma parte paga e saldo pendente', async () => {
  const calls = useSheets();
  const response = await invoke(validBody({
    modalidade: 'Parcial',
    itens: [paidItem(250, '11/08/2026'), pendingItem(650, '20/09/2026')]
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.modalidade, 'Parcial');
  assert.match(response.payload.grupo_id, /^PRC-/);
  assert.equal(calls[0].rows.length, 2);
  assert.deepEqual(calls[0].rows.map(row => row.status), ['Pago', 'Pendente']);
  assert.deepEqual(calls[0].rows.map(row => row.valor_pago), [250, 0]);
  assert.deepEqual(calls[0].rows.map(row => row.data_pagamento), ['11/08/2026', '']);
  assert.deepEqual(calls[0].rows.map(row => row.parcela_ref), [
    `1/2 [${response.payload.grupo_id}]`,
    `2/2 [${response.payload.grupo_id}]`
  ]);
});

test('reconfigura para Cancelado sem manter valor ou data de pagamento', async () => {
  const calls = useSheets();
  const response = await invoke(validBody({
    modalidade: 'Cancelado',
    itens: [cancelledItem()]
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.modalidade, 'Cancelado');
  assert.equal(calls[0].rows[0].status, 'Cancelado');
  assert.equal(calls[0].rows[0].valor_pago, 0);
  assert.equal(calls[0].rows[0].data_pagamento, '');
  assert.equal(calls[0].rows[0].parcela_ref, '');
});

test('propaga campos comuns e troca o lançamento de Entrada para Saída', async () => {
  const saidas = [
    { id: 1, categoria: 'Despesa' },
    { id: 3, categoria: 'Despesa' }
  ];
  const calls = useSheets({ saidas });
  const response = await invoke(validBody({ movimentacao: 'Saída' }));

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.movimentacao, 'Saída');
  assert.equal(calls.length, 1);

  const call = calls[0];
  assert.equal(call.sourceSheetName, 'Entradas');
  assert.equal(call.targetSheetName, 'Saídas');
  assert.deepEqual(call.sourceIds, [7]);
  assert.equal(call.targetStartId, 4);
  assert.equal(call.rows[0].movimentacao, 'Saída');
  assert.equal(call.rows[0].categoria, 'Produtos hospitalares');
  assert.equal(call.rows[0].fornecedor, 'Hospital Atualizado');
  assert.equal(call.rows[0].cliente, 'Hospital Atualizado');
  assert.equal(call.rows[0].conta_bancaria, 'Cora');
  assert.equal(call.rows[0].forma_pagamento, 'Boleto');
  assert.equal(call.rows[0].empresa, 'PULSE');
  assert.equal(call.rows[0].observacoes, 'Cronograma corrigido');
  assert.equal(call.rows[0].data_emissao, '11/08/2026');
});

test('rejeita soma, datas, valores, status e modalidade inválidos antes de tocar no Sheets', async t => {
  const cases = [
    {
      name: 'soma diferente do total',
      body: validBody({ valor_total: 900, itens: [pendingItem(899)] }),
      error: /soma/i
    },
    {
      name: 'data inexistente',
      body: validBody({ itens: [pendingItem(900, '31/02/2026')] }),
      error: /data/i
    },
    {
      name: 'valor não positivo',
      body: validBody({ itens: [pendingItem(0)] }),
      error: /maior que zero/i
    },
    {
      name: 'status desconhecido',
      body: validBody({ itens: [{ ...pendingItem(), status: 'Parcial' }] }),
      error: /status/i
    },
    {
      name: 'modalidade desconhecida',
      body: validBody({ modalidade: 'Vencido' }),
      error: /modalidade/i
    },
    {
      name: 'item pago sem valor pago positivo',
      body: validBody({
        modalidade: 'Pago',
        itens: [{ ...paidItem(), valor_pago: 0 }]
      }),
      error: /valor_pago/i
    },
    {
      name: 'item pendente com data de pagamento',
      body: validBody({
        itens: [{ ...pendingItem(), data_pagamento: '11/08/2026' }]
      }),
      error: /data_pagamento/i
    },
    {
      name: 'modalidade Pago com item Pendente',
      body: validBody({
        modalidade: 'Pago',
        itens: [paidItem(450), pendingItem(450)]
      }),
      error: /modalidade Pago/i
    },
    {
      name: 'modalidade Parcelado com item Pago',
      body: validBody({
        modalidade: 'Parcelado',
        itens: [paidItem(450), pendingItem(450)]
      }),
      error: /modalidade Parcelado/i
    }
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const calls = useSheets();
      const response = await invoke(scenario.body);
      assert.equal(response.statusCode, 400);
      assert.match(response.payload.error, scenario.error);
      assert.equal(calls.length, 0);
    });
  }
});

test('rejeita tipo, ID e registro inexistente sem chamar substituição', async t => {
  const cases = [
    { name: 'tipo inválido', params: { tipo: 'estoque', id: '7' }, statusCode: 400 },
    { name: 'ID inválido', params: { tipo: 'entrada', id: 'zero' }, statusCode: 400 },
    { name: 'registro inexistente', params: { tipo: 'entrada', id: '999' }, statusCode: 404 }
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const calls = useSheets();
      const response = await invoke(validBody(), scenario.params);
      assert.equal(response.statusCode, scenario.statusCode);
      assert.equal(calls.length, 0);
    });
  }
});

test('criação parcelada ignora referências do cliente e gera PRC e ordem no servidor', async () => {
  const calls = useCreateSheets({
    entradas: [paidEntry({ parcela_ref: '1/2 [PRC-GRUPO-JA-EXISTENTE]' })]
  });
  const clientGroupId = 'PRC-ID-FORJADO-PELO-CLIENTE';
  const response = await invokeRoute(createInstallments, {
    movimentacao: 'Entrada',
    categoria: 'Produtos hospitalares',
    fornecedor: 'Hospital Novo',
    conta_bancaria: 'Cora',
    forma_pagamento: 'Boleto',
    empresa: 'PULSE',
    modo_emissao: 'Nota fiscal',
    observacoes: 'Parcelamento novo',
    data_emissao: '11/08/2026',
    modalidade: 'Parcelado',
    valor_total: 900,
    parcelas: [
      { ...pendingItem(300, '20/08/2026'), parcela_ref: `9/99 [${clientGroupId}]`, num_parcelas: 99 },
      { ...pendingItem(300, '20/09/2026'), parcela_ref: `8/99 [${clientGroupId}]`, num_parcelas: 99 },
      { ...pendingItem(300, '20/10/2026'), parcela_ref: `7/99 [${clientGroupId}]`, num_parcelas: 99 }
    ]
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.success, true);
  assert.equal(response.payload.modalidade, 'Parcelado');
  assert.equal(response.payload.valor_total, 900);
  assert.equal(response.payload.linhas_criadas, 3);
  assert.match(response.payload.grupo_id, /^PRC-\d{14}-[A-F0-9]{8}$/);
  assert.notEqual(response.payload.grupo_id, clientGroupId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].movimentacao, 'Entrada');
  assert.deepEqual(calls[0].rows.map(row => row.num_parcelas), [3, 3, 3]);
  assert.deepEqual(calls[0].rows.map(row => row.parcela_ref), [
    `1/3 [${response.payload.grupo_id}]`,
    `2/3 [${response.payload.grupo_id}]`,
    `3/3 [${response.payload.grupo_id}]`
  ]);
  assert.equal(calls[0].rows.some(row => row.parcela_ref.includes(clientGroupId)), false);
});

test('criação parcelada mantém compatibilidade sem modalidade e valor_total', async () => {
  const calls = useCreateSheets();
  const response = await invokeRoute(createInstallments, {
    movimentacao: 'Saída',
    categoria: 'Serviços',
    fornecedor: 'Fornecedor Legado',
    parcelas: [
      pendingItem(350, '20/08/2026'),
      pendingItem(550, '20/09/2026')
    ]
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.modalidade, 'Parcelado');
  assert.equal(response.payload.valor_total, 900);
  assert.match(response.payload.grupo_id, /^PRC-\d{14}-[A-F0-9]{8}$/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].movimentacao, 'Saída');
  assert.deepEqual(calls[0].rows.map(row => row.valor), [350, 550]);
  assert.deepEqual(calls[0].rows.map(row => row.status), ['Pendente', 'Pendente']);
  assert.deepEqual(calls[0].rows.map(row => row.parcela_ref), [
    `1/2 [${response.payload.grupo_id}]`,
    `2/2 [${response.payload.grupo_id}]`
  ]);
});

test('pagamento rápido preserva valor acima da parcela sem alterar as futuras por padrão', async () => {
  const { calls, state } = usePaymentSheets({
    entradas: [
      paidEntry({ id: 1, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '1/3 [PRC-PAGAR]' }),
      paidEntry({ id: 2, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '2/3 [PRC-PAGAR]' }),
      paidEntry({ id: 3, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '3/3 [PRC-PAGAR]' })
    ]
  });

  const response = await invokeRoute(payInstallment, {
    valor_pago: 10000,
    data_pagamento: '11/08/2026',
    recalcular: false
  }, { tipo: 'entrada', id: '1' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.valor_pago, 10000);
  assert.equal(response.payload.pagamento_ajustado, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].updates, {
    status: 'Pago',
    valor_pago: 10000,
    data_pagamento: '11/08/2026'
  });
  assert.equal(state.entradas[1].valor, 100);
  assert.equal(state.entradas[2].valor, 100);
});

test('edição rápida de parcela paga corrige valor e data sem redistribuir o grupo', async () => {
  const { calls, state } = usePaymentSheets({
    entradas: [
      paidEntry({ id: 1, valor: 100, valor_pago: 10000, status: 'Pago', parcela_ref: '1/3 [PRC-AJUSTE]' }),
      paidEntry({ id: 2, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '2/3 [PRC-AJUSTE]' }),
      paidEntry({ id: 3, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '3/3 [PRC-AJUSTE]' })
    ]
  });

  const response = await invokeRoute(payInstallment, {
    valor_pago: '100,00',
    data_pagamento: '12/08/2026',
    recalcular: true
  }, { tipo: 'entrada', id: '1' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.pagamento_ajustado, true);
  assert.equal(response.payload.valor_pago, 100);
  assert.equal(calls.length, 1);
  assert.equal(state.entradas[0].valor_pago, 100);
  assert.equal(state.entradas[0].data_pagamento, '12/08/2026');
  assert.equal(state.entradas[1].valor, 100);
  assert.equal(state.entradas[2].valor, 100);
});

test('pagamento rápido rejeita valor inválido antes de tocar no Sheets', async () => {
  const { calls } = usePaymentSheets({ entradas: [paidEntry({ id: 1 })] });
  const response = await invokeRoute(payInstallment, {
    valor_pago: 0,
    data_pagamento: '11/08/2026',
    recalcular: false
  }, { tipo: 'entrada', id: '1' });

  assert.equal(response.statusCode, 400);
  assert.match(response.payload.error, /maior que zero/i);
  assert.equal(calls.length, 0);
});

test('desmarca parcela paga para não paga (pendente) limpando valor_pago e data_pagamento', async () => {
  const { calls, state } = usePaymentSheets({
    entradas: [
      paidEntry({ id: 1, valor: 100, valor_pago: 100, status: 'Pago', data_pagamento: '10/08/2026', parcela_ref: '1/3 [PRC-UNPAY]' }),
      paidEntry({ id: 2, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '2/3 [PRC-UNPAY]' }),
      paidEntry({ id: 3, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '3/3 [PRC-UNPAY]' })
    ]
  });

  const response = await invokeRoute(payInstallment, {
    status: 'Pendente',
    valor: 100,
    recalcular: false
  }, { tipo: 'entrada', id: '1' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.status, 'Pendente');
  assert.equal(response.payload.valor, 100);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].updates, {
    status: 'Pendente',
    valor: 100,
    valor_pago: 0,
    data_pagamento: ''
  });
  assert.equal(state.entradas[0].status, 'Pendente');
  assert.equal(state.entradas[0].valor_pago, 0);
  assert.equal(state.entradas[0].data_pagamento, '');
  assert.equal(state.entradas[1].valor, 100);
  assert.equal(state.entradas[2].valor, 100);
});

test('desmarca parcela paga para pendente alterando o valor e redistribuindo nas demais pendentes', async () => {
  const { calls, state } = usePaymentSheets({
    entradas: [
      paidEntry({ id: 1, valor: 100, valor_pago: 100, status: 'Pago', data_pagamento: '10/08/2026', parcela_ref: '1/3 [PRC-REDIST]' }),
      paidEntry({ id: 2, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '2/3 [PRC-REDIST]' }),
      paidEntry({ id: 3, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '3/3 [PRC-REDIST]' })
    ]
  });

  // Aumenta a parcela 1 de 100 para 150 (diff: +50), redistribuindo nas 2 pendentes (-25 cada)
  const response = await invokeRoute(payInstallment, {
    status: 'Pendente',
    valor: '150,00',
    recalcular: true
  }, { tipo: 'entrada', id: '1' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.status, 'Pendente');
  assert.equal(response.payload.valor, 150);
  assert.equal(state.entradas[0].status, 'Pendente');
  assert.equal(state.entradas[0].valor, 150);
  assert.equal(state.entradas[0].valor_pago, 0);
  assert.equal(state.entradas[0].data_pagamento, '');
  assert.equal(state.entradas[1].valor, 75);
  assert.equal(state.entradas[2].valor, 75);
});

test('desmarca parcela paga para pendente alterando o valor SEM redistribuir quando recalcular é falso', async () => {
  const { calls, state } = usePaymentSheets({
    entradas: [
      paidEntry({ id: 1, valor: 100, valor_pago: 100, status: 'Pago', data_pagamento: '10/08/2026', parcela_ref: '1/3 [PRC-NOREDIST]' }),
      paidEntry({ id: 2, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '2/3 [PRC-NOREDIST]' }),
      paidEntry({ id: 3, valor: 100, valor_pago: 0, status: 'Pendente', parcela_ref: '3/3 [PRC-NOREDIST]' })
    ]
  });

  const response = await invokeRoute(payInstallment, {
    status: 'Pendente',
    valor: 160,
    recalcular: false
  }, { tipo: 'entrada', id: '1' });

  assert.equal(response.statusCode, 200);
  assert.equal(state.entradas[0].status, 'Pendente');
  assert.equal(state.entradas[0].valor, 160);
  assert.equal(state.entradas[1].valor, 100);
  assert.equal(state.entradas[2].valor, 100);
});
