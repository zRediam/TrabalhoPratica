# Teste Rápido da Extração

## Instruções para Validar as Correções

### 1. Reiniciar o Backend
```bash
cd backend
npm install  # em caso de dependências novas
npm start
```

### 2. Abrir o Frontend
```bash
# Em outro terminal
cd frontend
npm run dev
```

### 3. Testes Recomendados

#### Teste A: PDF Normal (Deve funcionar sempre)
- [ ] Fazer upload de um PDF de nota fiscal bem estruturado
- [ ] Verificar se todos os campos são preenchidos (CNPJ, CPF, endereço)
- [ ] Ver logs no terminal backend:
  - `[EXTRACT] Iniciando extração de PDF`
  - `[EXTRACT] Etapa X concluída`
  - Não deve ter erros `[VALIDATION]`

#### Teste B: PDF com Formatação Diferente
- [ ] Fazer upload de um PDF com layout ligeiramente diferente
- [ ] Verificar se regex conseguiu encontrar dados:
  - `[REGEX] Encontrou valor com padrão X`
  - `[REGEX-NAME] Encontrou nome com padrão X`
- [ ] Ver se dados estão preenchidos mesmo sem IA encontrar

#### Teste C: PDF com Pouco Conteúdo
- [ ] Fazer upload de um PDF muito pequeno ou apenas com imagens
- [ ] Esperar por erro claro:
  - `[PDF] Aviso: PDF tem muito pouco conteúdo`
- [ ] Mensagem de erro no frontend deve sugerir OCR

#### Teste D: Validação de Campos
- [ ] Tentar salvar dados incompletos (sem confirmação)
- [ ] Ver mensagens de erro específicas:
  - `CNPJ do fornecedor inválido: esperado 14 dígitos`
  - `Endereço do cliente incompleto`

---

## Sinais de Sucesso

✅ **Extração funcionando bem se**:
- Todos os logs aparecem com `[EXTRACT] Etapa X concluído`
- Não há erros de validação ou aparecem poucos
- Campos críticos estão preenchidos (CNPJ, documento, valor)
- Endereço tem ao menos 10 caracteres

❌ **Problemas se**:
- Logs `[PDF]` mostram conteúdo vazio
- Muitos erros `[VALIDATION]` com campos em branco
- Resposta da IA não é JSON válido (logs falam em reparar JSON)
- Mesmo padrão de regex falha em PDFs similares

---

## Logs Esperados (Exemplo de Sucesso)

```
[EXTRACT] Iniciando extração de PDF: {
  fileName: 'notafiscal.pdf',
  fileSize: 245632,
  mimetype: 'application/pdf'
}

[PDF] Extração bem-sucedida: {
  textLength: 8956,
  linesCount: 142,
  firstLine: 'NOTA FISCAL ELETRÔNICA',
  lastLine: 'Assinado digitalmente'
}

[EXTRACT] Etapa 1 concluída: Extração de texto
[EXTRACT] Etapa 2 concluída: Prompt construído, enviando para IA
[EXTRACT] Etapa 3 concluída: Resposta recebida da IA {
  responseLength: 1250,
  hasJson: true
}
[EXTRACT] Etapa 4 concluído: JSON parseado com sucesso

[EXTRACT] Validação de campos da IA: {
  cnpjPresente: true,
  cnpjLength: 14,
  docPresente: true,
  docLength: 14,
  valorTotal: 1500.50,
  tipo: 'APAGAR'
}

[NORMALIZE] Dados normalizados: {
  cnpjFromIA: true,
  nomeFromIA: true,
  nomeExtraido: false,
  enderecoFromIA: true,
  tipo: 'APAGAR'
}

[DATABASE] Buscas encontradas: {
  fornecedorExiste: true,
  faturadoExiste: false,
  clienteExiste: false
}

[EXTRACT] Extração finalizada com sucesso
```

---

## Troubleshooting Rápido

| Problema | Causa Provável | Solução |
|----------|----------------|---------|
| PDF retorna conteúdo vazio | PDF é imagem sem OCR | Usar OCR antes de enviar |
| CNPJ em branco após extração | IA não encontrou CNPJ | PDF não tem CNPJ legível |
| Endereço truncado | Endereço > 200 caracteres | Reduzir tamanho ou aceitar truncado |
| Valores de data "null" | Formato de data não reconhecido | Adicionar novo formato em regex |
| Sempre falha mesmo PDFs bons | Chave de API inválida | Verificar GEMINI_API_KEY ou OPENROUTER_API_KEY |
| Intermitência na extração | Limite de quota da IA | Configurar fallback entre Gemini e OpenRouter |

