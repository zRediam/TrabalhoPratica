const { PDFParse } = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const db = require('../config/db');

const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-oss-20b:free';
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

const getProvider = () => {
  console.log('[PROVIDER] OpenRouter only');
  return 'openrouter';
};

const hasOpenRouter = () => {
  const hasKey = Boolean(String(process.env.OPENROUTER_API_KEY || '').trim());
  if (!hasKey) console.error('[PROVIDER] Key not set');
  return hasKey;
};

const hasGemini = () => false; // disabled

const invokeLlmWithFallback = async (promptText, contextLabel = 'extracao', options = { jsonResponse: true }) => {
  console.log(`[LLM-${contextLabel}] Using OpenRouter`);
  
  if (!hasOpenRouter()) throw new Error('OPENROUTER_API_KEY missing');

  try {
    const response = await generateWithOpenRouter(promptText, options);
    console.log(`[LLM-${contextLabel}] OK`);
    return response;
  } catch (error) {
    console.error(`[LLM-${contextLabel}] Error:`, error.message);
    throw error;
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
  if (!pdfText) return null;

  for (const label of labels) {
    // Pattern 1: label: value
    let regex = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\n\\r]{3,200})`, 'i');
    let match = regex.exec(pdfText);
    if (match && match[1]) {
      const value = normalizeText(match[1]);
      if (value.length >= 3) return value;
    }

    // Pattern 2: label on line, value below
    regex = new RegExp(`^\\s*${label}\\s*$[\\r\\n]+([^\\n\\r]{3,200})`, 'im');
    match = regex.exec(pdfText);
    if (match && match[1]) {
      const value = normalizeText(match[1]);
      if (value.length >= 3) return value;
    }

    // Pattern 3: label with spaces
    regex = new RegExp(`${label}[\\s\\:\\-\\.]*([A-ZÁÀÃÉÍÓÔÕÚÇÑ0-9\\s\\.\\,\\-\\/]+)`, 'i');
    match = regex.exec(pdfText);
    if (match && match[1]) {
      const value = normalizeText(match[1]).split(/[\n\r]/)[0];
      if (value.length >= 3 && value.length < 200) return value;
    }
  }
  return null;
};

const extractNameNearIdentifier = (pdfText, identifier) => {
  if (!pdfText || !identifier) return null;

  const cleanIdentifier = String(identifier).replace(/\D/g, '');
  if (!cleanIdentifier) return null;

  // Pattern 1: text before ID
  let regex = new RegExp(`([A-ZÁÀÃÉÍÓÔÕÚÇ0-9\s\.\-\/\&]{10,200})\\s*${cleanIdentifier}`, 'g');
  let match;
  while ((match = regex.exec(pdfText)) !== null) {
    const candidate = normalizeText(match[1]);
    const lines = candidate.split(/[\r\n]+/).map((line) => normalizeText(line)).filter(Boolean);
    if (lines.length > 0) return lines[lines.length - 1];
  }

  // Pattern 2: ID at line start, text after
  regex = new RegExp(`^\\s*${cleanIdentifier}\\s*[:\\-]?\\s*([A-ZÁÀÃÉÍÓÔÕÚÇ0-9\s\.\-\/\&]{10,200})$`, 'gim');
  match = regex.exec(pdfText);
  if (match && match[1]) {
    const candidate = normalizeText(match[1]);
    if (candidate.length >= 10 && candidate.length <= 200) return candidate;
  }

  // Pattern 3: check lines before/after ID
  const lines = pdfText.split(/[\r\n]+/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(cleanIdentifier)) {
      if (i > 0) {
        const candidate = normalizeText(lines[i - 1]);
        if (candidate.length >= 10 && candidate.length <= 200 && /[A-ZÁÀÃÉÍÓÔÕÚÇ]/.test(candidate)) return candidate;
      }
      if (i < lines.length - 1) {
        const candidate = normalizeText(lines[i + 1]);
        if (candidate.length >= 10 && candidate.length <= 200 && /[A-ZÁÀÃÉÍÓÔÕÚÇ]/.test(candidate)) return candidate;
      }
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
  const trimmedText = pdfText && pdfText.length > MAX_PROMPT_TEXT_CHARS
    ? `${pdfText.slice(0, MAX_PROMPT_TEXT_CHARS)}\n\n[Text truncated]`
    : pdfText;

  return `Extract data from invoice PDF. Return ONLY valid JSON (RFC 8259), no markdown.

CRITICAL:
- Fill ALL required fields when data exists in document
- CNPJ: exactly 14 digits (numbers only)
- Document (CPF/CNPJ): 11 or 14 digits
- Address: complete (street, number, neighborhood, city, state, zip)
- For missing fields, use "" or [], keep the key

PDF text:
${trimmedText}

Return this structure:
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

Rules:
- fornecedor = EMITTER/VENDOR (14-digit CNPJ)
- cliente = RECIPIENT/BUYER (destination)
- tipo: "APAGAR" (expense) or "ARECEBER" (income)
- classificacoesDespesa: when tipo="APAGAR"
- classificacoesReceita: when tipo="ARECEBER"
- parcelas: array with {valor, dataVencimento} for each installment

Required fields NEVER leave blank:
- fornecedor: razaoSocial, fantasia, cnpj (14 digits)
- cliente: nomeOuRazaoSocial, documento (11 or 14 digits), endereco (COMPLETE)
- numeroNotaFiscal, dataEmissao (YYYY-MM-DD), descricaoProdutos
- quantidadeParcelas, dataVencimento (YYYY-MM-DD), valorTotal (number)
- parcelas: array

Allowed classifications:
- INSUMOS AGRICOLAS
- MANUTENCAO E OPERACAO
- RECURSOS HUMANOS
- SERVICOS OPERACIONAIS
- INFRAESTRUTURA E UTILIDADES
- ADMINISTRATIVAS
- SEGUROS E PROTECAO
- IMPOSTOS E TAXAS
- INVESTIMENTOS
`;
};

const findOrCreateFornecedor = async ({ razaoSocial, fantasia, cnpj }) => {
  const cleanCnpj = String(cnpj || '').replace(/\D/g, '');
  if (!cleanCnpj) throw new Error('CNPJ required');

  const [rows] = await db.query('SELECT * FROM mantem_fornecedor WHERE cnpj = ?', [cleanCnpj]);
  if (rows.length) return { ...rows[0], exists: true };

  const [result] = await db.query(
    'INSERT INTO mantem_fornecedor (razao_social, nome_fantasia, cnpj, status) VALUES (?, ?, ?, ?)',
    [razaoSocial || '', fantasia || '', cleanCnpj, 'ATIVO']
  );

  const [inserted] = await db.query('SELECT * FROM mantem_fornecedor WHERE id = ?', [result.insertId]);
  return { ...inserted[0], exists: false };
};

const findOrCreateFaturado = async ({ nome, documento, endereco }) => {
  const cleanDoc = String(documento || '').replace(/\D/g, '');
  if (!cleanDoc) throw new Error('Document required');

  const [rows] = await db.query('SELECT * FROM mantem_faturado WHERE documento = ?', [cleanDoc]);
  if (rows.length) return { ...rows[0], exists: true };

  const [result] = await db.query(
    'INSERT INTO mantem_faturado (nome, documento, endereco, status) VALUES (?, ?, ?, ?)',
    [nome || '', cleanDoc, endereco || '', 'ATIVO']
  );

  const [inserted] = await db.query('SELECT * FROM mantem_faturado WHERE id = ?', [result.insertId]);
  return { ...inserted[0], exists: false };
};

const findOrCreateCliente = async ({ nome, documento, endereco }) => {
  const cleanDoc = String(documento || '').replace(/\D/g, '');
  if (!cleanDoc) throw new Error('Client document required');

  const [rows] = await db.query('SELECT * FROM mantem_cliente WHERE documento = ?', [cleanDoc]);
  if (rows.length) return { ...rows[0], exists: true };

  const [result] = await db.query(
    'INSERT INTO mantem_cliente (nome, documento, endereco, status) VALUES (?, ?, ?, ?)',
    [nome || '', cleanDoc, endereco || '', 'ATIVO']
  );

  const [inserted] = await db.query('SELECT * FROM mantem_cliente WHERE id = ?', [result.insertId]);
  return { ...inserted[0], exists: false };
};

const getTipoDespesaByDescricao = async (descricao) => {
  const upper = String(descricao || '').trim().toUpperCase();
  if (!upper) return null;
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

const createMovimentoConta = async ({ fornecedorId, faturadoId, numeroNotaFiscal, dataEmissao, dataVencimento, valorTotal, tipo, tipoDespesaId, descricaoProdutos }) => {
  const [result] = await db.query(
    `INSERT INTO movimentocontas
      (fornecedor_id, faturado_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, tipo_despesa_id, tipo, status_pagamento, descricao_produtos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fornecedorId, faturadoId, numeroNotaFiscal || null, dataEmissao, dataVencimento, valorTotal, tipoDespesaId || null, tipo, 'PENDENTE', descricaoProdutos || null]
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
  if (!value) return [];

  const parse = (entry) => {
    if (!entry) return [];
    if (typeof entry === 'string') {
      return entry.split(/[,;|\/]+/).map(i => i.trim()).filter(Boolean).map(i => i.toUpperCase());
    }
    if (typeof entry === 'object') return Object.values(entry).flatMap(parse);
    return [];
  };

  const items = Array.isArray(value) ? value.flatMap(parse) : parse(value);
  return [...new Set(items)];
};

const normalizeParcelDetails = (rawParcelas, quantidadeParcelas, valorTotal, dataVencimento) => {
  // Use AI-provided parcelas if available
  if (Array.isArray(rawParcelas) && rawParcelas.length > 0) {
    const items = rawParcelas.map((item, index) => {
      if (!item) return null;
      
      const valor = typeof item === 'object' 
        ? normalizeNumber(item.valor ?? item.amount ?? item.value ?? item.total)
        : normalizeNumber(item);
      
      const data = typeof item === 'object' ? toSqlDate(item.dataVencimento || item.data_vencimento || item.dueDate) : null;
      
      return { parcela: index + 1, valor: valor || 0, dataVencimento: data || null };
    }).filter(Boolean);

    if (items.length > 0) return items;
  }

  // Generate parcelas if not provided
  const count = normalizeInt(quantidadeParcelas);
  const baseValue = Math.floor((valorTotal * 100) / count) / 100;
  let remaining = Number((valorTotal - baseValue * count).toFixed(2));
  const startDate = toSqlDate(dataVencimento) ? new Date(toSqlDate(dataVencimento)) : new Date();

  return Array.from({ length: count }, (_, index) => {
    const amount = Number((baseValue + (index === count - 1 ? remaining : 0)).toFixed(2));
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
  const fornecedor = parsedJson.fornecedor || {};
  const cliente = parsedJson.faturado || parsedJson.cliente || {};
  const tipo = (String(parsedJson.tipo || '').toUpperCase() === 'ARECEBER') ? 'ARECEBER' : 'APAGAR';
  
  const cnpj = (fornecedor.cnpj || '').replace(/\D/g, '');
  const documento = (cliente.documento || cliente.cpf || cliente.cnpj || '').replace(/\D/g, '');
  
  // Try AI extracted data first, fallback to regex
  const nomeF = fornecedor.razaoSocial || fornecedor.fantasia || 
    (cnpj && extractNameNearIdentifier(pdfText, cnpj)) ||
    extractTextValue(pdfText, ['Razão', 'Emitente']);
  
  const nomeC = cliente.nome || cliente.nomeOuRazaoSocial ||
    (documento && extractNameNearIdentifier(pdfText, documento)) ||
    extractTextValue(pdfText, ['Destinatário', 'Cliente']);
  
  const endereco = cliente.endereco ||
    extractTextValue(pdfText, ['Endereço', 'Rua', 'Avenida']) || '';

  return {
    fornecedorData: { cnpj, razaoSocial: nomeF || '', fantasia: nomeF || '' },
    clienteData: { nome: nomeC || '', documento, endereco },
    faturadoData: { documento, nome: nomeC || '', endereco },
    tipo,
    classificacao: parsedJson.classificacao || '',
    classificacoesDespesa: normalizeClassificationList(parsedJson.classificacoesDespesa),
    classificacoesReceita: normalizeClassificationList(parsedJson.classificacoesReceita),
    numeroNotaFiscal: String(parsedJson.numeroNotaFiscal || '').trim(),
    dataEmissao: toSqlDate(parsedJson.dataEmissao),
    dataVencimento: toSqlDate(parsedJson.dataVencimento),
    valorTotal: normalizeNumber(parsedJson.valorTotal),
    quantidadeParcelas: normalizeInt(parsedJson.quantidadeParcelas),
    descricaoProdutos: normalizeText(parsedJson.descricaoProdutos),
    rawParcelas: parsedJson.parcelas || []
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
    quantidadeParcelas,
    descricaoProdutos
  } = normalizeParsedData(parsedJson, pdfText);

  const cleanCnpj = String(fornecedorData.cnpj || fornecedorData.CNPJ || '').replace(/\D/g, '');
  const cleanDoc = String(faturadoData.documento || faturadoData.cpf || faturadoData.cnpj || '').replace(/\D/g, '');

  console.log('[DATABASE] Buscando dados no banco:', {
    cnpjLimpo: cleanCnpj.substring(0, 5) + '***',
    docLimpo: cleanDoc.substring(0, 5) + '***',
    nomeCliente: clienteData.nome?.substring(0, 30),
    tipo,
    valorTotal
  });

  const fornecedorRow = await findFornecedorByCnpj(cleanCnpj);
  const faturadoRow = await findFaturadoByDocumento(cleanDoc);
  const clienteRow = await findClienteByDocumento(cleanDoc);

  console.log('[DATABASE] Resultados da busca:', {
    fornecedorExiste: !!fornecedorRow,
    faturadoExiste: !!faturadoRow,
    clienteExiste: !!clienteRow
  });

  const classificationRows = tipo === 'ARECEBER'
    ? await Promise.all(classificacoesReceita.map(getTipoReceitaByDescricao))
    : await Promise.all(classificacoesDespesa.map(getTipoDespesaByDescricao));

  const classifications = (tipo === 'ARECEBER' ? classificacoesReceita : classificacoesDespesa).map((descricao, index) => {
    const row = classificationRows[index];
    return row
      ? { id: row.id, exists: true, descricao: row.descricao }
      : { id: null, exists: false, descricao };
  });

  console.log('[DATABASE] Classificações encontradas:', {
    count: classifications.length,
    descricoes: classifications.map(c => c.descricao).join(', ')
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
      quantidadeParcelas,
      descricaoProdutos
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
  const descricaoProdutos = normalizeText(parsedJson.descricaoProdutos || parsedJson.descricao_produtos || parsedJson.produtos || '');

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
    tipoDespesaId,
    descricaoProdutos
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

const buildSearchTerms = (question) => {
  const cleaned = String(question)
    .normalize('NFD')
    .replace(/[ --]/g, ' ')
    .replace(/[^0-9A-Za-zÀ-ÿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return Array.from(new Set(
    cleaned
      .split(' ')
      .filter((term) => term.length >= 3 || /^\d{3,}$/.test(term))
  )).slice(0, 6);
};

const buildLikeQuery = (fields, terms) => {
  if (!terms.length) {
    return { whereClause: '', params: [] };
  }

  const searchParams = terms.map((term) => `%${term}%`);
  const fieldCondition = fields.map((field) => `${field} LIKE ?`).join(' OR ');
  const clause = searchParams.map(() => `(${fieldCondition})`).join(' OR ');
  const params = searchParams.flatMap((param) => fields.map(() => param));

  return { whereClause: `WHERE ${clause}`, params };
};

const formatRecords = (title, rows, fields) => {
  if (!rows || !rows.length) {
    return `${title}: nenhum registro encontrado.`;
  }

  return `${title}:
${rows.map((row, index) => `  ${index + 1}. ${fields.map((field) => `${field.label}: ${String(row[field.key] ?? '—').replace(/\s+/g, ' ').trim()}`).join(' | ')}`).join('\n')}`;
};

const getDatabaseCounts = async () => {
  const [[fornecedoresCount]] = await db.query('SELECT COUNT(*) AS total FROM mantem_fornecedor');
  const [[clientesCount]] = await db.query('SELECT COUNT(*) AS total FROM mantem_cliente');
  const [[faturadosCount]] = await db.query('SELECT COUNT(*) AS total FROM mantem_faturado');
  const [[despesasCount]] = await db.query('SELECT COUNT(*) AS total FROM tipo_despesa');
  const [[receitasCount]] = await db.query('SELECT COUNT(*) AS total FROM tipo_receita');
  const [[movimentosCount]] = await db.query('SELECT COUNT(*) AS total FROM movimentocontas');
  const [[parcelasCount]] = await db.query('SELECT COUNT(*) AS total FROM parcelacontas');

  return {
    fornecedores: fornecedoresCount.total || 0,
    clientes: clientesCount.total || 0,
    faturados: faturadosCount.total || 0,
    despesas: despesasCount.total || 0,
    receitas: receitasCount.total || 0,
    movimentos: movimentosCount.total || 0,
    parcelas: parcelasCount.total || 0
  };
};

const getTopFornecedoresByNotas = async () => {
  const [rows] = await db.query(
    `SELECT f.razao_social AS fornecedor, COUNT(m.id) AS notas, SUM(m.valor_total) AS valorTotal
     FROM movimentocontas m
     LEFT JOIN mantem_fornecedor f ON f.id = m.fornecedor_id
     GROUP BY f.id, f.razao_social
     ORDER BY notas DESC, valorTotal DESC
     LIMIT 6`
  );
  return rows;
};

const formatTopFornecedoresByNotas = (rows) => {
  if (!rows || !rows.length) {
    return 'Fornecedores por número de notas: nenhum registro encontrado.';
  }

  return `Fornecedores por número de notas:
${rows.map((row, index) => `  ${index + 1}. Fornecedor: ${String(row.fornecedor || '—')}, Notas: ${row.notas}, Valor total: ${Number(row.valorTotal || 0).toFixed(2)}`).join('\n')}`;
};

const answerCountQuestion = async (question) => {
  const normalized = String(question).toLowerCase();
  if (!/\bquant(os|as)?\b/.test(normalized)) {
    return null;
  }

  const countTargets = [
    { regex: /\bfornecedores?\b/, table: 'mantem_fornecedor', label: 'fornecedores' },
    { regex: /\bclientes?\b/, table: 'mantem_cliente', label: 'clientes' },
    { regex: /\bfaturados?\b/, table: 'mantem_faturado', label: 'faturados' },
    { regex: /\bdespesas?\b/, table: 'tipo_despesa', label: 'despesas' },
    { regex: /\breceitas?\b/, table: 'tipo_receita', label: 'receitas' },
    { regex: /\bmovimentos?\b/, table: 'movimentocontas', label: 'movimentos' },
    { regex: /\bparcelas?\b/, table: 'parcelacontas', label: 'parcelas' }
  ];

  for (const target of countTargets) {
    if (target.regex.test(normalized)) {
      const [[result]] = await db.query(`SELECT COUNT(*) AS total FROM ${target.table}`);
      const total = Number(result?.total || 0);
      const plural = total === 1 ? target.label.replace(/s$/, '') : target.label;
      return `Tem ${total} ${plural}.`;
    }
  }

  return null;
};

const getDatabaseContextForQuestion = async (question) => {
  const counts = await getDatabaseCounts();
  const [fornecedores] = await db.query('SELECT id, razao_social AS razaoSocial, nome_fantasia AS nomeFantasia, cnpj, status FROM mantem_fornecedor ORDER BY id DESC LIMIT 6');
  const [clientes] = await db.query('SELECT id, nome, documento, endereco, status FROM mantem_cliente ORDER BY id DESC LIMIT 6');
  const [faturados] = await db.query('SELECT id, nome, documento, endereco, status FROM mantem_faturado ORDER BY id DESC LIMIT 6');
  const [despesas] = await db.query('SELECT id, descricao, status FROM tipo_despesa ORDER BY id DESC LIMIT 6');
  const [receitas] = await db.query('SELECT id, descricao, status FROM tipo_receita ORDER BY id DESC LIMIT 6');
  const [movimentos] = await db.query('SELECT m.id, m.numero_nota_fiscal AS numeroNotaFiscal, m.tipo, m.status_pagamento AS statusPagamento, m.valor_total AS valorTotal, m.data_emissao AS dataEmissao, m.data_vencimento AS dataVencimento, f.razao_social AS fornecedor, t.nome AS faturado FROM movimentocontas m LEFT JOIN mantem_fornecedor f ON f.id = m.fornecedor_id LEFT JOIN mantem_faturado t ON t.id = m.faturado_id ORDER BY m.id DESC LIMIT 6');
  const [parcelas] = await db.query('SELECT p.id, p.movimento_contas_id AS movimentoContasId, p.parcela_numero AS parcelaNumero, p.identificacao, p.valor, p.data_vencimento AS dataVencimento, p.status_pagamento AS statusPagamento, m.numero_nota_fiscal AS numeroNotaFiscal FROM parcelacontas p LEFT JOIN movimentocontas m ON m.id = p.movimento_contas_id ORDER BY p.id DESC LIMIT 6');
  const topFornecedores = await getTopFornecedoresByNotas();

  const summaryContext = `Contagem de registros:\n  Fornecedores: ${counts.fornecedores}\n  Clientes: ${counts.clientes}\n  Faturados: ${counts.faturados}\n  Despesas: ${counts.despesas}\n  Receitas: ${counts.receitas}\n  Movimentos: ${counts.movimentos}\n  Parcelas: ${counts.parcelas}`;

  const contextParts = [
    summaryContext,
    formatTopFornecedoresByNotas(topFornecedores),
    formatRecords('Fornecedores', fornecedores, [
      { key: 'razaoSocial', label: 'Razão social' },
      { key: 'nomeFantasia', label: 'Nome fantasia' },
      { key: 'cnpj', label: 'CNPJ' },
      { key: 'status', label: 'Status' }
    ]),
    formatRecords('Clientes', clientes, [
      { key: 'nome', label: 'Nome' },
      { key: 'documento', label: 'Documento' },
      { key: 'endereco', label: 'Endereço' },
      { key: 'status', label: 'Status' }
    ]),
    formatRecords('Faturados', faturados, [
      { key: 'nome', label: 'Nome' },
      { key: 'documento', label: 'Documento' },
      { key: 'endereco', label: 'Endereço' },
      { key: 'status', label: 'Status' }
    ]),
    formatRecords('Despesas', despesas, [
      { key: 'descricao', label: 'Descrição' },
      { key: 'status', label: 'Status' }
    ]),
    formatRecords('Receitas', receitas, [
      { key: 'descricao', label: 'Descrição' },
      { key: 'status', label: 'Status' }
    ]),
    formatRecords('Movimentos', movimentos, [
      { key: 'numeroNotaFiscal', label: 'Nota fiscal' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'fornecedor', label: 'Fornecedor' },
      { key: 'faturado', label: 'Faturado' },
      { key: 'valorTotal', label: 'Valor' },
      { key: 'statusPagamento', label: 'Status' }
    ]),
    formatRecords('Parcelas', parcelas, [
      { key: 'numeroNotaFiscal', label: 'Nota fiscal' },
      { key: 'parcelaNumero', label: 'Parcela' },
      { key: 'identificacao', label: 'Identificação' },
      { key: 'dataVencimento', label: 'Vencimento' },
      { key: 'valor', label: 'Valor' },
      { key: 'statusPagamento', label: 'Status' }
    ])
  ];

  return contextParts.join('\n\n');
};

const buildRagPrompt = (question, context) => {
  return `Você é um assistente em português especializado em responder perguntas sobre o banco de dados.
Use somente os dados fornecidos abaixo. Não invente informações e não acrescente registros que não existam.

Contexto do banco de dados:
${context}

Pergunta: ${question}

Responda de forma clara e breve em português. Use os dados do contexto para responder qualquer pergunta sobre fornecedores, clientes, faturados, despesas, receitas, movimentações e parcelas.
Se houver resposta direta no contexto, dê essa resposta.
Se não houver informação suficiente, diga: "Não há informações suficientes no banco para responder a esta pergunta."`;
};

const queryDatabaseWithRag = async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'Pergunta obrigatória para a consulta RAG.' });
    }

    const normalizedQuestion = String(question).trim();
    const directCountAnswer = await answerCountQuestion(normalizedQuestion);
    if (directCountAnswer) {
      const context = await getDatabaseContextForQuestion(normalizedQuestion);
      return res.json({ question: normalizedQuestion, answer: directCountAnswer, context });
    }

    const context = await getDatabaseContextForQuestion(normalizedQuestion);
    if (!context || !context.trim()) {
      return res.json({ question: normalizedQuestion, answer: 'Não há informações suficientes no banco para responder a esta pergunta.', context: '' });
    }

    const promptText = buildRagPrompt(normalizedQuestion, context);
    const answer = await invokeLlmWithFallback(promptText, 'consulta-rag', { jsonResponse: false });
    return res.json({ question: normalizedQuestion, answer: String(answer).trim(), context });
  } catch (error) {
    console.error('[RAG] Error:', error.message);
    if (error.provider === 'openrouter') {
      return res.status(error.status || 500).json({ error: 'OpenRouter error', details: error.message });
    }
    return res.status(500).json({ error: 'Consulta RAG falhou', details: error.message });
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
    
    if (!text || text.length === 0) {
      throw new Error('Cannot extract text. PDF may be image-based or corrupted');
    }

    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length < 3) console.warn('[PDF] Warning: very little content');

    console.log('[PDF] Extracted:', { textLength: text.length, lines: lines.length });
    return text;
  } catch (error) {
    console.error('[PDF] Error:', error.message);
    throw new Error(`PDF extraction failed: ${error.message}`);
  } finally {
    await parser.destroy();
  }
};

const generateWithOpenRouter = async (promptText, options = { jsonResponse: true }) => {
  if (!process.env.OPENROUTER_API_KEY) {
    const err = new Error('OPENROUTER_API_KEY not set');
    err.provider = 'openrouter';
    err.status = 500;
    throw err;
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  console.log('[OPENROUTER] Requesting');

  const extractContent = (payload) => {
    const message = payload?.choices?.[0]?.message;
    if (!message) return null;
    if (typeof message.content === 'string' && message.content.trim()) return message.content;
    if (Array.isArray(message.content)) {
      const joined = message.content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('\n').trim();
      return joined || null;
    }
    return null;
  };

  const createAttempt = (messageContent) => {
    const attempt = {
      model,
      messages: [{ role: 'user', content: messageContent }],
      temperature: 0.1,
      max_tokens: 4096
    };
    if (options.jsonResponse) {
      attempt.response_format = { type: 'json_object' };
    }
    return attempt;
  };

  const attempts = options.jsonResponse
    ? [
        createAttempt(promptText),
        createAttempt(`${promptText}\n\nReturn pure valid JSON.`),
        createAttempt(`${promptText}\n\nJSON only, no markdown.`)
      ]
    : [
        createAttempt(promptText),
        createAttempt(`${promptText}\n\nResponda apenas em texto simples.`),
        createAttempt(`${promptText}\n\nExplique em português, sem formato JSON.`)
      ];

  let lastError = null;
  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
    const body = attempts[attemptIndex];
    try {
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
        const message = payload?.error?.message || `HTTP ${response.status}`;
        lastError = new Error(message);
        lastError.provider = 'openrouter';
        lastError.status = response.status;
        if (response.status === 429) throw lastError;
        continue;
      }

      const content = extractContent(payload);
      if (!content) {
        lastError = new Error('Empty response');
        continue;
      }

      if (options.jsonResponse) {
        try {
          JSON.parse(content);
          console.log('[OPENROUTER] OK');
          return content;
        } catch (jsonError) {
          lastError = new Error(`Invalid JSON: ${jsonError.message}`);
          continue;
        }
      }

      console.log('[OPENROUTER] OK');
      return content;
    } catch (fetchError) {
      lastError = fetchError;
      continue;
    }
  }

  const finalError = lastError || new Error('All attempts failed');
  finalError.provider = 'openrouter';
  finalError.status = 500;
  console.error('[OPENROUTER] Failed:', finalError.message);
  throw finalError;
};

const generateWithGemini = async (promptText) => {
  const err = new Error('Gemini disabled. Use OpenRouter');
  err.provider = 'gemini';
  err.status = 503;
  throw err;
};

const repairJsonWithProvider = async (rawText, provider) => {
  const repairPrompt = `Convert to valid JSON. Return pure JSON only, no markdown.\n${rawText}`;
  return generateWithOpenRouter(repairPrompt);
};

const extractDataFromPdf = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF sent' });

    console.log('[EXTRACT] Start:', { file: req.file.originalname, size: req.file.size });

    const pdfText = await extractPdfText(req.file.buffer);
    console.log('[EXTRACT] Step 1: Text extracted');

    const wordCount = pdfText.split(/\s+/).length;
    const lineCount = pdfText.split('\n').length;
    if (wordCount < 10 || lineCount < 3) {
      return res.status(400).json({ 
        error: 'PDF content too small',
        details: `${wordCount} words, ${lineCount} lines. PDF may be image-based`
      });
    }

    const promptText = buildPrompt(pdfText);
    console.log('[EXTRACT] Step 2: Prompt built');

    const resultText = await invokeLlmWithFallback(promptText, 'extracao-pdf');
    console.log('[EXTRACT] Step 3: Response received');

    let parsedJson;
    try {
      parsedJson = parseModelJson(resultText);
      console.log('[EXTRACT] Step 4: JSON parsed');
    } catch (firstParseError) {
      console.warn('[EXTRACT] JSON invalid, repairing...');
      const candidate = extractJsonCandidate(resultText);
      const repairedText = await repairJsonWithProvider(candidate, getProvider());
      parsedJson = parseModelJson(repairedText);
      console.log('[EXTRACT] Step 4: JSON repaired');
    }

    const cnpj = String(parsedJson?.fornecedor?.cnpj || '').replace(/\D/g, '');
    const doc = String(parsedJson?.cliente?.documento || parsedJson?.faturado?.documento || '').replace(/\D/g, '');
    const valor = normalizeNumber(parsedJson?.valorTotal || 0);
    
    console.log('[EXTRACT] Validation:', {
      cnpj: cnpj.length === 14 ? 'OK' : `Error (${cnpj.length})`,
      doc: (doc.length === 11 || doc.length === 14) ? 'OK' : `Error (${doc.length})`,
      valor: valor > 0 ? 'OK' : 'Error'
    });

    const databaseResult = await checkPdfDataInDatabase(parsedJson, pdfText);
    console.log('[EXTRACT] Step 5: Database checked');
    console.log('[EXTRACT] Done\n');

    res.json(databaseResult);
  } catch (error) {
    console.error('[EXTRACT] Error:', error.message);

    if (error.provider === 'openrouter') {
      return res.status(error.status || 500).json({
        error: 'OpenRouter error',
        details: error.message
      });
    }

    res.status(500).json({ error: 'Extraction failed', details: error?.message });
  }
};

const validateParsedDataForSave = (parsedData) => {
  const errors = [];
  const fornecedor = parsedData?.fornecedor || {};
  const faturado = parsedData?.faturado || {};
  const cliente = parsedData?.cliente || {};
  
  // Check CNPJ format (14 digits)
  const cnpj = String(fornecedor.cnpj || '').replace(/\D/g, '');
  if (cnpj.length !== 14) {
    errors.push(`CNPJ invalid: need 14 digits, got ${cnpj.length}`);
  }
  
  // Check company name (min 5 chars)
  const razaoSocial = normalizeText(fornecedor.razaoSocial || fornecedor.razao_social || '');
  if (!razaoSocial || razaoSocial.length < 5) {
    errors.push(`Company name too short: "${razaoSocial}"`);
  }

  // Check document (CPF 11 or CNPJ 14)
  const doc = String(faturado.documento || cliente.documento || '').replace(/\D/g, '');
  if (!(doc.length === 11 || doc.length === 14)) {
    errors.push(`Doc invalid: need 11 or 14 digits, got ${doc.length}`);
  }

  // Check client name (min 5 chars)
  const nomeCliente = normalizeText(faturado.nome || cliente.nome || '');
  if (!nomeCliente || nomeCliente.length < 5) {
    errors.push(`Client name too short: "${nomeCliente}"`);
  }

  // Check address (min 10 chars)
  const endereco = normalizeText(faturado.endereco || cliente.endereco || '');
  if (!endereco || endereco.length < 10) {
    errors.push(`Address too short (min 10): "${endereco}"`);
  }

  // Check value > 0
  const valorTotal = normalizeNumber(parsedData?.valorTotal);
  if (valorTotal <= 0) {
    errors.push(`Value must be > 0: ${valorTotal}`);
  }

  // Check issue date
  if (!toSqlDate(parsedData?.dataEmissao)) {
    errors.push(`Invalid issue date: "${parsedData?.dataEmissao}"`);
  }

  // Check due date
  if (!toSqlDate(parsedData?.dataVencimento)) {
    errors.push(`Invalid due date: "${parsedData?.dataVencimento}"`);
  }

  if (errors.length > 0) console.warn('[VALIDATION] Errors:', errors);
  return { ok: errors.length === 0, errors };
};

const confirmDatabaseSave = async (req, res) => {
  try {
    const { parsedData } = req.body;
    if (!parsedData) return res.status(400).json({ error: 'parsedData required' });

    const validation = validateParsedDataForSave(parsedData);
    if (!validation.ok) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors.join('; '),
        validationErrors: validation.errors
      });
    }

    const databaseResult = await savePdfDataToDatabase(parsedData);
    res.json({ parsedData, database: databaseResult });
  } catch (error) {
    console.error('[SAVE] Error:', error.message);
    const err = sanitizeProviderError('Database', error?.status, error?.message);
    res.status(err.status).json({ error: err.error, details: err.details });
  }
};

module.exports = {
  extractDataFromPdf,
  confirmDatabaseSave,
  queryDatabaseWithRag,
  listEntities,
  toggleStatus
};
