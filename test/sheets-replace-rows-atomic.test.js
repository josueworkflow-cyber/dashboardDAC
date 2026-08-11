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

test('replaceRowsAtomic envia exclusão, inserção e novas linhas em um único batch', async () => {
  const googleapisPath = require.resolve('googleapis');
  const sheetsPath = require.resolve('../src/sheets');
  const previousGoogleapis = require.cache[googleapisPath];
  const previousSheets = require.cache[sheetsPath];
  const previousSetInterval = global.setInterval;

  const batchCalls = [];
  const api = {
    spreadsheets: {
      async get() {
        return {
          data: {
            properties: { title: 'Planilha de teste' },
            sheets: [
              { properties: { sheetId: 11, title: 'Entradas' } },
              { properties: { sheetId: 22, title: 'Saídas' } },
              { properties: { sheetId: 33, title: 'Estoque' } }
            ]
          }
        };
      },
      async batchUpdate(args) {
        batchCalls.push(structuredClone(args));
        return { data: { replies: [] } };
      },
      values: {
        async get(args) {
          if (String(args.range).startsWith('Entradas!')) {
            return { data: { values: [['Primeira categoria'], [], ['Terceira categoria']] } };
          }
          return { data: { values: [] } };
        }
      }
    }
  };

  installModuleStub(googleapisPath, {
    google: {
      auth: { GoogleAuth: class GoogleAuth {} },
      sheets() { return api; }
    }
  });
  delete require.cache[sheetsPath];
  global.setInterval = () => ({ unref() {} });

  try {
    const sheets = require('../src/sheets');
    assert.equal(await sheets.initSheets(), true);
    assert.deepEqual(
      sheets.getCacheData().entradas.map(row => ({ id: row.id, categoria: row.categoria })),
      [
        { id: 1, categoria: 'Primeira categoria' },
        { id: 3, categoria: 'Terceira categoria' }
      ]
    );

    const result = await sheets.replaceRowsAtomic({
      sourceSheetName: 'Entradas',
      sourceIds: [2, 4, 2, 'inválido'],
      targetSheetName: 'Saídas',
      targetStartId: 3,
      rows: [
        {
          categoria: 'Fornecedores',
          modo_emissao: 'Nota fiscal',
          valor: 300,
          fornecedor: 'Fornecedor A',
          conta_bancaria: 'Inter',
          data_vencimento: '20/08/2026',
          data_pagamento: '',
          forma_pagamento: 'PIX',
          status: 'Pendente',
          movimentacao: 'Saída',
          empresa: 'DAC',
          num_parcelas: 2,
          valor_pago: 0,
          parcela_ref: '1/2 [PRC-TESTE]',
          observacoes: 'Primeira parcela',
          data_emissao: '11/08/2026'
        },
        {
          categoria: 'Fornecedores',
          modo_emissao: 'Nota fiscal',
          valor: 600,
          fornecedor: 'Fornecedor A',
          conta_bancaria: 'Inter',
          data_vencimento: '20/09/2026',
          data_pagamento: '',
          forma_pagamento: 'PIX',
          status: 'Pendente',
          movimentacao: 'Saída',
          empresa: 'DAC',
          num_parcelas: 2,
          valor_pago: 0,
          parcela_ref: '2/2 [PRC-TESTE]',
          observacoes: 'Segunda parcela',
          data_emissao: '11/08/2026'
        }
      ]
    });

    assert.deepEqual(result, {
      sourceSheetName: 'Entradas',
      targetSheetName: 'Saídas',
      deletedCount: 2,
      insertedCount: 2,
      startId: 3
    });
    assert.equal(batchCalls.length, 1);

    const requests = batchCalls[0].requestBody.requests;
    assert.equal(requests.length, 7);
    assert.deepEqual(
      requests.slice(0, 2).map(request => request.deleteDimension.range),
      [
        { sheetId: 11, dimension: 'ROWS', startIndex: 5, endIndex: 6 },
        { sheetId: 11, dimension: 'ROWS', startIndex: 3, endIndex: 4 }
      ]
    );
    assert.deepEqual(requests[2].insertDimension.range, {
      sheetId: 22,
      dimension: 'ROWS',
      startIndex: 4,
      endIndex: 6
    });

    const update = requests[3].updateCells;
    assert.deepEqual(update.start, { sheetId: 22, rowIndex: 4, columnIndex: 0 });
    assert.equal(update.rows.length, 2);
    assert.equal(update.fields, 'userEnteredValue');

    const firstValues = update.rows[0].values;
    assert.equal(firstValues.length, 16);
    assert.deepEqual(firstValues[2], { userEnteredValue: { numberValue: 300 } });
    assert.deepEqual(firstValues[3], { userEnteredValue: { stringValue: 'Fornecedor A' } });
    assert.deepEqual(firstValues[6], {});
    const expectedDateSerial = (Date.UTC(2026, 7, 11) - Date.UTC(1899, 11, 30)) / 86400000;
    assert.deepEqual(firstValues[15], { userEnteredValue: { numberValue: expectedDateSerial } });

    assert.deepEqual(
      requests.slice(4).map(request => request.repeatCell.range),
      [
        { sheetId: 22, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 5, endColumnIndex: 6 },
        { sheetId: 22, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 6, endColumnIndex: 7 },
        { sheetId: 22, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 15, endColumnIndex: 16 }
      ]
    );
  } finally {
    global.setInterval = previousSetInterval;
    if (previousGoogleapis) require.cache[googleapisPath] = previousGoogleapis;
    else delete require.cache[googleapisPath];
    if (previousSheets) require.cache[sheetsPath] = previousSheets;
    else delete require.cache[sheetsPath];
  }
});
