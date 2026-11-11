/**
 * Define/atualiza a senha do administrador (armazenada como hash scrypt).
 * Uso: ADMIN_PASSWORD='nova-senha' npx tsx scripts/set-admin-password.ts
 *      (opcional) ADMIN_USER='camara'
 */
import { PrismaClient } from '@prisma/client';
import { gerarHashSenha } from '../src/lib/senha';

const prisma = new PrismaClient();

async function main() {
  const senha = process.env.ADMIN_PASSWORD;
  const usuario = process.env.ADMIN_USER;
  if (!senha) {
    console.error('❌ Informe ADMIN_PASSWORD no ambiente.');
    process.exit(1);
  }

  await prisma.configuracao.upsert({
    where: { chave: 'senha_admin' },
    update: { valor: gerarHashSenha(senha) },
    create: { chave: 'senha_admin', valor: gerarHashSenha(senha) },
  });

  if (usuario) {
    await prisma.configuracao.upsert({
      where: { chave: 'usuario_admin' },
      update: { valor: usuario },
      create: { chave: 'usuario_admin', valor: usuario },
    });
  }

  await prisma.auditLog.create({
    data: {
      usuario: 'sistema',
      acao: 'ALTERAR_SENHA_ADMIN',
      entidade: 'Configuracao',
      detalhes: 'Senha do administrador redefinida via script',
    },
  });

  console.log('✅ Senha do administrador atualizada (hash scrypt).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
