# Documentação Integrada da API (Backend)

Conforme a construção da arquitetura, a API do backend está organizada respondendo no escopo de *localhost* na porta 8000.  
A interface do Swagger com a experimentação está sempre auto-documentada na rota `/docs` assim que a aplicação sobe.

---

## 1. Módulo "LIVROS"

**[GET]** `/api/livros`
- **Função:** Captura a listagem integral de todos os livros organizados na base.
- **Resposta Sucesso (JSON):** 
```json
[
  {
    "id": 1,
    "titulo": "Dom Quixote",
    "autor": "Miguel de Cervantes",
    "isbn": "9788574921008",
    "genero": "Ficção",
    "ano_publicacao": 1605,
    "status": "Disponível",
    "capa_url": null
  }
]
```

**[POST]** `/api/livros`
- **Função:** Realiza o salvamento persistente de um novo exemplar no banco.
- **Corpo da Requisição (JSON):**
```json
{
  "titulo": "O Senhor dos Anéis",
  "autor": "J.R.R. Tolkien",
  "isbn": "9788533613379",
  "genero": "Fantasia",
  "ano_publicacao": 1954
}
```

---

## 2. Módulo "USUÁRIOS"

**[GET]** `/api/usuarios`
- **Função:** Retorna todos os leitores que o sistema domina para o preenchimento de tabelas.

**[POST]** `/api/usuarios`
- **Função:** Injeta um novo perfil de usuário.
- **Corpo da Requisição (JSON):**
```json
{
  "nome": "João das Neves",
  "email": "joao@email.com",
  "telefone": "41 99911-2233"
}
```

**[DELETE]** `/api/usuarios/{usuario_id}`
- **Função:** Tenta remover o registro do leitor na base de dados.
- **Erro Tratado (Regra de Negócio):** Resulta em `400 Bad Request` se a consulta do script verificar a existência contínua de um objeto de empréstimo não finalizado contendo sua numeração de identificação (ID).

---

## 3. Módulo "EMPRÉSTIMOS"

**[POST]** `/api/emprestimos`
- **Função:** Celebra a criação do empréstimo de um livro à um leitor e automaticamente modifica a etiqueta de Status do livro de `Disponível` para `Emprestado`.
- **Corpo da Requisição (JSON):**
```json
{
  "livro_id": 1,
  "usuario_id": 3,
  "data_prevista_devolucao": "2024-12-05"
}
```
- **Erro Tratado (Regra de Negócio):** Resulta em `400 Bad Request` informando `{"detail": "O livro não está disponível para empréstimo."}` caso a propriedade do livro em questão seja lida diferentemente de "Disponível".

---

## 4. Módulo de Sistema Central

**[GET]** `/api/dashboard`
- **Função:** Entrega para as aplicações conectadas a métrica já somada e analisada de todas as linhas de contexto do acervo.
- **Resposta Sucesso (JSON):**
```json
{
    "total_livros": 150,
    "emprestados": 35,
    "disponiveis": 115
}
```
