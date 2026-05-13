const crypto = require('crypto');

// Usuários e roles via variáveis de ambiente
const USERS = [
  {
    user: process.env.GESTOR_USER || 'gestor',
    pass: process.env.GESTOR_PASS || 'dac2025',
    role: 'gestor'
  },
  {
    user: process.env.LUAN_USER || 'luanbraganca',
    pass: process.env.LUAN_PASS || '01011997Lu@n',
    role: 'gestor'
  },
  {
    user: process.env.OPERATOR_USER || 'financeiro',
    pass: process.env.OPERATOR_PASS || 'dac2025',
    role: 'operador'
  },
  {
    user: process.env.ESTOQUE_USER || 'estoque',
    pass: process.env.ESTOQUE_PASS || 'dac2026',
    role: 'estoque'
  },
  {
    user: process.env.COMERCIAL_USER || 'comercial',
    pass: process.env.COMERCIAL_PASS || 'dac2026',
    role: 'comercial'
  }
];

const fs = require('fs');
const path = require('path');

// Caminho para persistência de tokens
const TOKENS_FILE = path.join(__dirname, '../data/tokens.json');

// Garante que a pasta data exista
if (!fs.existsSync(path.dirname(TOKENS_FILE))) {
  fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
}

// Map de tokens válidos: token -> { expiry, role }
let validTokens = new Map();

// Carrega tokens do arquivo ao iniciar
try {
  if (fs.existsSync(TOKENS_FILE)) {
    const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    validTokens = new Map(Object.entries(data));
    console.log(`🔑 ${validTokens.size} sessões restauradas.`);
  }
} catch (e) {
  console.error('⚠️ Erro ao restaurar sessões:', e.message);
}

function saveTokens() {
  try {
    const obj = Object.fromEntries(validTokens);
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('⚠️ Erro ao salvar sessões:', e.message);
  }
}

function generateToken(role) {
  const token = crypto.randomBytes(48).toString('hex');
  validTokens.set(token, { expiry: Date.now() + 24 * 60 * 60 * 1000, role });
  saveTokens();
  return token;
}

// Limpeza de tokens expirados a cada 1 hora
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [t, data] of validTokens) {
    if (now > data.expiry) {
      validTokens.delete(t);
      changed = true;
    }
  }
  if (changed) saveTokens();
}, 3600000);

// Middleware de autenticação
function auth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !validTokens.has(token) || Date.now() > validTokens.get(token).expiry) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  req.userRole = validTokens.get(token).role;
  next();
}

// Registra as rotas de autenticação
function registerAuthRoutes(app) {
  app.post('/auth/login', (req, res) => {
    const { user, pass } = req.body;
    const found = USERS.find(u => u.user === user && u.pass === pass);
    if (found) {
      const token = generateToken(found.role);
      res.json({ success: true, token, role: found.role });
    } else {
      res.status(401).json({ success: false, error: 'Usuário ou senha inválidos' });
    }
  });

  app.get('/auth/check', (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token && validTokens.has(token) && Date.now() <= validTokens.get(token).expiry) {
      res.json({ valid: true, role: validTokens.get(token).role });
    } else {
      res.status(401).json({ valid: false });
    }
  });
}

module.exports = { auth, registerAuthRoutes };
