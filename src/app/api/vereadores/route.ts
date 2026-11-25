import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ordenarVereadoresRegimental } from '@/core/regimento';
import { registrarAuditoria } from '@/lib/auth';

function mascararChave(chave: string): string {
  if (chave.length > 10) {
    return `${chave.slice(0, 7)}...${chave.slice(-4)}`;
  }
  return chave ? 'Configurada' : '';
}

export async function GET() {
  try {
    const [vereadoresRaw, openaiCfg, geminiCfg] = await Promise.all([
      prisma.vereador.findMany(),
      prisma.configuracao.findUnique({ where: { chave: 'openai_key' } }),
      prisma.configuracao.findUnique({ where: { chave: 'gemini_key' } }),
    ]);

    const vereadores = ordenarVereadoresRegimental(vereadoresRaw);
    const chaveOpenai = (openaiCfg?.valor || process.env.OPENAI_API_KEY || '').trim();
    const chaveGemini = (geminiCfg?.valor || process.env.GEMINI_API_KEY || '').trim();

    return NextResponse.json({
      vereadores,
      openaiConfigurada: Boolean(chaveOpenai),
      openaiMascarada: mascararChave(chaveOpenai),
      geminiConfigurada: Boolean(chaveGemini),
      geminiMascarada: mascararChave(chaveGemini),
    });
  } catch (err) {
    console.error('Erro ao listar vereadores:', err);
    return NextResponse.json({ error: 'Erro ao carregar vereadores.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const acao = String(body.acao || 'adicionar');

    if (acao === 'adicionar') {
      const nome = String(body.nome || '').trim();
      const tratamento = body.tratamento === 'Vereadora' ? 'Vereadora' : 'Vereador';
      if (!nome) {
        return NextResponse.json({ error: 'Informe o nome do vereador.' }, { status: 400 });
      }

      const novo = await prisma.vereador.create({
        data: { nome, tratamento },
      });

      await registrarAuditoria({
        acao: 'CRIAR_VEREADOR',
        entidade: 'Vereador',
        entidadeId: novo.id,
        detalhes: `${tratamento} ${nome}`,
      });

      return NextResponse.json({ ok: true, vereador: novo });
    }

    if (acao === 'definir_presidente') {
      const id = Number(body.id);
      await prisma.$transaction([
        prisma.vereador.updateMany({ data: { isPresidente: false } }),
        prisma.vereador.update({
          where: { id },
          data: { isPresidente: true, isLicenciado: false },
        }),
      ]);

      await registrarAuditoria({
        acao: 'DEFINIR_PRESIDENTE',
        entidade: 'Vereador',
        entidadeId: id,
      });

      return NextResponse.json({ ok: true });
    }

    if (acao === 'alternar_licenca') {
      const id = Number(body.id);
      const atual = await prisma.vereador.findUnique({ where: { id } });
      if (!atual) {
        return NextResponse.json({ error: 'Vereador não encontrado.' }, { status: 404 });
      }

      const atualizado = await prisma.vereador.update({
        where: { id },
        data: { isLicenciado: !atual.isLicenciado },
      });

      await registrarAuditoria({
        acao: 'ALTERNAR_LICENCA',
        entidade: 'Vereador',
        entidadeId: id,
        detalhes: `Licenciado: ${atualizado.isLicenciado}`,
      });

      return NextResponse.json({ ok: true, vereador: atualizado });
    }

    if (acao === 'editar') {
      const id = Number(body.id);
      const nome = String(body.nome || '').trim();
      const tratamento = body.tratamento === 'Vereadora' ? 'Vereadora' : 'Vereador';
      const atualizado = await prisma.vereador.update({
        where: { id },
        data: { nome, tratamento },
      });
      return NextResponse.json({ ok: true, vereador: atualizado });
    }

    if (acao === 'excluir') {
      const id = Number(body.id);
      await prisma.vereador.delete({ where: { id } });
      await registrarAuditoria({
        acao: 'EXCLUIR_VEREADOR',
        entidade: 'Vereador',
        entidadeId: id,
      });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'salvar_gemini') {
      const chave = String(body.chave || '').trim();
      await prisma.configuracao.upsert({
        where: { chave: 'gemini_key' },
        update: { valor: chave },
        create: { chave: 'gemini_key', valor: chave },
      });
      await registrarAuditoria({
        acao: 'ATUALIZAR_CHAVE_GEMINI',
        entidade: 'Configuracao',
        entidadeId: 'gemini_key',
      });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'testar_gemini') {
      const cfg = await prisma.configuracao.findUnique({ where: { chave: 'gemini_key' } });
      const chave = String(body.chave || cfg?.valor || process.env.GEMINI_API_KEY || '').trim();
      if (!chave) {
        return NextResponse.json(
          { ok: false, error: 'Nenhuma chave do Google Gemini informada.' },
          { status: 400 }
        );
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          chave
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Responda apenas OK' }] }],
          }),
        }
      );
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: `Chave rejeitada pelo Google Gemini (HTTP ${res.status}).` },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        message: 'Google Gemini 2.5 Flash validado! Leitura inteligente de PDFs, tabelas e textos tachados ativa.',
      });
    }

    if (acao === 'salvar_openai') {
      const chave = String(body.chave || '').trim();
      await prisma.configuracao.upsert({
        where: { chave: 'openai_key' },
        update: { valor: chave },
        create: { chave: 'openai_key', valor: chave },
      });
      await registrarAuditoria({
        acao: 'ATUALIZAR_CHAVE_OPENAI',
        entidade: 'Configuracao',
        entidadeId: 'openai_key',
      });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'testar_openai') {
      const cfg = await prisma.configuracao.findUnique({ where: { chave: 'openai_key' } });
      const chave = String(body.chave || cfg?.valor || '').trim();
      if (!chave) {
        return NextResponse.json(
          { ok: false, error: 'Nenhuma chave da OpenAI informada.' },
          { status: 400 }
        );
      }

      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${chave}` },
      });
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: `Chave rejeitada pela OpenAI (HTTP ${res.status}).` },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        message: 'Conexão com a OpenAI validada com sucesso (GPT + TTS ativos)!',
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (err) {
    console.error('Erro em POST /api/vereadores:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
