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
    label: '🌐 Google Feminina Brasil (Gratuita — Padrão)',
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
};

export function limparTextoLegislativoDeterministico(raw: string): string {
  let txt = raw || '';

  // Remove blocos de assinatura digital ICP-Brasil e rodapés de verificação
  txt = txt.replace(
    /Documento assinado digitalmente[\s\S]*?(?=\n\n|$)/gi,
    ''
  );
  txt = txt.replace(/Assinado digitalmente por[\s\S]*?(?=\n\n|$)/gi, '');
  txt = txt.replace(/Para verificar a validade das assinaturas[\s\S]*?(?=\n\n|$)/gi, '');
  txt = txt.replace(/Código verificador:.*$/gim, '');
  txt = txt.replace(/https?:\/\/\S+/gi, '');
  txt = txt.replace(/Página\s+\d+\s+de\s+\d+/gi, '');

  // Une linhas quebradas no meio de frases pelo layout do PDF
  txt = txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');

  // Expansões legislativas para leitura fluida em plenário
  txt = txt.replace(/\bItapoá\/SC\b/gi, 'Itapoá');
  txt = txt.replace(/\b(?:nº|n\.º|n\.)\s*(\d+)/gi, 'Número $1');
  txt = txt.replace(/\bArt\.\s*(\d+)º?/gi, 'Artigo $1');
  txt = txt.replace(/§\s*1º/g, 'Parágrafo primeiro');
  txt = txt.replace(/§\s*2º/g, 'Parágrafo segundo');
  txt = txt.replace(/§\s*3º/g, 'Parágrafo terceiro');
  txt = txt.replace(/§\s*(\d+)º?/g, 'Parágrafo $1');

  // Converte incisos romanos comuns ("I - ", "II – ")
  txt = txt.replace(
    /\b(XX|XIX|XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\s*[-–—]\s*/g,
    (match, rom) => {
      const ord = ROMANOS_ORDINAIS[rom];
      return ord ? `${ord}. ` : match;
    }
  );

  txt = txt.replace(/\s{2,}/g, ' ').trim();
  return txt;
}

export async function revisarPaginaComIA(
  textoOriginal: string,
  openaiKey?: string
): Promise<string> {
  const baseLimpa = limparTextoLegislativoDeterministico(textoOriginal);
  if (!baseLimpa) return '';

  const chave = (openaiKey || '').trim();
  if (!chave) {
    return baseLimpa;
  }

  try {
    const promptSistema = `Você é um revisor legislativo oficial da Câmara Municipal de Itapoá-SC preparando o texto de uma proposição para leitura em voz alta por TTS em plenário.
Regras obrigatórias:
1. Remova textos tachados, cabeçalhos repetitivos, rodapés, e carimbos de assinatura digital (ICP-Brasil, códigos verificadores).
2. Converta tabelas (como quadros de dotações orçamentárias) em prosa corrida natural para leitura em voz alta.
3. Escreva números de leis/requerimentos, datas, valores monetários (R$), artigos (Art.), parágrafos (§) e incisos romanos por extenso para que a voz sintética leia com perfeição.
4. Mantenha fidelidade absoluta ao conteúdo jurídico e legislativo original. Retorne APENAS o texto pronto para leitura, sem comentários adicionais.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          { role: 'system', content: promptSistema },
          { role: 'user', content: textoOriginal.slice(0, 12000) },
        ],
      }),
    });

    if (!res.ok) {
      return baseLimpa;
    }

    const data = await res.json();
    const respostaIA = String(data.choices?.[0]?.message?.content || '').trim();
    return respostaIA || baseLimpa;
  } catch (err) {
    console.warn('Fallback para limpeza determinística (OpenAI indisponível):', err);
    return baseLimpa;
  }
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
      limpo.length < 40 && /assinado|documento|verificador/i.test(raw);
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
  // Padrão: Google Feminina Brasil Fluida
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
  // Velocidade de síntese da voz Google Cloud (mesma do leitor antigo)
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

  // Verifica cache determinístico em disco
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

  // 2. Vozes Gratuitas Google TTS (Feminina Brasil / Solene / Clara / Clássica)
  // Busca em lotes paralelos de 6 blocos e constrói o mapa exato de sincronia de tempo por frase!
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
