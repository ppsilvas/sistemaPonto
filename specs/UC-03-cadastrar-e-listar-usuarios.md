---
id: UC-03
title: "[UC-03] Listagem e Cadastro de Usuários (Admin)"
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
    - usuarios
    - backend
  estimate: 5
  blocked_by:
    - UC-01
requirements:
  rf:
    - RF03
  rn: []
  rnf:
    - RNF02
    - RNF03
    - RNF04
actors:
  - Admin
---

# [UC-03] Listagem e Cadastro de Usuários (Admin)

## 1. Resumo e História de Usuário

> **Como** usuário `admin`,  
> **quero** visualizar todos os usuários cadastrados e criar novos usuários informando nome, e-mail, senha inicial, perfil e projetos vinculados,  
> **para** integrar novos freelancers ou administradores à equipe de forma centralizada e segura.

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Mecanismo de Proteção |
|---|---|---|
| `Admin` | Permitido | Rota `/usuarios` liberada + validação `is_admin()` na Edge Function e nas políticas RLS. |
| `Worker` | Não permitido | Menu oculto, `AdminRoute` redireciona e API/Edge Function retorna `403 Forbidden`. |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF03` — Gestão de Usuários (Admin):** Cadastrar novos usuários informando nome, e-mail, senha inicial, perfil (`admin` ou `worker`) e projetos vinculados.
- **`RNF02` — Controle de Autorização e Segurança:** Apenas `admin` pode criar usuários (validado no servidor); senha inicial armazenada exclusivamente como hash criptográfico via Supabase Auth.
- **`RNF03` — Sincronismo de Horário no Servidor:** `usuarios.criado_em` carimbado em UTC pelo relógio do banco de dados (`now()`).
- **`RNF04` — Responsividade:** Listagem (tabela no desktop / cards no mobile) e formulário de cadastro responsivos.

---

## 4. Pré-condições

1. O usuário está autenticado com perfil `admin` e `ativo = true` (`UC-01`).
2. Os perfis `admin` e `worker` existem em `public.perfis` (`TECH-02`).
3. Uma Supabase Edge Function (ex.: `admin-create-user`) está implantada com acesso seguro à `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente server-side.

---

## 5. Fluxo Principal

### 5.1 Listagem de Usuários
1. O `admin` acessa a página **Usuários** (`/usuarios`).
2. O sistema consulta `public.usuarios` com join em `public.perfis` e contagem/lista de projetos vinculados em `public.usuario_projetos`.
3. A tela exibe todos os usuários contendo: **Nome**, **E-mail**, **Perfil** (`Admin` / `Worker`), **Status** (`Ativo` / `Inativo` `[Extensão ao PDF]`), **Projetos vinculados** e **Data de criação** (convertida de UTC para fuso local).
4. O `admin` pode buscar por nome/e-mail e filtrar por perfil (`Todos`, `Admin`, `Worker`) e status (`Ativos`, `Inativos`, `Todos`).

### 5.2 Cadastro de Novo Usuário
5. O `admin` aciona **Novo Usuário**.
6. O sistema exibe o formulário com os campos:
   - **Nome completo** (obrigatório);
   - **E-mail** (obrigatório, formato válido e único);
   - **Senha inicial** (obrigatória, mínimo de 8 caracteres, com opção de gerar senha forte e botão de copiar);
   - **Perfil** (obrigatório: `Worker` selecionado por padrão ou `Admin`);
   - **Projetos vinculados** (multi-seleção opcional listando projetos ativos de `public.projetos`).
7. O `admin` confirma o cadastro.
8. O front-end envia o payload junto ao JWT do `admin` logado para a Edge Function `admin-create-user`.
9. A Edge Function executa no servidor:
   1. Valida o JWT do chamador e confirma em `public.usuarios` + `public.perfis` que o chamador é `admin` e `ativo = true` (`RNF02`).
   2. Normaliza o e-mail (`trim().toLowerCase()`) e valida os campos obrigatórios.
   3. Cria o usuário em `auth.users` via `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })` (sem encerrar a sessão do `admin` logado).
   4. Insere o registro correspondente em `public.usuarios` (`id = authUser.id`, `nome`, `email`, `perfil_id`, `ativo = true`, `criado_em = now()` pelo banco).
   5. Se projetos iniciais foram selecionados, insere os vínculos em `public.usuario_projetos` (somente projetos válidos e ativos).
   6. Em caso de falha nos passos 4 ou 5, executa rollback compensatório removendo o usuário recém-criado em `auth.users` para evitar contas órfãs.
10. A Edge Function retorna `201 Created` com os dados do usuário criado (sem devolver a senha).
11. A UI fecha o formulário, atualiza a listagem e exibe feedback de sucesso.

---

## 6. Fluxos Alternativos e de Exceção

- **FA01 — Cadastro sem projetos vinculados inicialmente:**
  - É permitido cadastrar o usuário com a lista de projetos vazia; o usuário conseguirá fazer login (`UC-01`), mas ficará impedido de bater ponto até que um vínculo seja criado (`RN02`, `UC-06`, `UC-07`).
- **FE01 — E-mail já cadastrado (duplicidade):**
  - Tanto `auth.users` quanto `public.usuarios` impõem unicidade no e-mail. A Edge Function retorna `409 Conflict` e o formulário exibe *"Já existe um usuário cadastrado com este e-mail."*.
- **FE02 — Campos inválidos (nome em branco, e-mail malformado, senha fraca ou perfil inválido):**
  - Validação imediata no front-end e revalidação na Edge Function (`400 Bad Request`) indicando os campos com erro.
- **FE03 — Tentativa de chamada por `worker` ou sem JWT válido:**
  - A Edge Function retorna `401 Unauthorized` ou `403 Forbidden` sem executar qualquer escrita.
- **FE04 — Falha parcial ao inserir em `public.usuarios` ou `usuario_projetos`:**
  - Rollback remove o registro de `auth.users` e retorna erro `500`, preservando consistência entre Auth e banco de domínio.
- **FE05 — Lista de usuários vazia de resultados no filtro:**
  - Exibe estado vazio amigável com ação para limpar filtros.

---

## 7. Pós-condições e Impacto em Dados

- **Escrita:**
  - `auth.users`: nova credencial criada com senha criptografada (`RNF02`) e `email_confirm = true`.
  - `public.usuarios`: novo registro com `id` igual ao UUID do Auth, `perfil_id` correspondente, `ativo = true` (`[Extensão ao PDF]`) e `criado_em` em UTC pelo servidor (`RNF03`).
  - `public.usuario_projetos`: 0 a N registros vinculando o usuário aos projetos selecionados.
- **Sessão do Admin:** Permanece intacta (não é desconectado nem trocada pelo novo usuário).

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Admin cadastra novo `worker` com projetos vinculados:**
  - **Dado** um `admin` autenticado na tela `/usuarios`
  - **Quando** preenche nome, e-mail inédito, senha inicial válida, perfil `worker` e seleciona 2 projetos ativos, e salva
  - **Então** o usuário é criado em `auth.users` e `public.usuarios`, os 2 vínculos são gravados em `usuario_projetos`, a sessão do `admin` permanece ativa e o novo `worker` consegue fazer login imediatamente.
- **Cenário 2 — Bloqueio de e-mail duplicado:**
  - **Dado** um e-mail já existente em `public.usuarios`
  - **Quando** o `admin` tenta cadastrar outro usuário com o mesmo e-mail (mesmo variando maiúsculas/minúsculas)
  - **Então** o sistema rejeita com erro claro e não cria registros duplicados.
- **Cenário 3 — Bloqueio de criação por `worker`:**
  - **Dado** um JWT válido de usuário com perfil `worker`
  - **Quando** ocorre chamada direta à Edge Function `admin-create-user`
  - **Então** o servidor retorna `403 Forbidden` e nenhum usuário é criado.

### Checklist de Conclusão
- [ ] Tela `/usuarios` protegida por `AdminRoute`, listando nome, e-mail, perfil, status, projetos vinculados e data de criação (fuso local).
- [ ] Busca por nome/e-mail e filtros por perfil e status funcionais.
- [ ] Formulário de cadastro com nome, e-mail, senha inicial, perfil (`admin`/`worker`) e multi-seleção de projetos ativos.
- [ ] Edge Function `admin-create-user` valida `is_admin()` server-side, usa Service Role apenas no servidor e executa rollback se a inserção relacional falhar.
- [ ] E-mail normalizado em minúsculas e unicidade garantida.
- [ ] Layout responsivo (tabela desktop / cards mobile).

---

## 9. Notas Técnicas e de UX

- **Por que usar Edge Function?** O método cliente `supabase.auth.signUp()` substitui a sessão atual do navegador pelo usuário recém-criado e depende de fluxo de confirmação de e-mail. Usar `supabase.auth.admin.createUser` dentro de uma Edge Function garante que o `admin` continue logado e que o freelancer já possa acessar o sistema imediatamente com a senha inicial.
- Recomendar visualmente que o `admin` instrua o novo usuário a alterar a senha inicial no primeiro acesso (`UC-02`).
