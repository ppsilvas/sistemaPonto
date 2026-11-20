-- TECH-02 (PPS-6): Triggers de integridade/UTC e RPCs server-side

-- 1. Proteção do último administrador ativo (RN05)
CREATE OR REPLACE FUNCTION public.proteger_ultimo_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_perfil_id UUID;
  v_remaining_admins INTEGER;
BEGIN
  SELECT id INTO v_admin_perfil_id
  FROM public.perfis
  WHERE nome = 'admin';

  IF v_admin_perfil_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Verifica se o registro afetado era um admin ativo
  IF OLD.ativo = true AND OLD.perfil_id = v_admin_perfil_id THEN
    -- Serializa alterações concorrentes em admins
    PERFORM pg_advisory_xact_lock(hashtext('public.usuarios.last_admin_lock'));

    IF TG_OP = 'DELETE'
       OR NEW.ativo = false
       OR NEW.perfil_id <> v_admin_perfil_id THEN

      SELECT count(*) INTO v_remaining_admins
      FROM public.usuarios
      WHERE id <> OLD.id
        AND ativo = true
        AND perfil_id = v_admin_perfil_id;

      IF v_remaining_admins < 1 THEN
        RAISE EXCEPTION 'LAST_ADMIN_PROTECTED: Não é possível excluir, inativar ou rebaixar o único administrador ativo.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE TRIGGER trg_proteger_ultimo_admin
  BEFORE UPDATE OR DELETE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_ultimo_admin();

-- 2. Carimbos de data/hora exclusivamente server-side em UTC (RNF03)
CREATE OR REPLACE FUNCTION public.enforce_utc_audit_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.criado_em := now();
    NEW.inativado_em := CASE WHEN NEW.ativo THEN NULL ELSE now() END;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.criado_em := OLD.criado_em;
    IF NEW.ativo = false AND OLD.ativo = true THEN
      NEW.inativado_em := now();
    ELSIF NEW.ativo = true THEN
      NEW.inativado_em := NULL;
    ELSE
      NEW.inativado_em := OLD.inativado_em;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_usuarios_utc_timestamps
  BEFORE INSERT OR UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_utc_audit_timestamps();

CREATE OR REPLACE TRIGGER trg_projetos_utc_timestamps
  BEFORE INSERT OR UPDATE ON public.projetos
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_utc_audit_timestamps();

CREATE OR REPLACE FUNCTION public.enforce_registro_ponto_insert_utc()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.horario_entrada := now();
  NEW.horario_saida := NULL;
  NEW.atualizado_em := NULL;
  NEW.atualizado_por := NULL;
  NEW.excluido_em := NULL;
  NEW.excluido_por := NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_registros_ponto_insert_utc
  BEFORE INSERT ON public.registros_ponto
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_registro_ponto_insert_utc();

-- 3. RPC: Iniciar ponto (Start) — RN01, RN02, RNF03
CREATE OR REPLACE FUNCTION public.iniciar_ponto(
  p_projeto_id UUID,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS public.registros_ponto
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_registro public.registros_ponto;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_active_user() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Usuário não autenticado ou inativo.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario_projetos up
    JOIN public.projetos p ON p.id = up.projeto_id
    WHERE up.usuario_id = v_user_id
      AND up.projeto_id = p_projeto_id
      AND p.ativo = true
  ) THEN
    RAISE EXCEPTION 'PROJECT_NOT_LINKED: Projeto inativo ou não vinculado ao usuário.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.registros_ponto rp
    WHERE rp.usuario_id = v_user_id
      AND rp.horario_saida IS NULL
      AND rp.excluido_em IS NULL
  ) THEN
    RAISE EXCEPTION 'ACTIVE_SESSION_EXISTS: Já existe uma sessão de ponto ativa para este usuário.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.registros_ponto (
    usuario_id,
    projeto_id,
    horario_entrada,
    horario_saida,
    observacoes
  )
  VALUES (
    v_user_id,
    p_projeto_id,
    now(),
    NULL,
    p_observacoes
  )
  RETURNING * INTO v_registro;

  RETURN v_registro;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'ACTIVE_SESSION_EXISTS: Já existe uma sessão de ponto ativa para este usuário.'
      USING ERRCODE = 'P0001';
END;
$$;

-- 4. RPC: Pausar ponto (Pause) — RN01, RNF03
CREATE OR REPLACE FUNCTION public.pausar_ponto(
  p_observacoes TEXT DEFAULT NULL
)
RETURNS public.registros_ponto
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_registro public.registros_ponto;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_active_user() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Usuário não autenticado ou inativo.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.registros_ponto
  SET
    horario_saida = now(),
    observacoes = COALESCE(p_observacoes, observacoes)
  WHERE usuario_id = v_user_id
    AND horario_saida IS NULL
    AND excluido_em IS NULL
  RETURNING * INTO v_registro;

  IF v_registro.id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_SESSION: Nenhuma sessão de ponto ativa encontrada.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_registro;
END;
$$;

-- 5. RPC: Editar ponto (Admin com auditoria) — RN01, RN04, RNF03
CREATE OR REPLACE FUNCTION public.editar_ponto_admin(
  p_registro_id UUID,
  p_projeto_id UUID,
  p_horario_entrada TIMESTAMPTZ,
  p_horario_saida TIMESTAMPTZ,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS public.registros_ponto
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_registro public.registros_ponto;
BEGIN
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Apenas administradores podem editar registros de ponto.'
      USING ERRCODE = '42501';
  END IF;

  IF p_horario_saida IS NOT NULL AND p_horario_saida < p_horario_entrada THEN
    RAISE EXCEPTION 'INVALID_CHRONOLOGY: horario_saida deve ser maior ou igual a horario_entrada.'
      USING ERRCODE = '22007';
  END IF;

  UPDATE public.registros_ponto
  SET
    projeto_id = p_projeto_id,
    horario_entrada = p_horario_entrada,
    horario_saida = p_horario_saida,
    observacoes = p_observacoes,
    atualizado_em = now(),
    atualizado_por = v_admin_id
  WHERE id = p_registro_id
    AND excluido_em IS NULL
  RETURNING * INTO v_registro;

  IF v_registro.id IS NULL THEN
    RAISE EXCEPTION 'RECORD_NOT_FOUND: Registro de ponto não encontrado ou já excluído.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_registro;
END;
$$;

-- 6. RPC: Excluir ponto (Admin soft delete com auditoria) — RN04, RNF03
CREATE OR REPLACE FUNCTION public.excluir_ponto_admin(
  p_registro_id UUID
)
RETURNS public.registros_ponto
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_registro public.registros_ponto;
BEGIN
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Apenas administradores podem excluir registros de ponto.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.registros_ponto
  SET
    excluido_em = now(),
    excluido_por = v_admin_id,
    atualizado_em = now(),
    atualizado_por = v_admin_id
  WHERE id = p_registro_id
    AND excluido_em IS NULL
  RETURNING * INTO v_registro;

  IF v_registro.id IS NULL THEN
    RAISE EXCEPTION 'RECORD_NOT_FOUND: Registro de ponto não encontrado ou já excluído.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_registro;
END;
$$;

-- Permissões explícitas de execução das RPCs
REVOKE ALL ON FUNCTION public.iniciar_ponto(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_ponto(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.pausar_ponto(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pausar_ponto(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.editar_ponto_admin(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_ponto_admin(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.excluir_ponto_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_ponto_admin(UUID) TO authenticated;
