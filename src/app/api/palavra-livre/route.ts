import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ordenarVereadoresRegimental } from '@/core/regimento';
import { registrarAuditoria } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessaoIdParam = Number(searchParams.get('sessaoId') || 0);

    const [sessoes, vereadoresRaw] = await Promise.all([
      prisma.sessao.findMany({
        orderBy: { id: 'desc' },
        select: { id: true, nome: true, status: true },
      }),
      prisma.vereador.findMany(),
    ]);

    const sessaoAtiva =
      sessoes.find((s) => s.id === sessaoIdParam) || sessoes[0] || null;

    const vereadores = ordenarVereadoresRegimental(vereadoresRaw);
    const registros = sessaoAtiva
      ? await prisma.palavraLivre.findMany({
          where: { sessaoId: sessaoAtiva.id },
          orderBy: { ordem: 'asc' },
        })
      : [];

    return NextResponse.json({
      sessoes,
      sessaoAtiva,
      vereadores,
      registros,
    });
  } catch (err) {
    console.error('Erro em GET /api/palavra-livre:', err);
    return NextResponse.json({ error: 'Erro ao carregar Espaço Regimental.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const acao = String(body.acao || 'salvar');
    const sessaoId = Number(body.sessaoId);

    if (!sessaoId) {
      return NextResponse.json({ error: 'Sessão não informada.' }, { status: 400 });
    }

    if (acao === 'salvar') {
      const inscritosIds: number[] = Array.isArray(body.inscritosIds)
        ? body.inscritosIds.map(Number)
        : [];

      const existentes = await prisma.palavraLivre.findMany({
        where: { sessaoId },
      });

      const vereadores = ordenarVereadoresRegimental(await prisma.vereador.findMany());

      let contadorOrdem = 1;
      for (const v of vereadores) {
        const vaiFalar = inscritosIds.includes(v.id);
        const jaExiste = existentes.find((e) => e.vereadorId === v.id);
        const ordem = vaiFalar ? contadorOrdem++ : 0;

        await prisma.palavraLivre.upsert({
          where: {
            sessaoId_vereadorId: { sessaoId, vereadorId: v.id },
          },
          update: {
            vaiFalar,
            ordem,
            status: vaiFalar ? jaExiste?.status || 'aguardando' : 'nao_inscrito',
          },
          create: {
            sessaoId,
            vereadorId: v.id,
            vaiFalar,
            ordem,
            status: vaiFalar ? 'aguardando' : 'nao_inscrito',
          },
        });
      }

      await registrarAuditoria({
        acao: 'SALVAR_PALAVRA_LIVRE',
        entidade: 'Sessao',
        entidadeId: sessaoId,
        detalhes: `${inscritosIds.length} vereadores inscritos no Espaço Regimental`,
      });

      return NextResponse.json({ ok: true });
    }

    if (acao === 'sortear_ordem') {
      const inscritosIds: number[] = Array.isArray(body.inscritosIds)
        ? body.inscritosIds.map(Number)
        : [];

      // Embaralhamento Fisher-Yates para sorteio justo em plenário
      const embaralhados = [...inscritosIds];
      for (let i = embaralhados.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [embaralhados[i], embaralhados[j]] = [embaralhados[j], embaralhados[i]];
      }

      await prisma.palavraLivre.deleteMany({ where: { sessaoId } });

      const vereadores = await prisma.vereador.findMany();
      for (const v of vereadores) {
        const pos = embaralhados.indexOf(v.id);
        const vaiFalar = pos !== -1;
        await prisma.palavraLivre.create({
          data: {
            sessaoId,
            vereadorId: v.id,
            vaiFalar,
            ordem: vaiFalar ? pos + 1 : 0,
            status: vaiFalar ? 'aguardando' : 'nao_inscrito',
          },
        });
      }

      await registrarAuditoria({
        acao: 'SORTEAR_PALAVRA_LIVRE',
        entidade: 'Sessao',
        entidadeId: sessaoId,
        detalhes: `Ordem sorteada para ${embaralhados.length} inscritos`,
      });

      return NextResponse.json({ ok: true });
    }

    if (acao === 'alterar_status') {
      const vereadorId = Number(body.vereadorId);
      const novoStatus = String(body.status || 'aguardando');

      if (novoStatus === 'falando') {
        // Se um vereador começa a falar, marca quem estava 'falando' antes como 'concluido'
        await prisma.palavraLivre.updateMany({
          where: { sessaoId, status: 'falando' },
          data: { status: 'concluido' },
        });
      }

      await prisma.palavraLivre.update({
        where: { sessaoId_vereadorId: { sessaoId, vereadorId } },
        data: { status: novoStatus },
      });

      return NextResponse.json({ ok: true });
    }

    if (acao === 'limpar') {
      await prisma.palavraLivre.deleteMany({ where: { sessaoId } });
      await registrarAuditoria({
        acao: 'LIMPAR_PALAVRA_LIVRE',
        entidade: 'Sessao',
        entidadeId: sessaoId,
      });
      return NextResponse.json({ ok: true });
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
    console.error('Erro em POST /api/palavra-livre:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
