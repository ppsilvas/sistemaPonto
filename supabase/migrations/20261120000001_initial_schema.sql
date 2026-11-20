-- TECH-02 (PPS-6): Modelagem relacional inicial (5 tabelas, constraints e índices)

-- 1. Perfis de acesso
CREATE TABLE IF NOT EXISTS public.perfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(50) NOT NULL UNIQUE CHECK (nome IN ('admin', 'worker'))
);

-- 2. Usuários do domínio (espelho de auth.users)
CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  nome VARCHAR(150) NOT NULL CHECK (length(trim(nome)) > 0),
  email VARCHAR(255) NOT NULL UNIQUE,
  perfil_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE RESTRICT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  inativado_em TIMESTAMPTZ NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Projetos
CREATE TABLE IF NOT EXISTS public.projetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(150) NOT NULL CHECK (length(trim(nome)) > 0),
  descricao TEXT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  inativado_em TIMESTAMPTZ NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Vínculo N:N entre usuários e projetos
CREATE TABLE IF NOT EXISTS public.usuario_projetos (
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, projeto_id)
);

-- 5. Registros de ponto
CREATE TABLE IF NOT EXISTS public.registros_ponto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT,
  horario_entrada TIMESTAMPTZ NOT NULL DEFAULT now(),
  horario_saida TIMESTAMPTZ NULL,
  observacoes TEXT NULL,
  atualizado_em TIMESTAMPTZ NULL,
  atualizado_por UUID NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  excluido_em TIMESTAMPTZ NULL,
  excluido_por UUID NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT chk_registros_ponto_cronologia
    CHECK (horario_saida IS NULL OR horario_saida >= horario_entrada)
);

-- RN01: no máximo 1 registro aberto (não excluído) por usuário
CREATE UNIQUE INDEX IF NOT EXISTS uq_registros_ponto_sessao_ativa
  ON public.registros_ponto (usuario_id)
  WHERE horario_saida IS NULL AND excluido_em IS NULL;

-- Índices para consultas e filtros (RF08)
CREATE INDEX IF NOT EXISTS idx_registros_ponto_usuario_entrada
  ON public.registros_ponto (usuario_id, horario_entrada DESC)
  WHERE excluido_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_registros_ponto_projeto_entrada
  ON public.registros_ponto (projeto_id, horario_entrada DESC)
  WHERE excluido_em IS NULL;
