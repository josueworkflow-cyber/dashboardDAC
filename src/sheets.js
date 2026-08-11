/**
 * sheets.js — Integração com Google Sheets API
 * Leitura com cache em memória + escrita direta
 */

const { google } = require('googleapis');
const path = require('path');

// ─── Configuração ───

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '';
const KEY_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './credentials.json';
const CACHE_TTL = parseInt(process.env.SHEETS_CACHE_TTL || '30000', 10); // 30 seg padrão (antes 5 min)

// Nomes das abas na planilha
const SHEET_ENTRADAS = 'Entradas';
const SHEET_SAIDAS = 'Saídas';
const SHEET_ESTOQUE = 'Estoque';
const SHEET_COMERCIAL = 'Comercial';

// Linhas: Row 1 = título, Row 2 = cabeçalho, Row 3+ = dados
const DATA_START_ROW = 3;

// ─── Mapeamento de colunas ───

const COLS_ENTRADAS = [
  'categoria', 'modo_emissao', 'valor', 'cliente', 'conta_bancaria', 
  'data_vencimento', 'data_pagamento', 'forma_pagamento', 'status', 
  'movimentacao', 'empresa', 'num_parcelas', 'valor_pago', 'parcela_ref', 'observacoes', 'data_emissao'
];

const COLS_SAIDAS = [
  'categoria', 'modo_emissao', 'valor', 'fornecedor', 'conta_bancaria', 
  'data_vencimento', 'data_pagamento', 'forma_pagamento', 'status', 
  'movimentacao', 'empresa', 'num_parcelas', 'valor_pago', 'parcela_ref', 'observacoes', 'data_emissao'
];
const COLS_ESTOQUE = [
  'fornecedor', 'valor', 'data', 'pagamento', 'movimentacao',
  'nota_fiscal', 'parcelas', 'empresa', 'forma_pagamento', 'modo_emissao',
  'observacao', 'ref_orcamento', 'status', 'data_vencimento', 'vendedor'
];

// Comercial agora é derivado do Estoque (itens com ref_orcamento)
const COLS_COMERCIAL = COLS_ESTOQUE; // mantido para compatibilidade

// ─── Estado global ───

let sheetsApi = null;
let cache = {
  entradas: [],
  saidas: [],
  estoque: [],
  comercial: [],
  lastSync: null
};
let cacheTimer = null;

// ─── Autenticação ───

async function initSheets() {
  try {
    let authClient;

    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      // Credenciais via variável de ambiente (Docker / cloud)
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      authClient = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } else {
      // Fallback: arquivo local (desenvolvimento)
      const keyFile = path.isAbsolute(KEY_PATH) ? KEY_PATH : path.join(process.cwd(), KEY_PATH);
      authClient = new google.auth.GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    }

    const auth = authClient;

    sheetsApi = google.sheets({ version: 'v4', auth });

    // Teste de conexão: busca o título da planilha
    const meta = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    console.log(`✅ Google Sheets conectado: "${meta.data.properties.title}"`);

    // Carrega dados iniciais
    await refreshCache();

    // Inicia refresh automático
    cacheTimer = setInterval(refreshCache, CACHE_TTL);
    console.log(`   ⏱️  Cache atualiza a cada ${CACHE_TTL / 1000}s`);

    return true;
  } catch (err) {
    console.error('❌ Erro ao conectar ao Google Sheets:', err.message);
    return false;
  }
}

// ─── Leitura e Cache ───

async function refreshCache() {
  try {
    const [entradas, saidas, estoque] = await Promise.all([
      readSheet(SHEET_ENTRADAS, COLS_ENTRADAS),
      readSheet(SHEET_SAIDAS, COLS_SAIDAS),
      readSheet(SHEET_ESTOQUE, COLS_ESTOQUE)
    ]);

    cache.entradas = entradas;
    cache.saidas = saidas;
    cache.estoque = estoque;
    // Comercial agora é derivado: itens do estoque com ref_orcamento
    cache.comercial = estoque.filter(r => r.ref_orcamento);
    cache.lastSync = new Date();

    console.log(`🔄 Cache atualizado: ${entradas.length} entradas, ${saidas.length} saídas, ${estoque.length} estoque, ${cache.comercial.length} pedidos funil (${cache.lastSync.toLocaleTimeString('pt-BR')})`);
  } catch (err) {
    console.error('❌ Erro ao atualizar cache do Sheets:', err.message);
  }
}

async function readSheet(sheetName, columns) {
  const lastCol = String.fromCharCode(64 + columns.length); // A=1, B=2, ..., K=11
  const range = `${sheetName}!A${DATA_START_ROW}:${lastCol}`;

  const response = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING'
  });

  const rows = response.data.values || [];

  return rows
    // O ID representa a posição física relativa à primeira linha de dados.
    // Atribuí-lo antes do filtro evita comprimir IDs quando há linhas vazias.
    .map((row, index) => ({ row, id: index + 1 }))
    .filter(({ row }) => row.some(cell => cell !== '' && cell !== null && cell !== undefined))
    .map(({ row, id }) => {
      const obj = { id };
      columns.forEach((col, i) => {
        let val = row[i] !== undefined ? row[i] : '';

        // Tratar valor monetário e campos numéricos de parcelas
        if (col === 'valor' || col === 'valor_pago') {
          val = parseValor(val);
        } else if (col === 'num_parcelas') {
          val = typeof val === 'number' ? val : parseInt(val, 10) || 0;
        } else {
          val = String(val).trim();
        }

        // Tratar datas: se vier como número serial do Sheets, converter para DD/MM/AAAA
        if ((col === 'data_vencimento' || col === 'data_pagamento' || col === 'data' || col === 'data_emissao') && typeof row[i] === 'number') {
          val = serialDateToString(row[i]);
        }

        obj[col] = val;
      });
      return obj;
    });
}

/**
 * Converte valor monetário em formatos variados para número:
 * - Número direto (Sheets UNFORMATTED): 610, 1250.5
 * - String "R$ 1.250,00" → 1250.00
 * - String "1250,50" → 1250.50
 */
function parseValor(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let str = String(val)
    .replace(/R\$\s*/gi, '')
    .replace(/\s/g, '')
    .trim();

  // Formato brasileiro: 1.250,00 → 1250.00
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Converte número serial de data do Google Sheets para DD/MM/AAAA
 * (Google Sheets usa epoch a partir de 30/12/1899)
 */
function serialDateToString(serial) {
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + serial * 86400000);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ─── Escrita ───

async function appendRow(movimentacao, data) {
  const isEstoque = data._sheet === 'estoque' || data.isEstoque;
  const isEntrada = !isEstoque && (movimentacao || '').toLowerCase().includes('entrada');
  
  let sheetName, columns;
  if (isEstoque) {
    sheetName = SHEET_ESTOQUE;
    columns = COLS_ESTOQUE;
  } else {
    sheetName = isEntrada ? SHEET_ENTRADAS : SHEET_SAIDAS;
    columns = isEntrada ? COLS_ENTRADAS : COLS_SAIDAS;
  }

  // Monta a linha na ordem das colunas
  const row = columns.map(col => {
    if (col === 'movimentacao') return movimentacao || (isEstoque ? data.movimentacao : (isEntrada ? 'Entrada' : 'Saída'));
    if (col === 'valor') return data.valor || 0;
    return data[col] || '';
  });

  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${DATA_START_ROW}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row]
    }
  });

  // Invalida o cache e recarrega
  await refreshCache();

  return { sheetName, row };
}

async function appendMultipleRows(movimentacao, dataList) {
  if (!dataList || dataList.length === 0) return;
  
  const firstData = dataList[0];
  const isEstoque = firstData._sheet === 'estoque' || firstData.isEstoque;
  const isEntrada = !isEstoque && (movimentacao || '').toLowerCase().includes('entrada');
  
  let sheetName, columns;
  if (isEstoque) {
    sheetName = SHEET_ESTOQUE;
    columns = COLS_ESTOQUE;
  } else {
    sheetName = isEntrada ? SHEET_ENTRADAS : SHEET_SAIDAS;
    columns = isEntrada ? COLS_ENTRADAS : COLS_SAIDAS;
  }

  const rows = dataList.map(data => {
    return columns.map(col => {
      if (col === 'movimentacao') return movimentacao || (isEstoque ? data.movimentacao : (isEntrada ? 'Entrada' : 'Saída'));
      if (col === 'valor') return data.valor || 0;
      return data[col] !== undefined ? data[col] : '';
    });
  });

  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${DATA_START_ROW}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows
    }
  });

  await refreshCache();
  return { sheetName, count: rows.length };
}

async function deleteRow(sheetName, id) {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error("Planilha não encontrada");

  const sheetId = sheet.properties.sheetId;
  const rowIndex = DATA_START_ROW - 1 + (id - 1);

  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: "ROWS",
            startIndex: rowIndex,
            endIndex: rowIndex + 1
          }
        }
      }]
    }
  });

  await refreshCache();
  return true;
}

async function deleteMultipleRows(sheetName, ids) {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error("Planilha não encontrada");

  const sheetId = sheet.properties.sheetId;
  
  // Ordena IDs do maior para o menor para não deslocar os índices durante a deleção
  const sortedIds = [...ids].sort((a, b) => b - a);

  const requests = sortedIds.map(id => {
    const rowIndex = DATA_START_ROW - 1 + (id - 1);
    return {
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: "ROWS",
          startIndex: rowIndex,
          endIndex: rowIndex + 1
        }
      }
    };
  });

  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests }
  });

  await refreshCache();
  return true;
}

async function updateRow(sheetName, id, updates) {
  let columns;
  if (sheetName === SHEET_ESTOQUE) columns = COLS_ESTOQUE;
  else if (sheetName === SHEET_COMERCIAL) columns = COLS_COMERCIAL;
  else if (sheetName === SHEET_ENTRADAS) columns = COLS_ENTRADAS;
  else columns = COLS_SAIDAS;
  
  const rowIndex = DATA_START_ROW + (id - 1); 

  const dataToUpdate = [];
  
  for (const [key, val] of Object.entries(updates)) {
    const colIdx = columns.indexOf(key);
    if (colIdx !== -1) {
      const colLetter = String.fromCharCode(65 + colIdx); // A = 65
      dataToUpdate.push({
        range: `${sheetName}!${colLetter}${rowIndex}`,
        values: [[val]]
      });
    }
  }

  if (dataToUpdate.length > 0) {
    await sheetsApi.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: dataToUpdate
      }
    });

    await refreshCache();
    return true;
  }
}

/**
 * Substitui uma ou mais linhas financeiras por um novo conjunto de linhas em
 * uma única chamada spreadsheets.batchUpdate. Como todas as requisições do
 * lote são validadas antes de serem aplicadas pelo Google Sheets, a operação
 * não deixa o lançamento parcialmente removido ou inserido.
 *
 * sourceIds e targetStartId usam o mesmo identificador 1-based exposto pelo
 * cache (id 1 = primeira linha de dados, fisicamente na linha 3 da planilha).
 */
async function replaceRowsAtomic({
  sourceSheetName,
  sourceIds,
  targetSheetName,
  targetStartId,
  rows
}) {
  if (!sheetsApi) throw new Error('Google Sheets não está conectado.');

  const normalizedSourceIds = [...new Set((sourceIds || []).map(id => Number(id)))]
    .filter(id => Number.isInteger(id) && id > 0)
    .sort((a, b) => b - a);

  if (normalizedSourceIds.length === 0) {
    throw new Error('Nenhuma linha de origem válida foi informada para substituição.');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Nenhuma nova linha foi informada para substituição.');
  }

  const normalizedTargetStartId = Number(targetStartId);
  if (!Number.isInteger(normalizedTargetStartId) || normalizedTargetStartId <= 0) {
    throw new Error('Posição de inserção inválida para substituição.');
  }

  const columnsForSheet = sheetName => {
    if (sheetName === SHEET_ENTRADAS) return COLS_ENTRADAS;
    if (sheetName === SHEET_SAIDAS) return COLS_SAIDAS;
    throw new Error(`A substituição atômica não suporta a planilha "${sheetName}".`);
  };

  const targetColumns = columnsForSheet(targetSheetName);
  columnsForSheet(sourceSheetName);

  const meta = await sheetsApi.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties(sheetId,title)'
  });
  const sourceSheet = meta.data.sheets.find(s => s.properties.title === sourceSheetName);
  const targetSheet = meta.data.sheets.find(s => s.properties.title === targetSheetName);
  if (!sourceSheet) throw new Error(`Planilha de origem "${sourceSheetName}" não encontrada.`);
  if (!targetSheet) throw new Error(`Planilha de destino "${targetSheetName}" não encontrada.`);

  const sourceSheetId = sourceSheet.properties.sheetId;
  const targetSheetId = targetSheet.properties.sheetId;
  const requests = normalizedSourceIds.map(id => {
    const rowIndex = DATA_START_ROW - 1 + (id - 1);
    return {
      deleteDimension: {
        range: {
          sheetId: sourceSheetId,
          dimension: 'ROWS',
          startIndex: rowIndex,
          endIndex: rowIndex + 1
        }
      }
    };
  });

  const insertRowIndex = DATA_START_ROW - 1 + (normalizedTargetStartId - 1);
  requests.push({
    insertDimension: {
      range: {
        sheetId: targetSheetId,
        dimension: 'ROWS',
        startIndex: insertRowIndex,
        endIndex: insertRowIndex + rows.length
      },
      // Na primeira linha de dados, herdar de cima copiaria a formatação do cabeçalho.
      inheritFromBefore: normalizedTargetStartId > 1
    }
  });

  const dateColumns = new Set(['data_vencimento', 'data_pagamento', 'data_emissao']);
  const dateToSerial = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const text = String(value).trim();
    let day, month, year;
    let match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      [, day, month, year] = match.map(Number);
    } else {
      match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) throw new Error(`Data inválida ao montar as linhas: "${text}".`);
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    }

    const utc = Date.UTC(year, month - 1, day);
    const parsed = new Date(utc);
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new Error(`Data inválida ao montar as linhas: "${text}".`);
    }

    return (utc - Date.UTC(1899, 11, 30)) / 86400000;
  };

  const toCellData = (value, column) => {
    if (value === undefined || value === null || value === '') return {};
    if (dateColumns.has(column)) {
      return { userEnteredValue: { numberValue: dateToSerial(value) } };
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('Valor numérico inválido ao montar as linhas.');
      return { userEnteredValue: { numberValue: value } };
    }
    if (typeof value === 'boolean') {
      return { userEnteredValue: { boolValue: value } };
    }
    return { userEnteredValue: { stringValue: String(value) } };
  };

  const rowData = rows.map(row => ({
    values: targetColumns.map(column => toCellData(row[column], column))
  }));

  requests.push({
    updateCells: {
      start: {
        sheetId: targetSheetId,
        rowIndex: insertRowIndex,
        columnIndex: 0
      },
      rows: rowData,
      fields: 'userEnteredValue'
    }
  });

  for (const dateColumn of dateColumns) {
    const columnIndex = targetColumns.indexOf(dateColumn);
    if (columnIndex === -1) continue;
    requests.push({
      repeatCell: {
        range: {
          sheetId: targetSheetId,
          startRowIndex: insertRowIndex,
          endRowIndex: insertRowIndex + rows.length,
          startColumnIndex: columnIndex,
          endColumnIndex: columnIndex + 1
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'DATE',
              pattern: 'dd/mm/yyyy'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    });
  }

  const response = await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests }
  });

  if (!response || !response.data) {
    throw new Error('O Google Sheets não confirmou a substituição das linhas.');
  }

  await refreshCache();
  return {
    sourceSheetName,
    targetSheetName,
    deletedCount: normalizedSourceIds.length,
    insertedCount: rows.length,
    startId: normalizedTargetStartId
  };
}

// ─── Exports ───

function getCacheData() {
  return {
    entradas: cache.entradas,
    saidas: cache.saidas,
    estoque: cache.estoque,
    comercial: cache.comercial,
    sync: cache.lastSync ? cache.lastSync.toISOString() : new Date().toISOString()
  };
}

// ─── Comercial/Funil: Nº automático (lê do cache.estoque) ───

function getNextOrcamentoNumber() {
  const existing = cache.estoque || [];
  let maxNum = 0;
  existing.forEach(row => {
    const match = (row.ref_orcamento || '').match(/ORC-(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  return `ORC-${String(maxNum + 1).padStart(3, '0')}`;
}

// ─── Comercial: Buscar linha do Estoque por referência ORC ───

function findEstoqueRowByOrcamento(orcNumber) {
  const estoque = cache.estoque || [];
  return estoque.find(row => (row.ref_orcamento || '').includes(orcNumber));
}

function isConnected() {
  return sheetsApi !== null && cache.lastSync !== null;
}

module.exports = {
  initSheets,
  getCacheData,
  appendRow,
  appendMultipleRows,
  deleteRow,
  deleteMultipleRows,
  updateRow,
  replaceRowsAtomic,
  refreshCache,
  isConnected,
  getNextOrcamentoNumber,
  findEstoqueRowByOrcamento
};
