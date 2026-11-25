import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isElegivelParaRevisaoIA } from '@/core/regimento';
import {
  extrairPaginasDoPdfLocal,
  revisarDocumentoPdfComIA,
} from '@/services/ia-leitura.service';
import { registrarAuditoria } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessaoId = Number(id);

    const [sessao, geminiCfg, openaiCfg] = await Promise.all([
      prisma.sessao.findUnique({
        where: { id: sessaoId },
        include: {
          itens: {
            orderBy: { numero: 'asc' },
          },
        },
      }),
      prisma.configuracao.findUnique({ where: { chave: 'gemini_key' } }),
      prisma.configuracao.findUnique({ where: { chave: 'openai_key' } }),
    ]);

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
      iaStatus: {
        geminiAtivo: Boolean((geminiCfg?.valor || process.env.GEMINI_API_KEY || '').trim()),
        openaiAtivo: Boolean((openaiCfg?.valor || process.env.OPENAI_API_KEY || '').trim()),
      },
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

    const [item, geminiCfg, openaiCfg] = await Promise.all([
      prisma.pautaItem.findUnique({ where: { id: pautaId } }),
      prisma.configuracao.findUnique({ where: { chave: 'gemini_key' } }),
      prisma.configuracao.findUnique({ where: { chave: 'openai_key' } }),
    ]);

    if (!item || item.sessaoId !== sessaoId) {
      return NextResponse.json({ error: 'Item não encontrado na sessão.' }, { status: 404 });
    }

    if (!item.pdfUrl) {
      return NextResponse.json({ error: 'Este item não possui PDF anexado.' }, { status: 400 });
    }

    const paginasExtraidas = await extrairPaginasDoPdfLocal(item.pdfUrl);
    const geminiKey = (geminiCfg?.valor || process.env.GEMINI_API_KEY || '').trim();
    const openaiKey = (openaiCfg?.valor || process.env.OPENAI_API_KEY || '').trim();

    const { paginas: paginasRevisadas, provedorIa } = await revisarDocumentoPdfComIA({
      paginasAtuais: paginasExtraidas,
      pdfUrl: item.pdfUrl,
      geminiKey,
      openaiKey,
    });

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
      detalhes: `Revisão em lote (${provedorIa}): ${item.titulo} (${paginasRevisadas.length} pág.)`,
    });

    return NextResponse.json({
      ok: true,
      paginasProcessadas: paginasRevisadas.length,
      provedorIa,
    });
  } catch (err) {
    console.error('Erro em POST /api/sessoes/[id]/revisar-lote:', err);
    return NextResponse.json(
      { error: 'Falha ao revisar documento com IA.' },
      { status: 500 }
    );
  }
}
