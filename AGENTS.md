# Diretrizes para Agentes — Sistema de Controle de Ponto (Projeto Ponto Lelê)

Este arquivo define as regras operacionais, convenções de Git/Linear, comandos padrão e guardrails de qualidade e segurança que todo agente deve seguir ao trabalhar neste repositório (`ppsilvas/sistemaPonto`).

---

## 1. Fluxo de Trabalho com Issues no Linear

- **Projeto padrão no Linear:** `Projeto Ponto Lelê` (`P-PPS-1`), time `Ppsilvas` (`PPS`).
- **Leitura obrigatória antes de codar:** antes de iniciar uma atividade, consulte a issue no Linear (utilize a skill `linear-read-issues` em `.agents/skills/linear-read-issues/`), verifique relações de bloqueio (`blockedBy`/`blocks`), leia os comentários (`list_comments`) e cruze com a especificação correspondente em `specs/`.
- **Não pule bloqueios:** confirme se as issues listadas em `blockedBy` já foram concluídas antes de iniciar a implementação, salvo autorização explícita do usuário.
- **Divisão em Sub-issues:** sempre que uma issue principal for extensa, envolver múltiplas camadas independentes (ex.: migration/RLS no Supabase, Edge Function, interface React e testes) ou puder ser entregue de forma incremental com menor risco, **divida a atividade criando sub-issues no Linear** vinculadas à issue pai (`parentId: "PPS-XX"`):
  - Cada sub-issue deve ter escopo fechado, título objetivo e critérios de aceite verificáveis.
  - Mantenha a issue pai como agregadora do entregável completo e atualize os status de sub-issues e issue pai conforme o avanço (`Todo` → `In Progress` → `In Review` → `Done`).

---

## 2. Convenção de Branches

- **Nunca commite diretamente em `main`.** Crie sempre uma branch nova a partir de `main` atualizada (`origin/main`).
- **Padrão obrigatório para implementação de issues e sub-issues:**

  ```text
  <CODIGO-ISSUE>-<funcionalidade>
  ```

  - `<CODIGO-ISSUE>`: identificador da issue (ou sub-issue) no Linear em **MAIÚSCULAS** (ex.: `PPS-5`, `PPS-13`), **sem prefixo de tipo** (`feat/`, `fix/`, etc.).
  - `<funcionalidade>`: slug curto e descritivo da funcionalidade em `kebab-case` minúsculo, sem acentos, espaços ou caracteres especiais.

- **Exemplos:**
  - `PPS-5-setup-frontend-vercel`
  - `PPS-6-schema-rls-supabase`
  - `PPS-13-inicio-ponto-start`
  - `PPS-17-validacao-cronologica-edicao`
  - `PPS-19-politicas-rls-registros-ponto` *(sub-issue)*
- **Sub-issues:** ao dividir uma issue principal em sub-issues (ex.: `PPS-19` filha de `PPS-6`), use o código da própria sub-issue em maiúsculas na branch.
- **Alterações sem issue vinculada** (ex.: documentação interna ou ajustes pontuais de repositório): use `<descricao-curta>` em `kebab-case` (ex.: `agents-guidelines`, `update-gitignore`).

---

## 3. Convenção de Commits (Conventional Commits)

Todos os commits devem seguir estritamente a especificação **Conventional Commits**:

```text
<tipo>(<escopo>): <descrição curta no imperativo>

[corpo opcional explicando o "porquê" da mudança]

[rodapé opcional: Refs: PPS-XX | Closes: PPS-XX | BREAKING CHANGE: ...]
```

### Tipos Permitidos
- `feat`: nova funcionalidade ou caso de uso
- `fix`: correção de bug
- `docs`: documentação, specs, README, `AGENTS.md`
- `refactor`: refatoração sem alteração de comportamento externo
- `test`: adição ou ajuste de testes automatizados
- `style`: formatação/lint sem alteração lógica
- `perf`: melhoria de performance
- `build`: build, dependências ou configuração de deploy (Vite, Vercel)
- `ci`: pipelines e automações de CI/CD
- `chore`: manutenção geral, `.gitignore`, tooling
- `revert`: reversão de commit anterior

### Escopos Sugeridos
`auth`, `usuarios`, `projetos`, `ponto`, `relatorios`, `csv`, `db`, `rls`, `infra`, `specs`, `agents`.

### Regras de Qualidade de Commit
- Use verbo no imperativo na descrição, em letras minúsculas e sem ponto final (ex.: `feat(ponto): implementa rpc iniciar_ponto com carimbo utc`).
- Mantenha commits atômicos e coesos — evite misturar tarefas de issues distintas no mesmo commit.
- Referencie a issue no rodapé (`Refs: PPS-13`) quando relevante para rastreabilidade.

---

## 4. Comandos de Terminal Padronizados

Todos os agentes devem utilizar os comandos abaixo para instalar dependências, executar a aplicação, verificar qualidade e rodar testes (definidos no `package.json` a partir de `PPS-5`):

| Finalidade | Comando | Observação |
| --- | --- | --- |
| Instalar dependências | `npm install` | Instalação limpa ou atualização de pacotes |
| Servidor de desenvolvimento | `npm run dev` | Inicia o servidor local (Vite) |
| Checagem de tipos (TS estrito) | `npm run typecheck` | Executa `tsc --noEmit` |
| Lint / validação estática | `npm run lint` | Executa ESLint no código-fonte |
| Testes unitários e de UI | `npm run test` | Executa a suíte Vitest + React Testing Library |
| Cobertura de testes | `npm run test:coverage` | Valida o mínimo de **90%** de cobertura na UI |
| Build de produção | `npm run build` | Gera o bundle de produção (Vite) |
| Preview do build local | `npm run preview` | Serve localmente o bundle gerado em `dist/` |

---

## 5. Qualidade, Testes e Pull Requests

- **Cobertura mínima de UI (90%):** toda entrega que crie ou altere componentes, páginas ou fluxos de interface deve manter **cobertura mínima de 90%** (lines, functions, branches e statements) nos arquivos de UI, validada via `npm run test:coverage` antes da abertura do PR.
- **Validações obrigatórias pré-PR:** antes de abrir um Pull Request, execute e valide `npm run typecheck`, `npm run lint`, `npm run test:coverage` e `npm run build` (quando aplicável ao escopo alterado).
- **Abertura de PR:** direcione o PR à `main` (ou à branch integradora da issue pai, quando aplicável).
  - **Título do PR:** siga Conventional Commits incluindo o código da issue (ex.: `feat(ponto): [PPS-13] seleção de projeto e início de trabalho (Start)`).
  - **Descrição do PR:** inclua resumo objetivo, referência explícita no Linear (`Closes PPS-XX` ou `Refs PPS-XX`) e checklist com resultados das validações executadas (incluindo percentual de cobertura de UI e checagens de RLS/segurança).

---

## 6. Guardrails Técnicos e de Segurança do Projeto

- **Tipagem estrita (`RNF01`):** manter TypeScript com `strict: true` e tipagem explícita para todas as entidades (`perfis`, `usuarios`, `projetos`, `usuario_projetos`, `registros_ponto`). Evitar `any`.
- **RLS obrigatório no Supabase (`RNF02`):** **toda tabela** criada ou mantida no schema `public` do Supabase **deve ter Row Level Security habilitado (`ENABLE ROW LEVEL SECURITY`)** com políticas explícitas por operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) diferenciando `admin` e `worker`. Nunca exponha tabelas sem RLS nem confie apenas em ocultação de UI/rotas no front-end.
- **Sincronismo de horário em UTC (`RNF03`):** timestamps (`horario_entrada`, `horario_saida`, `criado_em`, `atualizado_em`, `excluido_em`) devem ser gerados exclusivamente pelo servidor/banco em UTC; o front-end apenas converte para o fuso local na exibição.
- **Regras de negócio críticas:** preservar `RN01` (unicidade de sessão ativa), `RN02` (vínculo obrigatório com projeto), `RN03` (troca de projeto exige `Pause` antes de novo `Start`), `RN04` (`horario_saida >= horario_entrada` + auditoria obrigatória) e `RN05` (proteção do último `admin` ativo).
- **Segredos e `.gitignore`:** **nunca** versione `.env`, `.agents/mcp_config.json`, `SUPABASE_SERVICE_ROLE_KEY`, PATs ou qualquer credencial. Apenas `.agents/skills/`, `.agents/hooks.json` e `.agents/hooks/` podem ser versionados dentro de `.agents/`.
