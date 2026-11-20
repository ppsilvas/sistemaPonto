---
id: UC-06
title: "[UC-06] Vincular e Desvincular Usuários a Projetos (Admin)"
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
    - projetos
    - usuarios
  estimate: 3
  blocked_by:
    - UC-03
    - UC-05
requirements:
  rf:
    - RF04
  rn:
    - RN02
  rnf:
    - RNF02
    - RNF04
actors:
  - Admin
---

# [UC-06] Vincular e Desvincular Usuários a Projetos (Admin)

## 1. Resumo e História de Usuário

> **Como** usuário `admin`,  
> **quero** vincular e desvincular usuários (`worker` e `admin`) a cada projeto,  
> **para** controlar exatamente em quais projetos cada pessoa pode registrar horas trabalhadas (`RN02`).

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Mecanismo de Proteção |
|---|---|---|
| `Admin` | Permitido | UI administrativa + políticas RLS `is_admin()` para `INSERT`/`DELETE` em `public.usuario_projetos`. |
| `Worker` | Não permitido | Apenas consulta os próprios vínculos (`SELECT WHERE usuario_id = auth.uid()`); escrita bloqueada por RLS. |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF04` — Gestão de Projetos (Admin):** Gerenciar a lista de usuários vinculados a cada projeto.
- **Matriz de Permissões (Seção 2):** Vincular e desvincular usuários a projetos — exclusivo do `admin`; `admin` também pode registrar ponto caso esteja vinculado a projetos.
- **`RN02` — Restrição de Vínculo com Projeto:** Um usuário sem nenhum projeto vinculado não poderá registrar ponto até que um `admin` realize o vínculo.
- **`RNF02` — Controle de Autorização e Segurança:** Alterações em `usuario_projetos` validadas via RLS somente para `admin`.
- **`RNF04` — Responsividade:** Interface de gestão de vínculos (lista de seleção/toggles) fácil de usar em desktop e mobile.

---

## 4. Pré-condições

1. O usuário está autenticado com perfil `admin` e `ativo = true` (`UC-01`).
2. Existe ao menos um projeto cadastrado (`UC-05`) e usuários cadastrados (`UC-03`).

---

## 5. Fluxo Principal

### 5.1 Gerenciamento a partir da Tela de Projetos
1. Na tela `/projetos`, o `admin` aciona **Gerenciar Equipe / Usuários** em um projeto específico.
2. O sistema abre um modal ou painel lateral listando:
   - Usuários atualmente **vinculados** ao projeto (nome, e-mail, perfil `Admin`/`Worker`, status);
   - Lista pesquisável de usuários **ativos disponíveis** para vínculo (incluindo `worker` e `admin`).
3. Para **vincular** um ou mais usuários:
   - O `admin` seleciona o(s) usuário(s) e confirma **Vincular**.
   - O sistema insere os pares `(usuario_id, projeto_id)` em `public.usuario_projetos`.
4. Para **desvincular** um usuário:
   - O `admin` aciona **Desvincular** ao lado do usuário.
   - O sistema verifica se aquele usuário possui **registro de ponto em aberto** (`horario_saida IS NULL AND excluido_em IS NULL`) especificamente naquele projeto.
   - Não havendo sessão aberta, remove o par `(usuario_id, projeto_id)` de `public.usuario_projetos`.
5. O sistema atualiza imediatamente a lista de vínculos e a contagem de membros do projeto, exibindo feedback visual.

### 5.2 Visão Complementar a partir da Tela de Usuários (Opcional / Recomendado)
6. Na edição de um usuário (`UC-04`), o `admin` também pode visualizar e gerenciar os projetos ativos vinculados àquele usuário, utilizando a mesma tabela `public.usuario_projetos`.

---

## 6. Fluxos Alternativos e de Exceção

- **FA01 — Vincular um `admin` a um projeto:**
  - Totalmente permitido, conforme Matriz de Permissões (*"Registrar ponto (Start/Pause): Permitido para Admin se vinculado a projetos"*).
- **FE01 — Tentativa de desvincular usuário com ponto em aberto naquele projeto:**
  - O sistema bloqueia a desvinculação e exibe aviso claro: *"Não é possível desvincular este usuário enquanto houver um ponto em aberto neste projeto. Peça ao usuário para pausar ou encerre o ponto administrativamente antes."*
  - *Justificativa:* evita estado inconsistente em que o usuário fica com cronômetro aberto em um projeto ao qual não tem mais acesso.
- **FE02 — Tentativa de vínculo duplicado:**
  - A UI já filtra usuários vinculados da lista de disponíveis, e a chave primária composta `PRIMARY KEY (usuario_id, projeto_id)` garante idempotência/unicidade no banco.
- **FE03 — Tentativa de vincular usuário a projeto inativo (`projetos.ativo = false`) ou vincular usuário inativo (`usuarios.ativo = false`) `[Extensão ao PDF]`:**
  - A UI não lista usuários inativos como elegíveis para novos vínculos e bloqueia novos vínculos em projetos inativos (exibindo aviso de que o projeto precisa ser reativado antes).
- **FE04 — Desvinculação do último projeto de um usuário:**
  - Permitida (se não houver ponto aberto). A partir desse momento, o usuário passa a cair na regra `RN02` ao acessar `/ponto`, ficando impedido de iniciar novas sessões até receber novo vínculo. O histórico de pontos já registrados nesse projeto permanece intacto.

---

## 7. Pós-condições e Impacto em Dados

- **Escrita:** `public.usuario_projetos` (`INSERT` / `DELETE` dos pares `usuario_id`, `projeto_id`).
- **Efeito imediato:**
  - Novo vínculo libera o projeto no seletor de ponto do usuário (`UC-07`) e habilita a consulta do nome/descrição do projeto via política RLS de `public.projetos`.
  - Desvinculação remove o projeto do seletor de novos pontos, sem excluir nem alterar `registros_ponto` passados (a política RLS de `projetos` mantém leitura para projetos presentes nos próprios `registros_ponto` históricos do `worker`).

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Admin vincula `worker` sem projetos a um projeto ativo (`RN02`):**
  - **Dado** um `worker` sem nenhum vínculo em `usuario_projetos`
  - **Quando** o `admin` o vincula ao projeto `"Projeto X"`
  - **Então** o registro `(usuario_id, projeto_id)` é salvo em `usuario_projetos` e o `worker` passa imediatamente a visualizar `"Projeto X"` na tela de Registro de Ponto.
- **Cenário 2 — Desvinculação preserva histórico de pontos:**
  - **Dado** um `worker` vinculado ao `"Projeto X"` com pontos já encerrados nesse projeto (sem ponto aberto)
  - **Quando** o `admin` desvincula o `worker` do `"Projeto X"`
  - **Então** o vínculo é removido, `"Projeto X"` não aparece mais para iniciar novos pontos, e o histórico passado do `worker` nesse projeto continua consultável em `UC-09`.
- **Cenário 3 — Bloqueio de desvinculação durante sessão ativa:**
  - **Dado** um usuário com registro aberto (`horario_saida IS NULL`) no `"Projeto X"`
  - **Quando** o `admin` tenta desvincular esse usuário do `"Projeto X"`
  - **Então** o sistema impede a ação e exibe mensagem orientando encerrar a sessão ativa primeiro.

### Checklist de Conclusão
- [ ] Interface de gestão de vínculos acessível a partir da tela `/projetos` (e sincronizada com a visualização em `/usuarios`).
- [ ] Suporte para vincular tanto `worker` quanto `admin` a múltiplos projetos (relação N:N).
- [ ] Verificação de ponto em aberto antes de permitir desvinculação.
- [ ] Chave primária composta `(usuario_id, projeto_id)` impede vínculos duplicados.
- [ ] Histórico de `registros_ponto` preservado após desvinculação (incluindo exibição correta do nome do projeto no histórico do `worker`).
- [ ] Políticas RLS impedem qualquer `INSERT`/`DELETE` em `usuario_projetos` por usuários `worker`.

---

## 9. Notas Técnicas e de UX

- Ao consultar projetos no front-end para o seletor de ponto (`UC-07`), filtrar por `usuario_projetos` + `projetos.ativo = true`; já no histórico (`UC-09`), usar o join de `registros_ponto.projeto_id -> projetos.id` para continuar exibindo o nome de projetos dos quais o usuário foi posteriormente desvinculado ou que foram inativados.
