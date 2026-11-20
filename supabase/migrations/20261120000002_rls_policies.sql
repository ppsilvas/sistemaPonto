-- TECH-02 (PPS-6): Funções auxiliares de autorização e políticas RLS (RNF02)

-- Habilitar RLS em todas as tabelas do schema public
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_ponto ENABLE ROW LEVEL SECURITY;

-- Funções auxiliares SECURITY DEFINER (evitam recursão em políticas RLS)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.ativo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid()
      AND u.ativo = true
      AND p.nome = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 1. Políticas de public.perfis
CREATE POLICY perfis_select_authenticated_active
  ON public.perfis
  FOR SELECT
  TO authenticated
  USING (public.is_active_user());

-- 2. Políticas de public.usuarios
CREATE POLICY usuarios_select_admin_or_self
  ON public.usuarios
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_active_user() AND id = auth.uid())
  );

CREATE POLICY usuarios_insert_admin
  ON public.usuarios
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY usuarios_update_admin
  ON public.usuarios
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY usuarios_delete_admin
  ON public.usuarios
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 3. Políticas de public.projetos
CREATE POLICY projetos_select_admin_or_linked
  ON public.projetos
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_active_user()
      AND (
        EXISTS (
          SELECT 1
          FROM public.usuario_projetos up
          WHERE up.usuario_id = auth.uid()
            AND up.projeto_id = projetos.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.registros_ponto rp
          WHERE rp.usuario_id = auth.uid()
            AND rp.projeto_id = projetos.id
            AND rp.excluido_em IS NULL
        )
      )
    )
  );

CREATE POLICY projetos_insert_admin
  ON public.projetos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY projetos_update_admin
  ON public.projetos
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY projetos_delete_admin
  ON public.projetos
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 4. Políticas de public.usuario_projetos
CREATE POLICY usuario_projetos_select_admin_or_self
  ON public.usuario_projetos
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_active_user() AND usuario_id = auth.uid())
  );

CREATE POLICY usuario_projetos_insert_admin
  ON public.usuario_projetos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY usuario_projetos_delete_admin
  ON public.usuario_projetos
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 5. Políticas de public.registros_ponto
CREATE POLICY registros_ponto_select_admin_or_self
  ON public.registros_ponto
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_active_user()
      AND usuario_id = auth.uid()
      AND excluido_em IS NULL
    )
  );

CREATE POLICY registros_ponto_insert_linked_active
  ON public.registros_ponto
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.usuario_projetos up
      JOIN public.projetos p ON p.id = up.projeto_id
      WHERE up.usuario_id = auth.uid()
        AND up.projeto_id = registros_ponto.projeto_id
        AND p.ativo = true
    )
  );

CREATE POLICY registros_ponto_update_admin
  ON public.registros_ponto
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
