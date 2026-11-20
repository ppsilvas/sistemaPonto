---
id: UC-02
title: "[UC-02] Atualização da Própria Senha"
type: use-case
linear:
  team: Ppsilvas
  team_key: PPS
  project: Projeto Ponto Lelê
  project_id: P-PPS-1
  milestone: "M2 - Autenticação, Usuários & Projetos"
  priority: 3
  labels:
    - Feature
  suggested_labels:
    - auth
    - security
    - admin
    - worker
  estimate: 2
  blocked_by:
    - UC-01
requirements:
  rf:
    - RF02
  rn: []
  rnf:
    - RNF02
    - RNF04
actors:
  - Admin
  - Worker
---

# [UC-02] Atualização da Própria Senha

## 1. Resumo e História de Usuário

> **Como** usuário autenticado (`admin` ou `worker`),  
> **quero** alterar minha própria senha informando minha senha atual e a nova senha,  
> **para** manter minha conta segura e substituir senhas iniciais definidas pelo administrador.

---

## 2. Atores e Matriz de Permissões Aplicável

| Ator | Permissão | Restrição |
|---|---|---|
| `Admin` | Permitido | Altera apenas a própria senha através deste fluxo. |
| `Worker` | Permitido | Altera apenas a própria senha; não pode alterar senha de terceiros. |
| Usuário não autenticado | Não permitido | Redirecionado para `/login`. |

---

## 3. Requisitos e Regras de Negócio Relacionados

- **`RF02` — Atualização de Senha:** Todo usuário autenticado (`worker` e `admin`) deve poder alterar sua própria senha informando a senha atual e a nova senha.
- **`RNF02` — Controle de Autorização e Segurança:** Armazenamento exclusivo via hash criptográfico no Supabase Auth; validação efetiva da senha atual antes da troca.
- **`RNF04` — Responsividade:** Formulário acessível e usável tanto em desktop quanto em dispositivos móveis.

---

## 4. Pré-condições

1. O usuário (`admin` ou `worker`) está autenticado e ativo (`UC-01`).
2. O usuário acessa a opção **Alterar Senha** no menu da conta/perfil.

---

## 5. Fluxo Principal

1. O usuário abre a tela ou modal **Alterar Senha** (ex.: `/perfil/senha` ou seção de conta).
2. O usuário preenche:
   - **Senha atual** (obrigatória);
   - **Nova senha** (obrigatória, política mínima recomendada: mínimo de 8 caracteres);
   - **Confirmação da nova senha** (obrigatória, deve coincidir com a nova senha).
3. O usuário aciona **Salvar nova senha**.
4. O front-end valida os campos (obrigatoriedade, comprimento mínimo, igualdade entre nova senha e confirmação, e que a nova senha seja diferente da senha atual).
5. O sistema valida a **senha atual** no servidor (reautenticando com o e-mail do usuário logado e a senha atual via `signInWithPassword` ou RPC/Edge Function equivalente antes de aplicar a alteração).
6. Com a senha atual confirmada, o sistema executa `supabase.auth.updateUser({ password: novaSenha })`.
7. O Supabase Auth gera o novo hash criptográfico e atualiza a credencial do usuário logado.
8. O sistema exibe confirmação visual (*"Senha alterada com sucesso."*) e limpa os campos do formulário.

---

## 6. Fluxos Alternativos e de Exceção

- **FE01 — Senha atual incorreta:**
  - A validação da senha atual falha; a nova senha **não** é salva e o sistema exibe erro claro no campo (*"A senha atual informada está incorreta."*).
- **FE02 — Nova senha não atende ao mínimo de segurança:**
  - Ex.: menos de 8 caracteres (ou rejeitada pela política configurada no Supabase Auth). O sistema bloqueia o envio e exibe os requisitos de senha.
- **FE03 — Confirmação da nova senha divergente:**
  - Validação imediata impede o envio e informa *"A confirmação não confere com a nova senha."*.
- **FE04 — Nova senha igual à senha atual:**
  - O sistema alerta *"A nova senha deve ser diferente da senha atual."* e impede o envio.
- **FE05 — Sessão expirada ou usuário inativado durante a operação:**
  - O sistema aborta a operação e redireciona para `/login`.
- **FE06 — Erro de rede / limite de tentativas (rate limit do Supabase Auth):**
  - Exibe mensagem informativa orientando aguardar alguns instantes antes de tentar novamente.

---

## 7. Pós-condições e Impacto em Dados

- **Escrita:** Atualização do hash criptográfico em `auth.users.encrypted_password` gerenciado exclusivamente pelo Supabase Auth (`RNF02`).
- **Efeito colateral:** A senha anterior deixa de ser válida imediatamente para novos logins; a nova senha passa a valer imediatamente.
- **Auditoria/Domínio:** Nenhuma alteração na tabela `public.usuarios` ou nos `registros_ponto` (sessão de ponto ativa, se existir, não é interrompida).

---

## 8. Critérios de Aceite (BDD e Checklist)

### Cenários BDD
- **Cenário 1 — Alteração bem-sucedida da senha (`worker` ou `admin`):**
  - **Dado** um usuário autenticado na tela de Alterar Senha
  - **Quando** informa a senha atual correta, uma nova senha válida e a confirmação idêntica, e confirma
  - **Então** o sistema atualiza a senha com sucesso e, ao fazer logout e novo login, apenas a nova senha é aceita.
- **Cenário 2 — Rejeição por senha atual incorreta:**
  - **Dado** um usuário autenticado na tela de Alterar Senha
  - **Quando** informa uma senha atual incorreta
  - **Então** o sistema impede a troca, exibe mensagem de erro e preserva a senha original.
- **Cenário 3 — Sessão de ponto ativa não é afetada:**
  - **Dado** um usuário com ponto aberto (`horario_saida IS NULL`)
  - **Quando** altera sua própria senha
  - **Então** a alteração é concluída sem pausar ou perder o registro de ponto em andamento.

### Checklist de Conclusão
- [ ] Acesso disponível no menu para ambos os perfis (`admin` e `worker`).
- [ ] Formulário exige **Senha atual**, **Nova senha** e **Confirmar nova senha** com opção de exibir/ocultar senha.
- [ ] Verificação obrigatória da senha atual no servidor antes de chamar `updateUser`.
- [ ] Validação de política mínima de senha e igualdade de confirmação no front-end e tratamento dos erros do Supabase Auth.
- [ ] Campos limpos após sucesso; senha nunca logada no console nem armazenada em `localStorage`.
- [ ] Layout responsivo testado em mobile e desktop.

---

## 9. Notas Técnicas e de UX

- **Atenção no Supabase Auth:** `supabase.auth.updateUser({ password })` sozinho não exige a senha atual se a sessão já estiver válida. Por isso, para cumprir rigorosamente `RF02` (*"informando a senha atual e a nova senha"*), a etapa de verificação da senha atual é obrigatória antes de invocar `updateUser` (via reautenticação com `signInWithPassword` usando o e-mail da sessão atual ou Edge Function dedicada).
- Nunca preencher nem pré-popular o campo de senha atual automaticamente.
