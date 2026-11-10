import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessaoId = Number(id);

    const sessao = await prisma.sessao.findUnique({
      where: { id: sessaoId },
      select: {
        id: true,
        nome: true,
        leituraEstadoJson: true,
      },
    });

    if (!sessao) {
      return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 });
    }

    let estado = null;
    if (sessao.leituraEstadoJson) {
      try {
        estado = JSON.parse(sessao.leituraEstadoJson);
      } catch {
        estado = null;
      }
    }

    return NextResponse.json({
      sessaoId: sessao.id,
      sessaoNome: sessao.nome,
      estado,
    });
  } catch (err) {
    console.error('Erro em GET /api/sessoes/[id]/leitura-sync:', err);
    return NextResponse.json({ error: 'Erro ao sincronizar leitura' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessaoId = Number(id);
    const body = await req.json();

    const payload = {
      pautaId: Number(body.pautaId || 0),
      titulo: String(body.titulo || ''),
      autor: String(body.autor || ''),
      etapa: String(body.etapa || ''),
      pdfUrl: body.pdfUrl ? String(body.pdfUrl) : null,
      pagina: Number(body.pagina || 1),
      scrollRatio: Number(body.scrollRatio || 0),
      scrollY: Number(body.scrollY || 0),
      maxScroll: Number(body.maxScroll || 0),
      audioUrl: body.audioUrl ? String(body.audioUrl) : null,
      isPlaying: Boolean(body.isPlaying),
      currentTime: Number(body.currentTime || 0),
      playbackRate: Number(body.playbackRate || 1.15),
      updatedAt: Date.now(),
    };

    await prisma.sessao.update({
      where: { id: sessaoId },
      data: {
        leituraEstadoJson: JSON.stringify(payload),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Erro em POST /api/sessoes/[id]/leitura-sync:', err);
    return NextResponse.json({ error: 'Erro ao gravar sync de leitura' }, { status: 500 });
  }
}
