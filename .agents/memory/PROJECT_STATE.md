# Estado do Projeto — PautaOnline (Câmara Municipal de Itapoá)

## Status Atual
- **Fase**: Fase 3 Concluída — Revisão de Leituras em Lote com IA (`/sessoes/[id]/revisar-lote`), Painel Pro de Leitura com PDF.js + TTS OpenAI/Google + Auto-Scroll Ancorado no Texto (`/sessoes/[id]/leitura`) e Telão de Leitura 16:9 sincronizado para OBS Studio (`/sessoes/[id]/telao-leitura`).
- **Repositório GitHub**: `https://github.com/Surflah/PautaOnline`
- **Domínio de Produção**: `https://pauta.camaraitapoa.sc.gov.br` (DNS apontando para VPS `177.153.60.71`, usuário SSH `ticamitp`, porta interna `3005`, diretório `/var/www/pauta`).

## Roteiro de Implementação (Fases)
- [x] **Fase 0**: Engenharia reversa completa do sistema legado (`camara.itapoa.digital/pauta`), criação de regras (`AGENTS.md`), memória persistente (`.agents/memory/`) e skills modulares (`.agents/skills/`).
- [x] **Fase 1**: Setup Next.js 15 + TypeScript + Tailwind v4 + Prisma ORM, Login Institucional, Cadastro de Vereadores + Config OpenAI, Integração Real SAPL (`sapl.itapoa.sc.leg.br`) e Gestão Completa de Sessões/Pauta + Roteiro A4.
- [x] **Fase 2**: Painel de Deliberação em Plenário (`delibe`), Chamada Nominal com cálculo de quórum, Votação Regimental com trava/empate do Presidente, Detector de Alteração de Pauta em Tempo Real e Espaço Regimental (`palavralivre`) com sorteio de ordem.
- [x] **Fase 3**:
  - Serviço de Extração de PDF por página (`unpdf`), Limpeza Legislativa Determinística + Revisão via OpenAI GPT-4o-mini e Síntese de Voz TTS Híbrida (OpenAI Neural Voices `nova`, `shimmer`, `coral`, `sage`, `onyx`, `echo`, `fable`, `alloy` + Fallback automático Google TTS pt-BR concatenado em MP3 com cache determinístico por hash) em `src/services/ia-leitura.service.ts`;
  - Revisão de Leituras em Lote com IA (`/sessoes/[id]/revisar-lote` + `/api/sessoes/[id]/revisar-lote`);
  - Painel Pro de Leitura (`/sessoes/[id]/leitura` + `/api/sessoes/[id]/leitura`) com sidebar retrátil, controles auto-ocultáveis, ganho de volume via Web Audio API `GainNode`, modal `<dialog>` de preparação página a página (`🚫 Não ler esta página`), e motor de Auto-Scroll ancorado nas coordenadas reais do texto extraídas pelo `pdf.js`;
  - Telão de Leitura 16:9 para Projetor / OBS Studio (`/sessoes/[id]/telao-leitura` + `/api/sessoes/[id]/leitura-sync`) com amortecedor cinematográfico em `requestAnimationFrame` e GC institucional flutuante.
- [ ] **Fase 4 (Próximo Passo)**: Módulo Cerimonial / Câmara Mirim completo (Gerenciador, Mestre de Cerimônias, Mesa Presidente, Mesa Secretária, Telão Eleição, GC OBS e Roteiro Impresso).
- [ ] **Fase 5**: Perfis de acesso, Auditoria avançada (Controle Interno) e refinamentos finais.
