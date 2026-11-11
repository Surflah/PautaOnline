# Estado do Projeto — PautaOnline (Câmara Municipal de Itapoá)

## Status Atual
- **Fase**: Fase 3 Concluída e Refinada — Cerimonial/Câmara Mirim removidos por decisão do Controle Interno; Painel Pro de Leitura (`/sessoes/[id]/leitura`) atualizado com **Vozes Gratuitas Femininas Google IA** (`google-feminina` padrão, `google-solene`, `google-clara`, `google-pt`) + **Vozes Nativas do Sistema (`speechSynthesis`)** + **Motor de Rolagem Automática Linha a Linha (`LinhaPdfAncorada` + `mapaTempo` + Guia Visual de Linha Ativa)** e servidor dinâmico de arquivos (`/api/arquivos/[...caminho]`) com suporte a HTTP `206 Partial Content`.
- **Repositório GitHub**: `https://github.com/Surflah/PautaOnline`
- **Domínio de Produção**: `https://pauta.camaraitapoa.sc.gov.br` (Deploy 100% ativo na VPS `177.153.60.71` com certificado SSL Let's Encrypt auto-renovável via `certbot.timer`, porta interna `3005`, Nginx proxy reverso).
- **Autenticação**: Usuário `camara` e senha `Camara#1989` configurados com hash `scrypt` (`src/lib/senha.ts`). Alterável via `ADMIN_PASSWORD='...' npm run admin:senha`.
- **Síntese de Voz Oficial**: Google Cloud TTS integrado com a credencial da Câmara Municipal de Itapoá (`credentials/google-tts.json`, gitignored), com voz padrão **Andressa** (`pt-BR-Standard-D`) e sincronia linha a linha via marcas SSML temporais por palavra. Fallback automático para vozes gratuitas em caso de indisponibilidade.

## Roteiro de Implementação (Fases)
- [x] **Fase 0**: Engenharia reversa completa do sistema legado (`camara.itapoa.digital/pauta`), criação de regras (`AGENTS.md`), memória persistente (`.agents/memory/`) e skills modulares (`.agents/skills/`).
- [x] **Fase 1**: Setup Next.js 15 + TypeScript + Tailwind v4 + Prisma ORM, Login Institucional, Cadastro de Vereadores + Config OpenAI, Integração Real SAPL (`sapl.itapoa.sc.leg.br`) e Gestão Completa de Sessões/Pauta + Roteiro A4.
- [x] **Fase 2**: Painel de Deliberação em Plenário (`delibe`), Chamada Nominal com cálculo de quórum, Votação Regimental com trava/empate do Presidente, Detector de Alteração de Pauta em Tempo Real e Espaço Regimental (`palavralivre`) com sorteio de ordem.
- [x] **Fase 3**:
  - Serviço de Extração de PDF por página (`unpdf`), Limpeza Legislativa Determinística + Revisão via OpenAI GPT-4o-mini e Síntese de Voz TTS Híbrida em lotes paralelos com **mapa de sincronia temporal por frase (`mapaTempo`)** e **Vozes Gratuitas Femininas Google IA** (`google-feminina`, `google-solene`, `google-clara`, `google-pt`) + OpenAI Neural Voices em `src/services/ia-leitura.service.ts`;
  - Servidor dinâmico de mídia em produção (`src/app/api/arquivos/[...caminho]/route.ts` + rewrite `/uploads/:path*`) com suporte a `Accept-Ranges: bytes` e `206 Partial Content`;
  - Revisão de Leituras em Lote com IA (`/sessoes/[id]/revisar-lote`);
  - Painel Pro de Leitura (`/sessoes/[id]/leitura`) com agrupamento real de linhas visuais do PDF (`LinhaPdfAncorada`), marcador visual luminoso na linha lida e rolagem automática linha a linha conforme a fala avança;
  - Telão de Leitura 16:9 para Projetor / OBS Studio (`/sessoes/[id]/telao-leitura`).
- [ ] **Fase 4 (Próximo Passo)**: Perfis de acesso, Painel de Auditoria do Controle Interno (`/auditoria`) e refinamentos finais.
