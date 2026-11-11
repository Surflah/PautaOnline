import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ caminho: string[] }> }
) {
  try {
    const { caminho } = await params;
    if (!Array.isArray(caminho) || caminho.length === 0) {
      return NextResponse.json({ error: 'Caminho inválido.' }, { status: 400 });
    }

    // Previne path traversal
    const limpos = caminho.map((seg) => path.basename(seg));
    const baseDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(baseDir, ...limpos);

    if (!filePath.startsWith(baseDir)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.mp3') contentType = 'audio/mpeg';
    else if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.json') contentType = 'application/json; charset=utf-8';
    else if (ext === '.wav') contentType = 'audio/wav';

    const fileBuffer = await fs.readFile(filePath);
    const total = fileBuffer.length;
    const range = req.headers.get('range');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunksize = end - start + 1;

      if (start >= total || end >= total || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${total}`,
          },
        });
      }

      const chunk = fileBuffer.subarray(start, end + 1);
      return new NextResponse(chunk, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunksize),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  }
}
