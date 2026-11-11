/**
 * Google Cloud Text-to-Speech (conta de serviço) — sem SDK, via REST.
 * - Autentica com a credencial apontada por GOOGLE_APPLICATION_CREDENTIALS (JSON fora do git).
 * - Usa a API v1beta1 com marcas SSML (<mark/>) para obter o instante EXATO de cada palavra,
 *   permitindo a rolagem automática linha a linha sincronizada com a fala.
 */
import fs from 'fs/promises';
import path from 'path';
import { SignJWT, importPKCS8 } from 'jose';

interface CredencialServico {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
}

export interface MarcaTempoPalavra {
  charIndex: number; // posição da palavra no texto original da página
  tempo: number; // segundos desde o início do MP3 final
}

let credCache: CredencialServico | null = null;
let tokenCache: { token: string; expiraEm: number } | null = null;

async function carregarCredencial(): Promise<CredencialServico | null> {
  if (credCache) return credCache;
  const caminho = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!caminho) return null;
  try {
    const abs = path.isAbsolute(caminho) ? caminho : path.join(process.cwd(), caminho);
    const json = JSON.parse(await fs.readFile(abs, 'utf-8'));
    if (!json.client_email || !json.private_key) return null;
    credCache = json;
    return credCache;
  } catch (err) {
    console.warn('Credencial Google Cloud TTS indisponível:', err);
    return null;
  }
}

export async function googleCloudDisponivel(): Promise<boolean> {
  return Boolean(await carregarCredencial());
}

async function obterTokenAcesso(): Promise<string> {
  if (tokenCache && tokenCache.expiraEm > Date.now() + 60_000) return tokenCache.token;
  const cred = await carregarCredencial();
  if (!cred) throw new Error('Credencial Google Cloud não configurada.');

  const tokenUri = cred.token_uri || 'https://oauth2.googleapis.com/token';
  const agora = Math.floor(Date.now() / 1000);
  const chave = await importPKCS8(cred.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/cloud-platform' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(cred.client_email)
    .setSubject(cred.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(agora)
    .setExpirationTime(agora + 3600)
    .sign(chave);

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Falha ao autenticar no Google Cloud: ${data.error_description || data.error || res.status}`);
  }
  tokenCache = { token: data.access_token, expiraEm: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

/** Duração (s) de um MP3 contando os frames MPEG (funciona para CBR e VBR). */
export function duracaoMp3(buf: Buffer): number {
  const BITRATES: Record<string, number[]> = {
    // [versão][layer3] kbps
    v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  };
  const SAMPLERATES: Record<number, number[]> = {
    3: [44100, 48000, 32000], // MPEG1
    2: [22050, 24000, 16000], // MPEG2
    0: [11025, 12000, 8000], // MPEG2.5
  };
  let i = 0;
  // Pula tag ID3v2
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + size;
  }
  let segundos = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const versao = (buf[i + 1] >> 3) & 0x03;
    const layer = (buf[i + 1] >> 1) & 0x03;
    const brIdx = (buf[i + 2] >> 4) & 0x0f;
    const srIdx = (buf[i + 2] >> 2) & 0x03;
    const padding = (buf[i + 2] >> 1) & 0x01;
    if (versao === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) {
      i++;
      continue;
    }
    const kbps = (versao === 3 ? BITRATES.v1 : BITRATES.v2)[brIdx];
    const sr = SAMPLERATES[versao][srIdx];
    const amostras = versao === 3 ? 1152 : 576;
    const tamanho = Math.floor(((amostras / 8) * kbps * 1000) / sr) + padding;
    if (tamanho <= 4) {
      i++;
      continue;
    }
    segundos += amostras / sr;
    i += tamanho;
  }
  return segundos;
}

function escaparXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface TrechoSsml {
  ssml: string;
  marcas: Map<string, number>; // nome da marca -> charIndex no texto original
}

/** Divide o texto em trechos SSML (< 5000 bytes) com uma <mark/> antes de cada palavra. */
function montarTrechosSsml(texto: string, limiteBytes = 4200): TrechoSsml[] {
  const trechos: TrechoSsml[] = [];
  let corpo = '';
  let marcas = new Map<string, number>();
  let n = 0;

  const fechar = () => {
    if (!corpo.trim()) return;
    trechos.push({ ssml: `<speak>${corpo}</speak>`, marcas });
    corpo = '';
    marcas = new Map();
  };

  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const nome = `w${n++}`;
    const pedaco = `<mark name="${nome}"/>${escaparXml(m[0])} `;
    const fimDeFrase = /[.!?;:]$/.test(m[0]);
    // Fecha o trecho antes de estourar o limite de bytes da API (5000)
    if (Buffer.byteLength(corpo + pedaco) > limiteBytes - 20) fechar();
    corpo += pedaco;
    marcas.set(nome, m.index);
    if (fimDeFrase && Buffer.byteLength(corpo) > limiteBytes * 0.8) fechar();
  }
  fechar();
  return trechos;
}

/**
 * Sintetiza o texto com a voz do Google Cloud e devolve o MP3 + marcas de tempo por palavra.
 */
export async function sintetizarGoogleCloud(params: {
  texto: string;
  voz: string; // ex.: pt-BR-Standard-D
  speakingRate?: number;
}): Promise<{ audio: Buffer; duracao: number; marcas: MarcaTempoPalavra[] }> {
  const token = await obterTokenAcesso();
  const trechos = montarTrechosSsml(params.texto);
  const codigoIdioma = params.voz.split('-').slice(0, 2).join('-') || 'pt-BR';

  const buffers: Buffer[] = [];
  const marcas: MarcaTempoPalavra[] = [];
  let deslocamento = 0;

  // Sintetiza os trechos em paralelo e depois concatena em ordem, deslocando os tempos
  const respostas = await Promise.all(
    trechos.map(async (trecho) => {
      const res = await fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          input: { ssml: trecho.ssml },
          voice: { languageCode: codigoIdioma, name: params.voz },
          audioConfig: { audioEncoding: 'MP3', speakingRate: params.speakingRate ?? 1.0 },
          enableTimePointing: ['SSML_MARK'],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.audioContent) {
        throw new Error(`Google Cloud TTS: ${data.error?.message || res.status}`);
      }
      return { trecho, data };
    })
  );

  for (const { trecho, data } of respostas) {
    const buf = Buffer.from(data.audioContent, 'base64');
    for (const tp of data.timepoints || []) {
      const charIndex = trecho.marcas.get(tp.markName);
      if (charIndex !== undefined) {
        marcas.push({ charIndex, tempo: deslocamento + Number(tp.timeSeconds || 0) });
      }
    }
    deslocamento += duracaoMp3(buf);
    buffers.push(buf);
  }

  return { audio: Buffer.concat(buffers), duracao: deslocamento, marcas };
}

/** Lista as vozes disponíveis do Google Cloud para um idioma. */
export async function listarVozesGoogleCloud(idioma = 'pt-BR'): Promise<{ name: string; ssmlGender: string }[]> {
  const token = await obterTokenAcesso();
  const res = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=${idioma}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.voices || [];
}
