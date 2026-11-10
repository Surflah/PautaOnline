import {
  buscarArtigoRegimento,
  buscarOrdemDoDiaSapl,
  triarExpedienteSapl,
  SaplMateriaOrdemDia,
  SaplMateriaExpediente,
} from './sapl.service';

export interface ItemPreviaRito {
  numero: number;
  titulo: string;
  ementa: string;
  tipoItem: string;
  autor: string;
  votacaoEtapa: string;
  votavel: boolean;
  saplMateriaId?: number | null;
  pdfUrlsParaBaixar?: string[];
}

export async function montarPreviaCompletaSapl(params: {
  saplSessaoId: number;
  nomeSessao: string;
  artigoRi: number;
  nomeServidor: string;
  tratamentoServidor: 'Servidor' | 'Servidora';
  numeroAtaAnterior: string;
  anoAtaAnterior: string;
  sessaoAnteriorNome: string;
  modoPdf: 'texto' | 'mesclado';
  urgenciasForcadasIds?: number[];
}): Promise<{
  nomeSessao: string;
  expediente: SaplMateriaExpediente[];
  ordemDoDia: SaplMateriaOrdemDia[];
  itensPrevia: ItemPreviaRito[];
}> {
  const [textoArtigo, expediente, ordemDoDia] = await Promise.all([
    buscarArtigoRegimento(params.artigoRi),
    triarExpedienteSapl(params.saplSessaoId),
    buscarOrdemDoDiaSapl(params.saplSessaoId),
  ]);

  const trat = params.tratamentoServidor;
  const tratMin = trat.toLowerCase();
  const serv = params.nomeServidor || 'Patrícia';

  const itens: ItemPreviaRito[] = [];

  // 1. SAUDAÇÃO
  itens.push({
    numero: itens.length + 1,
    titulo: 'SAUDAÇÃO',
    ementa:
      'Boa noite senhoras vereadoras, vereadores, autoridades e munícipes que nos acompanham nessa reunião de forma presencial e aqueles que nos acompanham pelo nosso canal no Youtube.',
    tipoItem: 'Rito / Expediente',
    autor: '',
    votacaoEtapa: 'Não Votável',
    votavel: false,
  });

  // 2. Leitura do Regimento Interno
  itens.push({
    numero: itens.length + 1,
    titulo: 'Leitura do Regimento Interno',
    ementa: `Solicito a ${trat} ${serv} que proceda com a Leitura do artigo ${params.artigoRi} do Regimento Interno desta casa.\n--------------------\n${textoArtigo}`,
    tipoItem: 'Rito / Expediente',
    autor: '',
    votacaoEtapa: 'Não Votável',
    votavel: false,
  });

  // 3. Chamada nominal
  itens.push({
    numero: itens.length + 1,
    titulo: 'Chamada nominal',
    ementa: `Conforme dispõe o artigo 163 do Regimento Interno, realizarei a chamada nominal dos vereadores para registro de presença:\n[CHAMADA]\nConforme o registro de presença dos vereadores e havendo quórum regimental, declaro aberta a ${params.nomeSessao}, em conformidade com o artigo 164 do Regimento Interno.`,
    tipoItem: 'Rito / Expediente',
    autor: '',
    votacaoEtapa: 'Não Votável',
    votavel: false,
  });

  // 4. Leitura das correspondências
  itens.push({
    numero: itens.length + 1,
    titulo: 'Leitura das correspondências',
    ementa: `Solicito a ${tratMin} ${serv} que proceda com a Leitura das Correspondências.\n------------------------------\n\nAs correspondências estão no Drive do Legislativo, e foram encaminhadas por e-mail a todos os Vereadores.`,
    tipoItem: 'Rito / Expediente',
    autor: '',
    votacaoEtapa: 'Não Votável',
    votavel: false,
  });

  // 5. Deliberação da ata da sessão anterior
  const numAta = params.numeroAtaAnterior || '96';
  const anoAta = params.anoAtaAnterior || String(new Date().getFullYear());
  const sessAnt = params.sessaoAnteriorNome || 'Reunião Ordinária anterior';

  itens.push({
    numero: itens.length + 1,
    titulo: 'Deliberação da ata da sessão anterior',
    ementa: `Coloco em DELIBERAÇÃO a Ata n. ${numAta}/${anoAta} da ${sessAnt}, quem for favorável permaneça como estão.\n-----------------------\nDECLARO a ATA N. ${numAta} de ${anoAta}, aprovada por unanimidade.`,
    tipoItem: 'Rito / Expediente',
    autor: '',
    votacaoEtapa: 'Não Votável',
    votavel: false,
  });

  // 6. Matérias do Expediente (Dando Entrada na Casa)
  const qtdExec = expediente.filter((e) => e.origem === 'Executivo').length;
  const qtdLeg = expediente.filter((e) => e.origem === 'Legislativo').length;

  let textoExpediente = 'Não há projetos dando entrada na casa no dia de hoje.';
  if (expediente.length > 0) {
    const partes: string[] = [];
    if (qtdExec > 0) {
      partes.push(
        `${String(qtdExec).padStart(2, '0')} projeto(s) de origem do Poder Executivo`
      );
    }
    if (qtdLeg > 0) {
      partes.push(
        `${String(qtdLeg).padStart(2, '0')} projeto(s) de origem deste Poder Legislativo`
      );
    }
    textoExpediente = `Temos ${partes.join(' e ')} dando entrada na casa no dia de hoje. Solicito a ${trat} ${serv} que faça a leitura dos referidos projetos.`;
  }

  itens.push({
    numero: itens.length + 1,
    titulo: 'Matérias do Expediente (Dando Entrada na Casa)',
    ementa: textoExpediente,
    tipoItem: 'Rito / Expediente',
    autor: '',
    votacaoEtapa: 'Não Votável',
    votavel: false,
  });

  // 7. Deliberação - Regime de Urgência (Art. 51 LOM), se houver
  const urgenciasIds =
    params.urgenciasForcadasIds ??
    expediente.filter((e) => e.urgenciaDetectada).map((e) => e.materiaId);
  const projetosUrgentes = expediente.filter((e) =>
    urgenciasIds.includes(e.materiaId)
  );
  const projetosOrdinarios = expediente.filter(
    (e) => !urgenciasIds.includes(e.materiaId)
  );

  if (projetosUrgentes.length > 0) {
    const siglasUrg = projetosUrgentes.map((p) => p.sigla).join(', ');
    const listaUrg = projetosUrgentes.map((p) => `- ${p.titulo};`).join('\n');
    itens.push({
      numero: itens.length + 1,
      titulo: `Deliberação - Regime de Urgência (Art. 51 LOM) - ${siglasUrg}`,
      ementa: `Coloco em DELIBERAÇÃO a solicitação de Regime de Urgência (Art. 51 da Lei Orgânica Municipal) para tramitação dos seguintes projetos:\n\n${listaUrg}`,
      tipoItem: 'Requerimento',
      autor: 'Poder Executivo',
      votacaoEtapa: 'Única Votação',
      votavel: true,
    });
  }

  // 8. Distribuição dos Projetos
  let textoDistribuicao = 'Não há projetos para distribuição às comissões permanentes na presente sessão.';
  if (expediente.length > 0) {
    const blocos: string[] = [];
    if (projetosOrdinarios.length > 0) {
      const listaOrd = projetosOrdinarios.map((p) => `- ${p.titulo};`).join('\n');
      blocos.push(
        `Após a leitura, distribuo os:\n\n${listaOrd}\n\nem regime ORDINÁRIO, para análises técnicas das comissões permanentes desta casa.`
      );
    }
    if (projetosUrgentes.length > 0) {
      const listaUrg = projetosUrgentes.map((p) => `- ${p.titulo};`).join('\n');
      blocos.push(
        `Distribuo também os:\n\n${listaUrg}\n\nem regime de URGÊNCIA (Art. 51 LOM), para análises técnicas das comissões permanentes desta casa.`
      );
    }
    textoDistribuicao = blocos.join('\n\n');
  }

  itens.push({
    numero: itens.length + 1,
    titulo: 'Distribuição dos Projetos',
    ementa: textoDistribuicao,
    tipoItem: 'Rito / Expediente',
    autor: '',
    votacaoEtapa: 'Não Votável',
    votavel: false,
  });

  // 9. Chamada para ordem do dia
  itens.push({
    numero: itens.length + 1,
    titulo: 'Chamada para ordem do dia',
    ementa: `Em conformidade com o parágrafo 1º do artigo 169 do Regimento Interno, realizarei a chamada nominal para atestar a presença dos vereadores para a abertura dos trabalhos da ordem do dia:\n[CHAMADA]\nConforme atestadas as presenças e havendo quórum regimental, declaro aberta a ordem do dia.`,
    tipoItem: 'Rito / Expediente',
    autor: '',
    votacaoEtapa: 'Não Votável',
    votavel: false,
  });

  // 10+. Matérias Votáveis da Ordem do Dia
  const votaveis = ordemDoDia.filter((m) => !m.isIndicacao);
  const indicacoes = ordemDoDia
    .filter((m) => m.isIndicacao)
    .sort((a, b) => a.numero - b.numero);

  for (const m of votaveis) {
    const urls =
      params.modoPdf === 'mesclado'
        ? [m.textoOriginalUrl, ...m.documentosAcessoriosUrls].filter(
            (u): u is string => Boolean(u)
          )
        : m.textoOriginalUrl
        ? [m.textoOriginalUrl]
        : [];

    itens.push({
      numero: itens.length + 1,
      titulo: m.titulo,
      ementa: m.ementa,
      tipoItem: m.tipo,
      autor: m.autor,
      votacaoEtapa: m.votacaoEtapaSugerida,
      votavel: true,
      saplMateriaId: m.materiaId,
      pdfUrlsParaBaixar: urls,
    });
  }

  // Último item: Leitura das Indicações agrupadas
  if (indicacoes.length > 0) {
    const numMin = indicacoes[0].numero;
    const numMax = indicacoes[indicacoes.length - 1].numero;
    const anoInd = indicacoes[0].ano;
    const faixaTexto =
      indicacoes.length === 1
        ? `da Indicação ${numMin} de ${anoInd}`
        : `das Indicações ${numMin} a ${numMax} de ${anoInd}`;

    const urlsIndicacoes = indicacoes
      .map((i) => i.textoOriginalUrl)
      .filter((u): u is string => Boolean(u));

    itens.push({
      numero: itens.length + 1,
      titulo: 'Leitura das Indicações',
      ementa: `Solicito a Leitura ${faixaTexto}. ESSE É O FIM DA PAUTA.`,
      tipoItem: 'Indicação',
      autor: 'Diversos Vereadores',
      votacaoEtapa: 'Não Votável',
      votavel: false,
      pdfUrlsParaBaixar: urlsIndicacoes,
    });
  }

  return {
    nomeSessao: params.nomeSessao,
    expediente,
    ordemDoDia,
    itensPrevia: itens,
  };
}
