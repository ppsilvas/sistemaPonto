---
id: UC-10
title: "[UC-10] Consulta Global de Registros de Ponto e Totalização de Horas (Admin)"
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
    - admin
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
  - Admin
---

# [UC-10] Consulta Global de Registros de Ponto e Totalização de Horas (Admin)

## 1. Resumo e História de Usuário

> **Como** usuário `admin`,  
> **quero** visualizar os registros de ponto de todos os usuários filtrando por usuário, projeto e período, com cálculo automático da duração de cada sessão, total acumulado e indicadores de auditoria,  
> **para** acompanhar o esforço da equipe, identificar registros inconsistentes e preparar fechamentos de horas.

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Mecanismo de Proteção |
|---|---|---|
| `Admin` | Permitido (todos os usuários e projetos) | Rota `/relatorios` protegida por `AdminRoute` + políticas RLS `is_admin()`. |
| `Worker` | Não permitido | Menu oculto, `AdminRoute` redireciona e RLS bloqueia acesso a registros de terceiros. |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF08` — Consulta, Cálculo e Gestão de Pontos:** O `admin` visualiza os registros de ponto de todos os usuários com filtros por usuário, projeto e período, duração automática por sessão, total acumulado de horas no filtro e acesso às ações de ajuste/exclusão (`UC-11`) e exportação CSV (`UC-12`).
- **`RNF02` — Controle de Autorização e Segurança:** Acesso irrestrito de leitura aos pontos validado exclusivamente para `admin` ativo via RLS.
- **`RNF03` — Sincronismo de Horário no Servidor:** Datas e carimbos (`horario_entrada`, `horario_saida`, `atualizado_em`) persistidos em UTC e exibidos no fuso local.
- **`RNF04` — Responsividade:** Painel de filtros, totalizadores e listagem adaptados a desktop e dispositivos móveis.

---

## 4. Pré-condições

1. O usuário está autenticado com perfil `admin` e `ativo = true` (`UC-01`).
2. As tabelas `usuarios`, `projetos` e `registros_ponto` com políticas RLS de `admin` estão implantadas (`TECH-02`).

---

## 5. Fluxo Principal

1. O `admin` acessa a página **Relatório de Pontos** (`/relatorios`).
2. O sistema carrega a barra de filtros contendo:
   - **Usuário:** `Todos` ou seleção de um usuário específico (incluindo inativos para consulta histórica, identificados com badge `Inativo`);
   - **Projeto:** `Todos` ou seleção de um projeto específico (incluindo inativos para histórico);
   - **Período:** **Data inicial** e **Data final** (padrão: mês atual + atalhos *Hoje*, *Esta semana*, *Este mês*, *Mês anterior*);
   - **Status (opcional de UX):** `Todos`, `Em andamento`, `Encerrados`, `Editados por admin` (e toggle opcional *"Mostrar excluídos [Auditoria]"* `[Extensão ao PDF]`, desmarcado por padrão para não contaminar os totais de horas).
3. O sistema consulta `public.registros_ponto` com joins para:
   - `usuarios` (autor da batida);
   - `projetos` (projeto alocado);
   - `usuarios` via `atualizado_por` (nome do admin que editou, se houver).
4. O painel superior exibe os **Indicadores do Filtro Atual**:
   - **Total de horas acumuladas** (soma exata das sessões encerradas não excluídas dentro do filtro);
   - **Total de registros**;
   - **Sessões em andamento** no filtro (destaque visual para identificar facilmente pontos esquecidos abertos);
   - Resumo agrupado colapsável **Horas por Projeto** e **Horas por Usuário** para o filtro selecionado.
5. A tabela principal (cards no mobile) exibe para cada registro (ordenado por `horario_entrada DESC`):
   - **Usuário**;
   - **Projeto**;
   - **Entrada** (fuso local);
   - **Saída** (fuso local ou badge *"Em andamento"*);
   - **Duração** calculada automaticamente;
   - **Observações**;
   - **Auditoria:** quando `atualizado_em IS NOT NULL`, exibe badge/tooltip *"Editado por [Nome Admin] em [Data/Hora local]"*;
   - **Ações:** botões **Editar** e **Excluir** (acionam os fluxos de `UC-11`).
6. O topo da página disponibiliza o botão **Exportar CSV** (`UC-12`) respeitando exatamente os filtros aplicados.

---

## 6. Fluxos Alternativos e de Exceção

- **FA01 — Detecção visual de registros potencialmente inconsistentes:**
  - Registros abertos há muitas horas (ex.: > 12h sem `horario_saida`) recebem destaque visual de alerta (badge amarela/laranja) para auxiliar o `admin` a revisar e corrigir em `UC-11`.
- **FA02 — Visualização de registros excluídos para fins de auditoria (`[Extensão ao PDF]`):**
  - Se o `admin` ativar explicitamente o filtro *"Incluir excluídos (Auditoria)"*, os registros com `excluido_em IS NOT NULL` aparecem visualmente diferenciados (tachados/badge *"Excluído por [Admin] em [Data/Hora]"*), porém **nunca** entram na soma de horas acumuladas nem na exportação CSV padrão.
- **FE01 — Intervalo de datas inválido (`data_inicial > data_final`):**
  - Bloqueia a consulta e exibe aviso de validação inline.
- **FE02 — Nenhum registro encontrado com os filtros aplicados:**
  - Exibe estado vazio com total `00:00` e botão **Limpar filtros**.
- **FE03 — Tentativa de acesso por `worker`:**
  - Bloqueada em UI (`AdminRoute`) e nas políticas RLS do Supabase.

---

## 7. Pós-condições e Impacto em Dados

- **Leitura:** `public.registros_ponto`, `public.usuarios` (autor e `atualizado_por`/`excluido_por`), `public.projetos`.
- **Escrita:** Nenhuma neste caso de uso (alterações são tratadas exclusivamente em `UC-11`).

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Filtro combinado por usuário, projeto e período:**
  - **Dado** registros de ponto de 3 usuários distribuídos em 2 projetos ao longo de 2 meses
  - **Quando** o `admin` filtra por `"Maria"`, `"Projeto Beta"` e período `"01/11/2026"` a `"15/11/2026"`
  - **Então** apenas os registros que satisfazem os 3 critérios são exibidos e o total acumulado reflete exatamente a soma dessas sessões encerradas.
- **Cenário 2 — Exibição de metadados de auditoria:**
  - **Dado** um registro previamente ajustado em `UC-11` com `atualizado_por` e `atualizado_em` preenchidos
  - **Quando** o `admin` visualiza o registro em `/relatorios`
  - **Então** visualiza o nome do administrador responsável pela alteração e a data/hora da edição formatada no fuso local.
- **Cenário 3 — Visibilidade de sessões em andamento:**
  - **Dado** um `worker` com ponto aberto (`horario_saida IS NULL`)
  - **Quando** o `admin` consulta `/relatorios`
  - **Então** o registro aparece destacado como *"Em andamento"* sem gerar erro de cálculo (`NaN`) no total de horas.

### Checklist de Conclusão
- [ ] Tela `/relatorios` protegida por `AdminRoute`, exibindo registros de todos os usuários.
- [ ] Filtros combináveis por usuário, projeto e período funcionando com atualização automática do total acumulado.
- [ ] Duração individual e total acumulado de horas calculados com precisão (reutilizando a mesma lógica de `UC-09`).
- [ ] Totalização consistente mesmo quando houver paginação (total reflete o filtro inteiro, não apenas a página atual).
- [ ] Exibição clara de status *"Em andamento"* e metadados de auditoria (`atualizado_por`, `atualizado_em`).
- [ ] Ações **Editar** / **Excluir** integradas a `UC-11` e botão **Exportar CSV** integrado a `UC-12`.
- [ ] Layout responsivo para desktop e mobile (`RNF04`).

---

## 9. Notas Técnicas e de UX

- Para filtros com grande volume de dados, considerar uma RPC ou view/query agregada no PostgreSQL para retornar o total exato em segundos + resumo por usuário/projeto junto da lista paginada, mantendo o carregamento rápido.
- Usar o mesmo critério de fuso horário de `UC-09` (início/fim do dia local convertido para UTC) para evitar discrepâncias entre a tela do `worker` e a tela do `admin`.
