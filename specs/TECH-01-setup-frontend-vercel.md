---
id: TECH-01
title: "[TECH-01] Setup do Projeto Front-end (React + TypeScript Estrito + Deploy Vercel)"
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
    - frontend
    - setup
  estimate: 3
  blocked_by: []
requirements:
  rf: []
  rn: []
  rnf:
    - RNF01
    - RNF04
actors:
  - Admin
  - Worker
---

# [TECH-01] Setup do Projeto Front-end (React + TypeScript Estrito + Deploy Vercel)

## 1. Resumo e Objetivo Técnico

Estruturar a base da aplicação web em **React + TypeScript com tipagem estrita**, configurada com cliente Supabase, roteamento com guarda de sessão/perfil, layout shell responsivo (desktop e mobile) e pipeline de deploy na **Vercel com HTTPS**.

Esta fundação garante padronização de código, segurança de tipos para todas as entidades do domínio e base responsiva para todos os casos de uso funcionais (`UC-01` a `UC-12`).

---

## 2. Requisitos Atendidos

| Código | Descrição | Como esta spec atende |
| --- | --- | --- |
| `RNF01` | Arquitetura Front-end e Deploy (React + TypeScript estrito + Vercel HTTPS) | Projeto Vite + React + TypeScript com `strict: true`, interfaces tipadas para todas as entidades e configuração de deploy SPA na Vercel com HTTPS. |
| `RNF04` | Responsividade (desktop e dispositivos móveis) | Layout shell responsivo *mobile-first* com navegação adaptativa (sidebar/topbar desktop e barra/drawer mobile) e área de toque adequada (mínimo `44x44px`) para `Start`/`Pause`. |

---

## 3. Escopo e Entregáveis Detalhados

### 3.1 Inicialização e Tooling

- Inicializar aplicação React + TypeScript (Vite) na raiz do projeto (ou diretório acordado).
- Habilitar no `tsconfig.json`:
  - `"strict": true`
  - `"noUncheckedIndexedAccess": true`
  - `"noImplicitReturns": true`
  - `"noFallthroughCasesInSwitch": true`
- Configurar linting e formatação (ESLint + Prettier) e script de verificação de tipos (`tsc --noEmit`).
- Configurar framework de testes unitários/componentes (ex.: Vitest + React Testing Library) para validar cálculos de horas, formatação CSV e regras de UI.

### 3.2 Estrutura Modular Recomendada

```text
src/
├── app/                # Providers (Auth, Router, Query/State), rotas e guards
├── components/         # Componentes compartilhados (Button, Input, Modal, LayoutShell)
├── features/
│   ├── auth/           # Login, troca de senha, contexto de sessão e perfil
│   ├── usuarios/       # CRUD de usuários (Admin)
│   ├── projetos/       # CRUD de projetos e vínculos (Admin)
│   ├── ponto/          # Seleção de projeto, Start/Pause, cronômetro ativo
│   └── relatorios/     # Histórico worker, relatório global admin, auditoria e CSV
├── lib/                # Cliente Supabase, formatadores de data/hora (UTC -> local), CSV
└── types/              # Tipagem estrita das entidades e tipos gerados do Supabase
```

### 3.3 Tipagem Estrita das Entidades (`RNF01`)

Criar tipos TypeScript estritos em `src/types/domain.ts` espelhando as 5 entidades do modelo relacional (incluindo extensões demarcadas em `TECH-02`):

- `PerfilNome = 'admin' | 'worker'`
- `Perfil`: `{ id: string; nome: PerfilNome }`
- `Usuario`: `{ id: string; nome: string; email: string; perfil_id: string; perfil?: PerfilNome; ativo: boolean; inativado_em: string | null; criado_em: string }`
- `Projeto`: `{ id: string; nome: string; descricao: string | null; ativo: boolean; inativado_em: string | null; criado_em: string }`
- `UsuarioProjeto`: `{ usuario_id: string; projeto_id: string }`
- `RegistroPonto`: `{ id: string; usuario_id: string; projeto_id: string; horario_entrada: string; horario_saida: string | null; observacoes: string | null; atualizado_em: string | null; atualizado_por: string | null; excluido_em: string | null; excluido_por: string | null }`

### 3.4 Integração Supabase e Variáveis de Ambiente

- Instalar `@supabase/supabase-js`.
- Criar `.env.example` documentando as variáveis públicas exigidas:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Garantir validação em tempo de inicialização caso alguma variável obrigatória esteja ausente.
- Garantir que chaves sensíveis (`SUPABASE_SERVICE_ROLE_KEY`) **nunca** sejam expostas no bundle front-end.

### 3.5 Layout Shell Responsivo e Infraestrutura de Rotas (`RNF04`)

- Implementar `AppLayout` responsivo com:
  - Cabeçalho identificando usuário logado, badge do perfil (`Admin` ou `Worker`) e ações rápidas (Alterar senha / Sair).
  - Menu de navegação condicional por perfil:
    - `Worker`: Registrar Ponto, Meu Histórico.
    - `Admin`: Registrar Ponto, Relatório de Pontos, Projetos, Usuários.
  - Adaptação mobile (`360px`–`430px`) priorizando acesso imediato à tela de `Start` / `Pause`.
- Estruturar guards de rota:
  - `PrivateRoute`: exige sessão autenticada e usuário `ativo = true`.
  - `AdminRoute`: exige perfil `admin`, redirecionando `worker` para a tela principal com feedback discreto.
- Infraestrutura de feedback visual padronizada (toasts/alertas de sucesso/erro, estados de *loading*, *empty states*).

### 3.6 Configuração de Deploy na Vercel (`RNF01`)

- Criar arquivo `vercel.json` com rewrite para SPA (`"source": "/(.*)", "destination": "/index.html"`) evitando erro 404 ao recarregar rotas protegidas.
- Validar build de produção (`npm run build`) e publicação na Vercel com HTTPS habilitado e variáveis de ambiente configuradas no painel da Vercel.

---

## 4. Critérios de Aceite

- [ ] Projeto React + TypeScript inicializado com `strict: true` e `npm run build` / `tsc --noEmit` passando sem erros ou warnings de tipagem `any` implícito.
- [ ] Todas as 5 entidades de domínio (`perfis`, `usuarios`, `projetos`, `usuario_projetos`, `registros_ponto`) possuem interfaces/tipos TypeScript estritos definidos.
- [ ] Cliente Supabase configurado lendo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com `.env.example` versionado e `.env` mantido no `.gitignore`.
- [ ] Guards de rota (`PrivateRoute` e `AdminRoute`) e `AppLayout` responsivo implementados e funcionais em viewports mobile (`375px`) e desktop (`1280px+`).
- [ ] `vercel.json` configurado para roteamento SPA e deploy funcional na Vercel acessível via HTTPS.
- [ ] Utilitários base de formatação de data/hora (conversão de timestamps ISO UTC para fuso horário local e cálculo de duração em `HH:MM:SS` / `HH:MM`) cobertos por testes unitários.

---

## 5. Notas e Riscos de Implementação

- **Fuso horário:** Toda data/hora vinda do Supabase estará em UTC (`TIMESTAMPTZ`). O front-end deve tratar formatação exclusivamente na camada de exibição usando o fuso local do navegador, nunca confiando no relógio local para gravar `horario_entrada` ou `horario_saida` (`RNF03`).
- **Segurança:** A ocultação de rotas/menus no front-end é apenas conveniência de UX; a autorização efetiva será sempre garantida pelas políticas RLS e RPCs definidas em `TECH-02`.
