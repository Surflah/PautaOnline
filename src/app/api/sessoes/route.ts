import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { registrarAuditoria } from '@/lib/auth';

export async function GET() {
  try {
    const sessoes = await prisma.sessao.findMany({
      orderBy: { id: 'desc' },
      include: {
        _count: {
          select: { itens: true, votos: true },
        },
      },
    });
    return NextResponse.json({ sessoes });
  } catch (err) {
    console.error('Erro ao listar sessões:', err);
    return NextResponse.json({ error: 'Erro ao listar sessões.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const acao = String(body.acao || 'criar');

    if (acao === 'criar') {
      const nome = String(body.nome || '').trim();
      const tipo = String(body.tipo || 'Ordinária').trim();
      if (!nome) {
        return NextResponse.json({ error: 'Informe o nome da sessão.' }, { status: 400 });
      }

      const nova = await prisma.sessao.create({
        data: { nome, tipo },
      });

      await registrarAuditoria({
        acao: 'CRIAR_SESSAO_MANUAL',
        entidade: 'Sessao',
        entidadeId: nova.id,
        detalhes: nome,
      });

      return NextResponse.json({ ok: true, sessao: nova });
    }

    if (acao === 'excluir') {
      const id = Number(body.id);
      await prisma.sessao.delete({ where: { id } });
      await registrarAuditoria({
        acao: 'EXCLUIR_SESSAO',
        entidade: 'Sessao',
        entidadeId: id,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (err) {
    console.error('Erro em POST /api/sessoes:', err);
    return NextResponse.json({ error: 'Erro ao processar sessão.' }, { status: 500 });
  }
}
