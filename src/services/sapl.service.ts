import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

const SAPL_BASE = process.env.SAPL_BASE_URL || 'https://sapl.itapoa.sc.leg.br';

async function fetchSaplJson(endpoint: string) {
  const url = endpoint.startsWith('http') ? endpoint : `${SAPL_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PautaOnline-CamaraItapoa/2.0' },
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`Erro ao consultar SAPL (${res.status}): ${url}`);
  }
  return res.json();
}

export interface SaplSessaoResumo {
  id: number;
  nome: string;
  numero: number;
  dataInicio: string;
  horaInicio: string;
  tipoId: number;
}

export interface SaplMateriaOrdemDia {
  numeroOrdem: number;
  materiaId: number;
  titulo: string;
  tipo: string;
  numero: number;
  ano: number;
  autor: string;
  ementa: string;
  textoOriginalUrl: string | null;
  documentosAcessoriosUrls: string[];
  isIndicacao: boolean;
  votacaoEtapaSugerida: string;
}

export interface SaplMateriaExpediente {
  numeroOrdem: number;
  materiaId: number;
  titulo: string;
  sigla: string;
  numero: number;
  ano: number;
  autor: string;
  origem: 'Executivo' | 'Legislativo';
  ementa: string;
  textoOriginalUrl: string | null;
  urgenciaDetectada: boolean;
  leiOrcamentaria: boolean;
}

function normalizeSaplFileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\/sapl\.itapoa\.sc\.leg\.br/, 'https://sapl.itapoa.sc.leg.br');
}

function extrairTipoPorTitulo(titulo: string): string {
  const t = titulo.toLowerCase();
  if (t.includes('projeto de lei complementar')) return 'Projeto de Lei Complementar';
  if (t.includes('projeto de lei substitutivo')) return 'Projeto de Lei Substitutivo';
  if (t.includes('projeto de lei ordinária') || t.includes('projeto de lei n')) return 'Projeto de Lei Ordinária';
  if (t.includes('projeto de resolução')) return 'Projeto de Resolução';
  if (t.includes('emenda à lei orgânica') || t.includes('emenda a lei orgânica')) return 'Proposta de Emenda a Lei Orgânica';
  if (t.includes('decreto legislativo')) return 'Projeto de Decreto Legislativo';
  if (t.includes('requerimento')) return 'Requerimento';
  if (t.includes('indicação') || t.includes('indicacao')) return 'Indicação';
  if (t.includes('moção') || t.includes('mocao')) return 'Moção';
  if (t.includes('subemenda')) return 'Subemenda legislativa';
  if (t.includes('emenda')) return 'Emenda Legislativa';
  if (t.includes('veto')) return 'Veto Parcial ou Total';
  return 'Projeto de Lei Ordinária';
}

export async function listarSessoesSapl(limit = 15): Promise<SaplSessaoResumo[]> {
  const data = await fetchSaplJson(`/api/sessao/sessaoplenaria/?o=-data_inicio&page_size=${limit}`);
  const results = data.results || [];
  return results.map((s: Record<string, unknown>) => ({
    id: Number(s.id),
    nome: String(s.__str__ || `Sessão Plenária #${s.id}`),
    numero: Number(s.numero || 0),
    dataInicio: String(s.data_inicio || ''),
    horaInicio: String(s.hora_inicio || ''),
    tipoId: Number(s.tipo || 1),
  }));
}

export async function buscarArtigoRegimento(numeroArtigo: number): Promise<string> {
  try {
    const res = await fetch(`${SAPL_BASE}/ta/38/text`, {
      headers: { 'User-Agent': 'PautaOnline-CamaraItapoa/2.0' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error('Falha ao obter Regimento Interno no SAPL');
    const html = await res.text();

    // Extrai todos os blocos de dispositivos vigentes (ignorando desativados/revogados)
    const regexDispositivo =
      /<div class="dptt\s*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="dtxt"[^>]*>([\s\S]*?)<\/div>/g;

    const dispositivos: { rotulo: string; texto: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = regexDispositivo.exec(html)) !== null) {
      const rotulo = match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      const texto = match[2]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      dispositivos.push({ rotulo, texto });
    }

    const alvoPadroes = [
      `Art. ${numeroArtigo}º.`,
      `Art. ${numeroArtigo}º`,
      `Art. ${numeroArtigo}.`,
      `Art. ${numeroArtigo}`,
    ];

    let capturando = false;
    const linhas: string[] = [];

    for (const d of dispositivos) {
      const isArtigo = /^Art\.\s*\d+/i.test(d.rotulo);
      const isEstruturaMaior = /^(TÍTULO|CAPÍTULO|SEÇÃO|SUBSEÇÃO)\b/i.test(d.rotulo);

      if (!capturando) {
        if (alvoPadroes.some((p) => d.rotulo.toLowerCase() === p.toLowerCase())) {
          capturando = true;
          linhas.push(`${d.rotulo} ${d.texto}`.trim());
        }
      } else {
        if (isArtigo || isEstruturaMaior) {
          break;
        }
        linhas.push(`${d.rotulo} ${d.texto}`.trim());
      }
    }

    if (linhas.length === 0) {
      return `Art. ${numeroArtigo}. [Texto do artigo ${numeroArtigo} do Regimento Interno da Câmara Municipal de Itapoá].`;
    }
    return linhas.join('\n');
  } catch (err) {
    console.error('Erro ao buscar artigo do Regimento Interno:', err);
    return `Art. ${numeroArtigo}. [Consulte o Regimento Interno da Câmara Municipal de Itapoá].`;
  }
}

async function obterDetalhesMateria(materiaId: number) {
  const [mat, autoriaData, docsData] = await Promise.all([
    fetchSaplJson(`/api/materia/materialegislativa/${materiaId}/`),
    fetchSaplJson(`/api/materia/autoria/?materia=${materiaId}&page_size=30`).catch(() => ({ results: [] })),
    fetchSaplJson(`/api/materia/documentoacessorio/?materia=${materiaId}&page_size=30`).catch(() => ({ results: [] })),
  ]);

  const autores = (autoriaData.results || [])
    .map((a: Record<string, unknown>) => {
      const str = String(a.__str__ || '');
      const semPrefixo = str.replace(/^Autoria:\s*/i, '');
      return semPrefixo.split(' - ')[0].trim();
    })
    .filter(Boolean);

  const docsUrls = (docsData.results || [])
    .map((d: Record<string, unknown>) => normalizeSaplFileUrl(String(d.arquivo || '')))
    .filter((u: string | null): u is string => Boolean(u));

  const titulo = String(mat.__str__ || `Matéria #${materiaId}`);
  const tipo = extrairTipoPorTitulo(titulo);
  const isIndicacao = tipo === 'Indicação';

  return {
    materiaId,
    titulo,
    tipo,
    numero: Number(mat.numero || 0),
    ano: Number(mat.ano || new Date().getFullYear()),
    autor: autores.join(', '),
    ementa: String(mat.ementa || ''),
    textoOriginalUrl: normalizeSaplFileUrl(mat.texto_original),
    documentosAcessoriosUrls: docsUrls,
    isIndicacao,
  };
}

export async function buscarOrdemDoDiaSapl(sessaoId: number): Promise<SaplMateriaOrdemDia[]> {
  const data = await fetchSaplJson(
    `/api/sessao/ordemdia/?sessao_plenaria=${sessaoId}&o=numero_ordem&page_size=100`
  );
  const results = data.results || [];

  const itens: SaplMateriaOrdemDia[] = [];
  for (const row of results) {
    const matId = Number(row.materia);
    if (!matId) continue;
    const det = await obterDetalhesMateria(matId);
    const obs = String(row.observacao || '').toLowerCase();
    let etapa = 'Primeira Votação';
    if (det.isIndicacao) {
      etapa = 'Não Votável';
    } else if (
      det.tipo === 'Requerimento' ||
      det.tipo === 'Moção' ||
      obs.includes('única') ||
      obs.includes('unica')
    ) {
      etapa = 'Única Votação';
    } else if (obs.includes('2ª') || obs.includes('segunda')) {
      etapa = 'Segunda Votação';
    }

    itens.push({
      numeroOrdem: Number(row.numero_ordem || itens.length + 1),
      ...det,
      votacaoEtapaSugerida: etapa,
    });
  }

  return itens.sort((a, b) => a.numeroOrdem - b.numeroOrdem);
}

export async function triarExpedienteSapl(sessaoId: number): Promise<SaplMateriaExpediente[]> {
  const data = await fetchSaplJson(
    `/api/sessao/expedientemateria/?sessao_plenaria=${sessaoId}&o=numero_ordem&page_size=100`
  );
  const results = data.results || [];
  const list: SaplMateriaExpediente[] = [];

  for (const row of results) {
    const matId = Number(row.materia);
    if (!matId) continue;
    const det = await obterDetalhesMateria(matId);
    if (det.isIndicacao || det.tipo === 'Requerimento' || det.tipo === 'Moção') {
      continue; // Apenas projetos dando entrada na Casa
    }

    const autorLower = det.autor.toLowerCase();
    const isExec =
      autorLower.includes('prefeito') ||
      autorLower.includes('executivo') ||
      autorLower.includes('jeferson') ||
      det.titulo.toLowerCase().includes('executivo');

    const ementaLower = `${det.titulo} ${det.ementa} ${row.observacao || ''}`.toLowerCase();
    const urgenciaDetectada =
      ementaLower.includes('urgência') ||
      ementaLower.includes('urgencia') ||
      ementaLower.includes('art. 51');
    const leiOrcamentaria =
      ementaLower.includes('orçament') ||
      ementaLower.includes('ldo') ||
      ementaLower.includes('loa') ||
      ementaLower.includes('plurianual') ||
      ementaLower.includes('crédito adicional');

    let sigla = 'PLO';
    if (det.tipo.includes('Complementar')) sigla = 'PLC';
    else if (det.tipo.includes('Resolução')) sigla = 'PR';
    else if (det.tipo.includes('Decreto')) sigla = 'PDL';

    list.push({
      numeroOrdem: Number(row.numero_ordem || list.length + 1),
      materiaId: det.materiaId,
      titulo: det.titulo,
      sigla: `${sigla} ${det.numero}/${det.ano}`,
      numero: det.numero,
      ano: det.ano,
      autor: det.autor,
      origem: isExec ? 'Executivo' : 'Legislativo',
      ementa: det.ementa,
      textoOriginalUrl: det.textoOriginalUrl,
      urgenciaDetectada,
      leiOrcamentaria,
    });
  }

  return list;
}

export async function baixarEMesclarPdfsUrls(
  urls: string[],
  nomeArquivoDestino: string
): Promise<string | null> {
  const validUrls = urls.filter(Boolean);
  if (validUrls.length === 0) return null;

  try {
    const dir = path.join(process.cwd(), 'public', 'uploads', 'pdfs');
    await fs.mkdir(dir, { recursive: true });

    if (validUrls.length === 1) {
      const res = await fetch(validUrls[0], {
        headers: { 'User-Agent': 'PautaOnline-CamaraItapoa/2.0' },
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const filePath = path.join(dir, nomeArquivoDestino);
      await fs.writeFile(filePath, buf);
      return `/uploads/pdfs/${nomeArquivoDestino}`;
    }

    const mergedPdf = await PDFDocument.create();
    let anyLoaded = false;

    for (const u of validUrls) {
      try {
        const res = await fetch(u, {
          headers: { 'User-Agent': 'PautaOnline-CamaraItapoa/2.0' },
        });
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        copiedPages.forEach((p) => mergedPdf.addPage(p));
        anyLoaded = true;
      } catch (e) {
        console.warn('Falha ao mesclar PDF individual:', u, e);
      }
    }

    if (!anyLoaded) return null;
    const pdfBytes = await mergedPdf.save();
    const filePath = path.join(dir, nomeArquivoDestino);
    await fs.writeFile(filePath, Buffer.from(pdfBytes));
    return `/uploads/pdfs/${nomeArquivoDestino}`;
  } catch (err) {
    console.error('Erro em baixarEMesclarPdfsUrls:', err);
    return null;
  }
}
