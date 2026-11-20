-- TECH-02 (PPS-6): Seed idempotente dos perfis de acesso
INSERT INTO public.perfis (nome)
VALUES
  ('admin'),
  ('worker')
ON CONFLICT (nome) DO NOTHING;
