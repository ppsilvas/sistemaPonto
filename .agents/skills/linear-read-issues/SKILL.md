---
name: linear-read-issues
description: >-
  Reads, lists, filters, and inspects Linear issues, milestones, blocking
  relations (blockedBy/blocks), comments, and attachments using the Linear MCP
  server configured in this workspace. Use when the user asks to check backlog
  items, read a specific Linear issue (e.g., PPS-5..PPS-18), find unblocked
  next tasks, inspect issue discussions, or cross-check Linear issues against
  local specs in Projeto Ponto Lelê (P-PPS-1).
---

# Leitura de Issues do Linear (`linear-read-issues`)

Este runbook padroniza como ler, filtrar e inspecionar issues do Linear usando o servidor MCP `linear` configurado no workspace, com foco no projeto **Projeto Ponto Lelê** (`P-PPS-1`, time `Ppsilvas` / `PPS`).

> **Escopo:** Esta skill é estritamente de **leitura**. Não crie, edite ou altere o status de issues (`save_issue`, `save_comment`) a menos que o usuário peça explicitamente.

---

## Pré-requisitos e Contexto Padrão

- **Servidor MCP:** `linear` (configurado em `.agents/mcp_config.json`).
- **Valores padrão deste repositório:**
  - `team`: `"Ppsilvas"` (chave `PPS`)
  - `project`: `"P-PPS-1"` (`Projeto Ponto Lelê`)
- Para consultar o catálogo completo de parâmetros das ferramentas MCP, UUIDs das milestones e o mapeamento `PPS-5`..`PPS-18` ↔ `specs/`, leia [references/project-context.md](./references/project-context.md) apenas quando precisar.
- **Verificação de disponibilidade:** Se o servidor MCP `linear` não estiver conectado ou retornar erro de autenticação/permissão, interrompa e informe claramente ao usuário qual ferramenta falhou — nunca invente dados nem acesse credenciais diretamente.

---

## Fluxo de Leitura de Issues

### 1. Listar ou Filtrar Issues (`linear.list_issues`)

Use `list_issues` para consultar o backlog, buscar por palavra-chave ou filtrar tarefas prontas:

- Informe `project: "P-PPS-1"` (ou outro projeto/time solicitado pelo usuário).
- Combine filtros quando relevante: `state` (ex.: `"Backlog"`, `"Todo"`, `"In Progress"`, `"Done"`), `priority` (`1`=Urgent, `2`=High, `3`=Medium, `4`=Low), `label`, `assignee` (aceita `"me"`), `query` (busca em título/descrição) ou `parentId`.
- Reduza ruído solicitando apenas os campos necessários em `fields`:
  `["id", "title", "status", "priority", "estimate", "projectMilestone", "labels", "assignee", "url"]`.
- **Paginação obrigatória:** sempre verifique `hasNextPage`. Se `hasNextPage` for `true`, chame `list_issues` novamente passando o `cursor` retornado até ler todas as páginas antes de totalizar ou afirmar que um item não existe.
- Se houver dúvida sobre os nomes válidos de status ou labels no time, consulte antes `linear.list_issue_statuses(team: "Ppsilvas")` ou `linear.list_issue_labels(team: "Ppsilvas")`.

### 2. Ler Detalhes Completos de uma Issue (`linear.get_issue`)

Use `get_issue` quando precisar ler a especificação completa, critérios de aceite ou bloqueios de uma issue (ex.: `PPS-5`, `PPS-13`):

- Passe o identificador legível em `id` (ex.: `"PPS-7"` — **não** use identificadores prefixados com `P-`, que representam projetos).
- Inclua `includeRelations: true` (ou `"relations"` em `fields`) para verificar `blockedBy` e `blocks` — essencial para confirmar se uma issue está desbloqueada antes de iniciar a implementação.
- Solicite `"description"`, `"projectMilestone"`, `"status"`, `"priority"`, `"estimate"`, `"labels"`, `"gitBranchName"`, `"attachments"` e `"url"`.

### 3. Ler Comentários e Discussões (`linear.list_comments`)

`get_issue` **não** retorna comentários. Sempre que precisar de contexto completo de uma issue (decisões, dúvidas respondidas, revisões ou comentários inline na descrição):

1. Chame `linear.list_comments(issueId: "PPS-XX")`.
2. Verifique comentários ancorados na descrição através do campo `quotedText`.
3. Se `hasNextPage` for `true`, pagine com `cursor`.

### 4. Ler Anexos e Imagens (quando houver)

- **Imagens embutidas em Markdown** na descrição ou comentários: passe o trecho Markdown para `linear.extract_images`.
- **Anexos da issue:** leia com `linear.get_attachment`.
- **Arquivos em comentários:** vêm no campo `attachments` de `list_comments`.
- URLs assinadas de upload do Linear expiram em poucos minutos; chame novamente a ferramenta para renovar caso expirem.

### 5. Cruzar com as Especificações Locais (`specs/`)

Quando o usuário pedir para analisar ou iniciar o desenvolvimento de uma issue deste projeto:

1. Identifique o arquivo correspondente em `specs/` (tabela de mapeamento em [references/project-context.md](./references/project-context.md) ou `specs/README.md`).
2. Compare a descrição e comentários da issue no Linear com o arquivo em `specs/`.
3. Sinalize explicitamente qualquer divergência entre o Linear e `specs/` antes de implementar.

---

## Checklist de Verificação da Leitura

Antes de responder ao usuário, confirme:

- [ ] Todas as páginas de `list_issues` / `list_comments` foram consumidas (`hasNextPage: false`).
- [ ] Ao inspecionar uma issue para implementação ou triagem, tanto `relations` (`blockedBy`/`blocks`) quanto `list_comments` foram verificados.
- [ ] A resposta apresenta de forma clara: **ID** (`PPS-XX`) com link clicável, **Título**, **Milestone**, **Status**, **Prioridade**, **Estimativa**, **Bloqueios (`blockedBy`)** e resumo objetivo (ou critérios de aceite) conforme pedido.
