# Estado do Projeto — PautaOnline (Câmara Municipal de Itapoá)

## Status Atual
- **Fase**: Fase 1 Concluída — Base Next.js 15 + TypeScript + Tailwind v4 + Prisma ORM + SQLite/PostgreSQL, Login Institucional, Cadastro de Vereadores + Config OpenAI, Integração Real SAPL (`sapl.itapoa.sc.leg.br`) e Gestão Completa de Sessões/Pauta + Roteiro A4.
- **Repositório GitHub**: `https://github.com/Surflah/PautaOnline`
- **Domínio de Produção**: `https://pauta.camaraitapoa.sc.gov.br` (DNS apontando para VPS `177.153.60.71`, usuário SSH `ticamitp`, porta interna `3005`, diretório `/var/www/pauta`).

## Roteiro de Implementação (Fases)
- [x] **Fase 0**: Engenharia reversa completa do sistema legado (`camara.itapoa.digital/pauta`), criação de regras (`AGENTS.md`), memória persistente (`.agents/memory/`) e skills modulares (`.agents/skills/`).
- [x] **Fase 1**:
  - Setup do projeto Next.js 15 + TypeScript + Tailwind v4 + Prisma ORM;
  - Modelagem completa do banco de dados (`prisma/schema.prisma`) e seed inicial (`prisma/seed.ts`) com os 9 vereadores de Itapoá e sessão inicial;
  - Login simples (`camara` / `camara@1010`) + Middleware JWT Edge + Dashboard Institucional moderna com suporte a PWA (`manifest.json`);
  - Módulo Cadastro de Vereadores (`/vereadores`: ordem alfabética, Presidente por último, Licenciado, Chave OpenAI + teste de conexão ao vivo);
  - Módulo Sessões & Pauta (`/sessoes`, `/sessoes/montar-sapl`, `/sessoes/[id]/pauta`, `/sessoes/[id]/roteiro`) com integração real ao SAPL de Itapoá (Norma 1749 Regimento Interno, triagem de urgência Art. 51 LOM, Rito de 9 itens, agrupamento de Indicações com mesclagem de PDF via `pdf-lib`, importação entre sessões locais, reordenação drag-and-drop acessível e impressão A4).
- [ ] **Fase 2 (Próximo Passo)**: Deliberação em Plenário (`delibe`), Chamada Nominal com cálculo de quórum, Votação Regimental, Alerta em tempo real de alteração de pauta e Espaço Regimental (`palavralivre`).
- [ ] **Fase 3**: Revisão de Leituras em Lote com IA + Painel Pro de Leitura (PDF.js + TTS OpenAI/Google + Auto-Scroll ancorado no texto + Telão de Leitura OBS).
- [ ] **Fase 4**: Módulo Cerimonial / Câmara Mirim completo (Gerenciador, Mestre de Cerimônias, Mesa Presidente, Mesa Secretária, Telão Eleição, GC OBS e Roteiro Impresso).
- [ ] **Fase 5**: Perfis de acesso, Auditoria avançada (Controle Interno) e refinamentos finais.
