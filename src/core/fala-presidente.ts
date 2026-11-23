export type BlocoFalaPresidente =
  | { tipo: 'fala'; ordem: number; texto: string }
  | { tipo: 'pausa'; rotulo: string };

/**
 * Identifica itens de Deliberação de Regime de Urgência (Art. 51 LOM),
 * que seguem o mesmo rito simbólico da Deliberação da Ata (sem votação nominal).
 */
export function isDeliberacaoUrgencia(titulo: string): boolean {
  return /delibera[çc][ãa]o.*regime\s+de\s+urg[eê]ncia/i.test(titulo || '');
}

/**
 * Limpa e estrutura o texto que o Presidente lê em plenário:
 * - Remove o aviso legado "ESSE É O FIM DA PAUTA."
 * - Em itens de Leitura do Regimento Interno (ou quando há "Art. ..." após separador),
 *   remove o texto integral do artigo, mantendo apenas o que o Presidente lê.
 * - Em itens de Deliberação de Regime de Urgência já salvos no formato antigo (bloco único),
 *   completa automaticamente com a 1ª fala simbólica + pausa + 2ª fala (igual à Deliberação da Ata).
 * - Separa blocos divididos por traços ("-----") em falas distintas com um indicador
 *   claro de espera (ex.: "Aguarde a leitura da Servidora" ou "Aguarde a manifestação do Plenário").
 */
export function prepararFalaPresidente(
  titulo: string,
  ementa: string
): BlocoFalaPresidente[] {
  let texto = (ementa || titulo || '').trim();

  // 1. Remove "ESSE É O FIM DA PAUTA."
  texto = texto
    .replace(/\s*ESSE\s+[EÉ]\s+O\s+FIM\s+DA\s+PAUTA\.?\s*/gi, ' ')
    .replace(/\s+\./g, '.')
    .trim();

  // 2. Divide por separadores de traços (ex.: "--------------------")
  const partesBrutas = texto
    .split(/\r?\n\s*-{4,}\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (partesBrutas.length === 0) {
    return [];
  }

  // 3. Compatibilidade com sessões já salvas: Deliberação de Regime de Urgência sem separador
  if (isDeliberacaoUrgencia(titulo) && partesBrutas.length === 1) {
    const primeiraFala = /permane[çc]a/i.test(partesBrutas[0])
      ? partesBrutas[0]
      : `${partesBrutas[0]}\n\nQuem for favorável permaneça como estão.`;
    return [
      { tipo: 'fala', ordem: 1, texto: primeiraFala },
      { tipo: 'pausa', rotulo: 'Aguarde a manifestação do Plenário' },
      {
        tipo: 'fala',
        ordem: 2,
        texto: 'DECLARO o Regime de Urgência aprovado por unanimidade.',
      },
    ];
  }

  // 3. Se for Leitura do Regimento Interno ou a 2ª parte começar com "Art." / "Artigo",
  // remove o texto do artigo e deixa somente a fala do Presidente.
  const isRegimento = /regimento\s+interno/i.test(titulo || '');
  const partesFiltradas = partesBrutas.filter((parte, idx) => {
    if (idx === 0) return true;
    if (isRegimento) return false;
    if (/^(Art\.|Artigo)\s*\d+/i.test(parte)) return false;
    return true;
  });

  if (partesFiltradas.length === 1) {
    return [{ tipo: 'fala', ordem: 1, texto: partesFiltradas[0] }];
  }

  const blocos: BlocoFalaPresidente[] = [];
  partesFiltradas.forEach((parte, idx) => {
    blocos.push({ tipo: 'fala', ordem: idx + 1, texto: parte });

    if (idx < partesFiltradas.length - 1) {
      const rotulo = inferirRotuloPausa(titulo, parte);
      blocos.push({ tipo: 'pausa', rotulo });
    }
  });

  return blocos;
}

function inferirRotuloPausa(titulo: string, falaAnterior: string): string {
  if (/servidora/i.test(falaAnterior)) {
    return 'Aguarde a leitura da Servidora';
  }
  if (/servidor\b/i.test(falaAnterior)) {
    return 'Aguarde a leitura do Servidor';
  }
  if (/correspond[eê]ncia/i.test(titulo) || /leitura/i.test(falaAnterior)) {
    return 'Aguarde a conclusão da leitura';
  }
  if (/ata/i.test(titulo) || /delibera[çc][ãa]o|favor[aá]vel/i.test(falaAnterior)) {
    return 'Aguarde a manifestação do Plenário';
  }
  return 'Aguarde antes de ler a continuação';
}

/**
 * Remove "ESSE É O FIM DA PAUTA." de textos simples (como antes/depois de [CHAMADA]).
 */
export function limparTextoPresidente(texto: string): string {
  return (texto || '')
    .replace(/\s*ESSE\s+[EÉ]\s+O\s+FIM\s+DA\s+PAUTA\.?\s*/gi, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}
