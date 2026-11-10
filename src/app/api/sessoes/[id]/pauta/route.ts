import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { registrarAuditoria } from '@/lib/auth';
import { buscarOrdemDoDiaSapl, baixarEMesclarPdfsUrls } from '@/services/sapl.service';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessaoId = Number(id);

    const [sessao, outrasSessoes] = await Promise.all([
      prisma.sessao.findUnique({
        where: { id: sessaoId },
        include: {
          itens: {
            orderBy: { numero: 'asc' },
          },
          _count: {
            select: { votos: true, presencas: true },
          },
        },
      }),
      prisma.sessao.findMany({
        where: { id: { not: sessaoId } },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          nome: true,
          _count: { select: { itens: true } },
        },
      }),
    ]);

    if (!sessao) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
    }

    return NextResponse.json({ sessao, outrasSessoes });
  } catch (err) {
    console.error('Erro em GET /api/sessoes/[id]/pauta:', err);
    return NextResponse.json({ error: 'Erro ao carregar pauta.' }, { status: 500 });
  }
}

async function tocarPautaSessao(sessaoId: number) {
  await prisma.sessao.update({
    where: { id: sessaoId },
    data: { pautaUpdatedAt: new Date() },
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessaoId = Number(id);
    const contentType = req.headers.get('content-type') || '';

    // 1. Upload/Cadastro/Edição de Item via FormData (suporta anexo PDF)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const itemId = formData.get('itemId') ? Number(formData.get('itemId')) : null;
      const numero = Number(formData.get('numero') || 1);
      const titulo = String(formData.get('titulo') || '').trim();
      const ementa = String(formData.get('ementa') || '').trim();
      const tipoItem = String(formData.get('tipoItem') || 'Projeto de Lei Ordinária');
      const autor = String(formData.get('autor') || '').trim();
      const votacaoEtapa = String(formData.get('votacaoEtapa') || 'Primeira Votação');
      const votavel = String(formData.get('votavel') || 'sim') === 'sim';
      const removerPdf = String(formData.get('removerPdf') || '') === 'true';
      const pdfFile = formData.get('pdfAnexo') as File | null;

      if (!titulo) {
        return NextResponse.json({ error: 'O título do item é obrigatório.' }, { status: 400 });
      }

      let novoPdfUrl: string | undefined = undefined;
      if (removerPdf) {
        novoPdfUrl = '';
      }

      if (pdfFile && pdfFile.size > 0) {
        const dir = path.join(process.cwd(), 'public', 'uploads', 'pdfs');
        await fs.mkdir(dir, { recursive: true });
        const safeName = `pauta_s${sessaoId}_${Date.now()}_${pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const fullPath = path.join(dir, safeName);
        const bytes = Buffer.from(await pdfFile.arrayBuffer());
        await fs.writeFile(fullPath, bytes);
        novoPdfUrl = `/uploads/pdfs/${safeName}`;
      }

      if (itemId) {
        const atualizado = await prisma.pautaItem.update({
          where: { id: itemId },
          data: {
            numero,
            titulo,
            ementa,
            tipoItem,
            autor,
            votacaoEtapa: votavel ? votacaoEtapa : 'Não Votável',
            votavel,
            ...(novoPdfUrl !== undefined ? { pdfUrl: novoPdfUrl || null, jaRevisado: false } : {}),
          },
        });
        await tocarPautaSessao(sessaoId);
        await registrarAuditoria({
          acao: 'EDITAR_ITEM_PAUTA',
          entidade: 'PautaItem',
          entidadeId: itemId,
          detalhes: `${numero}. ${titulo}`,
        });
        return NextResponse.json({ ok: true, item: atualizado });
      } else {
        const criado = await prisma.pautaItem.create({
          data: {
            sessaoId,
            numero,
            titulo,
            ementa,
            tipoItem,
            autor,
            votacaoEtapa: votavel ? votacaoEtapa : 'Não Votável',
            votavel,
            pdfUrl: novoPdfUrl || null,
          },
        });
        await tocarPautaSessao(sessaoId);
        await registrarAuditoria({
          acao: 'CRIAR_ITEM_PAUTA',
          entidade: 'PautaItem',
          entidadeId: criado.id,
          detalhes: `${numero}. ${titulo}`,
        });
        return NextResponse.json({ ok: true, item: criado });
      }
    }

    // 2. Ações JSON
    const body = await req.json();
    const acao = String(body.acao || '');

    if (acao === 'reordenar') {
      const idsOrdenados: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : [];
      await prisma.$transaction(
        idsOrdenados.map((itemId, idx) =>
          prisma.pautaItem.update({
            where: { id: itemId },
            data: { numero: idx + 1 },
          })
        )
      );
      await tocarPautaSessao(sessaoId);
      await registrarAuditoria({
        acao: 'REORDENAR_PAUTA',
        entidade: 'Sessao',
        entidadeId: sessaoId,
        detalhes: `${idsOrdenados.length} itens reordenados`,
      });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'excluir_item') {
      const itemId = Number(body.itemId);
      await prisma.pautaItem.delete({ where: { id: itemId } });
      // Re-sequencia números
      const restantes = await prisma.pautaItem.findMany({
        where: { sessaoId },
        orderBy: { numero: 'asc' },
      });
      await prisma.$transaction(
        restantes.map((it, idx) =>
          prisma.pautaItem.update({
            where: { id: it.id },
            data: { numero: idx + 1 },
          })
        )
      );
      await tocarPautaSessao(sessaoId);
      await registrarAuditoria({
        acao: 'EXCLUIR_ITEM_PAUTA',
        entidade: 'PautaItem',
        entidadeId: itemId,
      });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'zerar_votos') {
      await prisma.$transaction([
        prisma.voto.deleteMany({ where: { sessaoId } }),
        prisma.presenca.deleteMany({ where: { sessaoId } }),
      ]);
      await registrarAuditoria({
        acao: 'ZERAR_VOTACOES_SESSAO',
        entidade: 'Sessao',
        entidadeId: sessaoId,
      });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'importar_local') {
      const pautaIds: number[] = Array.isArray(body.pautaIds)
        ? body.pautaIds.map(Number)
        : [];
      if (pautaIds.length === 0) {
        return NextResponse.json({ error: 'Selecione ao menos um item.' }, { status: 400 });
      }

      const itensOrigem = await prisma.pautaItem.findMany({
        where: { id: { in: pautaIds } },
        orderBy: { numero: 'asc' },
      });

      const ultimoItem = await prisma.pautaItem.findFirst({
        where: { sessaoId },
        orderBy: { numero: 'desc' },
      });
      let proximoNum = (ultimoItem?.numero || 0) + 1;

      for (const orig of itensOrigem) {
        await prisma.pautaItem.create({
          data: {
            sessaoId,
            numero: proximoNum++,
            titulo: orig.titulo,
            ementa: orig.ementa,
            tipoItem: orig.tipoItem,
            autor: orig.autor,
            votacaoEtapa: orig.votacaoEtapa,
            votavel: orig.votavel,
            pdfUrl: orig.pdfUrl,
            saplMateriaId: orig.saplMateriaId,
          },
        });
      }

      await tocarPautaSessao(sessaoId);
      await registrarAuditoria({
        acao: 'IMPORTAR_ITENS_SESSAO_LOCAL',
        entidade: 'Sessao',
        entidadeId: sessaoId,
        detalhes: `${itensOrigem.length} itens importados`,
      });
      return NextResponse.json({ ok: true, importados: itensOrigem.length });
    }

    if (acao === 'importar_sapl') {
      const saplSessaoId = Number(body.saplSessaoId);
      const materiaIds: number[] = Array.isArray(body.materiaIds)
        ? body.materiaIds.map(Number)
        : [];
      const modoPdf: 'texto' | 'mesclado' =
        body.modoPdf === 'mesclado' ? 'mesclado' : 'texto';

      const todosOrdemDia = await buscarOrdemDoDiaSapl(saplSessaoId);
      const selecionados =
        materiaIds.length > 0
          ? todosOrdemDia.filter((m) => materiaIds.includes(m.materiaId))
          : todosOrdemDia;

      const ultimoItem = await prisma.pautaItem.findFirst({
        where: { sessaoId },
        orderBy: { numero: 'desc' },
      });
      let proximoNum = (ultimoItem?.numero || 0) + 1;

      const votaveis = selecionados.filter((m) => !m.isIndicacao);
      const indicacoes = selecionados
        .filter((m) => m.isIndicacao)
        .sort((a, b) => a.numero - b.numero);

      let totalCriados = 0;

      for (const m of votaveis) {
        const urls =
          modoPdf === 'mesclado'
            ? [m.textoOriginalUrl, ...m.documentosAcessoriosUrls].filter(
                (u): u is string => Boolean(u)
              )
            : m.textoOriginalUrl
            ? [m.textoOriginalUrl]
            : [];

        const nomeArq = `sapl_s${sessaoId}_m${m.materiaId}_${Date.now()}.pdf`;
        const pdfUrlLocal =
          urls.length > 0 ? await baixarEMesclarPdfsUrls(urls, nomeArq) : null;

        await prisma.pautaItem.create({
          data: {
            sessaoId,
            numero: proximoNum++,
            titulo: m.titulo,
            ementa: m.ementa,
            tipoItem: m.tipo,
            autor: m.autor,
            votacaoEtapa: m.votacaoEtapaSugerida,
            votavel: true,
            pdfUrl: pdfUrlLocal,
            saplMateriaId: m.materiaId,
          },
        });
        totalCriados++;
      }

      if (indicacoes.length > 0) {
        const numMin = indicacoes[0].numero;
        const numMax = indicacoes[indicacoes.length - 1].numero;
        const anoInd = indicacoes[0].ano;
        const faixaTexto =
          indicacoes.length === 1
            ? `da Indicação ${numMin} de ${anoInd}`
            : `das Indicações ${numMin} a ${numMax} de ${anoInd}`;

        const urlsInd = indicacoes
          .map((i) => i.textoOriginalUrl)
          .filter((u): u is string => Boolean(u));
        const nomeArqInd = `indicacoes_s${sessaoId}_${Date.now()}.pdf`;
        const pdfIndLocal =
          urlsInd.length > 0
            ? await baixarEMesclarPdfsUrls(urlsInd, nomeArqInd)
            : null;

        await prisma.pautaItem.create({
          data: {
            sessaoId,
            numero: proximoNum++,
            titulo: 'Leitura das Indicações',
            ementa: `Solicito a Leitura ${faixaTexto}. ESSE É O FIM DA PAUTA.`,
            tipoItem: 'Indicação',
            autor: 'Diversos Vereadores',
            votacaoEtapa: 'Não Votável',
            votavel: false,
            pdfUrl: pdfIndLocal,
          },
        });
        totalCriados++;
      }

      await tocarPautaSessao(sessaoId);
      await registrarAuditoria({
        acao: 'IMPORTAR_ORDEM_DIA_SAPL',
        entidade: 'Sessao',
        entidadeId: sessaoId,
        detalhes: `${totalCriados} itens importados do SAPL (sessão #${saplSessaoId})`,
      });

      return NextResponse.json({ ok: true, importados: totalCriados });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (err) {
    console.error('Erro em POST /api/sessoes/[id]/pauta:', err);
    return NextResponse.json({ error: 'Erro interno ao atualizar pauta.' }, { status: 500 });
  }
}
