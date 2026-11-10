import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ordenarVereadoresRegimental, calcularQuorum } from '@/core/regimento';
import { registrarAuditoria } from '@/lib/auth';
import crypto from 'crypto';

function gerarCarimboPauta(itens: { id: number; numero: number; titulo: string; votavel: boolean; votacaoEtapa: string }[]) {
  const raw = itens
    .map((i) => `${i.id}:${i.numero}:${i.titulo}:${i.votavel}:${i.votacaoEtapa}`)
    .join('|');
  return crypto.createHash('md5').update(raw).digest('hex');
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessaoId = Number(id);
    const { searchParams } = new URL(req.url);
    const itemIdParam = searchParams.get('itemId');

    const [sessao, vereadoresRaw] = await Promise.all([
      prisma.sessao.findUnique({
        where: { id: sessaoId },
        include: {
          itens: {
            orderBy: { numero: 'asc' },
          },
        },
      }),
      prisma.vereador.findMany(),
    ]);

    if (!sessao) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
    }

    const vereadores = ordenarVereadoresRegimental(vereadoresRaw);
    const itens = sessao.itens;

    let itemAtual =
      itens.find((i) => i.id === Number(itemIdParam)) ||
      itens.find((i) => i.id === sessao.itemAtualId) ||
      itens[0] ||
      null;

    if (itemAtual && sessao.itemAtualId !== itemAtual.id) {
      await prisma.sessao.update({
        where: { id: sessaoId },
        data: { itemAtualId: itemAtual.id },
      });
    }

    const [presencas, votos] = itemAtual
      ? await Promise.all([
          prisma.presenca.findMany({ where: { pautaItemId: itemAtual.id } }),
          prisma.voto.findMany({ where: { pautaItemId: itemAtual.id } }),
        ])
      : [[], []];

    const carimbo = gerarCarimboPauta(itens);

    return NextResponse.json({
      sessao: {
        id: sessao.id,
        nome: sessao.nome,
        tipo: sessao.tipo,
        status: sessao.status,
        itemAtualId: itemAtual?.id || null,
      },
      itens,
      itemAtual,
      vereadores,
      presencas,
      votos,
      carimbo,
    });
  } catch (err) {
    console.error('Erro em GET /api/sessoes/[id]/deliberacao:', err);
    return NextResponse.json({ error: 'Erro ao carregar deliberação.' }, { status: 500 });
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

    if (acao === 'mudar_item') {
      const pautaItemId = Number(body.pautaItemId);
      await prisma.sessao.update({
        where: { id: sessaoId },
        data: { itemAtualId: pautaItemId, status: 'EM_ANDAMENTO' },
      });
      return NextResponse.json({ ok: true, itemAtualId: pautaItemId });
    }

    if (acao === 'salvar_chamada') {
      const pautaItemId = Number(body.pautaItemId);
      const marcacoes: Record<string, 'Presente' | 'Ausente'> = body.marcacoes || {};

      const ops = Object.entries(marcacoes).map(([verIdStr, status]) => {
        const vereadorId = Number(verIdStr);
        const st = status === 'Presente' ? 'Presente' : 'Ausente';
        return prisma.presenca.upsert({
          where: {
            pautaItemId_vereadorId: { pautaItemId, vereadorId },
          },
          update: { status: st },
          create: {
            sessaoId,
            pautaItemId,
            vereadorId,
            status: st,
          },
        });
      });

      await prisma.$transaction(ops);

      const vereadores = await prisma.vereador.findMany();
      const presentesCount = Object.values(marcacoes).filter((s) => s === 'Presente').length;
      const quorum = calcularQuorum(vereadores, presentesCount);

      await registrarAuditoria({
        acao: 'REGISTRAR_CHAMADA',
        entidade: 'PautaItem',
        entidadeId: pautaItemId,
        detalhes: `Presentes: ${presentesCount}/${quorum.totalAtivos} (Quórum: ${quorum.temQuorum ? 'Sim' : 'Não'})`,
      });

      return NextResponse.json({ ok: true, quorum });
    }

    if (acao === 'limpar_chamada') {
      const pautaItemId = Number(body.pautaItemId);
      await prisma.presenca.deleteMany({ where: { pautaItemId } });
      await registrarAuditoria({
        acao: 'LIMPAR_CHAMADA',
        entidade: 'PautaItem',
        entidadeId: pautaItemId,
      });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'salvar_votacao') {
      const pautaItemId = Number(body.pautaItemId);
      const votosInput: Record<
        string,
        { voto: string; justificar?: boolean }
      > = body.votos || {};

      await prisma.voto.deleteMany({ where: { pautaItemId } });

      const entradas = Object.entries(votosInput).filter(([, val]) => Boolean(val?.voto));
      for (const [verIdStr, val] of entradas) {
        await prisma.voto.create({
          data: {
            sessaoId,
            pautaItemId,
            vereadorId: Number(verIdStr),
            voto: val.voto,
            justificar: Boolean(val.justificar),
          },
        });
      }

      // Contabiliza resultado regimental
      let sim = 0;
      let nao = 0;
      let abstencao = 0;
      let ausente = 0;

      for (const [, val] of entradas) {
        if (val.voto === 'sim') sim++;
        else if (val.voto === 'nao') nao++;
        else if (val.voto === 'abstencao') abstencao++;
        else if (val.voto === 'ausente') ausente++;
      }

      let textoResultado = '';
      let aprovado = false;
      if (sim > nao) {
        aprovado = true;
        if (nao === 0 && abstencao === 0) {
          textoResultado = `APROVADO POR UNANIMIDADE (${sim} votos favoráveis).`;
        } else {
          textoResultado = `APROVADO por ${sim} voto(s) favorável(is) a ${nao} contrário(s)${
            abstencao > 0 ? ` e ${abstencao} abstenção(ões)` : ''
          }.`;
        }
      } else if (nao > sim) {
        aprovado = false;
        textoResultado = `REJEITADO por ${nao} voto(s) contrário(s) a ${sim} favorável(is)${
          abstencao > 0 ? ` e ${abstencao} abstenção(ões)` : ''
        }.`;
      } else {
        aprovado = false;
        textoResultado = `EMPATE na votação (${sim} favoráveis x ${nao} contrários). O voto de desempate do Presidente é requerido.`;
      }

      await registrarAuditoria({
        acao: 'SALVAR_VOTACAO',
        entidade: 'PautaItem',
        entidadeId: pautaItemId,
        detalhes: `${textoResultado} (Ausentes: ${ausente})`,
      });

      return NextResponse.json({
        ok: true,
        aprovado,
        placar: { sim, nao, abstencao, ausente },
        textoResultado,
      });
    }

    if (acao === 'finalizar_sessao') {
      await prisma.sessao.update({
        where: { id: sessaoId },
        data: { status: 'ENCERRADA' },
      });
      await registrarAuditoria({
        acao: 'FINALIZAR_SESSAO',
        entidade: 'Sessao',
        entidadeId: sessaoId,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (err) {
    console.error('Erro em POST /api/sessoes/[id]/deliberacao:', err);
    return NextResponse.json({ error: 'Erro ao processar deliberação.' }, { status: 500 });
  }
}
