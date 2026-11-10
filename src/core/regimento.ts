export const TIPOS_MATERIA_OFICIAIS = [
  'Projeto de Lei Ordinária',
  'Projeto de Lei Complementar',
  'Projeto de Lei Substitutivo',
  'Projeto de Resolução',
  'Proposta de Emenda a Lei Orgânica',
  'Projeto de Decreto Legislativo',
  'Requerimento',
  'Indicação',
  'Moção',
  'Emenda Legislativa',
  'Subemenda legislativa',
  'Veto Parcial ou Total',
  'Denúncia de Infração Político-Administrativa',
  'Rito / Expediente',
] as const;

export const ETAPAS_VOTACAO = [
  'Primeira Votação',
  'Segunda Votação',
  'Única Votação',
  'Não Votável',
] as const;

export interface VereadorRegimental {
  id: number;
  nome: string;
  tratamento: string;
  isPresidente: boolean;
  isLicenciado: boolean;
}

/**
 * Ordena vereadores em ordem alfabética, garantindo que o Presidente fique sempre por último.
 */
export function ordenarVereadoresRegimental<T extends { nome: string; isPresidente: boolean }>(
  vereadores: T[]
): T[] {
  return [...vereadores].sort((a, b) => {
    if (a.isPresidente && !b.isPresidente) return 1;
    if (!a.isPresidente && b.isPresidente) return -1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

/**
 * Calcula o quórum regimental (maioria absoluta dos vereadores ativos/não licenciados):
 * floor(totalAtivos / 2) + 1
 */
export function calcularQuorum(
  vereadores: { isLicenciado: boolean }[],
  presentesCount: number
): {
  totalAtivos: number;
  minimoQuorum: number;
  temQuorum: boolean;
} {
  const totalAtivos = vereadores.filter((v) => !v.isLicenciado).length;
  const minimoQuorum = Math.floor(totalAtivos / 2) + 1;
  return {
    totalAtivos,
    minimoQuorum,
    temQuorum: presentesCount >= minimoQuorum,
  };
}

/**
 * Verifica se o Presidente deve votar na matéria:
 * - Em Projeto de Lei Complementar, o Presidente vota sempre (maioria absoluta regimental).
 * - Nas demais matérias, o Presidente só vota em caso de empate.
 */
export function verificarVotoPresidente(params: {
  tipoItem: string;
  votosFavoraveis: number;
  votosContrarios: number;
}): {
  presidentePodeVotar: boolean;
  motivo: 'LEI_COMPLEMENTAR' | 'EMPATE' | 'BLOQUEADO_REGIMENTO';
} {
  const isComplementar = params.tipoItem
    .toLowerCase()
    .includes('projeto de lei complementar');
  if (isComplementar) {
    return { presidentePodeVotar: true, motivo: 'LEI_COMPLEMENTAR' };
  }
  if (
    params.votosFavoraveis > 0 &&
    params.votosFavoraveis === params.votosContrarios
  ) {
    return { presidentePodeVotar: true, motivo: 'EMPATE' };
  }
  return { presidentePodeVotar: false, motivo: 'BLOQUEADO_REGIMENTO' };
}

/**
 * Elegibilidade para revisão em lote com IA:
 * Apenas itens votáveis, com PDF anexado e em Primeira ou Única Votação.
 */
export function isElegivelParaRevisaoIA(item: {
  votavel: boolean;
  pdfUrl?: string | null;
  votacaoEtapa: string;
}): boolean {
  if (!item.votavel || !item.pdfUrl) return false;
  return (
    item.votacaoEtapa === 'Primeira Votação' ||
    item.votacaoEtapa === 'Única Votação'
  );
}
