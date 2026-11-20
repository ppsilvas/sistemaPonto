-- Concede privilégios de tabela ao papel authenticated (autorização efetiva controlada via RLS)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.perfis TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projetos TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.usuario_projetos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.registros_ponto TO authenticated;
