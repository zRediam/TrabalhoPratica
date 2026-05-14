# Extracao de Nota Fiscal com IA (OpenRouter ou Gemini)

Aplicacao full stack para enviar um PDF de nota fiscal e extrair dados estruturados em JSON usando IA.

## Requisitos

- Node.js 18+
- MYSQL
- Uma ou duas chaves de IA (recomendado: **as duas** — em cota/429 do Gemini o backend tenta OpenRouter automaticamente):
  - OpenRouter (modelos free em `OPENROUTER_MODEL`)
  - Gemini (`GEMINI_API_KEY`)

## Configuracao

### Backend

1. Entre em `backend`

```bash
npm install
```

### Frontend

1. Entre em `frontend`
3. Instale dependencias:

```bash
npm install
```

## Executando

Em um terminal:

```bash
cd backend
npm run start
```

Em outro terminal:

```bash
cd frontend
npm run dev
```

## Endpoints

Base: `/api/notas`

- `GET /api/health` -> status do backend
- `POST /api/notas/extract` -> upload de arquivo PDF no campo `file`
- `POST /api/notas/confirm` -> grava `parsedData` no banco
- `GET /api/notas/list?type=...` -> listagem de cadastros
- `PATCH /api/notas/toggle-status` -> inativar/reativar entidade

## Tratamento de erros implementado

- Arquivo obrigatorio
- Apenas PDF permitido
- Limite de upload: 10MB
- Erro de quota (429) com mensagem especifica
- Erro de chave invalida/expirada (401) com mensagem especifica

