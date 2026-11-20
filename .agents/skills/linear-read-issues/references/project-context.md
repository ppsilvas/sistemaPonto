# Referência do Projeto e Ferramentas de Leitura — Linear MCP

## 1. Identificadores do Projeto Ponto Lelê

| Entidade | Nome / Chave | Identificador |
| --- | --- | --- |
| **Time** | `Ppsilvas` (`PPS`) | `4a17cc2a-37f3-4830-bd3d-1c11c53f5c00` |
| **Projeto** | `Projeto Ponto Lelê` | `P-PPS-1` (`d0460ed7-e5a0-4178-bf60-26fd6720128a`) |
| **URL do Projeto** | Linear | `https://linear.app/ppsilvas/project/projeto-ponto-lele-18add1b6d501` |
| **Status de Issue (Time `PPS`)** | `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate` | — |
| **Labels de Issue** | `Feature`, `Improvement`, `Bug` | — |

### Milestones do Projeto `P-PPS-1`

| Milestone | UUID |
| --- | --- |
| `M1 - Fundação & Infraestrutura` | `d56335d1-89e6-433e-b2d3-3679cce247f9` |
| `M2 - Autenticação, Usuários & Projetos` | `f9a458fd-8eb4-4d38-9d3f-edfa89984962` |
| `M3 - Controle de Ponto` | `1331fa3d-1f58-4a2b-a26a-561033b28c98` |
| `M4 - Consultas, Auditoria & Exportação` | `9ee4c602-3040-44d7-9adc-4e2c510ff499` |

---

## 2. Mapeamento Rápido Issues (`PPS-*`) ↔ Especificações (`specs/`)

| Issue | Spec ID | Milestone | Arquivo Local |
| --- | --- | --- | --- |
| `PPS-5` | `TECH-01` | M1 | `specs/TECH-01-setup-frontend-vercel.md` |
| `PPS-6` | `TECH-02` | M1 | `specs/TECH-02-modelagem-banco-rls-supabase.md` |
| `PPS-7` | `UC-01` | M2 | `specs/UC-01-autenticacao-e-controle-sessao.md` |
| `PPS-8` | `UC-02` | M2 | `specs/UC-02-alteracao-propria-senha.md` |
| `PPS-9` | `UC-03` | M2 | `specs/UC-03-cadastrar-e-listar-usuarios.md` |
| `PPS-10` | `UC-05` | M2 | `specs/UC-05-gerenciar-projetos.md` |
| `PPS-11` | `UC-04` | M2 | `specs/UC-04-editar-e-inativar-usuarios.md` |
| `PPS-12` | `UC-06` | M2 | `specs/UC-06-vincular-usuarios-projetos.md` |
| `PPS-13` | `UC-07` | M3 | `specs/UC-07-iniciar-registro-ponto-start.md` |
| `PPS-14` | `UC-08` | M3 | `specs/UC-08-pausar-registro-ponto-pause-e-troca-projeto.md` |
| `PPS-15` | `UC-09` | M4 | `specs/UC-09-consultar-historico-ponto-worker.md` |
| `PPS-16` | `UC-10` | M4 | `specs/UC-10-consultar-relatorio-pontos-admin.md` |
| `PPS-17` | `UC-11` | M4 | `specs/UC-11-editar-e-excluir-registros-ponto-auditoria.md` |
| `PPS-18` | `UC-12` | M4 | `specs/UC-12-exportar-relatorio-csv.md` |

---

## 3. Catálogo de Ferramentas de Leitura do MCP `linear`

| Ferramenta | Uso Principal | Parâmetros-chave |
| --- | --- | --- |
| `list_issues` | Listar, filtrar e pesquisar issues com paginação | `project`, `team`, `state`, `priority`, `label`, `assignee`, `query`, `parentId`, `fields`, `limit`, `cursor`, `orderBy` |
| `get_issue` | Ler detalhes completos de uma única issue | `id` (ex.: `"PPS-5"`), `includeRelations`, `fields` |
| `list_comments` | Ler comentários e anotações inline (`quotedText`) | `issueId` (ex.: `"PPS-5"`), `limit`, `cursor`, `orderBy` |
| `list_milestones` | Listar milestones e progresso de um projeto | `project` (`"P-PPS-1"`) |
| `get_milestone` | Ler detalhes de uma milestone específica | `project`, `query` |
| `get_project` | Ler resumo, descrição, recursos e milestones do projeto | `query` (`"P-PPS-1"`), `includeMembers`, `includeMilestones`, `includeResources` |
| `list_issue_statuses` | Descobrir status válidos do time | `team` (`"Ppsilvas"`) |
| `list_issue_labels` | Descobrir labels válidas do time/workspace | `team`, `includeGroups` |
| `get_attachment` | Ler metadados/conteúdo de anexo vinculado a uma issue | `id` |
| `extract_images` | Inspecionar imagens embutidas em Markdown do Linear | texto Markdown contendo as imagens |

### Exemplos de Consultas Comuns

- **Listar backlog completo do projeto (resumido):**
  ```json
  {
    "project": "P-PPS-1",
    "fields": ["id", "title", "status", "priority", "estimate", "projectMilestone", "labels", "url"]
  }
  ```
- **Filtrar apenas issues em andamento atribuídas a mim:**
  ```json
  {
    "project": "P-PPS-1",
    "state": "In Progress",
    "assignee": "me"
  }
  ```
- **Inspecionar uma issue com suas dependências:**
  ```json
  {
    "id": "PPS-7",
    "includeRelations": true
  }
  ```
- **Ler discussão/comentários de uma issue:**
  ```json
  {
    "issueId": "PPS-7"
  }
  ```
