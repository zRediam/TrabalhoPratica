const { PDFParse } = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const db = require('../config/db');

const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-oss-20b:free';
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

const getProvider = () => {
  const explicitProvider = process.env.AI_PROVIDER?.toLowerCase();
  if (explicitProvider) {
    return explicitProvider;
  }
  return process.env.OPENROUTER_API_KEY ? 'openrouter' : 'gemini';
};

const hasOpenRouter = () => Boolean(String(process.env.OPENROUTER_API_KEY || '').trim());
const hasGemini = () => Boolean(String(process.env.GEMINI_API_KEY || '').trim());

/**
 * Chama o provedor preferido (AI_PROVIDER ou heuristica) e, se falhar com cota/429 ou erro do Gemini,
 * tenta o outro provedor quando a respectiva chave existir (OpenRouter costuma ter modelos free).
 */
const invokeLlmWithFallback = async (promptText, contextLabel = 'extracao') => {
  const primary = getProvider();
  const runGemini = () => generateWithGemini(promptText);
  const runOpenRouter = () => generateWithOpenRouter(promptText);
  const tryPrimary = primary === 'gemini' ? runGemini : runOpenRouter;
  const trySecondary = primary === 'gemini' ? runOpenRouter : runGemini;
  const secondaryLabel = primary === 'gemini' ? 'OpenRouter' : 'Gemini';

  try {
    return await tryPrimary();
  } catch (primaryError) {
    const canUseGemini = hasGemini();
    const canUseOpenRouter = hasOpenRouter();
    const secondaryAvailable = primary === 'gemini' ? canUseOpenRouter : canUseGemini;

    if (!secondaryAvailable) {
      throw primaryError;
    }

    let shouldFallback = primary === 'openrouter' && primaryError?.provider === 'openrouter';

    if (primary === 'gemini') {
      const msg = String(primaryError?.message || primaryError?.cause || primaryError || '');
      const status = primaryError?.status ?? primaryError?.statusCode;
      shouldFallback =
        primaryError?.provider === 'gemini' ||
        status === 429 ||
        /RESOURCE_EXHAUSTED|quota|rate limit|free_tier|exceeded your current quota|limite/i.test(msg);
    }

    if (!shouldFallback) {
      throw primaryError;
    }

    console.warn(
      `[${contextLabel}] Provedor ${primary} falhou: ${primaryError?.message || primaryError}. Tentando ${secondaryLabel} (alternativa).`
    );
    return await trySecondary();
  }
};

const parseModelJson = (resultText) => {
  try {
    return JSON.parse(resultText);
  } catch (parseError) {
    const sanitized = resultText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(sanitized);
  }
};

const extractJsonCandidate = (text) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
};

const normalizeText = (value) => {
  if (!value) {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
};

const extractTextValue = (pdfText, labels) => {
  if (!pdfText) {
    return null;
  }

  for (const label of labels) {
    const regex = new RegExp(`${label}\\s*[:\-]?\\s*([^\\n\\r]{3,200})`, 'i');
    const match = regex.exec(pdfText);
    if (match && match[1]) {
      const value = normalizeText(match[1]);
      if (value.length >= 3) {
        return value;
      }
    }
  }

  return null;
};

const extractNameNearIdentifier = (pdfText, identifier) => {
  if (!pdfText || !identifier) {
    return null;
  }

  const cleanIdentifier = String(identifier).replace(/\D/g, '');
  if (!cleanIdentifier) {
    return null;
  }

  const regex = new RegExp(`([A-ZÁÀÃÉÍÓÔÕÚÇ0-9\s\.\-\/\&]{10,200})\\s*${cleanIdentifier}`, 'g');
  let match;
  while ((match = regex.exec(pdfText)) !== null) {
    const candidate = normalizeText(match[1]);
    const lines = candidate.split(/[\r\n]+/).map((line) => normalizeText(line)).filter(Boolean);
    if (lines.length > 0) {
      return lines[lines.length - 1];
    }
  }

  return null;
};

const normalizeNumber = (value) => {
  if (typeof value === 'number') {
    return value;
  }
  if (!value) {
    return 0;
  }

  const normalized = String(value)
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^\d\.\-]/g, '');

  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeInt = (value) => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  const parsed = parseInt(String(value).replace(/[^\d]/g, ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const toSqlDate = (value) => {
  if (!value) {
    return null;
  }
  const candidate = new Date(value);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }
  return candidate.toISOString().slice(0, 10);
};

const foldKey = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const MAX_PROMPT_TEXT_CHARS = 48000;

const buildPrompt = (pdfText) => {
  const trimmedText =
    pdfText && pdfText.length > MAX_PROMPT_TEXT_CHARS
      ? `${pdfText.slice(0, MAX_PROMPT_TEXT_CHARS)}\n\n[Texto truncado por limite de tamanho; use apenas o trecho acima.]`
      : pdfText;

  return `
Voce e um assistente especializado em processamento de Notas Fiscais (Contas a Pagar ou Receber).
Com base no texto extraido abaixo, retorne SOMENTE um unico objeto JSON valido (RFC 8259), sem markdown, sem comentarios e sem texto fora do JSON.

Texto da nota:
${trimmedText}

Estrutura exata desejada (exemplo valido — copie as chaves; substitua valores; use null apenas onde indicado):
{
  "fornecedor": { "razaoSocial": "", "fantasia": "", "cnpj": "" },
  "cliente": { "nomeOuRazaoSocial": "", "documento": "", "endereco": "" },
  "numeroNotaFiscal": "",
  "dataEmissao": "",
  "descricaoProdutos": "",
  "quantidadeParcelas": 1,
  "dataVencimento": "",
  "valorTotal": 0.0,
  "tipo": "APAGAR",
  "classificacoesDespesa": [],
  "classificacoesReceita": [],
  "parcelas": []
}

Regras importantes:
- fornecedor = EMITENTE / PRESTADOR / quem emite a nota (CNPJ de 14 digitos quando houver).
- cliente = DESTINATARIO / TOMADOR / FATURADO (quem recebe a mercadoria ou servico). Nunca copie o mesmo CNPJ do emitente para o cliente, salvo se a nota indicar explicitamente que sao a mesma pessoa.
- Preencha "tipo" com "APAGAR" para contas a pagar (nota de compra/despesa) ou "ARECEBER" para contas a receber (nota de venda/receita), conforme o contexto do documento.
- classificacoesDespesa: preencha quando "tipo" for "APAGAR" (pode inferir a partir de natureza da operacao, produtos ou observacoes).
- classificacoesReceita: preencha quando "tipo" for "ARECEBER".
- parcelas: um objeto por parcela com "valor" e "dataVencimento" (YYYY-MM-DD). Se houver uma unica parcela, use quantidadeParcelas 1 e um unico item em parcelas.

Campos obrigatorios:
- fornecedor: razaoSocial, fantasia, cnpj
- cliente: nomeOuRazaoSocial, documento (CPF ou CNPJ do destinatario), endereco
  IMPORTANTE: Endereco deve ser COMPLETO incluindo rua, numero, complemento (se houver), bairro, cidade, estado, CEP.
  Extraia TUDO que conseguir encontrar. Nao coloque apenas o CEP.
- numeroNotaFiscal
- dataEmissao
- descricaoProdutos (texto resumido ou lista)
- quantidadeParcelas
- dataVencimento (primeira parcela ou unica)
- valorTotal
- parcelas: array de objetos {"valor": number, "dataVencimento": "YYYY-MM-DD"}

Se algum campo nao existir no PDF, devolva string vazia ou array vazio, mas mantenha a estrutura.

Classificacoes permitidas (use exatamente um destes textos ou o mais proximo possivel):
- INSUMOS AGRICOLAS
- MANUTENCAO E OPERACAO
- RECURSOS HUMANOS
- SERVICOS OPERACIONAIS
- INFRAESTRUTURA E UTILIDADES
- ADMINISTRATIVAS
- SEGUROS E PROTECAO
- IMPOSTOS E TAXAS
- INVESTIMENTOS

ATENCAO: Se o endereco estiver dividido em multiplas linhas no PDF, junte tudo em um texto unico.
`;
};

const findOrCreateFornecedor = async ({ razaoSocial, fantasia, cnpj }) => {
  const cleanCnpj = String(cnpj || '').replace(/\D/g, '');
  if (!cleanCnpj) {
    throw new Error('CNPJ do fornecedor é obrigatório.');
  }

  const [rows] = await db.query('SELECT * FROM mantem_fornecedor WHERE cnpj = ?', [cleanCnpj]);
  if (rows.length) {
    return { ...rows[0], exists: true };
  }

  const [result] = await db.query(
    'INSERT INTO mantem_fornecedor (razao_social, nome_fantasia, cnpj, status) VALUES (?, ?, ?, ?)',
    [razaoSocial || '', fantasia || '', cleanCnpj, 'ATIVO']
  );

  const [inserted] = await db.query('SELECT * FROM mantem_fornecedor WHERE id = ?', [result.insertId]);
  return { ...inserted[0], exists: false };
};

const findOrCreateFaturado = async ({ nome, documento, endereco }) => {
  const cleanDoc = String(documento || '').replace(/\D/g, '');
  if (!cleanDoc) {
    throw new Error('Documento do faturado é obrigatório.');
  }

  const [rows] = await db.query('SELECT * FROM mantem_faturado WHERE documento = ?', [cleanDoc]);
  if (rows.length) {
    return { ...rows[0], exists: true };
  }

  const [result] = await db.query(
    'INSERT INTO mantem_faturado (nome, documento, endereco, status) VALUES (?, ?, ?, ?)',
    [nome || '', cleanDoc, endereco || '', 'ATIVO']
  );

  const [inserted] = await db.query('SELECT * FROM mantem_faturado WHERE id = ?', [result.insertId]);
  return { ...inserted[0], exists: false };
};

const findOrCreateCliente = async ({ nome, documento, endereco }) => {
  const cleanDoc = String(documento || '').replace(/\D/g, '');
  if (!cleanDoc) {
    throw new Error('Documento do cliente é obrigatório.');
  }

  const [rows] = await db.query('SELECT * FROM mantem_cliente WHERE documento = ?', [cleanDoc]);
  if (rows.length) {
    return { ...rows[0], exists: true };
  }

  const [result] = await db.query(
    'INSERT INTO mantem_cliente (nome, documento, endereco, status) VALUES (?, ?, ?, ?)',
    [nome || '', cleanDoc, endereco || '', 'ATIVO']
  );

  const [inserted] = await db.query('SELECT * FROM mantem_cliente WHERE id = ?', [result.insertId]);
  return { ...inserted[0], exists: false };
};

const getTipoDespesaByDescricao = async (descricao) => {
  const trimmed = String(descricao || '').trim();
  if (!trimmed) {
    return null;
  }
  const upper = trimmed.toUpperCase();
  const [rows] = await db.query('SELECT * FROM tipo_despesa WHERE UPPER(descricao) = ?', [upper]);
  if (rows.length) {
    return rows[0];
  }
  const [all] = await db.query('SELECT * FROM tipo_despesa');
  const target = foldKey(trimmed);
  return all.find((row) => foldKey(row.descricao) === target) || null;
};

const getTipoReceitaByDescricao = async (descricao) => {
  const trimmed = String(descricao || '').trim();
  if (!trimmed) {
    return null;
  }
  const upper = trimmed.toUpperCase();
  const [rows] = await db.query('SELECT * FROM tipo_receita WHERE UPPER(descricao) = ?', [upper]);
  if (rows.length) {
    return rows[0];
  }
  const [all] = await db.query('SELECT * FROM tipo_receita');
  const target = foldKey(trimmed);
  return all.find((row) => foldKey(row.descricao) === target) || null;
};

const findOrCreateTipoDespesa = async (descricao) => {
  const description = String(descricao || '').trim();
  if (!description) {
    throw new Error('Descricao da classificacao de despesa eh obrigatoria.');
  }

  const existing = await getTipoDespesaByDescricao(description);
  if (existing) {
    return { ...existing, exists: true };
  }

  const normalized = description.toUpperCase();
  const [result] = await db.query('INSERT INTO tipo_despesa (descricao, status) VALUES (?, ?)', [normalized, 'ATIVO']);
  const [inserted] = await db.query('SELECT * FROM tipo_despesa WHERE id = ?', [result.insertId]);
  return { ...inserted[0], exists: false };
};

const findOrCreateTipoReceita = async (descricao) => {
  const description = String(descricao || '').trim();
  if (!description) {
    throw new Error('Descricao da classificacao de receita eh obrigatoria.');
  }

  const existing = await getTipoReceitaByDescricao(description);
  if (existing) {
    return { ...existing, exists: true };
  }

  const normalized = description.toUpperCase();
  const [result] = await db.query('INSERT INTO tipo_receita (descricao, status) VALUES (?, ?)', [normalized, 'ATIVO']);
  const [inserted] = await db.query('SELECT * FROM tipo_receita WHERE id = ?', [result.insertId]);
  return { ...inserted[0], exists: false };
};

const findOrCreateTipoDespesaList = async (descriptions) => {
  return Promise.all(descriptions.map((descricao) => findOrCreateTipoDespesa(descricao)));
};

const findOrCreateTipoReceitaList = async (descriptions) => {
  return Promise.all(descriptions.map((descricao) => findOrCreateTipoReceita(descricao)));
};

const attachTipoDespesaToMovimento = async (movimentoContaId, tipoDespesaIds) => {
  if (!Array.isArray(tipoDespesaIds) || !tipoDespesaIds.length) {
    return;
  }

  const promises = tipoDespesaIds.map((tipoDespesaId) => db.query(
    'INSERT INTO movimentocontas_tipos_despesas (movimento_contas_id, tipo_despesa_id) VALUES (?, ?)',
    [movimentoContaId, tipoDespesaId]
  ));
  await Promise.all(promises);
};

const attachTipoReceitaToMovimento = async (movimentoContaId, tipoReceitaIds) => {
  if (!Array.isArray(tipoReceitaIds) || !tipoReceitaIds.length) {
    return;
  }

  const promises = tipoReceitaIds.map((tipoReceitaId) => db.query(
    'INSERT INTO movimentocontas_tipos_receitas (movimento_contas_id, tipo_receita_id) VALUES (?, ?)',
    [movimentoContaId, tipoReceitaId]
  ));
  await Promise.all(promises);
};

const createMovimentoConta = async ({ fornecedorId, faturadoId, numeroNotaFiscal, dataEmissao, dataVencimento, valorTotal, tipo, tipoDespesaId }) => {
  const [result] = await db.query(
    `INSERT INTO movimentocontas
      (fornecedor_id, faturado_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, tipo_despesa_id, tipo, status_pagamento)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fornecedorId, faturadoId, numeroNotaFiscal || null, dataEmissao, dataVencimento, valorTotal, tipoDespesaId || null, tipo, 'PENDENTE']
  );
  return result.insertId;
};

const createParcelas = async ({ movimentoContaId, dataVencimento, quantidadeParcelas, valorTotal, parcelasDetalhadas }) => {
  const parcelas = [];
  const fallbackDue = toSqlDate(dataVencimento) || new Date().toISOString().slice(0, 10);
  const parcelCountForIdent = () => {
    if (Array.isArray(parcelasDetalhadas) && parcelasDetalhadas.length > 0) {
      return parcelasDetalhadas.length;
    }
    return normalizeInt(quantidadeParcelas);
  };
  const identificacao = parcelCountForIdent() <= 1 ? 'UNICA' : 'PARCELADA';

  if (Array.isArray(parcelasDetalhadas) && parcelasDetalhadas.length > 0) {
    for (let i = 0; i < parcelasDetalhadas.length; i += 1) {
      const p = parcelasDetalhadas[i];
      const parcelaNumero = normalizeInt(p.parcela ?? i + 1);
      const amount = Number(normalizeNumber(p.valor).toFixed(2));
      const dueDateSql = toSqlDate(p.dataVencimento) || fallbackDue;

      const insertWithIdent = async () => {
        const [result] = await db.query(
          'INSERT INTO parcelacontas (movimento_contas_id, parcela_numero, valor, data_vencimento, identificacao, status_pagamento) VALUES (?, ?, ?, ?, ?, ?)',
          [movimentoContaId, parcelaNumero, amount, dueDateSql, identificacao, 'PENDENTE']
        );
        return result.insertId;
      };

      const insertLegacy = async () => {
        const [result] = await db.query(
          'INSERT INTO parcelacontas (movimento_contas_id, parcela_numero, valor, data_vencimento, status_pagamento) VALUES (?, ?, ?, ?, ?)',
          [movimentoContaId, parcelaNumero, amount, dueDateSql, 'PENDENTE']
        );
        return result.insertId;
      };

      let insertId;
      try {
        insertId = await insertWithIdent();
      } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054) {
          insertId = await insertLegacy();
        } else {
          throw err;
        }
      }

      parcelas.push({ id: insertId, parcela: parcelaNumero, valor: amount, dataVencimento: dueDateSql, identificacao, status: 'PENDENTE' });
    }
    return parcelas;
  }

  const parcelaCount = normalizeInt(quantidadeParcelas);
  const monthlyBase = Math.floor((valorTotal * 100) / parcelaCount) / 100;
  let remaining = Number((valorTotal - monthlyBase * parcelaCount).toFixed(2));

  const startDate = toSqlDate(dataVencimento) ? new Date(toSqlDate(dataVencimento)) : new Date();
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Data de vencimento invalida para parcelamento.');
  }

  for (let i = 1; i <= parcelaCount; i += 1) {
    const amount = Number((monthlyBase + (i === parcelaCount ? remaining : 0)).toFixed(2));
    if (i === parcelaCount) {
      remaining = 0;
    }

    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));
    const dueDateSql = dueDate.toISOString().slice(0, 10);

    let insertId;
    try {
      const [result] = await db.query(
        'INSERT INTO parcelacontas (movimento_contas_id, parcela_numero, valor, data_vencimento, identificacao, status_pagamento) VALUES (?, ?, ?, ?, ?, ?)',
        [movimentoContaId, i, amount, dueDateSql, identificacao, 'PENDENTE']
      );
      insertId = result.insertId;
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054) {
        const [result] = await db.query(
          'INSERT INTO parcelacontas (movimento_contas_id, parcela_numero, valor, data_vencimento, status_pagamento) VALUES (?, ?, ?, ?, ?)',
          [movimentoContaId, i, amount, dueDateSql, 'PENDENTE']
        );
        insertId = result.insertId;
      } else {
        throw err;
      }
    }

    parcelas.push({ id: insertId, parcela: i, valor: amount, dataVencimento: dueDateSql, identificacao, status: 'PENDENTE' });
  }

  return parcelas;
};

const normalizeClassificationList = (value) => {
  if (!value) {
    return [];
  }

  const parseSingle = (entry) => {
    if (!entry) {
      return [];
    }
    if (typeof entry === 'string') {
      return entry
        .split(/[,;|\/]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.toUpperCase());
    }
    if (typeof entry === 'object') {
      return Object.values(entry).flatMap(parseSingle);
    }
    return [];
  };

  const items = Array.isArray(value) ? value.flatMap(parseSingle) : parseSingle(value);
  return [...new Set(items)];
};

const normalizeParcelDetails = (rawParcelas, quantidadeParcelas, valorTotal, dataVencimento) => {
  if (Array.isArray(rawParcelas) && rawParcelas.length > 0) {
    const items = rawParcelas
      .map((item, index) => {
        if (!item) {
          return null;
        }

        if (typeof item === 'object') {
          const valor = normalizeNumber(item.valor ?? item.amount ?? item.value ?? item.valorTotal ?? item.total);
          const data = toSqlDate(item.dataVencimento || item.data_vencimento || item.vencimento || item.dueDate);
          return {
            parcela: index + 1,
            valor: valor || 0,
            dataVencimento: data || null
          };
        }

        const valor = normalizeNumber(item);
        return {
          parcela: index + 1,
          valor,
          dataVencimento: null
        };
      })
      .filter(Boolean);

    if (items.length > 0) {
      return items;
    }
  }

  const count = normalizeInt(quantidadeParcelas);
  const baseValue = Math.floor((valorTotal * 100) / count) / 100;
  let remaining = Number((valorTotal - baseValue * count).toFixed(2));
  const startDate = toSqlDate(dataVencimento) ? new Date(toSqlDate(dataVencimento)) : new Date();

  return Array.from({ length: count }, (_, index) => {
    const amount = Number((baseValue + (index === count - 1 ? remaining : 0)).toFixed(2));
    if (index === count - 1) {
      remaining = 0;
    }
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + index);
    return {
      parcela: index + 1,
      valor: amount,
      dataVencimento: dueDate.toISOString().slice(0, 10)
    };
  });
};

const findFirstStringValue = (value, testFn) => {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return testFn(value) ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findFirstStringValue(item, testFn);
      if (result) {
        return result;
      }
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const result = findFirstStringValue(value[key], testFn);
      if (result) {
        return result;
      }
    }
  }
  return null;
};

const findCnpjInParsedJson = (parsedJson) => {
  const fornecedorRoot = parsedJson?.fornecedor;
  const candidate = findFirstStringValue(fornecedorRoot || {}, (text) => {
    const digits = text.replace(/\D/g, '');
    return digits.length === 14;
  });
  return candidate ? candidate.replace(/\D/g, '') : null;
};

const findDocumentoInFaturadoSubtree = (parsedJson) => {
  const faturadoRoot = parsedJson?.faturado || parsedJson?.cliente;
  if (!faturadoRoot || typeof faturadoRoot !== 'object') {
    return null;
  }

  const direct =
    faturadoRoot.documento ||
    faturadoRoot.cpf ||
    faturadoRoot.cnpj ||
    faturadoRoot.CPF ||
    faturadoRoot.CNPJ;

  if (direct) {
    const digits = String(direct).replace(/\D/g, '');
    if (digits.length === 11 || digits.length === 14) {
      return digits;
    }
  }

  const candidate = findFirstStringValue(faturadoRoot, (text) => {
    const digits = text.replace(/\D/g, '');
    return digits.length === 11 || digits.length === 14;
  });
  return candidate ? candidate.replace(/\D/g, '') : null;
};

const normalizeParsedData = (parsedJson, pdfText) => {
  const fornecedorData = parsedJson.fornecedor || {};
  const faturadoData = parsedJson.faturado || parsedJson.cliente || {};
  const classificacao = parsedJson.classificacaoDespesa || parsedJson.tipoDespesa || parsedJson.classificacao || '';
  const tipo = String(parsedJson.tipo || parsedJson.tipoMovimento || parsedJson.movimento || '').toUpperCase() === 'ARECEBER' ? 'ARECEBER' : 'APAGAR';
  const numeroNotaFiscal = parsedJson.numeroNotaFiscal || parsedJson.numero_nota_fiscal || parsedJson.notaFiscal || null;
  const dataEmissao = toSqlDate(parsedJson.dataEmissao || parsedJson.data_emissao);
  const dataVencimento = toSqlDate(parsedJson.dataVencimento || parsedJson.data_vencimento);
  const valorTotal = normalizeNumber(parsedJson.valorTotal || parsedJson.valor_total);
  const quantidadeParcelas = normalizeInt(parsedJson.quantidadeParcelas || (Array.isArray(parsedJson.parcelas) ? parsedJson.parcelas.length : parsedJson.parcelas) || 1);
  const classificacoesDespesa = normalizeClassificationList(parsedJson.classificacoesDespesa || parsedJson.classificacoes || parsedJson.tipoDespesa || parsedJson.classificacaoDespesa || classificacao);
  const classificacoesReceita = normalizeClassificationList(parsedJson.classificacoesReceita || parsedJson.tipoReceita || parsedJson.classificacaoReceita);
  const rawParcelas = parsedJson.parcelas || parsedJson.parcelasDetalhadas || parsedJson.parcels;

  const fornecedorCnpj = fornecedorData.cnpj || fornecedorData.CNPJ || findCnpjInParsedJson(parsedJson);
  const faturadoDocumento =
    faturadoData.documento || faturadoData.cpf || faturadoData.cnpj || findDocumentoInFaturadoSubtree(parsedJson);

  const normalizedFornecedorName = normalizeText(fornecedorData.razaoSocial || fornecedorData.razao_social || fornecedorData.nome || fornecedorData.nomeFantasia || fornecedorData.fantasia);
  const normalizedFantasia = normalizeText(fornecedorData.fantasia || fornecedorData.nomeFantasia || fornecedorData.fantasia || fornecedorData.razaoSocial);
  const normalizedFaturadoName = normalizeText(faturadoData.nome || faturadoData.nomeOuRazaoSocial || faturadoData.razaoSocial || faturadoData.nome_fantasia || faturadoData.razaoSocial);
  const normalizedFaturadoAddress = normalizeText(faturadoData.endereco || faturadoData.address || '');

  const extractedFornecedorName = !normalizedFornecedorName && fornecedorCnpj
    ? extractNameNearIdentifier(pdfText, fornecedorCnpj) || extractTextValue(pdfText, ['Raz[aã]o Social', 'Nome\/Raz[aã]o Social', 'Emitente', 'Fornecedor'])
    : null;

  const extractedFaturadoName = !normalizedFaturadoName && faturadoDocumento
    ? extractNameNearIdentifier(pdfText, faturadoDocumento) || extractTextValue(pdfText, ['Destinat[aá]rio', 'Cliente', 'Comprador', 'Faturado'])
    : null;

  const extractedFaturadoAddress = !normalizedFaturadoAddress
    ? extractTextValue(pdfText, ['Endere[cç]o', 'Rua', 'Av\.', 'Avenida', 'Logradouro'])
    : null;

  const resolvedNome = normalizedFaturadoName || extractedFaturadoName || '';
  const resolvedEndereco = normalizedFaturadoAddress || extractedFaturadoAddress || '';

  return {
    fornecedorData: {
      ...fornecedorData,
      cnpj: fornecedorCnpj,
      razaoSocial: normalizedFornecedorName || extractedFornecedorName || '',
      fantasia: normalizedFantasia || extractedFornecedorName || ''
    },
    clienteData: {
      nome: resolvedNome,
      documento: faturadoDocumento,
      endereco: resolvedEndereco
    },
    faturadoData: {
      ...faturadoData,
      documento: faturadoDocumento,
      nome: resolvedNome,
      endereco: resolvedEndereco
    },
    tipo,
    classificacao,
    classificacoesDespesa,
    classificacoesReceita,
    numeroNotaFiscal,
    dataEmissao,
    dataVencimento,
    valorTotal,
    quantidadeParcelas,
    rawParcelas
  };
};

const findFornecedorByCnpj = async (cnpj) => {
  if (!cnpj) {
    return null;
  }
  const [rows] = await db.query('SELECT * FROM mantem_fornecedor WHERE cnpj = ?', [cnpj]);
  return rows[0] || null;
};

const findFaturadoByDocumento = async (documento) => {
  if (!documento) {
    return null;
  }
  const [rows] = await db.query('SELECT * FROM mantem_faturado WHERE documento = ?', [documento]);
  return rows[0] || null;
};

const findClienteByDocumento = async (documento) => {
  if (!documento) {
    return null;
  }
  const [rows] = await db.query('SELECT * FROM mantem_cliente WHERE documento = ?', [documento]);
  return rows[0] || null;
};

const checkPdfDataInDatabase = async (parsedJson, pdfText) => {
  const {
    fornecedorData,
    clienteData,
    faturadoData,
    tipo,
    classificacao,
    classificacoesDespesa,
    classificacoesReceita,
    numeroNotaFiscal,
    dataEmissao,
    dataVencimento,
    valorTotal,
    quantidadeParcelas
  } = normalizeParsedData(parsedJson, pdfText);

  const cleanCnpj = String(fornecedorData.cnpj || fornecedorData.CNPJ || '').replace(/\D/g, '');
  const cleanDoc = String(faturadoData.documento || faturadoData.cpf || faturadoData.cnpj || '').replace(/\D/g, '');

  const fornecedorRow = await findFornecedorByCnpj(cleanCnpj);
  const faturadoRow = await findFaturadoByDocumento(cleanDoc);
  const clienteRow = await findClienteByDocumento(cleanDoc);

  const classificationRows = tipo === 'ARECEBER'
    ? await Promise.all(classificacoesReceita.map(getTipoReceitaByDescricao))
    : await Promise.all(classificacoesDespesa.map(getTipoDespesaByDescricao));

  const classifications = (tipo === 'ARECEBER' ? classificacoesReceita : classificacoesDespesa).map((descricao, index) => {
    const row = classificationRows[index];
    return row
      ? { id: row.id, exists: true, descricao: row.descricao }
      : { id: null, exists: false, descricao };
  });

  return {
    parsedData: {
      fornecedor: {
        razaoSocial: fornecedorData.razaoSocial || fornecedorData.razao_social || fornecedorData.nome || '',
        fantasia: fornecedorData.fantasia || fornecedorData.nomeFantasia || '',
        cnpj: cleanCnpj
      },
      faturado: {
        nome: faturadoData.nome || faturadoData.nomeOuRazaoSocial || faturadoData.razaoSocial || '',
        documento: cleanDoc,
        endereco: faturadoData.endereco || faturadoData.address || ''
      },
      cliente: {
        nome: clienteData.nome || faturadoData.nome || faturadoData.nomeOuRazaoSocial || '',
        documento: cleanDoc,
        endereco: clienteData.endereco || faturadoData.endereco || faturadoData.address || ''
      },
      tipo,
      classificacaoDespesa: tipo === 'APAGAR' ? classificacoesDespesa : [],
      classificacaoReceita: tipo === 'ARECEBER' ? classificacoesReceita : [],
      numeroNotaFiscal,
      dataEmissao,
      dataVencimento,
      valorTotal,
      quantidadeParcelas
    },
    database: {
      fornecedor: fornecedorRow
        ? {
          id: fornecedorRow.id,
          exists: true,
          cnpj: fornecedorRow.cnpj,
          razaoSocial:
            (fornecedorRow.razao_social && String(fornecedorRow.razao_social).trim()) ||
            (fornecedorRow.nome_fantasia && String(fornecedorRow.nome_fantasia).trim()) ||
            fornecedorData.razaoSocial ||
            fornecedorData.razao_social ||
            fornecedorData.nome ||
            '',
          nomeFantasia: fornecedorRow.nome_fantasia || fornecedorData.fantasia || fornecedorData.nomeFantasia || ''
        }
        : {
          id: null,
          exists: false,
          cnpj: cleanCnpj,
          razaoSocial: fornecedorData.razaoSocial || fornecedorData.razao_social || fornecedorData.nome || '',
          nomeFantasia: fornecedorData.fantasia || fornecedorData.nomeFantasia || ''
        },
      faturado: faturadoRow
        ? { id: faturadoRow.id, exists: true, documento: faturadoRow.documento, nome: faturadoRow.nome, endereco: faturadoRow.endereco }
        : { id: null, exists: false, documento: cleanDoc, nome: faturadoData.nome || faturadoData.nomeOuRazaoSocial || '', endereco: faturadoData.endereco || '' },
      cliente: clienteRow
        ? { id: clienteRow.id, exists: true, documento: clienteRow.documento, nome: clienteRow.nome, endereco: clienteRow.endereco }
        : { id: null, exists: false, documento: cleanDoc, nome: clienteData.nome || '', endereco: clienteData.endereco || '' },
      tipo,
      classificacoes: classifications
    }
  };
};

const savePdfDataToDatabase = async (parsedJson) => {
  const fornecedorData = parsedJson.fornecedor || {};
  const clienteData = parsedJson.cliente || parsedJson.faturado || {};
  const faturadoData = parsedJson.faturado || parsedJson.cliente || {};
  const tipo = String(parsedJson.tipo || parsedJson.tipoMovimento || parsedJson.movimento || '').toUpperCase() === 'ARECEBER' ? 'ARECEBER' : 'APAGAR';
  const classificacoesDespesa = normalizeClassificationList(parsedJson.classificacoesDespesa || parsedJson.classificacoes || parsedJson.tipoDespesa || parsedJson.classificacaoDespesa || parsedJson.classificacao);
  const classificacoesReceita = normalizeClassificationList(parsedJson.classificacoesReceita || parsedJson.tipoReceita || parsedJson.classificacaoReceita);
  const numeroNotaFiscal = parsedJson.numeroNotaFiscal || parsedJson.numero_nota_fiscal || parsedJson.notaFiscal || null;
  const dataEmissao = toSqlDate(parsedJson.dataEmissao || parsedJson.data_emissao);
  const dataVencimento = toSqlDate(parsedJson.dataVencimento || parsedJson.data_vencimento);
  const valorTotal = normalizeNumber(parsedJson.valorTotal || parsedJson.valor_total);
  const quantidadeParcelas = normalizeInt(parsedJson.quantidadeParcelas || parsedJson.parcelas?.length || parsedJson.parcelas || 1);
  const rawParcelas = parsedJson.parcelas || parsedJson.parcelasDetalhadas || parsedJson.parcels;
  const parcelasDetalhadas = normalizeParcelDetails(rawParcelas, quantidadeParcelas, valorTotal, dataVencimento);

  const fornecedor = await findOrCreateFornecedor({
    razaoSocial: fornecedorData.razaoSocial || fornecedorData.razao_social || fornecedorData.nome || '',
    fantasia: fornecedorData.fantasia || fornecedorData.nomeFantasia || '',
    cnpj: fornecedorData.cnpj || fornecedorData.CNPJ || ''
  });

  const cliente = await findOrCreateCliente({
    nome: clienteData.nome || clienteData.nomeOuRazaoSocial || faturadoData.nome || faturadoData.nomeOuRazaoSocial || '',
    documento: clienteData.documento || faturadoData.documento || faturadoData.cpf || faturadoData.cnpj || '',
    endereco: clienteData.endereco || faturadoData.endereco || faturadoData.address || ''
  });

  const faturado = await findOrCreateFaturado({
    nome: faturadoData.nome || faturadoData.nomeOuRazaoSocial || faturadoData.razaoSocial || faturadoData.nome_fantasia || '',
    documento: faturadoData.documento || faturadoData.cpf || faturadoData.cnpj || '',
    endereco: faturadoData.endereco || faturadoData.address || ''
  });

  let classificationRows = [];
  let tipoDespesaId = null;
  let tipoReceitaId = null;

  if (tipo === 'ARECEBER') {
    const receitas = classificacoesReceita.length > 0 ? classificacoesReceita : normalizeClassificationList(parsedJson.classificacao || parsedJson.tipoReceita || 'RECEITA DIVERSA');
    classificationRows = await findOrCreateTipoReceitaList(receitas);
    tipoReceitaId = classificationRows[0]?.id || null;
  } else {
    const despesas = classificacoesDespesa.length > 0 ? classificacoesDespesa : normalizeClassificationList(parsedJson.classificacao || parsedJson.tipoDespesa || 'DESPESA DIVERSA');
    classificationRows = await findOrCreateTipoDespesaList(despesas);
    tipoDespesaId = classificationRows[0]?.id || null;
  }

  const movimentoContaId = await createMovimentoConta({
    fornecedorId: fornecedor.id,
    faturadoId: faturado.id,
    numeroNotaFiscal,
    dataEmissao,
    dataVencimento,
    valorTotal,
    tipo,
    tipoDespesaId
  });

  if (tipo === 'ARECEBER') {
    await attachTipoReceitaToMovimento(movimentoContaId, classificationRows.map((row) => row.id));
  } else {
    await attachTipoDespesaToMovimento(movimentoContaId, classificationRows.map((row) => row.id));
  }

  const parcelas = await createParcelas({
    movimentoContaId,
    dataVencimento,
    quantidadeParcelas,
    valorTotal,
    parcelasDetalhadas
  });

  let contasPagarId = null;
  let contasReceberId = null;
  if (tipo === 'APAGAR') {
    try {
      const [cpRes] = await db.query(
        `INSERT INTO contas_pagar (fornecedor_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, status_pagamento, tipo_despesa_id, movimento_contas_id)
         VALUES (?, ?, ?, ?, ?, 'PENDENTE', ?, ?)`,
        [fornecedor.id, numeroNotaFiscal, dataEmissao, dataVencimento, valorTotal, tipoDespesaId, movimentoContaId]
      );
      contasPagarId = cpRes.insertId;
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054) {
        const [cpRes] = await db.query(
          `INSERT INTO contas_pagar (fornecedor_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, status_pagamento, tipo_despesa_id)
           VALUES (?, ?, ?, ?, ?, 'PENDENTE', ?)`,
          [fornecedor.id, numeroNotaFiscal, dataEmissao, dataVencimento, valorTotal, tipoDespesaId]
        );
        contasPagarId = cpRes.insertId;
      } else {
        throw err;
      }
    }
  } else {
    try {
      const [crRes] = await db.query(
        `INSERT INTO contas_receber (faturado_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, status_recebimento, tipo_receita_id, movimento_contas_id)
         VALUES (?, ?, ?, ?, ?, 'PENDENTE', ?, ?)`,
        [faturado.id, numeroNotaFiscal, dataEmissao, dataVencimento, valorTotal, tipoReceitaId, movimentoContaId]
      );
      contasReceberId = crRes.insertId;
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146) {
        contasReceberId = null;
      } else if (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054) {
        const [crRes] = await db.query(
          `INSERT INTO contas_receber (faturado_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, status_recebimento, tipo_receita_id)
           VALUES (?, ?, ?, ?, ?, 'PENDENTE', ?)`,
          [faturado.id, numeroNotaFiscal, dataEmissao, dataVencimento, valorTotal, tipoReceitaId]
        );
        contasReceberId = crRes.insertId;
      } else {
        throw err;
      }
    }
  }

  return {
    fornecedor: {
      id: fornecedor.id,
      exists: fornecedor.exists,
      cnpj: fornecedor.cnpj,
      razaoSocial: fornecedor.razao_social || fornecedor.razaoSocial || '',
      nomeFantasia: fornecedor.nome_fantasia || fornecedor.nomeFantasia || ''
    },
    cliente: { id: cliente.id, exists: cliente.exists, documento: cliente.documento, nome: cliente.nome, endereco: cliente.endereco },
    faturado: { id: faturado.id, exists: faturado.exists, documento: faturado.documento, nome: faturado.nome, endereco: faturado.endereco },
    tipo,
    classificacoesDespesa: tipo === 'APAGAR' ? classificationRows.map((row) => ({ id: row.id, exists: row.exists, descricao: row.descricao })) : [],
    classificacoesReceita: tipo === 'ARECEBER' ? classificationRows.map((row) => ({ id: row.id, exists: row.exists, descricao: row.descricao })) : [],
    movimentoConta: { id: movimentoContaId, tipo, status: 'PENDENTE', valorTotal, numeroNotaFiscal },
    contasPagarId,
    contasReceberId,
    parcelas,
    classificacoes: classificationRows.map((row) => ({ id: row.id, exists: row.exists, descricao: row.descricao }))
  };
};

const listEntities = async (req, res) => {
  try {
    const type = (req.query.type || 'all').toLowerCase();
    const queries = {
      fornecedor: 'SELECT id, razao_social AS razaoSocial, nome_fantasia AS nomeFantasia, cnpj, status FROM mantem_fornecedor ORDER BY id DESC LIMIT 100',
      cliente: 'SELECT id, nome, documento, endereco, status FROM mantem_cliente ORDER BY id DESC LIMIT 100',
      faturado: 'SELECT id, nome, documento, endereco, status FROM mantem_faturado ORDER BY id DESC LIMIT 100',
      despesa: 'SELECT id, descricao, status FROM tipo_despesa ORDER BY id DESC LIMIT 100',
      receita: 'SELECT id, descricao, status FROM tipo_receita ORDER BY id DESC LIMIT 100',
      movimento: 'SELECT id, fornecedor_id, faturado_id, numero_nota_fiscal AS numeroNotaFiscal, data_emissao AS dataEmissao, data_vencimento AS dataVencimento, valor_total AS valorTotal, tipo_despesa_id AS tipoDespesaId, tipo, status_pagamento AS statusPagamento, criado_em AS criadoEm FROM movimentocontas ORDER BY id DESC LIMIT 100',
      parcela: 'SELECT id, movimento_contas_id AS movimentoContasId, parcela_numero AS parcelaNumero, valor, data_vencimento AS dataVencimento, identificacao, status_pagamento AS statusPagamento, criado_em AS criadoEm FROM parcelacontas ORDER BY id DESC LIMIT 100'
    };

    if (type === 'all') {
      const [fornecedores] = await db.query(queries.fornecedor);
      const [clientes] = await db.query(queries.cliente);
      const [faturados] = await db.query(queries.faturado);
      const [despesas] = await db.query(queries.despesa);
      const [receitas] = await db.query(queries.receita);
      const [movimentos] = await db.query(queries.movimento);
      const [parcelas] = await db.query(queries.parcela);
      return res.json({ fornecedores, clientes, faturados, despesas, receitas, movimentos, parcelas });
    }

    if (!queries[type]) {
      return res.status(400).json({ error: 'Tipo inválido para listagem.' });
    }

    const responseKeys = {
      fornecedor: 'fornecedores',
      cliente: 'clientes',
      faturado: 'faturados',
      despesa: 'despesas',
      receita: 'receitas',
      movimento: 'movimentos',
      parcela: 'parcelas'
    };

    const [rows] = await db.query(queries[type]);
    return res.json({ [responseKeys[type]]: rows });
  } catch (error) {
    console.error('Erro ao listar entidades do banco:', error);
    return res.status(500).json({ error: 'Falha ao recuperar registros do banco.' });
  }
};

const toggleStatus = async (req, res) => {
  try {
    const { entity, id } = req.body;
    const map = {
      fornecedor: 'mantem_fornecedor',
      cliente: 'mantem_cliente',
      faturado: 'mantem_faturado',
      despesa: 'tipo_despesa',
      receita: 'tipo_receita'
    };

    if (!map[entity]) {
      return res.status(400).json({ error: 'Entidade inválida para atualização de status.' });
    }

    const [rows] = await db.query(`SELECT status FROM ${map[entity]} WHERE id = ?`, [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }

    const nextStatus = rows[0].status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    await db.query(`UPDATE ${map[entity]} SET status = ? WHERE id = ?`, [nextStatus, id]);
    return res.json({ id, status: nextStatus });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    return res.status(500).json({ error: 'Falha ao atualizar status do registro.' });
  }
};

const sanitizeProviderError = (provider, status, message) => {
  const text = message || `Falha ao comunicar com ${provider}.`;

  if (status === 401 || text.includes('API_KEY_INVALID') || text.includes('API key expired')) {
    return {
      status: 401,
      error: `Chave da API ${provider} invalida, expirada ou sem permissao.`,
      details: text
    };
  }

  if (status === 429 || text.includes('RESOURCE_EXHAUSTED')) {
    const hint = hasOpenRouter()
      ? ' Se OPENROUTER_API_KEY estiver configurada, o backend tenta OpenRouter automaticamente; confira os logs.'
      : ' Configure OPENROUTER_API_KEY no .env para usar modelos gratuitos como alternativa.';
    return {
      status: 429,
      error: `Limite da API ${provider} excedido (cota ou taxa).${hint}`,
      details: text
    };
  }

  return {
    status: status || 500,
    error: 'Erro ao processar o arquivo PDF.',
    details: text
  };
};

const extractPdfText = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    const text = parsed?.text?.trim();
    if (!text) {
      throw new Error('Nao foi possivel extrair texto do PDF. Verifique se o arquivo nao esta corrompido.');
    }
    return text;
  } finally {
    await parser.destroy();
  }
};

const generateWithOpenRouter = async (promptText) => {
  if (!process.env.OPENROUTER_API_KEY) {
    const err = new Error('OPENROUTER_API_KEY nao esta configurada no backend.');
    err.provider = 'openrouter';
    err.status = 500;
    throw err;
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  const extractContent = (payload) => {
    const message = payload?.choices?.[0]?.message;
    if (!message) {
      return null;
    }

    if (typeof message.content === 'string' && message.content.trim()) {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      const joined = message.content
        .map((part) => (typeof part === 'string' ? part : part?.text || ''))
        .join('\n')
        .trim();
      if (joined) {
        return joined;
      }
    }

    return null;
  };

  const attempts = [
    {
      model,
      messages: [{ role: 'user', content: promptText }],
      response_format: { type: 'json_object' },
      temperature: 0.1
    },
    {
      model,
      messages: [
        {
          role: 'user',
          content: `${promptText}\n\nIMPORTANTE: responda com JSON valido no campo content.`
        }
      ],
      temperature: 0.1
    }
  ];

  for (const body of attempts) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || `Erro OpenRouter (${response.status})`;
      const providerError = new Error(message);
      providerError.provider = 'openrouter';
      providerError.status = response.status;
      throw providerError;
    }

    const content = extractContent(payload);
    if (content) {
      return content;
    }
  }

  throw new Error('OpenRouter nao retornou conteudo.');
};

const generateWithGemini = async (promptText) => {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY nao esta configurada no backend.');
    err.provider = 'gemini';
    err.status = 500;
    throw err;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const response = await ai.models.generateContent({
      model,
      contents: promptText,
      config: { responseMimeType: 'application/json' }
    });

    const content = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      const err = new Error('Gemini nao retornou conteudo.');
      err.provider = 'gemini';
      err.status = 500;
      throw err;
    }

    return content;
  } catch (err) {
    const msg = String(err?.message || err || '');
    const statusGuess =
      err?.status ??
      err?.statusCode ??
      (/\b429\b|RESOURCE_EXHAUSTED|quota exceeded|exceeded your current quota|rate limit|free_tier/i.test(msg) ? 429 : undefined);
    const wrapped = new Error(msg || 'Erro ao chamar Gemini');
    wrapped.provider = 'gemini';
    wrapped.status = statusGuess || 500;
    wrapped.cause = err;
    throw wrapped;
  }
};

const repairJsonWithProvider = async (rawText, provider) => {
  const repairPrompt = `
Converta o texto abaixo em JSON valido.
Retorne SOMENTE JSON puro, sem markdown e sem comentarios.
Nao invente dados novos; apenas corrija sintaxe.

Texto:
${rawText}
`;

  if (provider === 'gemini' && !hasGemini()) {
    return generateWithOpenRouter(repairPrompt);
  }
  if (provider === 'openrouter' && !hasOpenRouter()) {
    return generateWithGemini(repairPrompt);
  }

  return invokeLlmWithFallback(repairPrompt, 'reparo-json');
};

const extractDataFromPdf = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo PDF enviado.' });
    }

    const pdfText = await extractPdfText(req.file.buffer);
    const promptText = buildPrompt(pdfText);

    const resultText = await invokeLlmWithFallback(promptText, 'extracao-pdf');

    let parsedJson;
    try {
      parsedJson = parseModelJson(resultText);
    } catch (firstParseError) {
      const candidate = extractJsonCandidate(resultText);
      const repairedText = await repairJsonWithProvider(candidate, getProvider());
      parsedJson = parseModelJson(repairedText);
    }

    const databaseResult = await checkPdfDataInDatabase(parsedJson, pdfText);
    res.json(databaseResult);
  } catch (error) {
    console.error('Erro na extração de dados:', error);

    if (error.provider) {
      const providerName = error.provider === 'gemini' ? 'Gemini' : 'OpenRouter';
      const providerError = sanitizeProviderError(providerName, error?.status, error?.message);
      return res.status(providerError.status).json({
        error: providerError.error,
        details: providerError.details
      });
    }

    return res.status(500).json({
      error: 'Erro ao processar a extração.',
      details: error?.message || 'Falha inesperada no backend.'
    });
  }
};

const validateParsedDataForSave = (parsedData) => {
  const errors = [];
  const fornecedor = parsedData?.fornecedor || {};
  const faturado = parsedData?.faturado || {};
  const cliente = parsedData?.cliente || {};
  const cnpj = String(fornecedor.cnpj || '').replace(/\D/g, '');
  if (cnpj.length !== 14) {
    errors.push('CNPJ do fornecedor invalido ou incompleto (14 digitos).');
  }
  const doc = String(faturado.documento || cliente.documento || '').replace(/\D/g, '');
  if (!(doc.length === 11 || doc.length === 14)) {
    errors.push('CPF ou CNPJ do destinatario (cliente/faturado) invalido ou ausente.');
  }
  const valorTotal = normalizeNumber(parsedData?.valorTotal);
  if (valorTotal <= 0) {
    errors.push('Valor total deve ser maior que zero.');
  }
  if (!toSqlDate(parsedData?.dataEmissao)) {
    errors.push('Data de emissao invalida ou ausente.');
  }
  return { ok: errors.length === 0, errors };
};

const confirmDatabaseSave = async (req, res) => {
  try {
    const { parsedData } = req.body;
    if (!parsedData) {
      return res.status(400).json({ error: 'parsedData is required to salvar no banco.' });
    }

    const validation = validateParsedDataForSave(parsedData);
    if (!validation.ok) {
      return res.status(400).json({
        error: 'Dados insuficientes para registrar o movimento.',
        details: validation.errors.join(' '),
        validationErrors: validation.errors
      });
    }

    const databaseResult = await savePdfDataToDatabase(parsedData);
    res.json({ parsedData, database: databaseResult });
  } catch (error) {
    console.error('Erro ao salvar dados no banco:', error);
    const providerError = sanitizeProviderError('Banco de Dados', error?.status, error?.message);
    res.status(providerError.status).json({ error: providerError.error, details: providerError.details });
  }
};

module.exports = {
  extractDataFromPdf,
  confirmDatabaseSave,
  listEntities,
  toggleStatus
};
