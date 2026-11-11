import { PrismaClient } from '@prisma/client';
import { gerarHashSenha } from '../src/lib/senha';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados PautaOnline...');

  // 1. Configurações Padrão
  const configs = [
    { chave: 'usuario_admin', valor: process.env.ADMIN_USER || 'camara' },
    // Senha nunca fica no código: vem de ADMIN_PASSWORD (.env) e é salva como hash scrypt.
    // Sem ADMIN_PASSWORD, fica vazia (login bloqueado) até rodar scripts/set-admin-password.ts.
    {
      chave: 'senha_admin',
      valor: process.env.ADMIN_PASSWORD ? gerarHashSenha(process.env.ADMIN_PASSWORD) : '',
    },
    { chave: 'openai_key', valor: '' },
    { chave: 'obs_token', valor: 'itapoa-obs-2026' },
  ];

  for (const cfg of configs) {
    await prisma.configuracao.upsert({
      where: { chave: cfg.chave },
      update: {},
      create: cfg,
    });
  }

  // 2. Vereadores da Câmara Municipal de Itapoá
  const countVereadores = await prisma.vereador.count();
  if (countVereadores === 0) {
    const vereadoresPadrao = [
      { nome: 'Ademar', tratamento: 'Vereador', isPresidente: false, isLicenciado: false },
      { nome: 'Daniel', tratamento: 'Vereador', isPresidente: false, isLicenciado: false },
      { nome: 'Diego', tratamento: 'Vereador', isPresidente: false, isLicenciado: false },
      { nome: 'Jessica', tratamento: 'Vereadora', isPresidente: false, isLicenciado: false },
      { nome: 'Marta', tratamento: 'Vereadora', isPresidente: false, isLicenciado: false },
      { nome: 'Odinei', tratamento: 'Vereador', isPresidente: false, isLicenciado: false },
      { nome: 'Valdecir', tratamento: 'Vereador', isPresidente: false, isLicenciado: false },
      { nome: 'Wagner', tratamento: 'Vereador', isPresidente: false, isLicenciado: false },
      { nome: 'Ivan', tratamento: 'Vereador', isPresidente: true, isLicenciado: false },
    ];

    for (const v of vereadoresPadrao) {
      await prisma.vereador.create({ data: v });
    }
    console.log('✅ 9 Vereadores de Itapoá cadastrados com sucesso (Ivan como Presidente).');
  }

  // 3. Sessão Inicial de Demonstração (caso banco esteja sem sessões)
  const countSessoes = await prisma.sessao.count();
  if (countSessoes === 0) {
    const sessaoDemo = await prisma.sessao.create({
      data: {
        nome: '34ª Reunião Ordinária da 2ª Sessão Legislativa da 10ª Legislatura',
        tipo: 'Ordinária',
        saplSessaoId: 773,
      },
    });

    const itensDemo = [
      {
        numero: 1,
        titulo: 'SAUDAÇÃO',
        ementa:
          'Boa noite senhoras vereadoras, vereadores, autoridades e munícipes que nos acompanham nessa reunião de forma presencial e aqueles que nos acompanham pelo nosso canal no Youtube.',
        tipoItem: 'Rito / Expediente',
        autor: '',
        votacaoEtapa: 'Não Votável',
        votavel: false,
      },
      {
        numero: 2,
        titulo: 'Leitura do Regimento Interno',
        ementa:
          'Solicito a Servidora Patrícia que proceda com a Leitura do artigo 127 do Regimento Interno desta casa.\n--------------------\nArt. 127. O Setor de Protocolo ou a Secretaria da Casa receberá os documentos de origem dos Poderes Executivo e Legislativo de Itapoá e protocolará por meio do e-mail oficial protocolo@camaraitapoa.sc.gov.br.\nParágrafo único. As correspondências impressas devem ser recebidas e encaminhadas para a pasta de leitura das correspondências das Reuniões Ordinárias.',
        tipoItem: 'Rito / Expediente',
        autor: '',
        votacaoEtapa: 'Não Votável',
        votavel: false,
      },
      {
        numero: 3,
        titulo: 'Chamada nominal',
        ementa:
          'Conforme dispõe o artigo 163 do Regimento Interno, realizarei a chamada nominal dos vereadores para registro de presença:\n[CHAMADA]\nConforme o registro de presença dos vereadores e havendo quórum regimental, declaro aberta a 34ª Reunião Ordinária da 2ª Sessão Legislativa da 10ª Legislatura, em conformidade com o artigo 164 do Regimento Interno.',
        tipoItem: 'Rito / Expediente',
        autor: '',
        votacaoEtapa: 'Não Votável',
        votavel: false,
      },
      {
        numero: 4,
        titulo: 'Leitura das correspondências',
        ementa:
          'Solicito a servidora Patrícia que proceda com a Leitura das Correspondências.\n------------------------------\n\nAs correspondências estão no Drive do Legislativo, e foram encaminhadas por e-mail a todos os Vereadores.',
        tipoItem: 'Rito / Expediente',
        autor: '',
        votacaoEtapa: 'Não Votável',
        votavel: false,
      },
      {
        numero: 5,
        titulo: 'Deliberação da ata da sessão anterior',
        ementa:
          'Coloco em DELIBERAÇÃO a Ata n. 96/2026 da 33ª Reunião Ordinária, quem for favorável permaneça como estão.\n-----------------------\nDECLARO a ATA N. 96 de 2026, aprovada por unanimidade.',
        tipoItem: 'Rito / Expediente',
        autor: '',
        votacaoEtapa: 'Não Votável',
        votavel: false,
      },
      {
        numero: 6,
        titulo: 'Matérias do Expediente (Dando Entrada na Casa)',
        ementa:
          'Temos 02 (dois) projetos de origem do Poder Executivo e 01 (um) Projeto de Lei de origem deste Poder Legislativo dando entrada na casa no dia de hoje. Solicito a Servidora Patrícia que faça a leitura dos referidos projetos.',
        tipoItem: 'Rito / Expediente',
        autor: '',
        votacaoEtapa: 'Não Votável',
        votavel: false,
      },
      {
        numero: 7,
        titulo: 'Distribuição dos Projetos',
        ementa:
          'Após a leitura, distribuo os:\n\n- Projeto de Lei Complementar nº 34 de 2026;\n- Mensagem Modificativa do Poder Executivo nº 2 de 2026;\n- Mensagem Modificativa do Poder Executivo nº 3 de 2026;\n\nem regime ORDINÁRIO, para análises técnicas das comissões permanentes desta casa.',
        tipoItem: 'Rito / Expediente',
        autor: '',
        votacaoEtapa: 'Não Votável',
        votavel: false,
      },
      {
        numero: 8,
        titulo: 'Chamada para ordem do dia',
        ementa:
          'Em conformidade com o parágrafo 1º do artigo 169 do Regimento Interno, realizarei a chamada nominal para atestar a presença dos vereadores para a abertura dos trabalhos da ordem do dia:\n[CHAMADA]\nConforme atestadas as presenças e havendo quórum regimental, declaro aberta a ordem do dia.',
        tipoItem: 'Rito / Expediente',
        autor: '',
        votacaoEtapa: 'Não Votável',
        votavel: false,
      },
      {
        numero: 9,
        titulo: 'Requerimento nº 116 de 2026',
        ementa:
          'Requerem informações atualizadas completas e documentadas acerca das ações efetivamente realizadas para implementação da Lei Ordinária n. 1.489, de 25 de novembro de 2025, originada do Projeto de Lei Ordinária n. 80/2025.',
        tipoItem: 'Requerimento',
        autor: 'Valdecir, Ademar, Daniel, Diego, Jessica, Marta, Odinei, Wagner',
        votacaoEtapa: 'Única Votação',
        votavel: true,
        saplMateriaId: 15926,
      },
      {
        numero: 10,
        titulo: 'Projeto de Lei Ordinária nº 56 de 2026',
        ementa: 'Dispõe sobre matérias de interesse legislativo do Município de Itapoá/SC.',
        tipoItem: 'Projeto de Lei Ordinária',
        autor: 'Marta',
        votacaoEtapa: 'Primeira Votação',
        votavel: true,
        saplMateriaId: 15743,
      },
      {
        numero: 11,
        titulo: 'Leitura das Indicações',
        ementa:
          'Solicito a Leitura das Indicações 316 a 324 de 2026. ESSE É O FIM DA PAUTA.',
        tipoItem: 'Indicação',
        autor: 'Diversos Vereadores',
        votacaoEtapa: 'Não Votável',
        votavel: false,
      },
    ];

    for (const it of itensDemo) {
      await prisma.pautaItem.create({
        data: {
          sessaoId: sessaoDemo.id,
          ...it,
        },
      });
    }
    console.log('✅ Sessão 34ª Reunião Ordinária semeada com sucesso.');
  }

  console.log('✅ Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
