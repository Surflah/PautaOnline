import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSessionToken, SESSION_COOKIE_NAME, registrarAuditoria } from '@/lib/auth';
import { gerarHashSenha, verificarSenha } from '@/lib/senha';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const usuarioInput = String(body.usuario || '').trim();
    const senhaInput = String(body.senha || '').trim();

    const [cfgUser, cfgPass] = await Promise.all([
      prisma.configuracao.findUnique({ where: { chave: 'usuario_admin' } }),
      prisma.configuracao.findUnique({ where: { chave: 'senha_admin' } }),
    ]);

    const expectedUser = cfgUser?.valor || '';
    const storedPass = cfgPass?.valor || '';

    if (!expectedUser || !storedPass || usuarioInput !== expectedUser || !verificarSenha(senhaInput, storedPass)) {
      await registrarAuditoria({
        usuario: usuarioInput || '(vazio)',
        acao: 'LOGIN_FALHOU',
        entidade: 'Autenticacao',
        detalhes: 'Tentativa de login com credenciais inválidas',
      }).catch(() => {});
      return NextResponse.json(
        { error: 'Usuário ou senha incorretos.' },
        { status: 401 }
      );
    }

    // Migra senha legada em texto puro para hash scrypt
    if (!storedPass.startsWith('scrypt$')) {
      await prisma.configuracao.update({
        where: { chave: 'senha_admin' },
        data: { valor: gerarHashSenha(senhaInput) },
      });
    }

    const token = await createSessionToken({
      usuario: usuarioInput,
      role: 'ADMIN',
    });

    await registrarAuditoria({
      usuario: usuarioInput,
      acao: 'LOGIN',
      entidade: 'Autenticacao',
      detalhes: 'Login realizado com sucesso no PautaOnline',
    });

    const res = NextResponse.json({ ok: true, usuario: usuarioInput });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.headers.get('x-forwarded-proto') === 'https',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 dias
    });
    return res;
  } catch (err) {
    console.error('Erro no login:', err);
    return NextResponse.json({ error: 'Erro interno no servidor.' }, { status: 500 });
  }
}
