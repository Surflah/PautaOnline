# PautaOnline — Câmara Municipal de Itapoá-SC

Sistema Institucional de Gestão de Pautas Legislativas, Deliberação em Plenário, Leitura Automatizada por Inteligência Artificial (Teleprompter PDF + TTS) e Cerimonial / Câmara Mirim da **Câmara Municipal de Itapoá-SC**.

## Stack Tecnológica
- **Full-Stack Framework**: Next.js 15 (App Router) + TypeScript
- **Estilização & UI**: Tailwind CSS v4 + Lucide Icons
- **Banco de Dados & ORM**: Prisma ORM + SQLite / PostgreSQL
- **Integração Legislativa**: API REST pública do SAPL (`sapl.itapoa.sc.leg.br`) + Compilação do Regimento Interno (Norma Jurídica nº 1749)
- **Processamento de Documentos**: `pdf-lib` para mesclagem automática de proposições, pareceres e agrupamento de Indicações

## Execução Local
```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```
Acesse `http://localhost:3005`.
