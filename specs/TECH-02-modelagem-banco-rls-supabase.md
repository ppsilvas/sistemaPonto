---
id: TECH-02
title: "[TECH-02] Modelagem Relacional, Políticas RLS, Funções Server-Side e Seed no Supabase"
type: technical-spec
linear:
  team: Ppsilvas
  team_key: PPS
  project: Projeto Ponto Lelê
  project_id: P-PPS-1
  milestone: "M1 - Fundação & Infraestrutura"
  priority: 1
  labels:
    - Feature
  suggested_labels:
    - infra
    - backend
    - database
    - supabase
    - security
  estimate: 5
  blocked_by: []
requirements:
  rf: []
  rn:
    - RN01
    - RN04
    - RN05
  rnf:
    - RNF02
    - RNF03
actors:
  - Admin
  - Worker
---

# [TECH-02] Modelagem Relacional, Políticas RLS, Funções Server-Side e Seed no Supabase

## 1. Resumo e Objetivo Técnico

Implementar o schema relacional completo no **Supabase (PostgreSQL)** contendo as 5 tabelas especificadas na Seção 5 do documento de requisitos, com extensões mínimas claramente demarcadas para suportar inativação e auditoria de exclusão, além de **políticas de Row Level Security (RLS)**, **constraints de integridade**, **triggers/RPCs server-side** com carimbos de data/hora em UTC e **seed inicial** dos perfis e primeiro administrador.

---

## 2. Requisitos e Regras Garantidos em Nível de Banco

| Código | Descrição | Mecanismo no PostgreSQL / Supabase |
|---|---|---|
| `RN01` | Unicidade de sessão ativa por usuário | Índice único parcial `UNIQUE (usuario_id) WHERE horario_saida IS NULL AND excluido_em IS NULL`. |
| `RN04` | Integridade cronológica e auditoria em edições administrativas | `CHECK (horario_saida IS NULL OR horario_saida >= horario_entrada)` + trigger/RPC preenchendo `atualizado_em = now()` e `atualizado_por = auth.uid()`. |
| `RN05` | Proteção do último administrador ativo | Trigger `BEFORE UPDATE OR DELETE ON public.usuarios` bloqueando de forma atômica exclusão, inativação ou rebaixamento do último `admin` ativo. |
| `RNF02` | Controle de autorização e segurança (RLS + hash criptográfico) | RLS obrigatório (`ENABLE ROW LEVEL SECURITY`) em todas as tabelas + delegação do hash de senha ao Supabase Auth (`auth.users`). |
| `RNF03` | Sincronismo de horário no servidor (UTC) | `DEFAULT now()` e preenchimento exclusivo server-side via RPCs (`iniciar_ponto`, `pausar_ponto`) e triggers para `horario_entrada`, `horario_saida`, `criado_em`, `atualizado_em` e `excluido_em`. |

---

## 3. Extensões Propostas ao Schema do PDF (`[Extensão ao PDF]`)

Para suprir lacunas identificadas entre os Requisitos Funcionais/Regras de Negócio e a tabela da Seção 5 do PDF, são aplicadas as seguintes extensões mínimas:

1. **`usuarios` — Delegação de `senha_hash` ao Supabase Auth (`RNF02`):**
   - `public.usuarios.id` referencia `auth.users(id)` (`ON DELETE RESTRICT`).
   - O armazenamento criptográfico da senha (`senha_hash` no PDF) fica a cargo nativo de `auth.users.encrypted_password` (Supabase Auth), habilitando JWT/sessão e `auth.uid()` nas políticas RLS sem duplicar hashes.
2. **`usuarios.ativo` (`BOOLEAN NOT NULL DEFAULT true`) e `usuarios.inativado_em` (`TIMESTAMPTZ NULL`) `[Extensão ao PDF]`:**
   - Viabiliza *"excluir/inativar usuários"* (`RF03`) e *"único usuário admin ativo"* (`RN05`) preservando o histórico de `registros_ponto` e referências de auditoria (`atualizado_por`, `excluido_por`).
3. **`projetos.ativo` (`BOOLEAN NOT NULL DEFAULT true`) e `projetos.inativado_em` (`TIMESTAMPTZ NULL`) `[Extensão ao PDF]`:**
   - Permite inativar projetos sem corromper nem apagar registros históricos de ponto vinculados.
4. **`registros_ponto.excluido_em` (`TIMESTAMPTZ NULL`) e `registros_ponto.excluido_por` (`UUID NULL REFERENCES public.usuarios(id)`) `[Extensão ao PDF]`:**
   - Viabiliza *"excluir registros de ponto (com log de auditoria)"* (Matriz de Permissões e `RF08`), evitando que um `DELETE` físico apague o próprio registro de auditoria.

---

## 4. Especificação Detalhada do Schema SQL

### 4.1 Tabelas e Constraints

```sql
-- 1. Perfis de acesso
CREATE TABLE public.perfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(50) NOT NULL UNIQUE CHECK (nome IN ('admin', 'worker'))
);

-- 2. Usuários do domínio (espelho de auth.users)
CREATE TABLE public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  nome VARCHAR(150) NOT NULL CHECK (length(trim(nome)) > 0),
  email VARCHAR(255) NOT NULL UNIQUE,
  perfil_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE RESTRICT,
  ativo BOOLEAN NOT NULL DEFAULT true,             -- [Extensão ao PDF]
  inativado_em TIMESTAMPTZ NULL,                   -- [Extensão ao PDF]
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Projetos
CREATE TABLE public.projetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(150) NOT NULL CHECK (length(trim(nome)) > 0),
  descricao TEXT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,             -- [Extensão ao PDF]
  inativado_em TIMESTAMPTZ NULL,                   -- [Extensão ao PDF]
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Vínculo N:N entre usuários e projetos
CREATE TABLE public.usuario_projetos (
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, projeto_id)
);

-- 5. Registros de ponto
CREATE TABLE public.registros_ponto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT,
  horario_entrada TIMESTAMPTZ NOT NULL DEFAULT now(),
  horario_saida TIMESTAMPTZ NULL,
  observacoes TEXT NULL,
  atualizado_em TIMESTAMPTZ NULL,
  atualizado_por UUID NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  excluido_em TIMESTAMPTZ NULL,                    -- [Extensão ao PDF]
  excluido_por UUID NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT, -- [Extensão ao PDF]
  CONSTRAINT chk_registros_ponto_cronologia
    CHECK (horario_saida IS NULL OR horario_saida >= horario_entrada)
);

-- RN01: no máximo 1 registro aberto (não excluído) por usuário
CREATE UNIQUE INDEX uq_registros_ponto_sessao_ativa
  ON public.registros_ponto (usuario_id)
  WHERE horario_saida IS NULL AND excluido_em IS NULL;

-- Índices para consultas e filtros (RF08)
CREATE INDEX idx_registros_ponto_usuario_entrada
  ON public.registros_ponto (usuario_id, horario_entrada DESC)
  WHERE excluido_em IS NULL;

CREATE INDEX idx_registros_ponto_projeto_entrada
  ON public.registros_ponto (projeto_id, horario_entrada DESC)
  WHERE excluido_em IS NULL;
```

### 4.2 Funções Auxiliares de Autorização (`SECURITY DEFINER`)
Criar funções auxiliares com `SET search_path = public` para evitar recursão em políticas RLS:
- `public.is_admin() RETURNS BOOLEAN`: verifica se `auth.uid()` corresponde a um registro em `public.usuarios` com `ativo = true` e `perfis.nome = 'admin'`.
- `public.is_active_user() RETURNS BOOLEAN`: verifica se `auth.uid()` corresponde a um usuário com `ativo = true`.

### 4.3 Políticas de Row Level Security (RLS)

| Tabela | `SELECT` | `INSERT` | `UPDATE` | `DELETE` |
|---|---|---|---|---|
| `perfis` | Qualquer usuário ativo autenticado | Bloqueado (somente migration/seed) | Bloqueado | Bloqueado |
| `usuarios` | `admin`: todos; `worker`: apenas `id = auth.uid()` | Somente `admin` (ou Edge Function com Service Role) | Somente `admin` | Bloqueado para clientes (preferir inativação; se permitido, somente `admin` sujeito a `RN05`) |
| `projetos` | `admin`: todos; `worker`: projetos vinculados em `usuario_projetos` ou referenciados nos seus próprios `registros_ponto` | Somente `admin` | Somente `admin` | Somente `admin` (bloqueado se houver `registros_ponto` via `ON DELETE RESTRICT`) |
| `usuario_projetos` | `admin`: todos; `worker`: apenas `usuario_id = auth.uid()` | Somente `admin` | Bloqueado | Somente `admin` |
| `registros_ponto` | `admin`: todos (não excluídos ou via visão de auditoria); `worker`: apenas `usuario_id = auth.uid() AND excluido_em IS NULL` | Via RPC `iniciar_ponto` (ou política exigindo `usuario_id = auth.uid()`, vínculo em `usuario_projetos`, projeto `ativo = true` e usuário `ativo = true`) | Somente `admin` diretamente; `worker` encerra o próprio ponto apenas via RPC `pausar_ponto` | Bloqueado (exclusão administrativa sempre via soft delete auditado `excluir_ponto_admin`) |

### 4.4 Triggers e RPCs Server-Side (`RN01`, `RN02`, `RN04`, `RN05`, `RNF03`)
1. **Trigger `trg_proteger_ultimo_admin` (`RN05`):**
   - Dispara `BEFORE UPDATE OR DELETE ON public.usuarios`.
   - Adquire lock de transação (`pg_advisory_xact_lock` ou `SELECT ... FOR UPDATE` nos admins ativos) para evitar condição de corrida.
   - Impede deletar, definir `ativo = false` ou alterar `perfil_id` de `admin` para `worker` se restar menos de 1 `admin` ativo após a operação, lançando erro explícito (`LAST_ADMIN_PROTECTED`).
2. **RPC `public.iniciar_ponto(p_projeto_id UUID, p_observacoes TEXT DEFAULT NULL)` (`RF05`, `RF06`, `RN01`, `RN02`, `RNF03`):**
   - Valida usuário autenticado e `ativo = true`.
   - Valida que o usuário está vinculado ao `p_projeto_id` em `usuario_projetos` e que o projeto tem `ativo = true`.
   - Insere em `registros_ponto` com `horario_entrada = now()` (UTC servidor), `horario_saida = NULL`.
   - Retorna o registro criado (ou erro padronizado se já existir sessão aberta — `ACTIVE_SESSION_EXISTS` — ou ausência de vínculo — `PROJECT_NOT_LINKED`).
3. **RPC `public.pausar_ponto(p_observacoes TEXT DEFAULT NULL)` (`RF07`, `RN01`, `RNF03`):**
   - Localiza o registro aberto (`usuario_id = auth.uid() AND horario_saida IS NULL AND excluido_em IS NULL`).
   - Grava `horario_saida = now()` (UTC servidor) e atualiza `observacoes` (se informada, preservando ou substituindo conforme contrato da UI em `UC-08`).
   - Retorna o registro atualizado (ou erro `NO_ACTIVE_SESSION` se não houver sessão aberta).
4. **RPC `public.editar_ponto_admin(p_registro_id UUID, p_projeto_id UUID, p_horario_entrada TIMESTAMPTZ, p_horario_saida TIMESTAMPTZ, p_observacoes TEXT)` (`RF08`, `RN04`, `RN01`, `RNF03`):**
   - Valida `public.is_admin()`.
   - Valida que o registro não está excluído e que `p_horario_saida IS NULL OR p_horario_saida >= p_horario_entrada`.
   - Atualiza o registro gravando obrigatoriamente `atualizado_em = now()` e `atualizado_por = auth.uid()`.
5. **RPC `public.excluir_ponto_admin(p_registro_id UUID)` (`RF08`, `RN04`, `RNF03`, `[Extensão ao PDF]`):**
   - Valida `public.is_admin()`.
   - Aplica soft delete gravando `excluido_em = now()`, `excluido_por = auth.uid()`, `atualizado_em = now()` e `atualizado_por = auth.uid()`.

### 4.5 Seed Inicial
- Inserir perfis fixos `admin` e `worker` de forma idempotente (`ON CONFLICT (nome) DO NOTHING`).
- Documentar procedimento seguro de bootstrap do primeiro usuário `admin` (criação via Supabase Auth Dashboard/script + inserção vinculada em `public.usuarios` com perfil `admin`), sem versionar senhas em texto plano no repositório.

---

## 5. Critérios de Aceite

- [ ] Todas as 5 tabelas (`perfis`, `usuarios`, `projetos`, `usuario_projetos`, `registros_ponto`) criadas via migrations versionadas no Supabase com chaves primárias, estrangeiras e constraints especificadas.
- [ ] RLS ativado (`FORCE`/`ENABLE ROW LEVEL SECURITY`) em todas as 5 tabelas do schema `public`, validado por testes automatizados com JWT de `worker` e JWT de `admin`.
- [ ] `worker` não consegue via API REST do Supabase listar outros usuários, criar/editar projetos, alterar vínculos, ler pontos de terceiros ou editar/excluir diretamente qualquer registro de ponto.
- [ ] `RN01` validada no banco: duas chamadas concorrentes para `iniciar_ponto` pelo mesmo usuário resultam em apenas 1 registro aberto e erro controlado na segunda chamada.
- [ ] `RN04` validada no banco: tentativa de gravar `horario_saida < horario_entrada` falha com violação de constraint, e edições administrativas sempre gravam `atualizado_em` (UTC) e `atualizado_por`.
- [ ] `RN05` validada no banco: tentativa de inativar, excluir ou rebaixar o único `admin` ativo falha com erro `LAST_ADMIN_PROTECTED`.
- [ ] `RNF03` validada: todos os timestamps (`criado_em`, `horario_entrada`, `horario_saida`, `atualizado_em`, `excluido_em`) são gerados exclusivamente pelo relógio UTC do PostgreSQL, ignorando valores enviados pelo cliente.
- [ ] Perfis `admin` e `worker` populados via seed e procedimento de criação do primeiro `admin` documentado.

---

## 6. Notas e Riscos de Implementação

- **Segurança de RPCs (`SECURITY DEFINER`):** Toda função `SECURITY DEFINER` deve declarar `SET search_path = public` e validar explicitamente `auth.uid()` e `public.is_active_user()` / `public.is_admin()`, nunca confiando em parâmetros de identidade vindos do front-end.
- **Evolução futura de auditoria:** Caso o negócio passe a exigir histórico completo de valores *antes/depois* em múltiplas edições de um mesmo registro, pode-se adicionar futuramente uma tabela `auditoria_registros_ponto` sem alterar o contrato das RPCs descritas aqui.
