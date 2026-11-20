---
id: UC-07
title: "[UC-07] Seleção de Projeto e Início de Trabalho (Start)"
type: use-case
linear:
  team: Ppsilvas
  team_key: PPS
  project: Projeto Ponto Lelê
  project_id: P-PPS-1
  milestone: "M3 - Controle de Ponto"
  priority: 1
  labels:
    - Feature
  suggested_labels:
    - ponto
    - core
    - worker
    - admin
  estimate: 3
  blocked_by:
    - UC-06
requirements:
  rf:
    - RF05
    - RF06
  rn:
    - RN01
    - RN02
  rnf:
    - RNF02
    - RNF03
    - RNF04
    - RNF05
actors:
  - Worker
  - Admin
---

# [UC-07] Seleção de Projeto e Início de Trabalho (Start)

## 1. Resumo e História de Usuário

> **Como** usuário autenticado (`worker` ou `admin` vinculado a projetos),  
> **quero** selecionar obrigatoriamente um dos meus projetos vinculados, informar observações opcionais e acionar o botão **Start**,  
> **para** iniciar minha sessão de trabalho com horário oficial do servidor em UTC e acompanhamento visual imediato.

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Restrição |
|---|---|---|
| `Worker` | Permitido | Apenas em projetos ativos aos quais está explicitamente vinculado em `usuario_projetos`. |
| `Admin` | Permitido | Somente se também estiver vinculado a projetos ativos em `usuario_projetos` (conforme Matriz de Permissões). |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF05` — Seleção de Projeto no Ponto:** Antes de iniciar uma sessão de trabalho, selecionar obrigatoriamente um dos projetos aos quais está vinculado.
- **`RF06` — Início de Trabalho (Start):** Ao acionar **Start**, criar novo registro em `registros_ponto` contendo usuário, projeto selecionado, data/hora de entrada carimbada pelo servidor e observações opcionais.
- **`RN01` — Unicidade de Sessão Ativa:** Impedir dois registros abertos simultaneamente; enquanto houver registro ativo, o botão **Start** permanece desabilitado e **Pause** habilitado.
- **`RN02` — Restrição de Vínculo com Projeto:** Usuário sem nenhum projeto vinculado não poderá registrar ponto até que um `admin` realize o vínculo.
- **`RNF02` — Controle de Autorização e Segurança:** Validação de vínculo e identidade (`auth.uid()`) no servidor/RPC.
- **`RNF03` — Sincronismo de Horário no Servidor:** `horario_entrada` gravado exclusivamente pelo relógio UTC do banco (`now()`), jamais pelo relógio local do dispositivo.
- **`RNF04` — Responsividade:** Tela principal otimizada para acionamento rápido de **Start** no celular com um toque.
- **`RNF05` — Usabilidade e Feedback Visual:** Ao iniciar, exibir imediatamente o projeto em andamento, o horário de início e o cronômetro decorrido em tempo real.

---

## 4. Pré-condições

1. O usuário (`worker` ou `admin`) está autenticado e com `ativo = true` (`UC-01`).
2. O usuário está vinculado a pelo menos 1 projeto ativo em `public.usuario_projetos` (`UC-06`).
3. O usuário **não** possui registro de ponto aberto (`horario_saida IS NULL AND excluido_em IS NULL`).
4. A RPC `public.iniciar_ponto` e o índice único `uq_registros_ponto_sessao_ativa` estão implantados (`TECH-02`).

---

## 5. Fluxo Principal

1. O usuário acessa a tela principal **Registro de Ponto** (`/ponto`).
2. O sistema consulta em paralelo:
   - Se existe sessão de ponto ativa para `auth.uid()`;
   - A lista de projetos ativos (`projetos.ativo = true`) vinculados ao usuário via `usuario_projetos`.
3. Confirmado que não há sessão ativa e que existe ao menos 1 projeto vinculado:
   - O botão **Start** fica visível e preparado (habilitado assim que houver projeto selecionado);
   - O botão **Pause** permanece desabilitado (`RN01`).
4. O usuário seleciona obrigatoriamente um projeto na lista de projetos vinculados (`RF05`). *(Opcional de UX: se o usuário tiver exatamente 1 projeto vinculado, o seletor pode vir pré-selecionado para agilizar o uso mobile.)*
5. Opcionalmente, o usuário preenche o campo **Observações** descrevendo a atividade que será executada (`RF06`).
6. O usuário aciona o botão **Start**.
7. A UI desabilita o botão **Start** imediatamente (evitando duplo clique) e invoca a RPC `public.iniciar_ponto(p_projeto_id, p_observacoes)`.
8. No servidor (PostgreSQL), a RPC:
   1. Identifica o usuário exclusivamente via `auth.uid()` e confirma `ativo = true`;
   2. Valida existência do vínculo em `usuario_projetos` e que `projetos.ativo = true` (`RN02`);
   3. Insere novo registro em `public.registros_ponto` com `horario_entrada = now()` (UTC servidor — `RNF03`), `horario_saida = NULL` e `observacoes` (normalizada para `NULL` se vazia);
   4. O índice único parcial `uq_registros_ponto_sessao_ativa` garante atomicamente que nenhum segundo registro aberto seja criado (`RN01`).
9. A RPC retorna o registro criado (incluindo `horario_entrada` UTC do servidor).
10. A tela transita imediatamente para o estado **Sessão Ativa** (`RNF05`):
    - Botão **Start** desabilitado e seletor de projeto travado (`RN01`);
    - Botão **Pause** habilitado em destaque;
    - Exibição clara do **nome do projeto em andamento**, **horário de início** (convertido de UTC para o fuso local do dispositivo) e **cronômetro decorrido em tempo real** (`HH:MM:SS`).

---

## 6. Fluxos Alternativos e de Exceção

- **FE01 — Usuário sem nenhum projeto ativo vinculado (`RN02`):**
  - O seletor de projetos e o botão **Start** ficam desabilitados.
  - O sistema exibe estado informativo em destaque: *"Você ainda não está vinculado a nenhum projeto ativo. Solicite a um administrador para realizar o vínculo antes de registrar ponto."*
  - *(Se o próprio usuário for `admin`, exibir atalho direto para `/projetos` para se vincular.)*
- **FE02 — Usuário clica em Start sem selecionar projeto (`RF05`):**
  - O botão **Start** permanece desabilitado enquanto nenhum projeto estiver selecionado (ou exibe validação inline *"Selecione um projeto para iniciar."*).
- **FE03 — Tentativa simultânea em duas abas/dispositivos ou duplo clique (`RN01`):**
  - A segunda chamada recebe erro `ACTIVE_SESSION_EXISTS` do banco.
  - A UI exibe aviso (*"Você já possui um ponto em aberto."*) e recarrega automaticamente a sessão ativa real do servidor.
- **FE04 — Projeto foi desvinculado ou inativado enquanto a tela estava aberta (`RN02`):**
  - A RPC rejeita com `PROJECT_NOT_LINKED` / `PROJECT_INACTIVE`.
  - A UI exibe mensagem explicativa e atualiza a lista de projetos vinculados.
- **FE05 — Relógio local do dispositivo adiantado ou atrasado (`RNF03`):**
  - O valor salvo no banco é sempre `now()` UTC do servidor. Para evitar exibição de cronômetro negativo caso o relógio local esteja atrasado em relação ao servidor, a RPC pode retornar também `server_now` (ou usar `Math.max(0, elapsed)`) para calcular o *offset* de exibição do cronômetro no cliente.
- **FE06 — Erro de rede ao acionar Start:**
  - Exibe alerta amigável sem perder o texto digitado em **Observações** e reabilita o botão após verificar se o registro não foi gravado no servidor.

---

## 7. Pós-condições e Impacto em Dados

- **Escrita:** Novo registro em `public.registros_ponto`:
  - `id`: UUID gerado pelo banco;
  - `usuario_id`: `auth.uid()`;
  - `projeto_id`: UUID do projeto selecionado;
  - `horario_entrada`: `TIMESTAMPTZ` UTC gerado pelo servidor (`RNF03`);
  - `horario_saida`: `NULL`;
  - `observacoes`: texto opcional informado;
  - `atualizado_em`, `atualizado_por`, `excluido_em`, `excluido_por`: `NULL`.

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Início de ponto bem-sucedido:**
  - **Dado** um usuário autenticado vinculado ao projeto `"App Mobile"` sem sessão ativa
  - **Quando** seleciona `"App Mobile"`, escreve `"Implementação tela login"` em observações e clica em **Start**
  - **Então** um registro é criado em `registros_ponto` com `horario_entrada` carimbado em UTC pelo servidor e `horario_saida = NULL`, o botão **Start** fica desabilitado, **Pause** fica habilitado e o cronômetro em tempo real inicia exibindo `"App Mobile"` e o horário de entrada.
- **Cenário 2 — Bloqueio sem projeto vinculado (`RN02`):**
  - **Dado** um usuário sem projetos ativos em `usuario_projetos`
  - **Quando** acessa `/ponto`
  - **Então** não pode acionar **Start** e visualiza orientação clara para aguardar vínculo por um `admin`.
- **Cenário 3 — Bloqueio de sessão dupla em abas concorrentes (`RN01`):**
  - **Dado** o mesmo usuário com duas abas abertas em `/ponto`
  - **Quando** aciona **Start** na aba 1 e em seguida na aba 2
  - **Então** apenas 1 registro aberto é gravado no banco; a aba 2 recebe feedback controlado e sincroniza exibindo a sessão já ativa.
- **Cenário 4 — Imunidade ao relógio local (`RNF03`):**
  - **Dado** um dispositivo com o relógio local atrasado em 2 horas
  - **Quando** o usuário aciona **Start**
  - **Então** `horario_entrada` gravado em `registros_ponto` corresponde ao horário UTC real do servidor Supabase.

### Checklist de Conclusão
- [ ] Tela `/ponto` responsiva (*mobile-first*) com botões grandes e acionamento rápido de **Start** no celular (`RNF04`).
- [ ] Seletor lista apenas projetos ativos vinculados ao usuário (`RF05`, `RN02`).
- [ ] Estado bloqueado e informativo quando o usuário não tem projetos vinculados (`RN02`).
- [ ] RPC `iniciar_ponto` grava `horario_entrada` em UTC no servidor e valida vínculo e unicidade no banco (`RF06`, `RN01`, `RNF03`).
- [ ] Proteção contra duplo clique e sincronização automática em caso de conflito `ACTIVE_SESSION_EXISTS`.
- [ ] Transição imediata para painel de sessão ativa com projeto, horário de início e cronômetro em tempo real (`RNF05`).

---

## 9. Notas Técnicas e de UX

- **Offset do cronômetro:** Retornar `{ registro, server_now }` na RPC `iniciar_ponto` (e na consulta da sessão ativa) permite calcular `clockOffsetMs = Date.parse(server_now) - Date.now()` no front-end, exibindo um cronômetro em tempo real preciso mesmo quando o relógio do celular/computador está dessincronizado (`RNF03` + `RNF05`).
- O campo `observacoes` deve aceitar texto multilinha com limite razoável de UX (ex.: contador opcional ou 1.000 caracteres) mantendo-se simples e rápido no celular.
