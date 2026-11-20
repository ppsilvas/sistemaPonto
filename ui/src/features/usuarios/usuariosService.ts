import type { SupabaseClient } from '@supabase/supabase-js';
import type { PerfilNome, Projeto, Usuario } from '../../types/domain';

export interface ProjetoResumo {
  id: string;
  nome: string;
}

export interface UsuarioListItem extends Usuario {
  perfil: PerfilNome;
  projetos_vinculados: ProjetoResumo[];
}

export interface CreateUsuarioInput {
  nome: string;
  email: string;
  password: string;
  perfil: PerfilNome;
  projetoIds: string[];
}

interface UsuarioQueryRow {
  id: string;
  nome: string;
  email: string;
  perfil_id: string;
  ativo: boolean;
  inativado_em: string | null;
  criado_em: string;
  perfis: { nome: PerfilNome } | Array<{ nome: PerfilNome }> | null;
  usuario_projetos?: Array<{
    projetos: ProjetoResumo | Array<ProjetoResumo> | null;
  }>;
}

function extractPerfilNome(perfis: UsuarioQueryRow['perfis']): PerfilNome {
  if (Array.isArray(perfis)) {
    return perfis[0]?.nome ?? 'worker';
  }
  return perfis?.nome ?? 'worker';
}

function extractProjetos(
  links: UsuarioQueryRow['usuario_projetos'],
): ProjetoResumo[] {
  if (!links) return [];
  const items: ProjetoResumo[] = [];
  for (const link of links) {
    if (!link.projetos) continue;
    if (Array.isArray(link.projetos)) {
      items.push(...link.projetos);
    } else {
      items.push(link.projetos);
    }
  }
  return items;
}

export async function listUsuarios(
  client: SupabaseClient,
): Promise<UsuarioListItem[]> {
  const { data, error } = await client
    .from('usuarios')
    .select(
      'id, nome, email, perfil_id, ativo, inativado_em, criado_em, perfis(nome), usuario_projetos(projetos(id, nome))',
    )
    .order('criado_em', { ascending: false });

  if (error) {
    throw new Error('Não foi possível carregar os usuários.');
  }

  return ((data ?? []) as UsuarioQueryRow[]).map((row) => ({
    id: row.id,
    nome: row.nome,
    email: row.email,
    perfil_id: row.perfil_id,
    perfil: extractPerfilNome(row.perfis),
    ativo: row.ativo,
    inativado_em: row.inativado_em,
    criado_em: row.criado_em,
    projetos_vinculados: extractProjetos(row.usuario_projetos),
  }));
}

export async function listProjetosAtivos(
  client: SupabaseClient,
): Promise<Projeto[]> {
  const { data, error } = await client
    .from('projetos')
    .select('id, nome, descricao, ativo, inativado_em, criado_em')
    .eq('ativo', true)
    .order('nome', { ascending: true });

  if (error) {
    throw new Error('Não foi possível carregar os projetos ativos.');
  }

  return (data ?? []) as Projeto[];
}

export async function createUsuario(
  client: SupabaseClient,
  input: CreateUsuarioInput,
): Promise<Usuario> {
  const { data, error } = await client.functions.invoke<Usuario>(
    'admin-create-user',
    {
      body: {
        nome: input.nome.trim(),
        email: input.email.trim().toLowerCase(),
        password: input.password,
        perfil: input.perfil,
        projetoIds: input.projetoIds,
      },
    },
  );

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = (await context.json()) as { error?: string };
        if (body.error) {
          throw new Error(body.error);
        }
      } catch (inner) {
        if (inner instanceof Error && inner.message !== 'Unexpected end of JSON input') {
          throw inner;
        }
      }
    }
    throw new Error(error.message || 'Não foi possível cadastrar o usuário.');
  }

  if (!data) {
    throw new Error('Resposta vazia ao cadastrar usuário.');
  }

  return data;
}

export function generateStrongPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;

  const chars = [
    upper[Math.floor(Math.random() * upper.length)]!,
    lower[Math.floor(Math.random() * lower.length)]!,
    digits[Math.floor(Math.random() * digits.length)]!,
    symbols[Math.floor(Math.random() * symbols.length)]!,
  ];

  for (let i = chars.length; i < length; i += 1) {
    chars.push(all[Math.floor(Math.random() * all.length)]!);
  }

  return chars.sort(() => Math.random() - 0.5).join('');
}
