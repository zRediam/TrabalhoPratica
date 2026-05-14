# Guia de Debug - Extração Intermitente de PDFs

## Resumo das Correções Implementadas

O problema de extração intermitente foi causado por:
1. **Falta de validação robusta** do PDF extraído
2. **Padrões regex limitados** para encontrar dados em formatos diferentes
3. **Falta de logging detalhado** para rastrear falhas
4. **Resposta da IA inconsistente** sem validação prévia

## Melhorias Implementadas

### 1. Extração de Texto do PDF (`extractPdfText`)
- ✅ Adicionado aviso se o PDF tem muito pouco conteúdo (< 3 linhas)
- ✅ Log detalhado com tamanho do texto e linhas encontradas
- ✅ Melhor mensagem de erro para PDFs com OCR baixo ou corrompidos
- ✅ Log das primeiras e últimas linhas para debug

### 2. Padrões de Regex Expandidos (`extractTextValue`)
- ✅ **Padrão 1**: Label seguido de dois-pontos/hífen (original)
- ✅ **Padrão 2**: Label no início da linha, valor na próxima
- ✅ **Padrão 3**: Label com espaços e separadores variados
- ✅ Log de qual padrão encontrou cada valor

### 3. Extração de Nome perto de ID (`extractNameNearIdentifier`)
- ✅ **Padrão 1**: Texto antes do ID (ex: "Empresa CNPJ 12345678901234")
- ✅ **Padrão 2**: ID no início, nome na mesma linha
- ✅ **Padrão 3**: Procura em contexto (linhas anteriores/posteriores)
- ✅ Log detalhado de qual padrão funcionou

### 4. Prompt para IA Melhorado (`buildPrompt`)
- ✅ Reforçado que campos obrigatórios NUNCA devem estar vazios
- ✅ Instruções explícitas sobre formatos de CNPJ (14 dígitos), CPF (11), endereço completo
- ✅ Log de truncamento de texto (> 48KB)
- ✅ Ênfase em juntar endereços distribuídos em múltiplas linhas

### 5. Logging Detalhado em Cada Etapa (`extractDataFromPdf`)
- ✅ **[EXTRACT]**: Início, etapas 1-5, informações de sucesso
- ✅ **[EXTRACT]**: Validação de campos críticos da IA
- ✅ **[PDF]**: Extração de texto com warnings
- ✅ **[REGEX]**: Todos os padrões tentados e sucesso
- ✅ **[REGEX-NAME]**: Busca por nomes perto de IDs
- ✅ **[NORMALIZE]**: Dados normalizados (IA vs regex)
- ✅ **[DATABASE]**: Buscas e resultados no banco
- ✅ **[VALIDATION]**: Erros de validação detalhados

### 6. Validação Mais Rigorosa (`validateParsedDataForSave`)
- ✅ Mensagens de erro específicas com valores recebidos
- ✅ Validação de comprimento de razão social (min 5 caracteres)
- ✅ Validação de comprimento de nome do cliente (min 5 caracteres)
- ✅ Validação de endereco completo (min 10 caracteres)
- ✅ Log de todos os erros de validação

---

## Como Usar o Debug

### Passo 1: Ativar Logs do Backend
Certifique-se de que o backend está rodando no terminal com logs visíveis:

```bash
cd backend
npm start
```

Os logs aparecerão no console do terminal.

### Passo 2: Fazer Upload de um PDF Problemático
1. Acesse o frontend (ex: http://localhost:5173)
2. Faça upload de um PDF que não está funcionando
3. Observe a resposta

### Passo 3: Análise dos Logs

#### Cenário 1: PDF com Extração de Texto Vazia
```
[PDF] Aviso: PDF tem muito pouco conteúdo extraído { linesCount: 0, textLength: 0 }
```
**Solução**: O PDF pode ser baseado em imagem sem OCR. Considere usar OCR antes de enviar.

#### Cenário 2: Regex Não Encontra Dados
```
[REGEX] Nenhum valor encontrado para labels: ['Razão Social', ...]
```
**Solução**: O PDF tem um formato diferente. Você pode:
- Adicionar novos padrões de regex em `extractTextValue`
- Melhorar as labels procuradas

#### Cenário 3: IA Retorna JSON Inválido
```
[EXTRACT] Etapa 3 concluída: Resposta recebida da IA { responseLength: 150, hasJson: false }
```
**Solução**: A IA não conseguiu gerar um JSON válido. Verifique:
- Se a chave da API (Gemini/OpenRouter) está configurada
- Se o PDF tem conteúdo legível
- Tente outro provedor (configure AI_PROVIDER)

#### Cenário 4: Campos Obrigatórios Faltando
```
[VALIDATION] Erros de validação encontrados: [
  'CNPJ do fornecedor inválido: esperado 14 dígitos, recebido 0. Valor: ""',
  'Razão social do fornecedor inválida ou muito curta: ""'
]
```
**Solução**: A IA não conseguiu extrair os dados. Verifique:
- Se o PDF tem esses dados visíveis
- Se está sendo truncado (check log `[PROMPT] Texto truncado`)
- Considere enviar um PDF menor ou mais claro

#### Cenário 5: Dados Encontrados via Regex
```
[REGEX] Encontrou valor com padrão 1: { label: 'Razão Social', value: 'EMPRESA LTDA' }
[NORMALIZE] Dados normalizados: { nomeFromIA: false, nomeExtraido: true }
```
**Sucesso**: O sistema conseguiu extrair via regex quando a IA falhou.

---

## Configurações Importantes (.env do Backend)

```env
# Provedor preferido de IA (gemini ou openrouter)
AI_PROVIDER=gemini
GEMINI_API_KEY=seu_token_gemini
OPENROUTER_API_KEY=seu_token_openrouter

# Modelos (opcional, use defaults se não especificado)
GEMINI_MODEL=gemini-2.0-flash
OPENROUTER_MODEL=openai/gpt-oss-20b:free

# Banco de dados
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=1510
```

---

## Checklist de Debugging

- [ ] Verificar se os logs aparecem quando enviar um PDF
- [ ] Confirmar que a extração de texto retorna conteúdo (> 3 linhas)
- [ ] Verificar se a IA está retornando JSON válido
- [ ] Confirmar que campos críticos (CNPJ, documento, valor) estão preenchidos
- [ ] Se regex encontrou dados e IA não retornou, é um problema da IA
- [ ] Se nem regex nem IA encontraram, o PDF pode ser muito diferente do esperado

---

## Próximos Passos

Se ainda tiver problemas:

1. **PDF com OCR**: Use uma ferramenta como `Tesseract` para processar imagens antes
2. **Formatos especiais**: Adicione novos padrões de regex em `extractTextValue`
3. **Múltiplos formatos**: Estude a estrutura de um PDF problemático e adapte as labels

## Exemplo de PDF Ideal

Um PDF ideal para extração deve ter:
- ✅ Texto legível (não apenas imagem)
- ✅ CNPJ/CPF com exatamente 14/11 dígitos separados
- ✅ Endereço completo (rua, número, bairro, cidade, estado, CEP)
- ✅ Razão social/nome com pelo menos 5 caracteres
- ✅ Valor total claro com separadores de milhares/decimais
- ✅ Data em formato consistente (DD/MM/YYYY ou YYYY-MM-DD)

