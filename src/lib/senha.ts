import crypto from 'crypto';

/**
 * Hash de senha com scrypt (nativo do Node, sem dependências).
 * Formato armazenado: `scrypt$<saltHex>$<hashHex>`.
 */
export function gerarHashSenha(senha: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Compara a senha informada com o valor armazenado (em tempo constante). */
export function verificarSenha(senha: string, armazenado: string): boolean {
  if (!armazenado) return false;

  if (armazenado.startsWith('scrypt$')) {
    const [, saltHex, hashHex] = armazenado.split('$');
    if (!saltHex || !hashHex) return false;
    const esperado = Buffer.from(hashHex, 'hex');
    const calculado = crypto.scryptSync(senha, Buffer.from(saltHex, 'hex'), esperado.length);
    return crypto.timingSafeEqual(esperado, calculado);
  }

  // Compatibilidade com bancos antigos (texto puro) — será migrado para hash no próximo login
  const a = Buffer.from(senha);
  const b = Buffer.from(armazenado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
