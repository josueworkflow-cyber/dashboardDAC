/* ═══════════════════════════════════════════════
   config.js — Constantes globais e configuração
   do Chart.js. Deve ser carregado PRIMEIRO.
   ═══════════════════════════════════════════════ */

// Paleta de cores dos gráficos
const PALETTE_SOBER = [
  '#C41230', '#1B3A6B', '#2A5C8A', '#16803C',
  '#B45309', '#4A4A5A', '#2A2A3A', '#7C3AED',
  '#0E7490', '#9F1239'
];

// Estado global dos dados (usado por todos os scripts)
let ENT = [];
let SAI = [];
let ESTQ = [];

// Categorias para o formulário de lançamento
const CATS_ENTRADA = ['Produtos Hospitalares'];
const CATS_SAIDA = [
  'Comissão', 'Entrada de Mercadoria', 'Fornecedores',
  'Imposto', 'Logistica', 'Loja', 'Luan',
  'Operacional', 'Vale', 'Variavel'
];

// ─── Defaults globais do Chart.js ───
Chart.defaults.color = '#5A5A6A';
Chart.defaults.borderColor = 'rgba(255,255,255,.03)';
Chart.defaults.font.family = "'DM Sans',sans-serif";
Chart.defaults.font.size = 11;

Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 14;
Chart.defaults.plugins.legend.labels.font = { size: 13 };
Chart.defaults.plugins.legend.labels.padding = 18;
Chart.defaults.plugins.legend.labels.boxHeight = 14;

Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(20,20,25,.95)';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,.06)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
