import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  extrairPaginasDoPdfLocal,
  revisarDocumentoPdfComIA,
  gerarAudioTtsPagina,
  PaginaRoteiroLeitura,
  VOZES_TTS_DISPONIVEIS,
  VOZ_PADRAO,
} from '@/services/ia-leitura.service';
import { registrarAuditoria } from '@/lib/auth';

async function obterChavesIa() {
  const [geminiCfg, openaiCfg] = await Promise.all([
    prisma.configuracao.findUnique({ where: { chave: 'gemini_key' } }),
    prisma.configuracao.findUnique({ where: { chave: 'openai_key' } }),
  ]);
  const geminiKey = (geminiCfg?.valor || process.env.GEMINI_API_KEY || '').trim();
  const openaiKey = (openaiCfg?.valor || process.env.OPENAI_API_KEY || '').trim();
  return { geminiKey, openaiKey };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessaoId = Number(id);
    const { searchParams } = new URL(req.url);
    const pautaIdParam = Number(searchParams.get('pautaId') || 0);
    const ignoreCache = searchParams.get('ignoreCache') === '1';

    if (pautaIdParam) {
      const item = await prisma.pautaItem.findUnique({
        where: { id: pautaIdParam },
      });

      if (!item || item.sessaoId !== sessaoId) {
        return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 });
      }

      if (!ignoreCache && item.paginasRevisadasJson) {
        try {
          const parsed = JSON.parse(item.paginasRevisadasJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return NextResponse.json({
              item,
              paginas: parsed,
              origem: 'cache_revisado',
            });
          }
        } catch {
          // Segue para extração do PDF
        }
      }

      if (item.pdfUrl) {
        const paginasPdf = await extrairPaginasDoPdfLocal(item.pdfUrl);
        return NextResponse.json({
          item,
          paginas: paginasPdf,
          origem: 'pdf_original',
        });
      }

      const paginasEmenta: PaginaRoteiroLeitura[] = [
        {
          pagina_real: 1,
          texto: item.ementa || item.titulo,
          pular: false,
          audio_url: null,
        },
      ];
      return NextResponse.json({
        item,
        paginas: paginasEmenta,
        origem: 'ementa',
      });
    }

    const [sessao, chaves] = await Promise.all([
      prisma.sessao.findUnique({
        where: { id: sessaoId },
        include: {
          itens: {
            orderBy: { numero: 'asc' },
          },
        },
      }),
      obterChavesIa(),
    ]);

    if (!sessao) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
    }

    return NextResponse.json({
      sessao: {
        id: sessao.id,
        nome: sessao.nome,
      },
      itens: sessao.itens,
      vozes: VOZES_TTS_DISPONIVEIS,
      iaStatus: {
        geminiAtivo: Boolean(chaves.geminiKey),
        openaiAtivo: Boolean(chaves.openaiKey),
      },
    });
  } catch (err) {
    console.error('Erro em GET /api/sessoes/[id]/leitura:', err);
    return NextResponse.json({ error: 'Erro ao carregar dados de leitura.' }, { status: 500 });
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
    const acao = String(body.acao || '');

    const { geminiKey, openaiKey } = await obterChavesIa();

    if (acao === 'revisar_ia') {
      const pautaId = Number(body.pautaId || 0);
      const paginas: PaginaRoteiroLeitura[] = Array.isArray(body.paginas)
        ? body.paginas
        : [];

      const item = pautaId
        ? await prisma.pautaItem.findUnique({ where: { id: pautaId } })
        : null;

      const { paginas: revisadas, provedorIa } = await revisarDocumentoPdfComIA({
        paginasAtuais: paginas,
        pdfUrl: item?.pdfUrl || null,
        geminiKey,
        openaiKey,
      });

      return NextResponse.json({
        ok: true,
        paginas: revisadas,
        provedorIa,
      });
    }

    if (acao === 'salvar_roteiro') {
      const pautaId = Number(body.pautaId);
      const paginas: PaginaRoteiroLeitura[] = Array.isArray(body.paginas)
        ? body.paginas.map((p: PaginaRoteiroLeitura) => ({
            pagina_real: Number(p.pagina_real),
            texto: String(p.texto || '').trim(),
            pular: Boolean(p.pular),
            audio_url: null, // invalida sempre audio_url antigo ao salvar edição
          }))
        : [];

      await prisma.pautaItem.update({
        where: { id: pautaId },
        data: {
          paginasRevisadasJson: JSON.stringify(paginas),
          jaRevisado: true,
        },
      });

      await registrarAuditoria({
        acao: 'SALVAR_ROTEIRO_LEITURA',
        entidade: 'PautaItem',
        entidadeId: pautaId,
        detalhes: `${paginas.length} páginas salvas no roteiro de leitura (Sessão #${sessaoId})`,
      });

      return NextResponse.json({ ok: true, paginas });
    }

    if (acao === 'gerar_audio') {
      const pautaId = Number(body.pautaId);
      const pagina = Number(body.pagina || 1);
      const texto = String(body.texto || '').trim();
      const voz = String(body.voz || VOZ_PADRAO);

      const { audioUrl, provedor, vozUsada, mapaTempo } = await gerarAudioTtsPagina({
        pautaId,
        pagina,
        texto,
        voz,
        openaiKey,
      });

      const item = await prisma.pautaItem.findUnique({ where: { id: pautaId } });
      if (item?.paginasRevisadasJson) {
        try {
          const pags: PaginaRoteiroLeitura[] = JSON.parse(item.paginasRevisadasJson);
          const atualizadas = pags.map((p) =>
            p.pagina_real === pagina ? { ...p, audio_url: audioUrl } : p
          );
          await prisma.pautaItem.update({
            where: { id: pautaId },
            data: { paginasRevisadasJson: JSON.stringify(atualizadas) },
          });
        } catch {
          // Ignora se JSON inválido
        }
      }

      return NextResponse.json({
        ok: true,
        audioUrl,
        provedor,
        vozUsada,
        mapaTempo,
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (err) {
    console.error('Erro em POST /api/sessoes/[id]/leitura:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao processar leitura.' },
      { status: 500 }
    );
  }
}
