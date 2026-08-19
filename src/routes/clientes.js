'use strict';

const fs = require('fs');
const path = require('path');
const { auth } = require('../auth');

const CLIENTES_FILE = path.join(__dirname, '../../data/clientes.json');

function readClientes() {
  try {
    if (!fs.existsSync(CLIENTES_FILE)) {
      fs.writeFileSync(CLIENTES_FILE, '[]', 'utf8');
      return [];
    }
    const raw = fs.readFileSync(CLIENTES_FILE, 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('❌ Erro ao ler data/clientes.json:', err.message);
    return [];
  }
}

function writeClientes(list) {
  try {
    const dir = path.dirname(CLIENTES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CLIENTES_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('❌ Erro ao salvar data/clientes.json:', err.message);
    return false;
  }
}

function normalizeNomeCliente(nome) {
  return String(nome || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function registerClientesRoutes(app) {
  // Lista todos os clientes cadastrados
  app.get('/api/clientes', auth, (_req, res) => {
    try {
      const clientes = readClientes();
      return res.json({ success: true, clientes });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao listar clientes.' });
    }
  });

  // Adiciona um novo cliente (formatado em caixa alta)
  app.post('/api/clientes', auth, (req, res) => {
    try {
      const nome = normalizeNomeCliente(req.body && req.body.nome);
      if (!nome) {
        return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
      }

      const clientes = readClientes();
      const exists = clientes.some(c => c.toUpperCase() === nome);

      if (!exists) {
        clientes.push(nome);
        clientes.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
        writeClientes(clientes);
      }

      return res.json({ success: true, nome, clientes });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao salvar cliente.' });
    }
  });

  // Exclui um cliente da lista salva
  app.delete('/api/clientes/:nome', auth, (req, res) => {
    try {
      const nomeTarget = normalizeNomeCliente(decodeURIComponent(req.params.nome || ''));
      if (!nomeTarget) {
        return res.status(400).json({ error: 'Nome do cliente para exclusão é inválido.' });
      }

      let clientes = readClientes();
      const originalLength = clientes.length;
      clientes = clientes.filter(c => c.toUpperCase() !== nomeTarget);

      if (clientes.length !== originalLength) {
        writeClientes(clientes);
      }

      return res.json({ success: true, deleted: nomeTarget, clientes });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao excluir cliente.' });
    }
  });
}

module.exports = {
  registerClientesRoutes,
  readClientes,
  writeClientes,
  normalizeNomeCliente
};
