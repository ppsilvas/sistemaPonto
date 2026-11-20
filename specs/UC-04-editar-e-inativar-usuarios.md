---
id: UC-04
title: "[UC-04] Edição e Inativação/Exclusão de Usuários com Proteção do Último Admin"
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
    - usuarios
    - security
  estimate: 3
  blocked_by:
    - UC-03
requirements:
  rf:
    - RF03
  rn:
    - RN05
  rnf:
    - RNF02
    - RNF04
actors:
  - Admin
---

# [UC-04] Edição e Inativação/Exclusão de Usuários com Proteção do Último Admin

## 1. Resumo e História de Usuário

> **Como** usuário `admin`,  
> **quero** atualizar dados cadastrais (nome, e-mail, perfil) e inativar/reativar ou excluir usuários,  
> **para** manter o cadastro da equipe atualizado sem risco de bloquear o acesso administrativo do sistema (`RN05`) nem perder o histórico de pontos.

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Mecanismo de Proteção |
|---|---|---|
| `Admin` | Permitido | Rota `/usuarios` + políticas RLS + Edge Function validando `is_admin()` + trigger `RN05` no banco. |
| `Worker` | Não permitido | Bloqueado em UI, RLS e Edge Function (`403 Forbidden`). |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF03` — Gestão de Usuários (Admin):** Atualizar dados cadastrais e excluir/inativar usuários.
- **`RN05` — Proteção do Último Administrador:** Impedir a exclusão, inativação ou rebaixamento de perfil (`admin` → `worker`) do único usuário `admin` ativo, evitando bloqueio administrativo do sistema.
- **`RNF02` — Controle de Autorização e Segurança:** Validação server-side / RLS e sincronização segura de e-mail e bloqueio de acesso no Supabase Auth.
- **`RNF04` — Responsividade:** Modais/formulários de edição e confirmação utilizáveis em desktop e celular.

---

## 4. Pré-condições

1. O usuário está autenticado com perfil `admin` e `ativo = true` (`UC-01`).
2. Existe ao menos um usuário listado na tela `/usuarios` (`UC-03`).
3. A trigger `trg_proteger_ultimo_admin` (`TECH-02`) está ativa em `public.usuarios`.

---

## 5. Fluxo Principal

### 5.1 Edição de Dados Cadastrais
1. Na tela `/usuarios`, o `admin` seleciona **Editar** em um usuário.
2. O sistema abre o formulário preenchido com **Nome**, **E-mail**, **Perfil** (`admin` / `worker`) e **Status** (`Ativo` / `Inativo` `[Extensão ao PDF]`).
3. Caso o usuário selecionado seja o **único `admin` ativo**, a UI já exibe aviso explicativo e desabilita a troca de perfil para `worker` e a inativação (`RN05`).
4. O `admin` altera os campos desejados e aciona **Salvar alterações**.
5. O sistema envia a requisição para Edge Function autenticada (ex.: `admin-update-user`) que:
   1. Valida que o chamador é `admin` ativo (`RNF02`).
   2. Se o e-mail foi alterado, verifica unicidade e atualiza o e-mail em `auth.users` e em `public.usuarios`.
   3. Atualiza `nome` e `perfil_id` em `public.usuarios` (sujeito à trigger atômica de `RN05`).
6. O sistema atualiza a listagem e exibe confirmação de sucesso.

### 5.2 Inativação / Reativação de Usuário (`[Extensão ao PDF]`)
7. O `admin` aciona **Inativar** em um usuário ativo (que não seja o único `admin` ativo).
8. O sistema verifica se o usuário possui **ponto em aberto** (`horario_saida IS NULL AND excluido_em IS NULL`) e exibe modal de confirmação:
   - Se houver ponto aberto, alerta o `admin` sobre a sessão em andamento (orientando encerrar administrativamente em `UC-11` após inativar, ou confirmando ciência).
9. Ao confirmar, a Edge Function:
   1. Atualiza `public.usuarios` definindo `ativo = false` e `inativado_em = now()` (UTC servidor) — protegido pela trigger `RN05`.
   2. Aplica bloqueio de login no Supabase Auth (ex.: `ban_duration` / revogação de sessão) impedindo novas autenticações.
10. O histórico em `registros_ponto` e referências de auditoria (`atualizado_por`, `excluido_por`) permanecem intactos para relatórios históricos.
11. Para **Reativar** um usuário inativo, o `admin` aciona **Reativar**, definindo `ativo = true`, `inativado_em = NULL` e removendo o bloqueio no Supabase Auth.

---

## 6. Fluxos Alternativos e de Exceção

- **FA01 — Exclusão física para usuário sem histórico (opcional):**
  - Caso o usuário nunca tenha registrado ponto e nunca tenha auditado registros (`0` referências em `registros_ponto`), o sistema pode opcionalmente oferecer **Excluir permanentemente** (sujeito a `RN05`). Caso possua histórico, apenas **Inativar** é permitido, explicando que a preservação protege os relatórios e auditoria (`[Extensão ao PDF]`).
- **FE01 — Tentativa de rebaixar, inativar ou excluir o último `admin` ativo (`RN05`):**
  - Mesmo sob requisições simultâneas de dois admins tentando se rebaixar ao mesmo tempo, a trigger `trg_proteger_ultimo_admin` (`TECH-02`) bloqueia a operação com erro `LAST_ADMIN_PROTECTED`.
  - A UI exibe alerta claro: *"Não é possível inativar, excluir ou alterar o perfil do único administrador ativo do sistema."*.
- **FE02 — Novo e-mail já em uso por outro usuário:**
  - A operação falha com `409 Conflict` e exibe *"Este e-mail já está em uso por outro usuário."*, sem alterar `auth.users` nem `public.usuarios`.
- **FE03 — `Admin` rebaixa o próprio perfil (havendo outro `admin` ativo):**
  - O sistema solicita confirmação explícita avisando que o usuário perderá acesso administrativo imediatamente; após confirmar, a sessão recarrega o novo perfil (`worker`) e redireciona para `/ponto`.
- **FE04 — Falha na sincronização entre `auth.users` e `public.usuarios`:**
  - A Edge Function executa rollback compensatório para não deixar e-mail ou status dessincronizado entre Auth e tabela `public.usuarios`.

---

## 7. Pós-condições e Impacto em Dados

- **Escrita:**
  - `public.usuarios`: atualização de `nome`, `email`, `perfil_id`, `ativo` (`[Extensão ao PDF]`) e `inativado_em` (`[Extensão ao PDF]`, carimbado em UTC pelo banco).
  - `auth.users`: sincronização de `email` e status de banimento/revogação de sessão.
- **Preservação:** Registros existentes em `registros_ponto` e referências de auditoria não são perdidos com a inativação.

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Proteção contra rebaixamento do último `admin` ativo (`RN05`):**
  - **Dado** que existe apenas 1 usuário com perfil `admin` e `ativo = true`
  - **Quando** esse `admin` tenta alterar seu perfil para `worker` ou se inativar (via UI ou chamada direta à API)
  - **Então** o sistema bloqueia a operação na UI e no banco (`LAST_ADMIN_PROTECTED`) e mantém o usuário como `admin` ativo.
- **Cenário 2 — Inativação de `worker` preserva histórico e bloqueia login:**
  - **Dado** um `worker` ativo com registros de ponto anteriores
  - **Quando** o `admin` confirma a inativação desse usuário
  - **Então** `usuarios.ativo` passa para `false` com `inativado_em` em UTC, o `worker` não consegue mais fazer login e seus registros de ponto continuam visíveis nos relatórios históricos do `admin`.
- **Cenário 3 — Alteração de e-mail sincronizada:**
  - **Dado** um usuário existente
  - **Quando** o `admin` atualiza seu nome e e-mail para um endereço inédito
  - **Então** ambos `auth.users` e `public.usuarios` são atualizados e o usuário passa a autenticar com o novo e-mail.

### Checklist de Conclusão
- [ ] Edição de nome, e-mail e perfil (`admin` ↔ `worker`) funcionando com sincronização segura no Supabase Auth.
- [ ] Inativação (`ativo = false`, `inativado_em` UTC) e reativação (`ativo = true`) implementadas preservando `registros_ponto`.
- [ ] Regra `RN05` reforçada na UI (aviso + desabilitação) e garantida atomicamente no PostgreSQL via trigger `trg_proteger_ultimo_admin`.
- [ ] Confirmação explícita quando o `admin` edita o próprio perfil para `worker` (havendo outro `admin` ativo) ou inativa usuário com ponto aberto.
- [ ] Tentativas feitas por `worker` rejeitadas pelo servidor com `403 Forbidden`.

---

## 9. Notas Técnicas e de UX

- Ao alterar `ativo = false`, considerar a invalidação da sessão ativa do usuário no Auth (`admin.updateUserById(id, { ban_duration: '876000h' })`) aliada à checagem `is_active_user()` nas políticas RLS (`TECH-02`), garantindo bloqueio imediato mesmo antes da expiração do JWT.
- Exibir badge visual clara diferenciando usuários **Ativos** e **Inativos** na listagem `/usuarios`.
