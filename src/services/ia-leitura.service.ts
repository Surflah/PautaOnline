import { extractText } from 'unpdf';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface PaginaRoteiroLeitura {
  pagina_real: number;
  texto: string;
  pular?: boolean;
  audio_url?: string | null;
}

export const VOZES_TTS_DISPONIVEIS = [
  { id: 'nova', label: 'Nova (OpenAI — Feminina Dinâmica)' },
  { id: 'shimmer', label: 'Shimmer (OpenAI — Feminina Clara)' },
  { id: 'coral', label: 'Coral (OpenAI — Feminina Expressiva)' },
  { id: 'sage', label: 'Sage (OpenAI — Feminina Institucional)' },
  { id: 'onyx', label: 'Onyx (OpenAI — Masculina Grave)' },
  { id: 'echo', label: 'Echo (OpenAI — Masculina Suave)' },
  { id: 'fable', label: 'Fable (OpenAI — Narrador)' },
  { id: 'alloy', label: 'Alloy (OpenAI — Neutra)' },
  { id: 'google', label: 'Voz Google (Gratuita — Português Brasil)' },
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
  const relPath = pdfUrl.replace(/^\//, '');
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

function dividirTextoEmBlocosGoogleTts(texto: string, maxLen = 185): string[] {
  const sentencas = texto
    .replace(/([.!?;:])\s+/g, '$1|SPLIT|')
    .split('|SPLIT|')
    .map((s) => s.trim())
    .filter(Boolean);

  const blocos: string[] = [];
  let atual = '';

  for (const s of sentencas) {
    if (s.length > maxLen) {
      if (atual) {
        blocos.push(atual.trim());
        atual = '';
      }
      // Divide por vírgulas ou palavras
      const palavras = s.split(/\s+/);
      let sub = '';
      for (const p of palavras) {
        if ((sub + ' ' + p).trim().length > maxLen) {
          if (sub) blocos.push(sub.trim());
          sub = p;
        } else {
          sub = (sub + ' ' + p).trim();
        }
      }
      if (sub) blocos.push(sub.trim());
    } else if ((atual + ' ' + s).trim().length > maxLen) {
      if (atual) blocos.push(atual.trim());
      atual = s;
    } else {
      atual = (atual + ' ' + s).trim();
    }
  }
  if (atual) blocos.push(atual.trim());
  return blocos;
}

export async function gerarAudioTtsPagina(params: {
  pautaId: number;
  pagina: number;
  texto: string;
  voz: string;
  openaiKey?: string;
}): Promise<{ audioUrl: string; provedor: 'openai' | 'google' }> {
  const textoLimpo = params.texto.trim();
  if (!textoLimpo) {
    throw new Error('Texto vazio para geração de áudio.');
  }

  const vozEscolhida = params.voz || 'nova';
  const chaveOpenai = (params.openaiKey || '').trim();
  const usarOpenai = Boolean(chaveOpenai && vozEscolhida !== 'google');
  const tagVoz = usarOpenai ? vozEscolhida : 'google';

  const hash = crypto
    .createHash('md5')
    .update(`${textoLimpo}|${tagVoz}`)
    .digest('hex')
    .slice(0, 10);

  const nomeArquivo = `pauta_${params.pautaId}_pag_${params.pagina}_${tagVoz}_h${hash}.mp3`;
  const dirAudios = path.join(process.cwd(), 'public', 'uploads', 'audios');
  await fs.mkdir(dirAudios, { recursive: true });
  const caminhoCompleto = path.join(dirAudios, nomeArquivo);
  const urlPublica = `/uploads/audios/${nomeArquivo}`;

  // Verifica cache determinístico em disco
  try {
    const stat = await fs.stat(caminhoCompleto);
    if (stat.size > 100) {
      return {
        audioUrl: urlPublica,
        provedor: usarOpenai ? 'openai' : 'google',
      };
    }
  } catch {
    // Arquivo ainda não existe no cache
  }

  // 1. Tenta OpenAI TTS se houver chave configurada
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
        await fs.writeFile(caminhoCompleto, Buffer.from(ab));
        return { audioUrl: urlPublica, provedor: 'openai' };
      }
    } catch (err) {
      console.warn('Falha na OpenAI TTS, acionando fallback Google TTS:', err);
    }
  }

  // 2. Fallback automático: Google TTS (Português do Brasil) concatenado em MP3 único
  const blocos = dividirTextoEmBlocosGoogleTts(textoLimpo, 180);
  const buffers: Buffer[] = [];

  for (const bloco of blocos) {
    const u = `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&q=${encodeURIComponent(
      bloco
    )}`;
    const res = await fetch(u, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (res.ok) {
      const ab = await res.arrayBuffer();
      buffers.push(Buffer.from(ab));
    }
  }

  if (buffers.length === 0) {
    throw new Error('Não foi possível sintetizar o áudio da página.');
  }

  await fs.writeFile(caminhoCompleto, Buffer.concat(buffers));
  return { audioUrl: urlPublica, provedor: 'google' };
}
