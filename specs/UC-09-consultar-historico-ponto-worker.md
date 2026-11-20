---
id: UC-09
title: "[UC-09] Consulta de Histórico Próprio e Cálculo de Horas (Worker)"
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
    - relatorios
    - worker
    - ponto
  estimate: 3
  blocked_by:
    - UC-08
requirements:
  rf:
    - RF08
  rn: []
  rnf:
    - RNF02
    - RNF03
    - RNF04
actors:
  - Worker
  - Admin
---

# [UC-09] Consulta de Histórico Próprio e Cálculo de Horas (Worker)

## 1. Resumo e História de Usuário

> **Como** usuário `worker` (ou `admin` consultando suas próprias batidas),  
> **quero** consultar exclusivamente o meu histórico de pontos filtrando por projeto e período, com cálculo automático da duração de cada sessão e do total de horas acumuladas,  
> **para** acompanhar minhas entregas e conferir minhas horas trabalhadas por projeto.

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Restrição |
|---|---|---|
| `Worker` | Permitido (apenas próprios registros) | Política RLS restringe `SELECT` em `registros_ponto` a `usuario_id = auth.uid() AND excluido_em IS NULL`. Não possui botões nem permissão para editar/excluir registros. |
| `Admin` | Permitido | Pode consultar seu próprio histórico aqui (ou filtrar por si mesmo no painel global `UC-10`). |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF08` — Consulta, Cálculo e Gestão de Pontos:** O `worker` visualiza apenas o seu próprio histórico; o sistema deve calcular automaticamente a duração de cada sessão e o total de horas acumuladas no filtro selecionado (com atalho para exportação em CSV coberta em `UC-12`).
- **`RNF02` — Controle de Autorização e Segurança:** Isolamento estrito de registros por usuário garantido via RLS no banco de dados (não apenas por filtro de query no front-end).
- **`RNF03` — Sincronismo de Horário no Servidor:** Datas/horas persistidas em UTC convertidas corretamente para o fuso horário local do usuário, tanto na exibição quanto nos limites de filtro por período.
- **`RNF04` — Responsividade:** Filtros, totalizadores e listagem de sessões adaptados a desktop (tabela) e dispositivos móveis (cards).

---

## 4. Pré-condições

1. O usuário está autenticado e ativo (`UC-01`).
2. As políticas RLS de `public.registros_ponto` e `public.projetos` estão implantadas (`TECH-02`).

---

## 5. Fluxo Principal

1. O usuário acessa a página **Meu Histórico** (`/historico`).
2. Por padrão, o sistema carrega o filtro inicial do **mês atual** (ou **últimos 30 dias** — padrão claro e visível nos campos de data) para **todos os projetos** do usuário, ordenando do registro mais recente para o mais antigo (`horario_entrada DESC`).
3. O sistema consulta `public.registros_ponto` com join em `public.projetos` (trazendo apenas registros do próprio `auth.uid()` com `excluido_em IS NULL` `[Extensão ao PDF]`).
4. O usuário pode combinar os filtros:
   - **Projeto:** `Todos` ou um projeto específico (incluindo projetos vinculados atuais e projetos históricos onde já registrou ponto);
   - **Período:** **Data inicial** e **Data final** (com atalhos rápidos: *Hoje*, *Esta semana*, *Este mês*, *Mês anterior*).
5. Para cada sessão retornada, o sistema exibe:
   - **Data** e **Projeto** (com indicação discreta caso o projeto esteja `Inativo`);
   - **Entrada** (`DD/MM/AAAA HH:MM:SS` no fuso local);
   - **Saída** (`DD/MM/AAAA HH:MM:SS` no fuso local ou badge *"Em andamento"* quando `horario_saida IS NULL`);
   - **Duração da sessão** calculada automaticamente (`HH:MM` ou `HH:MM:SS` para sessões encerradas);
   - **Observações** (com expansão se o texto for longo);
   - Indicador sutil *"Ajustado pelo administrador"* quando `atualizado_em IS NOT NULL` (somente leitura).
6. No topo da listagem, o sistema exibe o card de **Resumo do Período Filtrado**:
   - **Total de horas acumuladas** (soma exata em segundos das sessões encerradas no filtro, formatada em `HH:MM` e opcionalmente horas decimais, ex.: `32h 45m (32,75h)`);
   - **Quantidade de sessões** no período;
   - Indicação explícita caso exista 1 sessão **em andamento** no filtro (esclarecendo se o tempo aberto ainda não foi contabilizado no total consolidado ou exibindo separadamente).
7. A página disponibiliza o botão **Exportar CSV** (`UC-12`) utilizando exatamente o filtro ativo.

---

## 6. Fluxos Alternativos e de Exceção

- **FA01 — Sessão atravessando virada de dia / limite de período:**
  - Critério determinístico de filtro por período: filtrar por `horario_entrada >= inicio_dia_local_em_UTC AND horario_entrada <= fim_dia_local_em_UTC`. Documentar consistentemente para bater exatamente com `UC-10` e `UC-12`.
- **FA02 — Nenhum registro encontrado para o filtro selecionado:**
  - Exibe estado vazio amigável (*"Nenhum registro de ponto encontrado para este período."*) com total de horas `00:00` e botão para limpar filtros.
- **FE01 — Intervalo de datas inválido (`data_inicial > data_final`):**
  - A UI bloqueia a consulta e exibe mensagem *"A data inicial não pode ser posterior à data final."*.
- **FE02 — Tentativa de `worker` consultar registros de outro `usuario_id` manipulando a requisição API:**
  - A política RLS (`usuario_id = auth.uid()`) retorna conjunto vazio, impedindo vazamento de dados de terceiros (`RNF02`).
- **FE03 — `Worker` tenta editar ou excluir um registro próprio:**
  - Não existem ações de edição/exclusão na interface; tentativas diretas via API são bloqueadas por RLS (`TECH-02`).

---

## 7. Pós-condições e Impacto em Dados

- **Leitura:** `public.registros_ponto` (`excluido_em IS NULL`) e `public.projetos` (`id`, `nome`, `ativo`).
- **Escrita:** Nenhuma (operação estritamente de leitura).
- **Precisão dos cálculos:** Soma realizada a partir das diferenças reais entre timestamps UTC (`horario_saida - horario_entrada` em segundos) antes de arredondar para exibição, evitando erro cumulativo de arredondamento por minuto.

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Cálculo automático de duração por sessão e total acumulado:**
  - **Dado** um `worker` com 2 sessões encerradas no período filtrado: `01:30:00` no `"Projeto A"` e `02:15:30` no `"Projeto B"`
  - **Quando** acessa `/historico` sem filtro de projeto
  - **Então** visualiza ambas as durações individuais e o total acumulado exato de `03h 45m` (ou `03:45:30`).
- **Cenário 2 — Filtro por projeto recalcula o total:**
  - **Dado** o mesmo cenário anterior
  - **Quando** seleciona o filtro `"Projeto A"`
  - **Então** apenas o registro do `"Projeto A"` é exibido e o total acumulado atualiza automaticamente para `01h 30m`.
- **Cenário 3 — Isolamento de dados do `worker` (`RNF02`):**
  - **Dado** registros de ponto de múltiplos usuários na tabela `registros_ponto`
  - **Quando** o `worker` acessa `/historico` ou consulta `registros_ponto` diretamente via cliente Supabase
  - **Então** apenas seus próprios registros não excluídos são retornados.
- **Cenário 4 — Registros excluídos administrativamente não entram no cálculo (`[Extensão ao PDF]`):**
  - **Dado** um registro do `worker` que foi excluído por um `admin` (`excluido_em IS NOT NULL`)
  - **Quando** o `worker` consulta o período correspondente
  - **Então** o registro excluído não é listado nem somado ao total de horas.

### Checklist de Conclusão
- [ ] Tela `/historico` acessível para `worker` e `admin`, listando apenas registros do usuário logado com `excluido_em IS NULL`.
- [ ] Filtros por projeto e período (data inicial/final + atalhos rápidos) com validação de intervalo.
- [ ] Conversão correta de limites de data local → UTC na query e de UTC → fuso local na exibição (`RNF03`).
- [ ] Cálculo automático da duração individual e do total acumulado sem erro cumulativo de arredondamento, coberto por testes unitários.
- [ ] Tratamento claro de sessões em andamento (`horario_saida IS NULL`) sem quebrar o cálculo.
- [ ] Layout responsivo (tabela desktop / cards mobile) (`RNF04`).

---

## 9. Notas Técnicas e de UX

- **Paginação vs. Totalização:** Se houver paginação na listagem (ex.: 50 itens por página), garantir que o **total acumulado de horas** reflita **todos** os registros do filtro selecionado (via RPC/agregação no banco ou soma completa do conjunto filtrado), nunca apenas a página atual!
- Manter a função pura de cálculo de duração (`calcularDuracaoSegundos`, `formatarDuracao`) compartilhada entre `UC-09`, `UC-10` e `UC-12` para garantir 100% de consistência numérica entre tela e CSV.
