# PRD: Estrutura e Arquitetura do Projeto — DAC Dashboard

Este documento detalha a arquitetura técnica, os requisitos funcionais e a estrutura de dados do sistema **DAC Dashboard**, uma ferramenta de gestão financeira e de estoque integrada ao Google Sheets.

---

## 1. Visão Geral
O sistema é um dashboard gerencial projetado para centralizar o controle de Entradas, Saídas e Estoque de uma empresa. O diferencial é o uso do **Google Sheets como banco de dados em tempo real**, permitindo que usuários editem dados diretamente na planilha ou via interface web.

## 2. Stack Tecnológica
- **Backend**: Node.js com Express.
- **Frontend**: Vanilla HTML5, CSS3 (variáveis e design premium) e JavaScript Moderno (ES6+).
- **Banco de Dados**: Google Sheets API v4 (com camada de cache em memória).
- **Autenticação**: JWT (JSON Web Tokens) com login simples.
- **Infraestrutura**: Dockerizada (Dockerfile incluso).

---

## 3. Arquitetura do Sistema

### 3.1. Estrutura de Pastas
```text
├── server.js               # Ponto de entrada do servidor Express
├── src/
│   ├── auth.js            # Lógica de autenticação e middleware JWT
│   ├── db.js              # Inicialização da conexão com dados
│   ├── sheets.js          # Core: Integração, Cache e Mapeamento do Google Sheets
│   └── routes/
│       ├── api.js         # Rotas de leitura de dados e KPIs
│       └── lancamento.js  # Rotas de escrita (POST/PUT/DELETE) e parcelamentos
├── public/                # Assets Frontend (SPA)
│   ├── index.html         # Template principal (Single Page Application)
│   ├── css/               # Estilização modular e temas
│   └── js/                # Lógica do cliente dividida por módulos
│       ├── app.js         # Core do frontend e roteamento de abas
│       ├── estoque.js     # Gestão de estoque e lançamentos
│       ├── financial.js   # Dashboard financeiro e filtros globais
│       └── ...            # Gráficos e gestão de dados
└── data/                  # Armazenamento persistente local (tokens, etc.)
```

---

## 4. Integração com Google Sheets

### 4.1. Mapeamento de Dados (Schema)
O sistema trabalha com três abas principais, cada uma com um mapeamento rígido de colunas:

- **Entradas**: `categoria`, `modo_emissao`, `valor`, `cliente`, `conta_bancaria`, `data_vencimento`, `data_pagamento`, `forma_pagamento`, `status`, `movimentacao`, `empresa`, `num_parcelas`, `valor_pago`, `parcela_ref`, `observacoes`, `data_emissao`.
- **Saídas**: Estrutura idêntica à de Entradas (16 colunas A a P), usando `fornecedor` no lugar de `cliente`.
- **Estoque**: `fornecedor`, `valor`, `data`, `pagamento`, `movimentacao`, `nota_fiscal`, `parcelas`, `empresa`, `forma_pagamento`, `modo_emissao`.

### 4.2. Mecanismo de Cache
Para evitar atingir os limites de quota da API do Google e garantir performance:
- **Leitura**: O servidor mantém um cache em memória.
- **TTL**: O cache é atualizado automaticamente a cada 30 segundos (padrão).
- **Escrita**: Operações de escrita invalidam o cache imediatamente e forçam um refresh.

---

## 5. Funcionalidades Principais

### 5.1. Dashboard Financeiro
- Visualização de KPIs (Saldo, Receitas, Despesas).
- Gráficos de fluxo de caixa por período.
- Filtros globais por Empresa, Mês e Data.

### 5.2. Gestão de Estoque
- Lançamento de Entradas e Saídas de produtos.
- Vinculação de Notas Fiscais e Modos de Emissão (Com Nota, Por PD, Empréstimo).
- Visualização de saldo financeiro do estoque.

### 5.3. Parcelamentos Automáticos
- Criação de múltiplos lançamentos a partir de uma configuração de parcelas.
- Lógica de "PRC-ID" para agrupar e excluir parcelas em lote.
- Recálculo de parcelas pendentes ao pagar um valor diferente do original.

### 5.4. Segurança
- Rotas protegidas por middleware de autenticação.
- Senha criptografada (configurável via `.env`).
- Sessões via `localStorage` com expiração de token.

---

## 6. Fluxos de Dados (Data Flow)

1. **Leitura**: Client → API `/api/data` → Cache (src/sheets.js) → Resposta JSON.
2. **Escrita**: Client → API `/api/lancamento` → Google Sheets API → Invalida Cache → Resposta Sucesso.
3. **Edição**: Client → API `/api/lancamento/:tipo/:id` → Update Batch no Sheets → Refresh Cache.

---

## 7. Variáveis de Ambiente Necessárias
- `GOOGLE_SPREADSHEET_ID`: ID da planilha do Google.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: Credenciais da conta de serviço.
- `JWT_SECRET`: Chave para assinatura de tokens.
- `ADMIN_PASSWORD`: Senha de acesso ao dashboard.
