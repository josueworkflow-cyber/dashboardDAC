'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CLIENTES_FILE = path.join(__dirname, '../data/clientes.json');

const authPath = require.resolve('../src/auth');
const routePath = require.resolve('../src/routes/clientes');
const previousAuth = require.cache[authPath];
const previousRoute = require.cache[routePath];

require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: { auth(_req, _res, next) { next(); } },
  children: [],
  paths: []
};
delete require.cache[routePath];

const { registerClientesRoutes, readClientes, writeClientes, normalizeNomeCliente } = require('../src/routes/clientes');
const routes = new Map();
const app = {};
for (const method of ['get', 'post', 'put', 'delete']) {
  app[method] = (routePath, ...handlers) => {
    routes.set(`${method.toUpperCase()} ${routePath}`, handlers.at(-1));
  };
}
registerClientesRoutes(app);

const getClientes = routes.get('GET /api/clientes');
const postCliente = routes.get('POST /api/clientes');
const deleteCliente = routes.get('DELETE /api/clientes/:nome');

assert.equal(typeof getClientes, 'function');
assert.equal(typeof postCliente, 'function');
assert.equal(typeof deleteCliente, 'function');

test.after(() => {
  if (previousAuth) require.cache[authPath] = previousAuth;
  else delete require.cache[authPath];
  if (previousRoute) require.cache[routePath] = previousRoute;
  else delete require.cache[routePath];
});

async function invokeRoute(handler, body = {}, params = {}) {
  let payload;
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      payload = data;
      return this;
    }
  };
  await handler({ body, params }, res);
  return { statusCode: res.statusCode, payload };
}

test('normaliza nome do cliente em caixa alta e sem espaços extras', () => {
  assert.equal(normalizeNomeCliente('  hospital santa clara  '), 'HOSPITAL SANTA CLARA');
  assert.equal(normalizeNomeCliente('clinica   bangu  ltda'), 'CLINICA BANGU LTDA');
  assert.equal(normalizeNomeCliente(''), '');
  assert.equal(normalizeNomeCliente(null), '');
});

test('lista clientes pré-cadastrados via GET /api/clientes', async () => {
  const response = await invokeRoute(getClientes);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.success, true);
  assert.ok(Array.isArray(response.payload.clientes));
  assert.ok(response.payload.clientes.includes('AMAZON'));
  assert.ok(response.payload.clientes.includes('CLINICA BANGU'));
});

test('adiciona novo cliente em caixa alta via POST /api/clientes', async () => {
  const original = readClientes();
  const testName = 'CLIENTE DE TESTE AUTOMATIZADO XYZ';

  try {
    const response = await invokeRoute(postCliente, { nome: '  cliente de teste automatizado xyz  ' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.success, true);
    assert.equal(response.payload.nome, testName);
    assert.ok(response.payload.clientes.includes(testName));

    // Tentativa de duplicata não duplica
    const dupResponse = await invokeRoute(postCliente, { nome: 'cliente de teste automatizado xyz' });
    assert.equal(dupResponse.statusCode, 200);
    const count = dupResponse.payload.clientes.filter(c => c === testName).length;
    assert.equal(count, 1);
  } finally {
    writeClientes(original);
  }
});

test('rejeita inclusão de cliente com nome vazio', async () => {
  const response = await invokeRoute(postCliente, { nome: '   ' });
  assert.equal(response.statusCode, 400);
  assert.match(response.payload.error, /obrigatório/i);
});

test('exclui cliente da lista via DELETE /api/clientes/:nome', async () => {
  const original = readClientes();
  const testName = 'CLIENTE PARA EXCLUSAO TESTE';

  try {
    await invokeRoute(postCliente, { nome: testName });
    assert.ok(readClientes().includes(testName));

    const response = await invokeRoute(deleteCliente, {}, { nome: encodeURIComponent(testName) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.success, true);
    assert.equal(response.payload.deleted, testName);
    assert.equal(response.payload.clientes.includes(testName), false);
    assert.equal(readClientes().includes(testName), false);
  } finally {
    writeClientes(original);
  }
});
