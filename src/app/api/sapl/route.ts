import { NextRequest, NextResponse } from 'next/server';
import {
  listarSessoesSapl,
  buscarArtigoRegimento,
  buscarOrdemDoDiaSapl,
  baixarEMesclarPdfsUrls,
} from '@/services/sapl.service';
import { montarPreviaCompletaSapl, ItemPreviaRito } from '@/services/rito.service';
import { prisma } from '@/lib/prisma';
import { registrarAuditoria } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const acao = searchParams.get('acao') || 'sessoes';

    if (acao === 'sessoes') {
      const sessoes = await listarSessoesSapl(20);
      return NextResponse.json({ sessoes });
    }

    if (acao === 'artigo') {
      const numero = Number(searchParams.get('numero') || 1);
      const texto = await buscarArtigoRegimento(numero);
      return NextResponse.json({ numero, texto });
    }

    if (acao === 'ordem_do_dia') {
      const sessaoId = Number(searchParams.get('sessaoId'));
      if (!sessaoId) {
        return NextResponse.json({ error: 'sessaoId obrigatório' }, { status: 400 });
      }
      const itens = await buscarOrdemDoDiaSapl(sessaoId);
      return NextResponse.json({ itens });
    }

    return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  } catch (err) {
    console.error('Erro em GET /api/sapl:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao consultar SAPL' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const acao = String(body.acao || 'previa');

    if (acao === 'previa') {
      const resultado = await montarPreviaCompletaSapl({
        saplSessaoId: Number(body.saplSessaoId),
        nomeSessao: String(body.nomeSessao || 'Sessão Ordinária'),
        artigoRi: Number(body.artigoRi || 127),
        nomeServidor: String(body.nomeServidor || 'Patrícia'),
        tratamentoServidor: body.tratamentoServidor === 'Servidor' ? 'Servidor' : 'Servidora',
        numeroAtaAnterior: String(body.numeroAtaAnterior || '96'),
        anoAtaAnterior: String(body.anoAtaAnterior || new Date().getFullYear()),
        sessaoAnteriorNome: String(body.sessaoAnteriorNome || 'Reunião Ordinária anterior'),
        modoPdf: body.modoPdf === 'mesclado' ? 'mesclado' : 'texto',
        urgenciasForcadasIds: Array.isArray(body.urgenciasForcadasIds)
          ? body.urgenciasForcadasIds.map(Number)
          : undefined,
      });

      return NextResponse.json(resultado);
    }

    if (acao === 'gravar_sessao') {
      const nomeSessao = String(body.nomeSessao || '').trim();
      const saplSessaoId = body.saplSessaoId ? Number(body.saplSessaoId) : null;
      const itensPrevia: ItemPreviaRito[] = Array.isArray(body.itensPrevia)
        ? body.itensPrevia
        : [];

      if (!nomeSessao || itensPrevia.length === 0) {
        return NextResponse.json(
          { error: 'Nome da sessão e itens da prévia são obrigatórios.' },
          { status: 400 }
        );
      }

      const novaSessao = await prisma.sessao.create({
        data: {
          nome: nomeSessao,
          saplSessaoId,
          tipo: nomeSessao.toLowerCase().includes('comiss') ? 'Comissão' : 'Ordinária',
        },
      });

      let primeiroItemId: number | null = null;

      for (let idx = 0; idx < itensPrevia.length; idx++) {
        const item = itensPrevia[idx];
        let pdfUrlLocal: string | null = null;

        if (item.pdfUrlsParaBaixar && item.pdfUrlsParaBaixar.length > 0) {
          const nomeArq = `sessao_${novaSessao.id}_item_${idx + 1}_${Date.now()}.pdf`;
          pdfUrlLocal = await baixarEMesclarPdfsUrls(item.pdfUrlsParaBaixar, nomeArq);
        }

        const criado = await prisma.pautaItem.create({
          data: {
            sessaoId: novaSessao.id,
            numero: idx + 1,
            titulo: item.titulo,
            ementa: item.ementa || '',
            tipoItem: item.tipoItem || 'Proposição',
            autor: item.autor || '',
            votacaoEtapa: item.votacaoEtapa || (item.votavel ? 'Primeira Votação' : 'Não Votável'),
            votavel: Boolean(item.votavel),
            pdfUrl: pdfUrlLocal,
            saplMateriaId: item.saplMateriaId ? Number(item.saplMateriaId) : null,
          },
        });

        if (idx === 0) {
          primeiroItemId = criado.id;
        }
      }

      if (primeiroItemId) {
        await prisma.sessao.update({
          where: { id: novaSessao.id },
          data: { itemAtualId: primeiroItemId },
        });
      }

      await registrarAuditoria({
        acao: 'MONTAR_PAUTA_SAPL',
        entidade: 'Sessao',
        entidadeId: novaSessao.id,
        detalhes: `Sessão '${nomeSessao}' montada do SAPL com ${itensPrevia.length} itens.`,
      });

      return NextResponse.json({ ok: true, sessaoId: novaSessao.id });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (err) {
    console.error('Erro em POST /api/sapl:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao processar integração SAPL' },
      { status: 500 }
    );
  }
}
