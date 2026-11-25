import { extractText } from 'unpdf';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { sintetizarGoogleCloud, googleCloudDisponivel } from './google-cloud-tts.service';

export interface PaginaRoteiroLeitura {
  pagina_real: number;
  texto: string;
  pular?: boolean;
  audio_url?: string | null;
}

export interface PontoSincroniaAudio {
  fracAudio: number; // 0..1 (tempo real no arquivo MP3)
  fracTexto: number; // 0..1 (fração de caracteres lidos no texto da página)
}

export type ProvedorRevisaoIa =
  | 'gemini-pdf'
  | 'gemini-texto'
  | 'openai'
  | 'regras-locais';

export const VOZ_PADRAO = 'gcloud:pt-BR-Standard-D';

export const VOZES_TTS_DISPONIVEIS = [
  // Google Cloud TTS (credencial da Câmara) — com marcas de tempo por palavra (sincronia exata)
  { id: 'gcloud:pt-BR-Standard-D', label: '⭐ Andressa (Google Cloud — Padrão)', gratuita: false, genero: 'Feminina' },
  { id: 'gcloud:pt-BR-Wavenet-D', label: '☁️ Google Wavenet D (Feminina Natural)', gratuita: false, genero: 'Feminina' },
  { id: 'gcloud:pt-BR-Neural2-A', label: '☁️ Google Neural2 A (Feminina Neural)', gratuita: false, genero: 'Feminina' },
  { id: 'gcloud:pt-BR-Neural2-C', label: '☁️ Google Neural2 C (Feminina Neural)', gratuita: false, genero: 'Feminina' },
  { id: 'gcloud:pt-BR-Wavenet-A', label: '☁️ Google Wavenet A (Feminina)', gratuita: false, genero: 'Feminina' },
  { id: 'gcloud:pt-BR-Wavenet-C', label: '☁️ Google Wavenet C (Feminina)', gratuita: false, genero: 'Feminina' },
  { id: 'gcloud:pt-BR-Standard-A', label: '☁️ Google Standard A (Feminina)', gratuita: false, genero: 'Feminina' },
  { id: 'gcloud:pt-BR-Neural2-B', label: '☁️ Google Neural2 B (Masculina Neural)', gratuita: false, genero: 'Masculina' },
  { id: 'gcloud:pt-BR-Wavenet-B', label: '☁️ Google Wavenet B (Masculina)', gratuita: false, genero: 'Masculina' },
  { id: 'gcloud:pt-BR-Wavenet-E', label: '☁️ Google Wavenet E (Masculina)', gratuita: false, genero: 'Masculina' },
  {
    id: 'google-feminina',
    label: '🌐 Google Feminina Brasil (Gratuita — Reserva)',
    gratuita: true,
    genero: 'Feminina',
  },
  {
    id: 'google-solene',
    label: '🌐 Google Feminina Solene/Pausada (Gratuita — Brasil)',
    gratuita: true,
    genero: 'Feminina',
  },
  {
    id: 'google-clara',
    label: '🌐 Google Feminina Clara GTX (Gratuita — Brasil)',
    gratuita: true,
    genero: 'Feminina',
  },
  {
    id: 'google-pt',
    label: '🌐 Google Feminina Clássica (Gratuita — Português)',
    gratuita: true,
    genero: 'Feminina',
  },
  {
    id: 'nova',
    label: '✨ Nova (OpenAI — Feminina Dinâmica)',
    gratuita: false,
    genero: 'Feminina',
  },
  {
    id: 'shimmer',
    label: '✨ Shimmer (OpenAI — Feminina Clara)',
    gratuita: false,
    genero: 'Feminina',
  },
  {
    id: 'coral',
    label: '✨ Coral (OpenAI — Feminina Expressiva)',
    gratuita: false,
    genero: 'Feminina',
  },
  {
    id: 'sage',
    label: '✨ Sage (OpenAI — Feminina Institucional)',
    gratuita: false,
    genero: 'Feminina',
  },
  {
    id: 'onyx',
    label: '✨ Onyx (OpenAI — Masculina Grave)',
    gratuita: false,
    genero: 'Masculina',
  },
  {
    id: 'echo',
    label: '✨ Echo (OpenAI — Masculina Suave)',
    gratuita: false,
    genero: 'Masculina',
  },
  {
    id: 'alloy',
    label: '✨ Alloy (OpenAI — Neutra)',
    gratuita: false,
    genero: 'Neutra',
  },
] as const;

const ROMANOS_ORDINAIS: Record<string, string> = {
  I: 'Primeiro',
  II: 'Segundo',
  III: 'Terceiro',
  IV: 'Quarto',
  V: 'Quinto',
  VI: 'Sexto',
  VII: 'Sétimo',
  VIII: 'Oitavo',
  IX: 'Nono',
  X: 'Décimo',
  XI: 'Décimo primeiro',
  XII: 'Décimo segundo',
  XIII: 'Décimo terceiro',
  XIV: 'Décimo quarto',
  XV: 'Décimo quinto',
  XVI: 'Décimo sexto',
  XVII: 'Décimo sétimo',
  XVIII: 'Décimo oitavo',
  XIX: 'Décimo nono',
  XX: 'Vigésimo',
  XXI: 'Vigésimo primeiro',
  XXII: 'Vigésimo segundo',
  XXIII: 'Vigésimo terceiro',
  XXIV: 'Vigésimo quarto',
  XXV: 'Vigésimo quinto',
  XXVI: 'Vigésimo sexto',
  XXVII: 'Vigésimo sétimo',
  XXVIII: 'Vigésimo oitavo',
  XXIX: 'Vigésimo nono',
  XXX: 'Trigésimo',
};

const ORDINAIS_1_A_9: Record<string, string> = {
  '1': 'primeiro',
  '2': 'segundo',
  '3': 'terceiro',
  '4': 'quarto',
  '5': 'quinto',
  '6': 'sexto',
  '7': 'sétimo',
  '8': 'oitavo',
  '9': 'nono',
};

const MESES_POR_EXTENSO: Record<number, string> = {
  1: 'janeiro',
  2: 'fevereiro',
  3: 'março',
  4: 'abril',
  5: 'maio',
  6: 'junho',
  7: 'julho',
  8: 'agosto',
  9: 'setembro',
  10: 'outubro',
  11: 'novembro',
  12: 'dezembro',
};

export function limparTextoLegislativoDeterministico(raw: string): string {
  let txt = raw || '';

  // 1. Remove tags "[assinado digitalmente]", "(assinado digitalmente)" e blocos ICP-Brasil / verificador
  txt = txt.replace(/\[\s*assinado\s+digitalmente[^\]]*\]/gi, ' ');
  txt = txt.replace(/\(\s*assinado\s+digitalmente[^)]*\)/gi, ' ');
  txt = txt.replace(
    /Documento\s+assinado\s+digitalmente[\s\S]*?(?=\n\n|$)/gi,
    ' '
  );
  txt = txt.replace(/Assinado\s+(?:digitalmente|eletronicamente)\s+por[\s\S]*?(?=\n\n|$)/gi, ' ');
  txt = txt.replace(
    /Consulte\s+a\s+autenticidade\s+e\s+integridade[\s\S]*?(?=\n\n|$)/gi,
    ' '
  );
  txt = txt.replace(
    /Para\s+verificar\s+a\s+validade\s+das\s+assinaturas[\s\S]*?(?=\n\n|$)/gi,
    ' '
  );
  txt = txt.replace(
    /A\s+autenticidade\s+deste\s+documento\s+pode\s+ser\s+conferida[\s\S]*?(?=\n\n|$)/gi,
    ' '
  );
  txt = txt.replace(/Código\s+(?:verificador|CRC|de\s+autenticidade)\s*:?.*$/gim, ' ');
  txt = txt.replace(/Chave\s+de\s+validação\s*:?.*$/gim, ' ');
  txt = txt.replace(/https?:\/\/\S+/gi, ' ');
  txt = txt.replace(/\bwww\.\S+/gi, ' ');
  txt = txt.replace(/Página\s+\d+\s+(?:de|\/)\s+\d+/gi, ' ');
  txt = txt.replace(/Pág\.?\s*\d+\s*(?:de|\/)\s*\d+/gi, ' ');
  txt = txt.replace(/\bFl(?:s)?\.?\s*\d+\s*\/\s*\d+/gi, ' ');

  // Remove linhas de sublinhado ou traços longos de assinatura
  txt = txt.replace(/_{3,}/g, ' ');
  txt = txt.replace(/-{4,}/g, ' ');
  txt = txt.replace(/\.{4,}/g, ' ');

  // 2. Une linhas quebradas no meio de frases pelo layout do PDF
  txt = txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');

  // 3. Converte datas DD/MM/AAAA para extenso ("25 de novembro de 2026") ANTES de tratar barras número/ano
  txt = txt.replace(
    /\b(0?[1-9]|[12]\d|3[01])\s*\/\s*(0?[1-9]|1[0-2])\s*\/\s*(19\d{2}|20\d{2})\b/g,
    (match, dStr, mStr, anoStr) => {
      const dia = parseInt(dStr, 10);
      const mes = MESES_POR_EXTENSO[parseInt(mStr, 10)];
      if (!mes) return match;
      const diaFalado = dia === 1 ? 'primeiro' : String(dia);
      return `${diaFalado} de ${mes} de ${anoStr}`;
    }
  );

  // 4. Corrige números legislativos com ano ("43/2026", "1.489/2025", "02/2026") para NUNCA ler como fração ("avos")!
  txt = txt.replace(
    /\b(\d+(?:\.\d{3})*)\s*\/\s*(19\d{2}|20\d{2})\b/g,
    (_match, numStr, anoStr) => {
      const numSemZeroEsq = numStr.replace(/^0+(\d)/, '$1');
      return `${numSemZeroEsq} de ${anoStr}`;
    }
  );

  // Anos de 2 dígitos após termos legislativos (ex.: "Lei nº 43/26" -> "Lei nº 43 de 2026")
  txt = txt.replace(
    /\b((?:nº|n\.º|n°|n\.|número|lei|decreto|portaria|resolução|ata|ofício|requerimento|indicação|moção|emenda|parecer|projeto)\s+\d+(?:\.\d{3})*)\s*\/\s*(\d{2})\b/gi,
    (_m, prefixo, ano2) => {
      const a = parseInt(ano2, 10);
      const anoCompleto = a <= 50 ? `20${ano2}` : `19${ano2}`;
      return `${prefixo} de ${anoCompleto}`;
    }
  );

  // 5. Expansões legislativas para leitura fluida em plenário
  txt = txt.replace(/Câmara\s+Municipal\s+de\s+Itapoá\s*[-/]\s*SC/gi, 'Câmara Municipal de Itapoá');
  txt = txt.replace(/\bItapoá\s*[-/]\s*SC\b/gi, 'Itapoá');
  txt = txt.replace(/\bPLO\b/g, 'Projeto de Lei Ordinária');
  txt = txt.replace(/\bPLC\b/g, 'Projeto de Lei Complementar');
  txt = txt.replace(/\bPDL\b/g, 'Projeto de Decreto Legislativo');
  txt = txt.replace(/\bLOM\b/g, 'Lei Orgânica Municipal');

  // "nº", "n.º", "n°", "N." antes de números
  txt = txt.replace(/\b(?:nº|n\.º|n°|N\.º|N°)\s*(\d+)/gi, 'número $1');
  txt = txt.replace(/\bN\.\s*(\d+)/g, 'número $1');

  // Artigos: 1º a 9º como ordinais ("Artigo primeiro"), 10+ como cardinais ("Artigo 10")
  txt = txt.replace(/\bArt\.?\s*([1-9])\s*[º°]?(?!\d)/gi, (_m, d) => {
    return `Artigo ${ORDINAIS_1_A_9[d] || d}`;
  });
  txt = txt.replace(/\bArt\.?\s*(\d+)\s*[º°]?/gi, 'Artigo $1');

  // Parágrafos (§ 1º..9º, §§, Par. único)
  txt = txt.replace(/§§\s*/g, 'Parágrafos ');
  txt = txt.replace(/§\s*único/gi, 'Parágrafo único');
  txt = txt.replace(/\bPar\.\s*único/gi, 'Parágrafo único');
  txt = txt.replace(/§\s*([1-9])\s*[º°]?(?!\d)/g, (_m, d) => {
    return `Parágrafo ${ORDINAIS_1_A_9[d] || d}`;
  });
  txt = txt.replace(/§\s*(\d+)\s*[º°]?/g, 'Parágrafo $1');

  // Converte incisos romanos comuns ("I - ", "II – ", "IV — ")
  txt = txt.replace(
    /\b(XXX|XXIX|XXVIII|XXVII|XXVI|XXV|XXIV|XXIII|XXII|XXI|XX|XIX|XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\s*[-–—]\s*/g,
    (match, rom) => {
      const ord = ROMANOS_ORDINAIS[rom];
      return ord ? `${ord}: ` : match;
    }
  );

  txt = txt.replace(/\s{2,}/g, ' ').trim();
  return txt;
}

const PROMPT_SISTEMA_REVISAO_LEGISLATIVA = `Você é um revisor legislativo oficial da Câmara Municipal de Itapoá-SC preparando o texto de uma proposição legislativa para leitura em voz alta por voz sintética (TTS) em plenário.

Regras obrigatórias e rigorosas:
1. REMOVA COMPLETAMENTE: textos tachados/riscados, cabeçalhos e rodapés repetitivos de papel timbrado, numeração de página ("Página X de Y"), linhas de assinatura e TODOS os avisos/carimbos de assinatura digital ("[assinado digitalmente]", "Documento assinado digitalmente", "ICP-Brasil", "Consulte a autenticidade", "Código verificador", URLs).
2. TABELAS E QUADROS: nunca leia colunas soltas ou desconexas! Converta qualquer tabela (como quadros de dotações orçamentárias, tabelas de cargos/vencimentos, cronogramas ou demonstrativos) em prosa corrida, clara e natural para quem está apenas ouvindo, associando o nome de cada coluna ao seu respectivo valor em cada linha.
3. NÚMEROS E BARRAS (PROIBIDO DEIXAR FRAÇÃO): JAMAIS deixe "43/2026" ou "1.489/2025" com barra "/", pois o leitor lê como fração ("avos"). Escreva sempre "quarenta e três de dois mil e vinte e seis" (ou "43 de 2026").
4. VALORES, DATAS E DISPOSITIVOS LEGAIS: escreva valores monetários (R$ 15.000,00 -> quinze mil reais), porcentagens, datas, artigos (Art. 1º -> Artigo primeiro; Art. 10 -> Artigo dez), parágrafos (§ 1º -> Parágrafo primeiro) e incisos romanos (I - -> Inciso primeiro:) de forma fluida para leitura em voz alta.
5. FIDELIDADE JURÍDICA: não resuma, não omita o mérito do texto e não adicione comentários como "Aqui está o texto:". Retorne exclusivamente o texto pronto para leitura.`;

export async function revisarPaginaComIA(
  textoOriginal: string,
  opcoes?: { openaiKey?: string; geminiKey?: string } | string
): Promise<string> {
  const baseLimpa = limparTextoLegislativoDeterministico(textoOriginal);
  if (!baseLimpa) return '';

  const openaiKey =
    typeof opcoes === 'string'
      ? opcoes.trim()
      : (opcoes?.openaiKey || process.env.OPENAI_API_KEY || '').trim();
  const geminiKey =
    typeof opcoes === 'object' && opcoes !== null
      ? (opcoes.geminiKey || process.env.GEMINI_API_KEY || '').trim()
      : (process.env.GEMINI_API_KEY || '').trim();

  // 1. Prioriza Google Gemini (2.5 Flash) se configurado
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          geminiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: PROMPT_SISTEMA_REVISAO_LEGISLATIVA }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: textoOriginal.slice(0, 20000) }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
            },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const txtIa = String(
          data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        ).trim();
        if (txtIa) {
          return limparTextoLegislativoDeterministico(txtIa);
        }
      }
    } catch (err) {
      console.warn('Falha no Gemini (texto), tentando alternativa:', err);
    }
  }

  // 2. Alternativa: OpenAI GPT-4o-mini
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.1,
          messages: [
            { role: 'system', content: PROMPT_SISTEMA_REVISAO_LEGISLATIVA },
            { role: 'user', content: textoOriginal.slice(0, 15000) },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const respostaIA = String(
          data.choices?.[0]?.message?.content || ''
        ).trim();
        if (respostaIA) {
          return limparTextoLegislativoDeterministico(respostaIA);
        }
      }
    } catch (err) {
      console.warn('Fallback para limpeza determinística (OpenAI indisponível):', err);
    }
  }

  return baseLimpa;
}

/**
 * Revisão Multimodal Completa do Documento PDF:
 * Quando há chave Google Gemini configurada e arquivo PDF disponível, envia o próprio PDF
 * para o Gemini 2.5 Flash enxergar tabelas reais, textos tachados e carimbos visuais página a página!
 */
export async function revisarDocumentoPdfComIA(params: {
  paginasAtuais: PaginaRoteiroLeitura[];
  pdfUrl?: string | null;
  geminiKey?: string;
  openaiKey?: string;
}): Promise<{
  paginas: PaginaRoteiroLeitura[];
  provedorIa: ProvedorRevisaoIa;
}> {
  const geminiKey = (params.geminiKey || process.env.GEMINI_API_KEY || '').trim();
  const openaiKey = (params.openaiKey || process.env.OPENAI_API_KEY || '').trim();

  const paginasParaLer = params.paginasAtuais.filter((p) => !p.pular);
  if (paginasParaLer.length === 0) {
    return { paginas: params.paginasAtuais, provedorIa: 'regras-locais' };
  }

  // 1. Modo Ouro: Gemini 2.5 Flash lendo o arquivo PDF visualmente (tabelas + tachados + carimbos)
  if (geminiKey && params.pdfUrl) {
    try {
      const relPath = params.pdfUrl
        .replace(/^\/api\/arquivos\//, 'uploads/')
        .replace(/^\//, '');
      const fullPath = path.join(process.cwd(), 'public', relPath);
      const pdfBuf = await fs.readFile(fullPath);

      // Limite seguro p/ inlineData (~18MB de PDF bruto)
      if (pdfBuf.length <= 18 * 1024 * 1024) {
        const numerosPaginas = paginasParaLer.map((p) => p.pagina_real).join(', ');
        const promptPdf = `${PROMPT_SISTEMA_REVISAO_LEGISLATIVA}

Analise visualmente o documento PDF anexado e prepare o texto de leitura APENAS para as seguintes páginas: [${numerosPaginas}].
Retorne ESTRITAMENTE um array JSON válido no formato:
[
  { "pagina_real": 1, "texto": "texto limpo e fluente para leitura em voz alta desta página" }
]
Se uma página contiver exclusivamente assinaturas digitais ou carimbos sem conteúdo legislativo para ler, retorne "texto": "" para essa página.`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
            geminiKey
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: {
                        mimeType: 'application/pdf',
                        data: pdfBuf.toString('base64'),
                      },
                    },
                    { text: promptPdf },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
              },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const rawJson = String(
            data.candidates?.[0]?.content?.parts?.[0]?.text || ''
          ).trim();
          const parsed = JSON.parse(rawJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const mapaPorPagina = new Map<number, string>();
            for (const item of parsed) {
              if (item && typeof item.pagina_real === 'number') {
                mapaPorPagina.set(
                  item.pagina_real,
                  limparTextoLegislativoDeterministico(String(item.texto || ''))
                );
              }
            }

            const atualizadas = params.paginasAtuais.map((p) => {
              if (p.pular) return p;
              const novoTxt = mapaPorPagina.get(p.pagina_real);
              if (novoTxt === undefined) return p;
              return {
                ...p,
                texto: novoTxt,
                pular: novoTxt.length === 0 ? true : p.pular,
                audio_url: null,
              };
            });
            return { paginas: atualizadas, provedorIa: 'gemini-pdf' };
          }
        }
      }
    } catch (err) {
      console.warn('Falha na revisão multimodal PDF com Gemini, usando modo texto:', err);
    }
  }

  // 2. Modo Texto com IA (Gemini ou OpenAI) ou Regras Determinísticas Locais
  const temAlgumaChave = Boolean(geminiKey || openaiKey);
  const provedorIa: ProvedorRevisaoIa = geminiKey
    ? 'gemini-texto'
    : openaiKey
      ? 'openai'
      : 'regras-locais';

  const revisadas: PaginaRoteiroLeitura[] = [];
  for (const p of params.paginasAtuais) {
    if (p.pular) {
      revisadas.push(p);
    } else {
      const novoTexto = temAlgumaChave
        ? await revisarPaginaComIA(p.texto, { geminiKey, openaiKey })
        : limparTextoLegislativoDeterministico(p.texto);
      revisadas.push({
        ...p,
        texto: novoTexto,
        audio_url: null,
      });
    }
  }

  return { paginas: revisadas, provedorIa };
}

export async function extrairPaginasDoPdfLocal(
  pdfUrl: string
): Promise<PaginaRoteiroLeitura[]> {
  const relPath = pdfUrl.replace(/^\/api\/arquivos\//, 'uploads/').replace(/^\//, '');
  const fullPath = path.join(process.cwd(), 'public', relPath);
  const buf = await fs.readFile(fullPath);

  const extraido = await extractText(new Uint8Array(buf), { mergePages: false });
  const paginasTextos: string[] = Array.isArray(extraido.text)
    ? extraido.text
    : [String(extraido.text || '')];

  return paginasTextos.map((raw, idx) => {
    const limpo = limparTextoLegislativoDeterministico(raw);
    const pareceSoAssinatura =
      limpo.length < 45 &&
      /assinado|documento|verificador|autenticidade|icp-brasil/i.test(raw);
    return {
      pagina_real: idx + 1,
      texto: limpo || raw.trim(),
      pular: pareceSoAssinatura,
      audio_url: null,
    };
  });
}

interface BlocoTextoTts {
  texto: string;
  fracTextoFim: number;
}

function dividirTextoEmBlocosComOffset(texto: string, maxLen = 165): BlocoTextoTts[] {
  const sentencas = texto
    .replace(/([.!?;:])\s+/g, '$1|SPLIT|')
    .split('|SPLIT|')
    .map((s) => s.trim())
    .filter(Boolean);

  const blocosTextos: string[] = [];
  let atual = '';

  for (const s of sentencas) {
    if (s.length > maxLen) {
      if (atual) {
        blocosTextos.push(atual.trim());
        atual = '';
      }
      const palavras = s.split(/\s+/);
      let sub = '';
      for (const p of palavras) {
        if ((sub + ' ' + p).trim().length > maxLen) {
          if (sub) blocosTextos.push(sub.trim());
          sub = p;
        } else {
          sub = (sub + ' ' + p).trim();
        }
      }
      if (sub) blocosTextos.push(sub.trim());
    } else if ((atual + ' ' + s).trim().length > maxLen) {
      if (atual) blocosTextos.push(atual.trim());
      atual = s;
    } else {
      atual = (atual + ' ' + s).trim();
    }
  }
  if (atual) blocosTextos.push(atual.trim());

  const totalChars = Math.max(
    1,
    blocosTextos.reduce((acc, b) => acc + b.length, 0)
  );
  let acumChars = 0;

  return blocosTextos.map((b) => {
    acumChars += b.length;
    return {
      texto: b,
      fracTextoFim: Math.min(1, acumChars / totalChars),
    };
  });
}

function montarUrlGoogleTts(bloco: string, varianteVoz: string): string {
  const q = encodeURIComponent(bloco);
  if (varianteVoz === 'google-solene') {
    return `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&ttsspeed=0.24&q=${q}`;
  }
  if (varianteVoz === 'google-clara') {
    return `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=pt-BR&client=gtx&q=${q}`;
  }
  if (varianteVoz === 'google-pt') {
    return `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-PT&client=tw-ob&ttsspeed=1&q=${q}`;
  }
  return `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&ttsspeed=1&q=${q}`;
}

export async function gerarAudioTtsPagina(params: {
  pautaId: number;
  pagina: number;
  texto: string;
  voz: string;
  openaiKey?: string;
}): Promise<{
  audioUrl: string;
  provedor: 'openai' | 'google' | 'gcloud';
  vozUsada: string;
  mapaTempo: PontoSincroniaAudio[];
}> {
  const textoLimpo = params.texto.trim();
  if (!textoLimpo) {
    throw new Error('Texto vazio para geração de áudio.');
  }

  const vozEscolhida = params.voz || VOZ_PADRAO;
  const chaveOpenai = (params.openaiKey || '').trim();
  const isVozGcloud = vozEscolhida.startsWith('gcloud:');
  const usarGcloud = isVozGcloud && (await googleCloudDisponivel());
  const isVozGoogle =
    vozEscolhida === 'google' || vozEscolhida.startsWith('google-');
  const usarOpenai = Boolean(chaveOpenai && !isVozGoogle && !isVozGcloud);
  const tagVoz = usarGcloud
    ? vozEscolhida
    : usarOpenai
      ? vozEscolhida
      : isVozGoogle && vozEscolhida !== 'google'
        ? vozEscolhida
        : 'google-feminina';
  const provedorEsperado: 'openai' | 'google' | 'gcloud' = usarGcloud
    ? 'gcloud'
    : usarOpenai
      ? 'openai'
      : 'google';
  const SPEAKING_RATE_GCLOUD = 1.2;

  const hash = crypto
    .createHash('md5')
    .update(`${textoLimpo}|${tagVoz}|${usarGcloud ? SPEAKING_RATE_GCLOUD : ''}`)
    .digest('hex')
    .slice(0, 10);

  const tagArquivo = tagVoz.replace(/[^a-zA-Z0-9-]+/g, '_');
  const nomeArquivo = `pauta_${params.pautaId}_pag_${params.pagina}_${tagArquivo}_h${hash}.mp3`;
  const dirAudios = path.join(process.cwd(), 'public', 'uploads', 'audios');
  await fs.mkdir(dirAudios, { recursive: true });
  const caminhoCompleto = path.join(dirAudios, nomeArquivo);
  const caminhoJson = `${caminhoCompleto}.json`;
  const urlPublica = `/api/arquivos/audios/${nomeArquivo}`;

  // Verifica cache determinístico em disco (baseado no hash do texto + voz)
  try {
    const stat = await fs.stat(caminhoCompleto);
    if (stat.size > 100) {
      let mapaTempo: PontoSincroniaAudio[] = [
        { fracAudio: 0, fracTexto: 0 },
        { fracAudio: 1, fracTexto: 1 },
      ];
      try {
        const rawJson = await fs.readFile(caminhoJson, 'utf-8');
        const parsed = JSON.parse(rawJson);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          mapaTempo = parsed;
        }
      } catch {
        // Sem JSON complementar
      }
      return {
        audioUrl: urlPublica,
        provedor: provedorEsperado,
        vozUsada: tagVoz,
        mapaTempo,
      };
    }
  } catch {
    // Arquivo ainda não existe no cache
  }

  // 0. Google Cloud TTS (credencial da Câmara) com marcas de tempo por palavra
  if (usarGcloud) {
    try {
      const { audio, duracao, marcas } = await sintetizarGoogleCloud({
        texto: textoLimpo,
        voz: tagVoz.replace(/^gcloud:/, ''),
        speakingRate: SPEAKING_RATE_GCLOUD,
      });
      const totalChars = Math.max(1, textoLimpo.length);
      const dur = Math.max(0.001, duracao);
      const mapaTempo: PontoSincroniaAudio[] = [{ fracAudio: 0, fracTexto: 0 }];
      for (const m of marcas) {
        const fa = Math.min(1, m.tempo / dur);
        const ft = Math.min(1, m.charIndex / totalChars);
        const ult = mapaTempo[mapaTempo.length - 1];
        if (fa >= ult.fracAudio && ft >= ult.fracTexto) {
          mapaTempo.push({ fracAudio: Number(fa.toFixed(5)), fracTexto: Number(ft.toFixed(5)) });
        }
      }
      mapaTempo.push({ fracAudio: 1, fracTexto: 1 });
      await fs.writeFile(caminhoCompleto, audio);
      await fs.writeFile(caminhoJson, JSON.stringify(mapaTempo), 'utf-8');
      return { audioUrl: urlPublica, provedor: 'gcloud', vozUsada: tagVoz, mapaTempo };
    } catch (err) {
      console.warn('Falha no Google Cloud TTS, usando voz gratuita de reserva:', err);
      return gerarAudioTtsPagina({ ...params, voz: 'google-feminina' });
    }
  }

  // 1. Tenta OpenAI TTS se houver chave configurada e voz OpenAI selecionada
  if (usarOpenai) {
    try {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chaveOpenai}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: vozEscolhida,
          input: textoLimpo.slice(0, 4096),
          speed: 1.0,
        }),
      });

      if (res.ok) {
        const ab = await res.arrayBuffer();
        const mapaLinear: PontoSincroniaAudio[] = [
          { fracAudio: 0, fracTexto: 0 },
          { fracAudio: 1, fracTexto: 1 },
        ];
        await fs.writeFile(caminhoCompleto, Buffer.from(ab));
        await fs.writeFile(caminhoJson, JSON.stringify(mapaLinear), 'utf-8');
        return {
          audioUrl: urlPublica,
          provedor: 'openai',
          vozUsada: vozEscolhida,
          mapaTempo: mapaLinear,
        };
      }
    } catch (err) {
      console.warn('Falha na OpenAI TTS, acionando fallback Google Feminina:', err);
    }
  }

  // 2. Vozes Gratuitas Google TTS (Reserva)
  const blocos = dividirTextoEmBlocosComOffset(textoLimpo, 165);
  const buffersPorBloco: { buf: Buffer; fracTextoFim: number }[] = [];

  const TAMANHO_LOTE = 6;
  for (let i = 0; i < blocos.length; i += TAMANHO_LOTE) {
    const lote = blocos.slice(i, i + TAMANHO_LOTE);
    const resultadosLote = await Promise.all(
      lote.map(async (bloco) => {
        const u = montarUrlGoogleTts(bloco.texto, tagVoz);
        const res = await fetch(u, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        });
        if (!res.ok) {
          return null;
        }
        const ab = await res.arrayBuffer();
        return {
          buf: Buffer.from(ab),
          fracTextoFim: bloco.fracTextoFim,
        };
      })
    );

    for (const item of resultadosLote) {
      if (item && item.buf.length > 0) {
        buffersPorBloco.push(item);
      }
    }
  }

  if (buffersPorBloco.length === 0) {
    throw new Error('Não foi possível sintetizar o áudio da página.');
  }

  const totalBytes = Math.max(
    1,
    buffersPorBloco.reduce((acc, b) => acc + b.buf.length, 0)
  );
  const mapaTempo: PontoSincroniaAudio[] = [{ fracAudio: 0, fracTexto: 0 }];
  let bytesAcumulados = 0;

  for (const item of buffersPorBloco) {
    bytesAcumulados += item.buf.length;
    mapaTempo.push({
      fracAudio: Math.min(1, Number((bytesAcumulados / totalBytes).toFixed(4))),
      fracTexto: Number(item.fracTextoFim.toFixed(4)),
    });
  }

  const mp3Final = Buffer.concat(buffersPorBloco.map((b) => b.buf));
  await fs.writeFile(caminhoCompleto, mp3Final);
  await fs.writeFile(caminhoJson, JSON.stringify(mapaTempo), 'utf-8');

  return {
    audioUrl: urlPublica,
    provedor: 'google',
    vozUsada: tagVoz,
    mapaTempo,
  };
}
