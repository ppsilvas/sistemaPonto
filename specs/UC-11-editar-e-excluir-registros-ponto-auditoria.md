---
id: UC-11
title: "[UC-11] Edição e Exclusão Administrativa de Registros de Ponto com Auditoria"
type: use-case
linear:
  team: Ppsilvas
  team_key: PPS
  project: Projeto Ponto Lelê
  project_id: P-PPS-1
  milestone: "M4 - Consultas, Auditoria & Exportação"
  priority: 2
  labels:
    - Feature
  suggested_labels:
    - admin
    - auditoria
    - ponto
    - security
  estimate: 5
  blocked_by:
    - UC-10
requirements:
  rf:
    - RF08
  rn:
    - RN01
    - RN04
  rnf:
    - RNF02
    - RNF03
    - RNF04
actors:
  - Admin
---

# [UC-11] Edição e Exclusão Administrativa de Registros de Ponto com Auditoria

## 1. Resumo e História de Usuário

> **Como** usuário `admin`,  
> **quero** ajustar ou excluir registros de ponto inconsistentes (como horários esquecidos abertos ou batidas incorretas) garantindo validação cronológica e registro automático de auditoria,  
> **para** manter a integridade das horas apuradas com rastreabilidade completa de quem alterou ou excluiu cada registro e quando (`RN04`).

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Mecanismo de Proteção |
|---|---|---|
| `Admin` | Permitido (com log de auditoria obrigatório) | Ações em `/relatorios` + RPCs `editar_ponto_admin` e `excluir_ponto_admin` validando `is_admin()`. |
| `Worker` | Não permitido | Sem botões na UI + RLS bloqueia `UPDATE`/`DELETE` direto + RPCs rejeitam chamadores não-admin. |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF08` — Consulta, Cálculo e Gestão de Pontos:** O `admin` pode ajustar ou excluir registros inconsistentes mantendo registro de auditoria.
- **Matriz de Permissões (Seção 2):** Editar ou excluir registros de ponto — permitido apenas ao `admin` (com log de auditoria).
- **`RN04` — Integridade Cronológica e Auditoria:** Em edições administrativas, `horario_saida` nunca poderá ser anterior a `horario_entrada` do mesmo registro, e o sistema deve registrar qual `admin` efetuou a alteração (`atualizado_por`) e quando ela ocorreu (`atualizado_em`).
- **`RN01` — Unicidade de Sessão Ativa:** Edições administrativas não podem resultar em dois registros abertos (`horario_saida IS NULL`) simultâneos para o mesmo usuário.
- **`RNF02` — Controle de Autorização e Segurança:** Validação de perfil `admin` e preenchimento de auditoria exclusivamente no servidor (não aceitando `atualizado_por`/`atualizado_em` vindos do cliente).
- **`RNF03` — Sincronismo de Horário no Servidor:** `atualizado_em` e `excluido_em` gerados exclusivamente pelo relógio UTC do servidor (`now()`).
- **`RNF04` — Responsividade:** Modais de edição e confirmação de exclusão utilizáveis em desktop e celular.

---

## 4. Pré-condições

1. O usuário está autenticado com perfil `admin` e `ativo = true` (`UC-01`).
2. O registro alvo está visível no relatório global (`/relatorios`, `UC-10`) e ainda não foi excluído (`excluido_em IS NULL`).
3. As RPCs `public.editar_ponto_admin` e `public.excluir_ponto_admin` e as constraints de `RN01` e `RN04` estão implantadas (`TECH-02`).

---

## 5. Fluxo Principal

### 5.1 Edição Administrativa de Registro de Ponto
1. Em `/relatorios` (`UC-10`), o `admin` aciona **Editar** em um registro de ponto.
2. O sistema abre o modal **Editar Registro de Ponto** exibindo (somente leitura) o nome do usuário dono do registro e permitindo alterar:
   - **Projeto** (lista de projetos — destacando os vinculados ao usuário);
   - **Horário de entrada** (data e hora no fuso local, convertida para ISO UTC no envio);
   - **Horário de saída** (data e hora no fuso local — opcional apenas se o registro já estiver em aberto e o `admin` mantiver em aberto, ou preenchido para encerrar um ponto esquecido aberto);
   - **Observações** (texto livre opcional).
3. O modal exibe prévia instantânea da **nova duração calculada** conforme o `admin` ajusta os horários.
4. O `admin` aciona **Salvar alterações**.
5. O front-end valida previamente que `horario_saida` (quando informado) não é anterior a `horario_entrada` (`RN04`) e invoca a RPC `public.editar_ponto_admin(p_registro_id, p_projeto_id, p_horario_entrada, p_horario_saida, p_observacoes)`.
6. No servidor (PostgreSQL), a RPC:
   1. Valida `public.is_admin()`;
   2. Confirma que o registro existe e `excluido_em IS NULL`;
   3. Valida `RN04`: `p_horario_saida IS NULL OR p_horario_saida >= p_horario_entrada` (reforçado pela constraint `chk_registros_ponto_cronologia`);
   4. Valida `RN01`: caso `p_horario_saida IS NULL`, garante que não existe outro registro aberto para o mesmo usuário (reforçado pelo índice único `uq_registros_ponto_sessao_ativa`);
   5. Atualiza os campos editados e grava **obrigatoriamente no servidor** `atualizado_em = now()` (UTC — `RNF03`) e `atualizado_por = auth.uid()` (`RN04`).
7. A tela fecha o modal, atualiza a listagem e os totais de horas, exibe confirmação de sucesso e passa a exibir o selo de auditoria no registro editado.

### 5.2 Exclusão Administrativa Auditada (`[Extensão ao PDF]`)
8. Em `/relatorios`, o `admin` aciona **Excluir** em um registro inconsistente (ex.: batida duplicada ou acidental).
9. O sistema abre modal de confirmação exibindo resumo do registro (usuário, projeto, entrada, saída e duração) e alertando que o registro sairá dos relatórios e totais, mantendo rastro de auditoria da exclusão.
10. Ao confirmar, o front-end invoca a RPC `public.excluir_ponto_admin(p_registro_id)`.
11. No servidor (PostgreSQL), a RPC:
    1. Valida `public.is_admin()`;
    2. Aplica soft delete gravando `excluido_em = now()` (UTC), `excluido_por = auth.uid()`, `atualizado_em = now()` e `atualizado_por = auth.uid()` (`[Extensão ao PDF]`);
    3. Caso o registro excluído estivesse em aberto (`horario_saida IS NULL`), o índice parcial `WHERE horario_saida IS NULL AND excluido_em IS NULL` libera imediatamente o usuário para iniciar um novo ponto (`RN01`).
12. A tela remove o registro da listagem padrão, recalcula os totais acumulados e exibe feedback visual.

---

## 6. Fluxos Alternativos e de Exceção

- **FA01 — Encerramento administrativo de ponto esquecido em aberto:**
  - Se um `worker` esqueceu de clicar em **Pause** no dia anterior, o `admin` edita o registro informando o `horario_saida` correto (>= `horario_entrada`). O registro passa a encerrado, grava auditoria (`atualizado_por`/`atualizado_em`) e libera o botão **Start** na tela do `worker`.
- **FE01 — `horario_saida` anterior a `horario_entrada` (`RN04`):**
  - Validação no front-end impede o envio e exibe erro inline: *"O horário de saída não pode ser anterior ao horário de entrada."*
  - Mesmo em chamada direta à RPC/banco, a validação e a constraint `chk_registros_ponto_cronologia` rejeitam a escrita com erro `INVALID_CHRONOLOGY`.
- **FE02 — Tentativa de limpar `horario_saida` (reabrir sessão) quando o usuário já possui outro ponto aberto (`RN01`):**
  - O índice `uq_registros_ponto_sessao_ativa` bloqueia a alteração e a UI informa *"Não é possível reabrir este registro porque o usuário já possui outro ponto em andamento."*.
- **FE03 — Tentativa de edição ou exclusão por usuário `worker`:**
  - As RPCs validam `public.is_admin()` e retornam `403 / permission denied`; políticas RLS também bloqueiam qualquer `UPDATE`/`DELETE` direto na tabela `registros_ponto`.
- **FE04 — Registro já excluído por outro administrador concorrentemente:**
  - A RPC retorna `RECORD_NOT_FOUND_OR_DELETED`, a UI exibe aviso e atualiza a tabela.
- **FE05 — Edição sem nenhuma mudança real nos campos:**
  - A UI desabilita o botão **Salvar alterações** enquanto não houver diferença nos valores, evitando registrar auditoria desnecessária.

---

## 7. Pós-condições e Impacto em Dados

- **Edição em `public.registros_ponto`:**
  - Atualiza `projeto_id`, `horario_entrada`, `horario_saida`, `observacoes`;
  - Grava automaticamente no servidor: `atualizado_em = now()` (UTC) e `atualizado_por = auth.uid()`.
- **Exclusão auditada em `public.registros_ponto` `[Extensão ao PDF]`:**
  - Grava `excluido_em = now()` (UTC), `excluido_por = auth.uid()`, `atualizado_em = now()` e `atualizado_por = auth.uid()`.
  - Registro deixa de aparecer nas consultas padrão de `worker` (`UC-09`), `admin` (`UC-10`) e exportação CSV (`UC-12`), preservando a trilha de auditoria no banco.

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Edição válida registra auditoria automática (`RN04`, `RNF03`):**
  - **Dado** um `admin` editando um registro de ponto de um `worker`
  - **Quando** altera `horario_saida` para um horário posterior a `horario_entrada` e salva
  - **Então** o registro é atualizado com o novo horário, `atualizado_por` recebe o UUID do `admin` logado e `atualizado_em` recebe o timestamp UTC do servidor.
- **Cenário 2 — Bloqueio de inversão cronológica (`RN04`):**
  - **Dado** um registro com `horario_entrada = 10:00`
  - **Quando** o `admin` tenta definir `horario_saida = 09:30` (via UI ou chamada direta à RPC)
  - **Então** a operação é rejeitada tanto na UI quanto no PostgreSQL, mantendo o registro inalterado.
- **Cenário 3 — Exclusão administrativa mantém trilha de auditoria (`[Extensão ao PDF]`):**
  - **Dado** um registro inconsistente selecionado por um `admin`
  - **Quando** o `admin` confirma a exclusão
  - **Então** o registro recebe `excluido_em` (UTC) e `excluido_por` (`auth.uid()`), deixa de aparecer nos relatórios padrão e nos cálculos de horas, e permanece rastreável para auditoria.
- **Cenário 4 — `Worker` não pode editar nem excluir pontos (`RNF02`):**
  - **Dado** um `worker` autenticado
  - **Quando** tenta invocar `editar_ponto_admin`, `excluir_ponto_admin` ou `UPDATE`/`DELETE` em `registros_ponto`
  - **Então** o Supabase rejeita a operação com erro de permissão.

### Checklist de Conclusão
- [ ] Modal de edição administrativa com conversão correta entre inputs locais (`datetime-local`) e ISO UTC.
- [ ] Validação de `RN04` (`horario_saida >= horario_entrada`) na UI e garantida no PostgreSQL (`CHECK` + RPC).
- [ ] Validação de `RN01` ao editar/reabrir registros de ponto.
- [ ] Gravação exclusivamente server-side de `atualizado_em` (UTC) e `atualizado_por` (`auth.uid()`).
- [ ] Exclusão administrativa via soft delete auditado (`excluido_em` UTC + `excluido_por`) com modal de confirmação explícita.
- [ ] Recálculo imediato dos totais na tela `/relatorios` após edição ou exclusão.
- [ ] Bloqueio efetivo de `worker` testado diretamente contra as RPCs e API REST do Supabase.

---

## 9. Notas Técnicas e de UX

- **Cuidado com `datetime-local` e fuso horário:** O input HTML `datetime-local` trabalha no fuso horário do navegador sem offset. Converter explicitamente `new Date(localInputValue).toISOString()` ao enviar para a RPC, e formatar de volta no fuso local ao abrir o modal, evitando deslocamentos de ±3h (ex.: UTC-3 Brasília).
- Nunca confiar em `atualizado_por` ou `atualizado_em` recebidos via parâmetro da RPC; esses campos devem ser preenchidos internamente no SQL usando `auth.uid()` e `now()`.
