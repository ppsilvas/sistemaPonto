---
id: UC-05
title: "[UC-05] Cadastro, Edição e Inativação/Exclusão de Projetos (Admin)"
type: use-case
linear:
  team: Ppsilvas
  team_key: PPS
  project: Projeto Ponto Lelê
  project_id: P-PPS-1
  milestone: "M2 - Autenticação, Usuários & Projetos"
  priority: 2
  labels:
    - Feature
  suggested_labels:
    - admin
    - projetos
  estimate: 3
  blocked_by:
    - UC-01
requirements:
  rf:
    - RF04
  rn: []
  rnf:
    - RNF02
    - RNF03
    - RNF04
actors:
  - Admin
---

# [UC-05] Cadastro, Edição e Inativação/Exclusão de Projetos (Admin)

## 1. Resumo e História de Usuário

> **Como** usuário `admin`,  
> **quero** cadastrar, visualizar, editar e inativar/excluir projetos com nome e descrição,  
> **para** organizar as frentes de trabalho nas quais os freelancers e administradores alocarão suas horas.

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Mecanismo de Proteção |
|---|---|---|
| `Admin` | Permitido (CRUD completo) | Rota `/projetos` + políticas RLS `is_admin()` para `SELECT`/`INSERT`/`UPDATE`/`DELETE` em `public.projetos`. |
| `Worker` | Não permitido | Menu oculto, `AdminRoute` redireciona e RLS bloqueia escrita em `public.projetos`. |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF04` — Gestão de Projetos (Admin):** Cadastrar projetos (nome e descrição) e editar suas informações.
- **Matriz de Permissões (Seção 2):** Cadastrar, editar e excluir projetos — permitido exclusivamente ao `admin`.
- **`RNF02` — Controle de Autorização e Segurança:** Validação de permissão `admin` via RLS no banco de dados.
- **`RNF03` — Sincronismo de Horário no Servidor:** `projetos.criado_em` e `projetos.inativado_em` carimbados em UTC pelo banco de dados (`now()`).
- **`RNF04` — Responsividade:** Listagem e modais/formulários de projeto utilizáveis em desktop e celular.

---

## 4. Pré-condições

1. O usuário está autenticado com perfil `admin` e `ativo = true` (`UC-01`).
2. A tabela `public.projetos` e suas políticas RLS estão implantadas (`TECH-02`).

---

## 5. Fluxo Principal

### 5.1 Listagem de Projetos
1. O `admin` acessa a página **Projetos** (`/projetos`).
2. O sistema lista os projetos de `public.projetos` com: **Nome**, **Descrição** (resumida se longa), **Status** (`Ativo` / `Inativo` `[Extensão ao PDF]`), **Quantidade de usuários vinculados** (`usuario_projetos`) e **Data de criação** (formatada no fuso local).
3. O `admin` pode buscar por nome/descrição e filtrar por status (`Ativos`, `Inativos`, `Todos`).

### 5.2 Cadastro de Novo Projeto
4. O `admin` aciona **Novo Projeto**.
5. O formulário solicita:
   - **Nome do projeto** (obrigatório, não vazio após `trim`);
   - **Descrição** (opcional, texto livre de escopo ou detalhes gerais).
6. O `admin` confirma o salvamento.
7. O sistema insere o registro em `public.projetos` (o banco gera `id`, `ativo = true` e `criado_em = now()` em UTC).
8. O projeto aparece imediatamente na listagem com atalho para gerenciar usuários vinculados (`UC-06`).

### 5.3 Edição de Projeto
9. O `admin` seleciona **Editar** em um projeto existente, ajusta **Nome** e/ou **Descrição** e salva.
10. O sistema atualiza o registro em `public.projetos` e reflete imediatamente o novo nome/descrição nos seletores de ponto e relatórios.

### 5.4 Inativação ou Exclusão de Projeto (`[Extensão ao PDF]`)
11. O `admin` seleciona **Inativar** (ou **Excluir**) em um projeto.
12. O sistema verifica se existem **sessões de ponto abertas** (`horario_saida IS NULL AND excluido_em IS NULL`) para aquele projeto:
    - Se houver sessões abertas, exibe alerta listando os usuários com ponto ativo naquele projeto e orienta encerrar/pausar essas sessões antes de inativar ou excluir.
13. Se o projeto **possui registros históricos** em `registros_ponto`:
    - O sistema realiza **inativação (soft delete)** gravando `ativo = false` e `inativado_em = now()` (UTC servidor) `[Extensão ao PDF]`, impedindo novos `Start` nesse projeto mas preservando todos os relatórios históricos e exportações CSV.
14. Se o projeto **não possui nenhum registro** em `registros_ponto`:
    - O sistema permite **Inativar** ou **Excluir permanentemente** (com modal de confirmação explícita), removendo em cascata apenas os vínculos em `usuario_projetos`.
15. Um projeto inativo pode ser **Reativado** posteriormente (`ativo = true`, `inativado_em = NULL`).

---

## 6. Fluxos Alternativos e de Exceção

- **FE01 — Nome do projeto em branco ou contendo apenas espaços:**
  - Validação no front-end e `CHECK (length(trim(nome)) > 0)` no banco rejeitam a operação com mensagem *"O nome do projeto é obrigatório."*.
- **FE02 — Tentativa de exclusão física via API de projeto com registros de ponto associados:**
  - A constraint `ON DELETE RESTRICT` em `registros_ponto.projeto_id` (`TECH-02`) impede a exclusão e o sistema exibe *"Este projeto já possui registros de ponto vinculados e só pode ser inativado para preservar o histórico."*.
- **FE03 — Tentativa de operação por usuário `worker`:**
  - Bloqueada em UI (`AdminRoute`) e rejeitada pelo PostgreSQL RLS (`403` / permission denied).
- **FE04 — Estado vazio (nenhum projeto cadastrado ainda):**
  - Exibe tela de estado vazio amigável com botão de destaque para criar o primeiro projeto.

---

## 7. Pós-condições e Impacto em Dados

- **Escrita:** `public.projetos` (`id`, `nome`, `descricao`, `ativo` `[Extensão ao PDF]`, `inativado_em` `[Extensão ao PDF]`, `criado_em` UTC servidor).
- **Efeito em cascata:**
  - Inativação (`ativo = false`): oculta o projeto do seletor de **novo ponto** (`UC-07`), mas mantém o projeto visível nos filtros e tabelas de relatórios históricos (`UC-09`, `UC-10`, `UC-12`).
  - Exclusão física (somente quando sem `registros_ponto`): remove vínculos em `usuario_projetos` via `ON DELETE CASCADE`.

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Cadastro de projeto válido pelo `admin`:**
  - **Dado** um `admin` na tela `/projetos`
  - **Quando** preenche nome `"Cliente Alpha - Redesign"` e descrição opcional, e salva
  - **Então** o projeto é criado com `ativo = true` e `criado_em` em UTC pelo servidor e passa a constar na listagem.
- **Cenário 2 — Proteção de histórico ao remover projeto com pontos lançados `[Extensão ao PDF]`:**
  - **Dado** um projeto que já possui registros em `registros_ponto`
  - **Quando** o `admin` solicita remover/inativar o projeto (sem pontos abertos no momento)
  - **Então** o projeto é marcado como `ativo = false` com `inativado_em` UTC, deixa de aparecer para novas batidas (`Start`), e seus registros antigos permanecem íntegros nos relatórios.
- **Cenário 3 — Bloqueio de inativação com ponto aberto:**
  - **Dado** um projeto com ao menos um registro em aberto (`horario_saida IS NULL`)
  - **Quando** o `admin` tenta inativá-lo ou excluí-lo
  - **Então** o sistema bloqueia a ação e informa quais usuários estão com ponto aberto naquele projeto.

### Checklist de Conclusão
- [ ] Tela `/projetos` protegida por `AdminRoute` com busca, filtro por status e contagem de usuários vinculados.
- [ ] Cadastro e edição de `nome` (obrigatório) e `descricao` (opcional) com feedback visual.
- [ ] Inativação (`ativo = false`, `inativado_em` UTC) e reativação funcionando corretamente.
- [ ] Exclusão física permitida apenas quando não houver `registros_ponto` associados (reforçada por `ON DELETE RESTRICT`).
- [ ] Verificação prévia de sessões em aberto antes de inativar/excluir.
- [ ] Políticas RLS validadas impedindo escrita por `worker`.

---

## 9. Notas Técnicas e de UX

- Ao editar um projeto, exibir na mesma tela ou aba uma seção/atalho direto **"Gerenciar Usuários Vinculados"** (`UC-06`) para reduzir cliques no dia a dia do administrador.
- Exibir claramente badge `Inativo` em relatórios antigos para que o `admin` e o `worker` saibam que aquele projeto foi encerrado.
