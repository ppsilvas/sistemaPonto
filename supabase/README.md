# Banco de Dados e Segurança — Supabase (`TECH-02` / `PPS-6`)

Este diretório contém as migrations SQL versionadas e o seed inicial do **Projeto Ponto Lelê**.

## Estrutura

- `migrations/20261120000001_initial_schema.sql`: criação das 5 tabelas (`perfis`, `usuarios`, `projetos`, `usuario_projetos`, `registros_ponto`), constraints (`chk_registros_ponto_cronologia`) e índices (`uq_registros_ponto_sessao_ativa` para `RN01`).
- `migrations/20261120000002_rls_policies.sql`: habilitação obrigatória de RLS em todas as tabelas (`RNF02`), funções auxiliares `is_admin()` e `is_active_user()`, e políticas explícitas por operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
- `migrations/20261120000003_triggers_and_rpcs.sql`: trigger `trg_proteger_ultimo_admin` (`RN05`), triggers de carimbo UTC server-side (`RNF03`) e RPCs `iniciar_ponto`, `pausar_ponto`, `editar_ponto_admin` e `excluir_ponto_admin`.
- `seed.sql`: inserção idempotente dos perfis `admin` e `worker`.

## Bootstrap Seguro do Primeiro Administrador

Nunca versione senhas ou chaves `service_role` no repositório. Para criar o primeiro usuário administrador em um ambiente novo:

1. No painel do **Supabase → Authentication → Users → Add user**, crie o usuário com e-mail e senha forte (marcando *Auto Confirm User*).
2. Copie o `User UID` gerado em `auth.users`.
3. Execute no **SQL Editor** do Supabase substituindo os placeholders:

```sql
INSERT INTO public.usuarios (id, nome, email, perfil_id, ativo)
SELECT
  '<USER_UID_DO_AUTH_USERS>'::uuid,
  'Administrador Inicial',
  'admin@seudominio.com',
  p.id,
  true
FROM public.perfis p
WHERE p.nome = 'admin'
ON CONFLICT (id) DO NOTHING;
```
