// Referência ao módulo sheets (carregado sob demanda)
let sheetsModule = null;

// Inicializa a fonte de dados: Google Sheets
function initDb() {
  console.log('📊 Modo GOOGLE SHEETS ativo — dados serão lidos da planilha');
  sheetsModule = require('./sheets');
  return sheetsModule.initSheets();
}

module.exports = {
  getSheetsModule: () => sheetsModule,
  initDb
};
