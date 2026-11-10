import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isElegivelParaRevisaoIA } from '@/core/regimento';
import {
  extrairPaginasDoPdfLocal,
  revisarPaginaComIA,
} from '@/services/ia-leitura.service';
import { registrarAuditoria } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessaoId = Number(id);

    const sessao = await prisma.sessao.findUnique({
      where: { id: sessaoId },
      include: {
        itens: {
          orderBy: { numero: 'asc' },
        },
      },
    });

    if (!sessao) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
    }

    const itensMapeados = sessao.itens.map((it) => {
      const elegivelBase = isElegivelParaRevisaoIA(it);
      const elegivel = elegivelBase && !it.jaRevisado;

      let motivo = 'Entra na fila de revisão com IA';
      if (it.jaRevisado) {
        motivo = '✓ Leitura já revisada';
      } else if (!it.votavel) {
        motivo = 'Item não-votável (Rito / Expediente / Indicações)';
      } else if (!it.pdfUrl) {
        motivo = 'Sem arquivo PDF anexado';
      } else if (it.votacaoEtapa === 'Segunda Votação') {
        motivo = 'Em Segunda Votação (já foi lido na 1ª votação)';
      }

      return {
        id: it.id,
        numero: it.numero,
        titulo: it.titulo,
        votacaoEtapa: it.votacaoEtapa,
        votavel: it.votavel,
        pdfUrl: it.pdfUrl,
        jaRevisado: it.jaRevisado,
        elegivel,
        elegivelForcado: Boolean(it.pdfUrl),
        motivo,
      };
    });

    return NextResponse.json({
      sessao: { id: sessao.id, nome: sessao.nome },
      itens: itensMapeados,
    });
  } catch (err) {
    console.error('Erro em GET /api/sessoes/[id]/revisar-lote:', err);
    return NextResponse.json({ error: 'Erro ao listar fila de revisão.' }, { status: 500 });
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
    const pautaId = Number(body.pautaId);

    const [item, openaiCfg] = await Promise.all([
      prisma.pautaItem.findUnique({ where: { id: pautaId } }),
      prisma.configuracao.findUnique({ where: { chave: 'openai_key' } }),
    ]);

    if (!item || item.sessaoId !== sessaoId) {
      return NextResponse.json({ error: 'Item não encontrado na sessão.' }, { status: 404 });
    }

    if (!item.pdfUrl) {
      return NextResponse.json({ error: 'Este item não possui PDF anexado.' }, { status: 400 });
    }

    const paginasExtraidas = await extrairPaginasDoPdfLocal(item.pdfUrl);
    const chaveOpenai = openaiCfg?.valor || '';

    const paginasRevisadas = [];
    for (const p of paginasExtraidas) {
      if (p.pular) {
        paginasRevisadas.push(p);
      } else {
        const textoLimpo = await revisarPaginaComIA(p.texto, chaveOpenai);
        paginasRevisadas.push({
          ...p,
          texto: textoLimpo,
        });
      }
    }

    await prisma.pautaItem.update({
      where: { id: pautaId },
      data: {
        paginasRevisadasJson: JSON.stringify(paginasRevisadas),
        jaRevisado: true,
      },
    });

    await registrarAuditoria({
      acao: 'REVISAR_LEITURA_IA',
      entidade: 'PautaItem',
      entidadeId: pautaId,
      detalhes: `${paginasRevisadas.length} páginas revisadas para '${item.titulo}'`,
    });

    return NextResponse.json({
      ok: true,
      pautaId,
      totalPaginas: paginasRevisadas.length,
    });
  } catch (err) {
    console.error('Erro em POST /api/sessoes/[id]/revisar-lote:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao revisar PDF com IA.' },
      { status: 500 }
    );
  }
}
