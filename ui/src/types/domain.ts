export type PerfilNome = 'admin' | 'worker';

export interface Perfil {
  id: string;
  nome: PerfilNome;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil_id: string;
  perfil?: PerfilNome;
  ativo: boolean;
  inativado_em: string | null;
  criado_em: string;
}

export interface Projeto {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  inativado_em: string | null;
  criado_em: string;
}

export interface UsuarioProjeto {
  usuario_id: string;
  projeto_id: string;
}

export interface RegistroPonto {
  id: string;
  usuario_id: string;
  projeto_id: string;
  horario_entrada: string;
  horario_saida: string | null;
  observacoes: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
  excluido_em: string | null;
  excluido_por: string | null;
}
