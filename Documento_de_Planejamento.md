# Documento de Planejamento

## Descrição do Sistema
O sistema é uma aplicação web completa focada em organizar e gerenciar acervos de livros. Ele permite o cadastro rápido de exemplares, o registro de usuários (leitores) e o controle rigoroso de empréstimos, facilitando a visualização de quem está com qual livro e a data estipulada para a devolução.

## Objetivo Geral
Fornecer uma ferramenta simples, intuitiva e incrivelmente rápida para a gestão de empréstimos, garantindo que nenhum livro se perca pela falta de rastreio de seu histórico, mantendo as informações da biblioteca sempre centralizadas e protegidas localmente (banco SQLite).

## Público-Alvo
- Colecionadores e leitores assíduos.
- Administradores de bibliotecas comunitárias.
- Professores, grupos de leitura ou escolas de pequeno porte que compartilham prateleiras.

## Funcionalidades Principais
1. **Gestão de Acervo**: Inclusão de novos livros preenchendo as informações vitais, como título, autor e gênero.
2. **Gestão de Usuários**: Um catálogo simplificado para reter nome e meio de contato do leitor (e-mail, telefone).
3. **Controle de Empréstimos**: Integração do livro x usuário com estipulação intuitiva da data de devolução através de um seletor visual (dropdown).
4. **Painel de Análise**: Dashboard imediato (logo na tela inicial) que consolida estatísticas e distribui o status dos livros.

## Requisitos Funcionais
- O sistema deve operar um cadastro de livros com base nas propriedades exigidas.
- A aplicação deve ser dividida em telas individuais gerenciadas por um menu lateral perene.
- Todos os cadastros devem ser armazenados de maneira persistente para tolerar o desligamento do servidor.
- O Dashboard deve calcular em tempo real o volume total de recursos baseando-se em contadores reativos no banco de dados.

## Requisitos Não Funcionais
- **Tempo de resposta:** Toda consulta da listagem de acervos deve ocorrer sem gargalo por estar utilizando processos Python assíncronos.
- **Responsividade visual:** Uso de Tailwind CSS assegurando aderência para que possa rodar visualmente confortável sem dependência pesada de arquivos longos de estilo padrão.
- **Limpeza de UI/UX:** Alertas de status guiados pelas cores (Verdes = liberado, Vermelho = bloqueado/emprestado).

## Regras de Negócio
- Não é permitido registrar num sistema um empréstimo cujo exemplar solicitado consta com estado indisponível.
- Não o sistema bloqueia e emite erro ao invés de prosseguir caso o ato vá ferir a confiabilidade daquele material.
- Um leitor não pode ser apagado da base do sistema enquanto ostentar obrigações de entrega pendentes para com a Biblioteca (bloqueio no gatilho de exclusão da API).

## Estrutura e Tecnologias
- **Camada Visual:** Construída com a fluidez de componentes reativos `Vue.js 3`.
- **Servidor (Backend):** Utiliza as abstrações e arquitetura Restful e tipagem rápida do `FastAPI (Python)`.
- **Banco de Dados Relacional:** O `SQLite` local é gerenciado inteligentemente por via do mapeamento direto do ORM conhecido por `SQLAlchemy`.
