---
id: UC-01
title: "[UC-01] Autenticação de Acesso, Identificação de Perfil e Controle de Sessão"
type: use-case
linear:
  team: Ppsilvas
  team_key: PPS
  project: Projeto Ponto Lelê
  project_id: P-PPS-1
  milestone: "M2 - Autenticação, Usuários & Projetos"
  priority: 1
  labels:
    - Feature
  suggested_labels:
    - auth
    - admin
    - worker
  estimate: 3
  blocked_by:
    - TECH-01
    - TECH-02
requirements:
  rf:
    - RF01
  rn: []
  rnf:
    - RNF01
    - RNF02
    - RNF04
actors:
  - Admin
  - Worker
---

# [UC-01] Autenticação de Acesso, Identificação de Perfil e Controle de Sessão

## 1. Resumo e História de Usuário

> **Como** usuário cadastrado (`admin` ou `worker`),  
> **quero** me autenticar com e-mail e senha e ter meu perfil identificado automaticamente,  
> **para** acessar apenas as funcionalidades permitidas ao meu nível de acesso com segurança.

Este caso de uso estabelece a porta de entrada do sistema: login via Supabase Auth, validação de conta ativa, resolução automática do perfil (`admin` ou `worker`), controle de rotas protegidas, persistência de sessão e encerramento seguro (logout).

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Escopo após Autenticação |
|---|---|---|
| Usuário não autenticado | Acessa somente `/login` | Qualquer rota protegida redireciona para `/login`. |
| `Admin` | Permitido | Identificado como `admin`; acessa ponto, relatório global, projetos e usuários. |
| `Worker` | Permitido | Identificado como `worker`; acessa apenas ponto, histórico próprio e troca de senha. Rotas de `admin` são bloqueadas. |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF01` — Autenticação de Acesso:** Exigir autenticação por e-mail e senha, identificando automaticamente o perfil (`admin` ou `worker`) do usuário logado.
- **`RNF01` — Arquitetura Front-end e Deploy:** Interface em React + TypeScript estrito, publicada em HTTPS na Vercel.
- **`RNF02` — Controle de Autorização e Segurança:** Validação de perfil/permissões no servidor/RLS e armazenamento de senhas exclusivamente via hash criptográfico (Supabase Auth).
- **`RNF04` — Responsividade:** Tela de login e menu de sessão adaptados a desktop e dispositivos móveis.

---

## 4. Pré-condições

1. O usuário possui conta criada no Supabase Auth (`auth.users`) e registro correspondente em `public.usuarios` vinculado a um perfil válido em `public.perfis` (`admin` ou `worker`).
2. A conta do usuário está com `ativo = true` (`[Extensão ao PDF]`).
3. As migrações e políticas RLS de `TECH-02` e o shell/rotas de `TECH-01` estão implantados.

---

## 5. Fluxo Principal

1. O usuário acessa a URL da aplicação sem sessão ativa e é direcionado à tela de login (`/login`).
2. O usuário informa **e-mail** e **senha** e aciona o botão **Entrar**.
3. O front-end valida preenchimento obrigatório e formato básico do e-mail, exibindo estado de carregamento e desabilitando múltiplos envios.
4. A aplicação invoca `supabase.auth.signInWithPassword({ email, password })`.
5. O Supabase Auth valida a senha contra o hash criptográfico armazenado e emite o token de sessão (JWT).
6. A aplicação consulta `public.usuarios` (com join em `public.perfis`) filtrando pelo `auth.uid()` retornado.
7. O sistema confirma que `usuarios.ativo = true` (`[Extensão ao PDF]`) e carrega no contexto de autenticação os dados do usuário (`id`, `nome`, `email`, `perfil: 'admin' | 'worker'`).
8. O sistema redireciona o usuário para a tela inicial adequada (ex.: tela de Registro de Ponto `/ponto` para `worker` e `/ponto` ou painel administrativo para `admin`), renderizando apenas os itens de menu permitidos ao perfil.
9. Ao acionar **Sair (Logout)**, o sistema executa `supabase.auth.signOut()`, limpa o estado local em memória e redireciona para `/login`.

---

## 6. Fluxos Alternativos e de Exceção

- **FA01 — Sessão já ativa ao abrir ou recarregar a página:**
  - O `AuthProvider` restaura a sessão via `supabase.auth.getSession()` / `onAuthStateChange`, revalida o perfil e `ativo = true` em `public.usuarios` e mantém o usuário na rota solicitada (respeitando permissão do perfil).
- **FE01 — Credenciais inválidas (e-mail inexistente ou senha incorreta):**
  - O sistema exibe mensagem genérica e segura (*"E-mail ou senha inválidos."*) sem revelar se o e-mail existe no cadastro.
- **FE02 — Usuário inativado (`ativo = false`) `[Extensão ao PDF]`:**
  - Mesmo que as credenciais sejam válidas no Auth (caso o banimento não tenha ocorrido simultaneamente), ao detectar `ativo = false` em `public.usuarios`, o sistema encerra a sessão imediatamente (`signOut`) e exibe mensagem *"Sua conta está inativa. Contate um administrador."*.
- **FE03 — Conta autenticada no Auth sem registro em `public.usuarios`:**
  - O sistema encerra a sessão (`signOut`), registra erro no log do cliente e exibe mensagem orientada para contatar o administrador.
- **FE04 — `Worker` tenta acessar rota administrativa manualmente pela URL (ex.: `/usuarios`, `/projetos`, `/relatorios/admin`):**
  - O `AdminRoute` bloqueia a renderização e redireciona para `/ponto` exibindo aviso discreto (*"Acesso restrito a administradores."*).
  - Mesmo que um cliente malicioso tente chamar endpoints do Supabase diretamente, as políticas RLS (`TECH-02`) negam a operação.
- **FE05 — Sessão expirada durante o uso:**
  - O listener `onAuthStateChange` detecta invalidação/expiração do token, limpa o estado da aplicação e redireciona para `/login` preservando opcionalmente a rota de destino (`returnUrl`).
- **FE06 — Erro de rede / indisponibilidade do Supabase:**
  - O sistema exibe alerta amigável permitindo nova tentativa sem limpar o e-mail digitado.

---

## 7. Pós-condições e Impacto em Dados

- **Leitura:** `auth.users` (via Supabase Auth), `public.usuarios` (`id`, `nome`, `email`, `perfil_id`, `ativo`) e `public.perfis` (`nome`).
- **Escrita:** Nenhuma alteração nas tabelas de domínio; sessão JWT gerenciada pelo Supabase Auth.
- **RLS envolvida:** Política de `SELECT` em `public.usuarios` permitindo leitura apenas do próprio registro (`id = auth.uid()`) para `worker` e de todos para `admin`.

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Login válido como `worker`:**
  - **Dado** um usuário ativo com perfil `worker` na tela `/login`
  - **Quando** informa e-mail e senha válidos e clica em **Entrar**
  - **Então** o sistema autentica, identifica automaticamente o perfil `worker`, redireciona para `/ponto` e não exibe menus de gestão de usuários, projetos ou relatório global.
- **Cenário 2 — Login válido como `admin`:**
  - **Dado** um usuário ativo com perfil `admin` na tela `/login`
  - **Quando** informa e-mail e senha válidos e clica em **Entrar**
  - **Então** o sistema autentica, identifica automaticamente o perfil `admin` e habilita acesso completo às áreas administrativas e de ponto.
- **Cenário 3 — Tentativa de acesso direto a rota admin por `worker`:**
  - **Dado** um `worker` autenticado
  - **Quando** navega diretamente para `/usuarios` ou `/projetos`
  - **Então** é redirecionado para `/ponto` sem exibir dados administrativos.
- **Cenário 4 — Login com usuário inativo `[Extensão ao PDF]`:**
  - **Dado** um usuário com `ativo = false`
  - **Quando** tenta realizar login
  - **Então** a sessão é imediatamente encerrada e o sistema exibe mensagem informando conta inativa.

### Checklist de Conclusão
- [ ] Tela `/login` responsiva (desktop e mobile) com validação de formulário e toggle opcional de visibilidade da senha.
- [ ] Integração com `supabase.auth.signInWithPassword`, `getSession`, `onAuthStateChange` e `signOut`.
- [ ] Identificação automática do perfil (`admin` / `worker`) carregado a partir de `public.usuarios` + `public.perfis`.
- [ ] Validação de `ativo = true` impedindo acesso de contas inativadas.
- [ ] Bloqueio efetivo de rotas protegidas (`PrivateRoute`) e administrativas (`AdminRoute`) com preservação de UX ao recarregar a página.
- [ ] Mensagem de erro genérica para credenciais inválidas sem enumeração de e-mails.

---

## 9. Notas Técnicas e de UX

- Não exibir opção de "Criar conta" (auto-registro público): conforme `RF03`, apenas usuários `admin` cadastram novos usuários no sistema.
- Utilizar um estado `authLoading` explícito no `AuthProvider` para evitar *flash* da tela de login ou redirecionamento indevido enquanto a sessão e o perfil ainda estão sendo hidratados no recarregamento.
