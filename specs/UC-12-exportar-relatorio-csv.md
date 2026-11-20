---
id: UC-12
title: "[UC-12] Exportação de Registros de Ponto em CSV"
type: use-case
linear:
  team: Ppsilvas
  team_key: PPS
  project: Projeto Ponto Lelê
  project_id: P-PPS-1
  milestone: "M4 - Consultas, Auditoria & Exportação"
  priority: 3
  labels:
    - Feature
  suggested_labels:
    - relatorios
    - csv
    - admin
    - worker
  estimate: 2
  blocked_by:
    - UC-09
    - UC-10
requirements:
  rf:
    - RF08
  rn: []
  rnf:
    - RNF02
    - RNF04
actors:
  - Admin
  - Worker
---

# [UC-12] Exportação de Registros de Ponto em CSV

## 1. Resumo e História de Usuário

> **Como** usuário autenticado (`admin` ou `worker`),  
> **quero** exportar os registros de ponto do filtro selecionado em arquivo CSV contendo durações individuais e total de horas acumuladas,  
> **para** compartilhar relatórios com clientes, faturar horas de projetos ou realizar análises em planilhas (Excel / Google Sheets).

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Escopo dos Dados Exportados |
|---|---|---|
| `Admin` | Permitido | Exporta todos os registros (de todos os usuários ou filtrados por usuário/projeto/período), incluindo colunas de auditoria. |
| `Worker` | Permitido | Exporta **exclusivamente** os seus próprios registros filtrados por projeto e período (garantido por RLS). |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF08` — Consulta, Cálculo e Gestão de Pontos:** O sistema deve calcular automaticamente a duração de cada sessão e o total de horas acumuladas no filtro selecionado, permitindo exportar os dados em CSV.
- **`RNF02` — Controle de Autorização e Segurança:** Os dados obtidos para geração do CSV respeitam rigorosamente o escopo de permissão (RLS) do perfil logado; proteção contra *CSV Formula Injection* em campos de texto livre (como `observacoes`).
- **`RNF04` — Responsividade:** Ação de exportação acessível e funcional tanto em desktop quanto em navegadores móveis.

---

## 4. Pré-condições

1. O usuário está autenticado e ativo (`UC-01`).
2. O usuário está na tela **Meu Histórico** (`/historico`, `UC-09`) ou **Relatório de Pontos** (`/relatorios`, `UC-10`) com filtros válidos definidos.

---

## 5. Fluxo Principal

1. O usuário configura os filtros desejados (usuário no caso de `admin`, projeto e período) na tela de consulta (`UC-09` ou `UC-10`).
2. O usuário aciona o botão **Exportar CSV**.
3. O sistema verifica se há ao menos 1 registro ativo (`excluido_em IS NULL`) correspondente aos filtros selecionados.
4. Caso a listagem em tela esteja paginada, o sistema busca **todos** os registros completos do filtro atual no Supabase (respeitando RLS) para que o arquivo CSV contenha o período filtrado inteiro, e não apenas a página visível.
5. O gerador de CSV formata o conteúdo seguindo especificação padronizada:
   - **Codificação:** UTF-8 com BOM (`\uFEFF`) para abertura sem quebra de acentos no Microsoft Excel;
   - **Separador:** ponto e vírgula (`;`) como padrão compatível com Excel em PT-BR (escapando valores entre aspas duplas quando contiverem `;`, `"`, ou quebras de linha);
   - **Sanitização de segurança:** prefixar com apóstrofo (`'`) células de texto livre (`nome`, `projeto`, `observacoes`) que iniciem com `=`, `+`, `-`, `@`, `\t` ou `\r` para prevenir *CSV Injection*;
   - **Colunas:**
     - `Usuario`
     - `Email` *(opcional na visão admin)*
     - `Projeto`
     - `Data_Entrada` (`DD/MM/AAAA` no fuso local)
     - `Hora_Entrada` (`HH:MM:SS` no fuso local)
     - `Data_Saida` (`DD/MM/AAAA` ou vazio se em andamento)
     - `Hora_Saida` (`HH:MM:SS` ou `"Em andamento"`)
     - `Duracao_HHMM` (ex.: `02:30` ou vazio se em andamento)
     - `Duracao_Horas_Decimais` (ex.: `2,50` — facilita soma direta em planilhas e faturamento)
     - `Observacoes`
     - *(Somente na visão `admin`)* `Editado_Por` e `Editado_Em`
   - **Linha final de totalização:** linha de resumo contendo `"TOTAL"` e a soma exata de `Duracao_HHMM` e `Duracao_Horas_Decimais` das sessões encerradas no arquivo (idêntica ao total exibido na tela).
6. O navegador dispara automaticamente o download do arquivo com nome padronizado:
   - Ex.: `pontos_2026-11-01_a_2026-11-30.csv` (ou `pontos_<slug-usuario>_2026-11-01_a_2026-11-30.csv`).
7. O sistema libera o estado de carregamento e exibe feedback discreto de sucesso.

---

## 6. Fluxos Alternativos e de Exceção

- **FA01 — Registros com observações contendo quebras de linha, vírgulas, ponto e vírgula ou aspas:**
  - Todos os valores são escapados conforme RFC 4180 (aspas internas duplicadas `""` e campo envolvido por aspas), mantendo o alinhamento exato das colunas no Excel e Google Sheets.
- **FA02 — Filtro contém 1 sessão em andamento (`horario_saida IS NULL`):**
  - A linha é incluída no CSV com `Hora_Saida = "Em andamento"` e colunas de duração vazias, sem corromper a linha final de totalização.
- **FA03 — Exclusão de registros deletados (`[Extensão ao PDF]`):**
  - Mesmo se o `admin` tiver ativado a visualização de auditoria de excluídos na tela (`UC-10`), a exportação CSV padrão exporta exclusivamente registros válidos (`excluido_em IS NULL`), evitando cobrança indevida de horas excluídas.
- **FE01 — Nenhum registro no filtro selecionado:**
  - O botão **Exportar CSV** permanece desabilitado (ou exibe aviso *"Não há registros para exportar com os filtros atuais."*) evitando download de arquivo vazio sem sentido.
- **FE02 — Erro de rede ao buscar conjunto completo filtrado:**
  - Exibe alerta amigável sem travar a página e permite tentar novamente.

---

## 7. Pós-condições e Impacto em Dados

- **Leitura:** Consulta completa de `public.registros_ponto` (com `excluido_em IS NULL`), `public.projetos` e `public.usuarios` respeitando RLS.
- **Escrita:** Nenhuma alteração no banco de dados.
- **Saída:** Arquivo `.csv` gerado no cliente e baixado localmente pelo usuário.

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Exportação CSV pelo `worker` contém apenas seus dados filtrados:**
  - **Dado** um `worker` em `/historico` com filtro de projeto `"Projeto Alpha"` e período de novembro
  - **Quando** clica em **Exportar CSV**
  - **Então** baixa um arquivo `.csv` UTF-8 (com BOM) contendo apenas seus próprios registros daquele projeto/período, com duração por sessão e linha de `TOTAL` igual ao total exibido na tela.
- **Cenário 2 — Exportação CSV pelo `admin` respeita filtros e inclui auditoria:**
  - **Dado** um `admin` em `/relatorios` filtrando todos os usuários em um período com registros editados
  - **Quando** clica em **Exportar CSV**
  - **Então** o arquivo contém registros de todos os usuários do filtro, colunas `Editado_Por` e `Editado_Em`, e exclui registros marcados com `excluido_em IS NOT NULL`.
- **Cenário 3 — Proteção de formatação e CSV Injection:**
  - **Dado** um registro cuja observação contém `=CMD|'/C calc'!A0; linha 1\n"linha 2"`
  - **Quando** exportado para CSV
  - **Então** o campo é sanitizado (prefixado com `'`) e escapado corretamente em RFC 4180 sem quebrar colunas nem executar fórmulas ao abrir em planilhas.

### Checklist de Conclusão
- [ ] Botão **Exportar CSV** disponível em `/historico` (`UC-09`) e `/relatorios` (`UC-10`), desabilitado quando não há registros.
- [ ] Exportação busca todos os registros do filtro ativo (não limitada à paginação visual) respeitando RLS.
- [ ] Arquivo gerado em UTF-8 com BOM (`\uFEFF`), escape RFC 4180 e proteção contra CSV Injection.
- [ ] Inclui duração formatada (`HH:MM`), duração decimal e linha final de totalização idêntica à exibida na tela.
- [ ] Módulo gerador de CSV (`src/lib/csv.ts`) coberto por testes unitários (acentos, aspas, quebras de linha, fórmulas maliciosas, sessão aberta e totalização).
- [ ] Download funcional em desktop (Chrome/Edge/Firefox/Safari) e navegadores mobile (`RNF04`).

---

## 9. Notas Técnicas e de UX

- Reutilizar exatamente as mesmas funções puras de cálculo de duração e soma total de `UC-09`/`UC-10` para garantir divergência zero entre o total exibido na UI e o total na linha final do CSV.
- Liberar a URL temporária criada via `URL.createObjectURL(blob)` com `URL.revokeObjectURL` logo após disparar o download para evitar vazamento de memória.
