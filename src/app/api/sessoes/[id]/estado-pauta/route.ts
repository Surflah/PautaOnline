import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessaoId = Number(id);
    const { searchParams } = new URL(req.url);
    const itemAtualIdParam = Number(searchParams.get('itemAtualId') || 0);

    const sessao = await prisma.sessao.findUnique({
      where: { id: sessaoId },
      include: {
        itens: {
          orderBy: { numero: 'asc' },
          select: {
            id: true,
            numero: true,
            titulo: true,
            votavel: true,
            votacaoEtapa: true,
          },
        },
      },
    });

    if (!sessao) {
      return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 });
    }

    const raw = sessao.itens
      .map((i) => `${i.id}:${i.numero}:${i.titulo}:${i.votavel}:${i.votacaoEtapa}`)
      .join('|');
    const carimbo = crypto.createHash('md5').update(raw).digest('hex');

    const alvoId = itemAtualIdParam || sessao.itemAtualId || sessao.itens[0]?.id;
    const idxAtual = sessao.itens.findIndex((i) => i.id === alvoId);
    const itemAtual = idxAtual >= 0 ? sessao.itens[idxAtual] : sessao.itens[0] || null;
    const proximoItem =
      idxAtual >= 0 && idxAtual + 1 < sessao.itens.length
        ? sessao.itens[idxAtual + 1]
        : null;

    return NextResponse.json({
      carimbo,
      atualTitulo: itemAtual ? `${itemAtual.numero}. ${itemAtual.titulo}` : '',
      proximoTitulo: proximoItem ? `${proximoItem.numero}. ${proximoItem.titulo}` : '',
    });
  } catch (err) {
    console.error('Erro em GET /api/sessoes/[id]/estado-pauta:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
