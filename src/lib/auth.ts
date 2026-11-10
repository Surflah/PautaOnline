import { cookies } from 'next/headers';
import { prisma } from './prisma';
import {
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE_NAME,
  SessionPayload,
} from './jwt';

export { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME };
export type { SessionPayload };

export async function getSessionUser(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}

export async function registrarAuditoria(params: {
  usuario?: string;
  acao: string;
  entidade: string;
  entidadeId?: string | number;
  detalhes?: string;
}) {
  try {
    const sess = await getSessionUser();
    await prisma.auditLog.create({
      data: {
        usuario: params.usuario || sess?.usuario || 'sistema',
        acao: params.acao,
        entidade: params.entidade,
        entidadeId: params.entidadeId != null ? String(params.entidadeId) : null,
        detalhes: params.detalhes || null,
      },
    });
  } catch (err) {
    console.error('Erro ao gravar log de auditoria:', err);
  }
}
