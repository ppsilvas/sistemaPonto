---
id: UC-08
title: "[UC-08] Pausa/Encerramento de Trabalho (Pause), Cronômetro Ativo e Troca de Projeto"
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
    - UC-07
requirements:
  rf:
    - RF07
  rn:
    - RN01
    - RN03
  rnf:
    - RNF02
    - RNF03
    - RNF04
    - RNF05
actors:
  - Worker
  - Admin
---

# [UC-08] Pausa/Encerramento de Trabalho (Pause), Cronômetro Ativo e Troca de Projeto

## 1. Resumo e História de Usuário

> **Como** usuário com uma sessão de ponto em andamento (`worker` ou `admin`),  
> **quero** visualizar claramente o projeto ativo, o horário de início e o cronômetro em tempo real, complementar minhas observações e acionar **Pause**,  
> **para** encerrar meu registro com horário oficial do servidor e, quando necessário, trocar de projeto iniciando uma nova sessão (`RN03`).

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Restrição |
|---|---|---|
| `Worker` | Permitido | Encerra exclusivamente o próprio registro de ponto em aberto (`usuario_id = auth.uid()`). |
| `Admin` | Permitido | No fluxo operacional `/ponto`, encerra apenas o próprio registro em aberto. *(Para encerrar ponto aberto de outro usuário, utiliza o fluxo administrativo `UC-11`.)* |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF07` — Pausa / Fim de Trabalho (Pause):** Ao acionar **Pause**, encerrar o registro ativo atual gravando `horario_saida` e permitindo complementar `observacoes`. Ao clicar em **Start** novamente, um novo registro de ponto será criado.
- **`RN01` — Unicidade de Sessão Ativa:** Enquanto aberto, **Start** desabilitado e **Pause** habilitado; ao encerrar, **Pause** volta a ficar desabilitado e **Start** habilitado.
- **`RN03` — Troca de Projeto Durante o Expediente:** Para mudar de projeto ao longo do dia, o usuário deve acionar **Pause** no registro atual (encerrando a sessão do primeiro projeto), selecionar o novo projeto e acionar **Start** para gerar um novo registro.
- **`RNF02` — Controle de Autorização e Segurança:** Encerramento feito exclusivamente via RPC autenticada validando `auth.uid()` (sem liberar `UPDATE` genérico em `registros_ponto` para `worker`).
- **`RNF03` — Sincronismo de Horário no Servidor:** `horario_saida` gravado exclusivamente pelo relógio UTC do servidor (`now()`).
- **`RNF04` — Responsividade:** Acionamento rápido de **Pause** pelo celular.
- **`RNF05` — Usabilidade e Feedback Visual:** Exibição clara e contínua do projeto em andamento, horário de início e cronômetro decorrido em tempo real enquanto o ponto estiver aberto.

---

## 4. Pré-condições

1. O usuário está autenticado e ativo (`UC-01`).
2. O usuário possui exatamente 1 registro ativo em `public.registros_ponto` (`usuario_id = auth.uid() AND horario_saida IS NULL AND excluido_em IS NULL`) criado via `UC-07`.
3. A RPC `public.pausar_ponto` está implantada (`TECH-02`).

---

## 5. Fluxo Principal

### 5.1 Acompanhamento da Sessão Ativa e Persistência entre Recarregamentos (`RNF05`)
1. Ao abrir ou recarregar `/ponto` (inclusive em outro dispositivo ou após fechar o navegador), o sistema consulta a sessão ativa do usuário no Supabase (junto ao nome do projeto e `server_now`).
2. O painel principal destaca o cartão **Ponto em Andamento** exibindo:
   - Indicador visual de status ativo (ex.: badge pulsante *"Em andamento"*);
   - **Projeto em andamento** (nome completo);
   - **Horário de início** formatado no fuso local do navegador;
   - **Cronômetro decorrido em tempo real** (`HH:MM:SS`) atualizado a cada segundo com base no `horario_entrada` UTC do servidor;
   - Campo **Observações** pré-carregado com o texto informado no `Start` (se houver), editável para complementação (`RF07`).
3. O seletor de projeto permanece bloqueado enquanto o ponto estiver aberto, exibindo orientação sucinta sobre `RN03` (*"Para trocar de projeto, pause o registro atual primeiro."*).
4. O botão **Start** permanece desabilitado e o botão **Pause** habilitado (`RN01`).

### 5.2 Encerramento da Sessão (`Pause`)
5. O usuário opcionalmente complementa ou ajusta o texto do campo **Observações** descrevendo o que foi concluído no período.
6. O usuário aciona o botão **Pause**.
7. A UI desabilita o botão **Pause** durante a requisição e invoca a RPC `public.pausar_ponto(p_observacoes)`.
8. No servidor (PostgreSQL), a RPC:
   1. Localiza o registro aberto de `auth.uid()` (`horario_saida IS NULL AND excluido_em IS NULL`);
   2. Atualiza `horario_saida = now()` (UTC servidor — `RNF03`) e grava o texto final de `observacoes`;
   3. Valida a integridade `horario_saida >= horario_entrada` (constraint da tabela);
   4. Retorna o registro encerrado.
9. A tela exibe resumo breve da sessão recém-encerrada (projeto + duração total calculada), limpa o estado de sessão ativa, desabilita **Pause**, desbloqueia o seletor de projetos e reabilita **Start** (`RN01`).

### 5.3 Troca de Projeto ou Retomada Durante o Expediente (`RN03`, `RF07`)
10. Caso o usuário deseje retomar o trabalho no mesmo projeto ou mudar para outro projeto ao longo do dia:
    - Com a sessão anterior já encerrada, seleciona o novo projeto (ou o mesmo) no seletor desbloqueado;
    - Aciona **Start** (`UC-07`), criando um **novo registro independente** em `registros_ponto` (nunca reabrindo o registro já pausado).

---

## 6. Fluxos Alternativos e de Exceção

- **FA01 — Sessão atravessa a meia-noite (virada de dia):**
  - Como `horario_entrada` e `horario_saida` são `TIMESTAMPTZ` completos em UTC, o cronômetro continua contando além de `24:00:00` sem resetar, e o encerramento calcula a duração total corretamente.
- **FA02 — Complemento de observações mantido em branco:**
  - Se o usuário não digitar nada no `Start` nem no `Pause`, `observacoes` permanece `NULL`. Se havia texto no `Start` e o usuário acrescenta novas informações no campo pré-preenchido antes do `Pause`, o texto completo editado é salvo.
- **FE01 — Sessão já foi encerrada em outra aba ou por um `admin` (`UC-11`):**
  - Ao acionar **Pause**, a RPC retorna `NO_ACTIVE_SESSION`.
  - A UI informa *"Esta sessão de ponto já foi encerrada anteriormente."* e atualiza o estado da tela para inativo (sem travar a interface).
- **FE02 — Usuário tenta trocar o projeto sem pausar primeiro (`RN03`):**
  - O seletor de projeto está desabilitado enquanto o ponto está aberto, com texto auxiliar explicando que é necessário pausar antes de iniciar em outro projeto.
- **FE03 — Perda momentânea de conexão ao clicar em Pause:**
  - A UI exibe erro amigável, preserva as observações digitadas e permite tentar novamente (reconsultando se o registro já foi fechado no servidor antes de reportar falha definitiva).
- **FE04 — Aba do navegador ficou em segundo plano (throttling de `setInterval`):**
  - O cronômetro **não** incrementa somando `+1s` em memória; ele recalcula `agora_estimado_servidor - horario_entrada` a cada tick (e ao evento `visibilitychange`), mantendo precisão exata mesmo após horas em background ou tela bloqueada no celular.

---

## 7. Pós-condições e Impacto em Dados

- **Escrita:** Atualização exclusivamente no registro aberto do usuário em `public.registros_ponto`:
  - `horario_saida`: `TIMESTAMPTZ` UTC gerado pelo servidor (`now()`);
  - `observacoes`: texto atualizado/complementado pelo usuário;
  - `atualizado_em` e `atualizado_por`: permanecem `NULL` (pois se trata do fluxo operacional normal de `Pause`, reservando `atualizado_em`/`atualizado_por` para edições administrativas conforme `RN04`).
- **Histórico:** O registro encerrado passa a compor imediatamente os totais de horas em `UC-09`, `UC-10` e `UC-12`.

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Persistência do cronômetro ao recarregar a página (`RNF05`):**
  - **Dado** um usuário que iniciou ponto no projeto `"API Pagamentos"` há 15 minutos
  - **Quando** fecha o navegador, reabre e acessa `/ponto`
  - **Então** a tela exibe `"API Pagamentos"`, o horário de início original no fuso local e o cronômetro contando a partir de `00:15:xx`, com **Start** desabilitado e **Pause** habilitado.
- **Cenário 2 — Pausa com complemento de observações (`RF07`, `RNF03`):**
  - **Dado** um ponto aberto com observação inicial `"Setup inicial"`
  - **Quando** o usuário complementa para `"Setup inicial + testes de integração"` e clica em **Pause**
  - **Então** o servidor grava `horario_saida` em UTC e a observação completa, encerra o cronômetro, exibe a duração da sessão e reabilita o seletor de projeto e **Start**.
- **Cenário 3 — Troca de projeto durante o expediente (`RN03`):**
  - **Dado** um usuário trabalhando no `"Projeto A"` que precisa mudar para `"Projeto B"`
  - **Quando** aciona **Pause** no `"Projeto A"`, seleciona `"Projeto B"` e aciona **Start**
  - **Então** existem 2 registros distintos em `registros_ponto`: o do `"Projeto A"` encerrado (`horario_saida IS NOT NULL`) e um novo registro ativo para `"Projeto B"` (`horario_saida IS NULL`).
- **Cenário 4 — Retomada após pausa gera novo registro (`RF07`):**
  - **Dado** um usuário que pausou o `"Projeto A"`
  - **Quando** clica novamente em **Start** no mesmo `"Projeto A"`
  - **Então** o registro anterior permanece intocado e um novo registro independente é criado em `registros_ponto`.

### Checklist de Conclusão
- [ ] Tela `/ponto` restaura sessão ativa automaticamente após reload/reabertura (`RNF05`).
- [ ] Cronômetro em tempo real calculado pela diferença contra `horario_entrada` UTC do servidor (imune a throttling de aba em background e deriva do relógio local).
- [ ] Campo de observações pré-carregado e editável antes de acionar **Pause** (`RF07`).
- [ ] RPC `pausar_ponto` grava `horario_saida` em UTC no servidor e não altera `atualizado_em`/`atualizado_por` (`RNF03`, `RN04`).
- [ ] Seletor de projeto bloqueado durante sessão ativa com instrução clara de `RN03`; desbloqueado após `Pause`.
- [ ] Experiência mobile responsiva com botão **Pause** de fácil alcance (`RNF04`).

---

## 9. Notas Técnicas e de UX

- **Sem poluir auditoria administrativa:** Certificar-se na RPC `pausar_ponto` de que o encerramento normal do próprio ponto pelo usuário **não** grava `atualizado_em` / `atualizado_por`, pois na Seção 5 do PDF esses campos representam explicitamente *"alteração administrativa no registro"*.
- Exibir na parte inferior da tela `/ponto` um resumo compacto das **sessões de hoje** (últimas batidas do dia) reforça a confiança visual de que o ponto foi registrado e encerrado corretamente.
