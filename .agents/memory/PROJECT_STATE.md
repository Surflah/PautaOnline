# Estado do Projeto — PautaOnline (Câmara Municipal de Itapoá)

## Status Atual
- **Fase**: Fase 2 Concluída — Deliberação em Plenário (`delibe`), Chamada Nominal com cálculo de quórum, Votação Regimental com trava/empate do Presidente, Detector de Alteração de Pauta em Tempo Real e Espaço Regimental (`palavralivre`) com sorteio de ordem.
- **Repositório GitHub**: `https://github.com/Surflah/PautaOnline`
- **Domínio de Produção**: `https://pauta.camaraitapoa.sc.gov.br` (DNS apontando para VPS `177.153.60.71`, usuário SSH `ticamitp`, porta interna `3005`, diretório `/var/www/pauta`).

## Roteiro de Implementação (Fases)
- [x] **Fase 0**: Engenharia reversa completa do sistema legado (`camara.itapoa.digital/pauta`), criação de regras (`AGENTS.md`), memória persistente (`.agents/memory/`) e skills modulares (`.agents/skills/`).
- [x] **Fase 1**: Setup Next.js 15 + TypeScript + Tailwind v4 + Prisma ORM, Login Institucional, Cadastro de Vereadores + Config OpenAI, Integração Real SAPL (`sapl.itapoa.sc.leg.br`) e Gestão Completa de Sessões/Pauta + Roteiro A4.
- [x] **Fase 2**:
  - Painel de Deliberação em Plenário (`/sessoes/[id]/deliberacao` + `/api/sessoes/[id]/deliberacao`):
    - Modo 1: Item Não-Votável comum com card amarelo de leitura da Presidência;
    - Modo 2: Item com `[CHAMADA]` (Chamada Nominal e Chamada para Ordem do Dia) com tabela interativa, cálculo de quórum regimental (`floor(ativos/2)+1`) e modal `<dialog>` de vereadores faltantes;
    - Modo 3: Item Votável com os 3 passos narrados, aviso de Lei Complementar, trava de voto do Presidente com liberação automática em caso de empate (Voto de Minerva) ou Lei Complementar, destaque amarelo para justificativa de voto, popup e placar fixo de resultado;
    - Detector de Alteração de Pauta em tempo real (`/api/sessoes/[id]/estado-pauta`) com faixa clicável no topo (amarela ou vermelha se houver marcações não salvas).
  - Módulo Espaço Regimental / Palavra Livre (`/palavra-livre` + `/api/palavra-livre`):
    - Inscrição com botões circulares táteis, sorteio eletrônico (`Fisher-Yates`), controle de quem está falando (`Conceder Palavra` -> `Falando` -> `Concluído`), textos regimentais dinâmicos e botão de finalizar sessão.
- [ ] **Fase 3 (Próximo Passo)**: Revisão de Leituras em Lote com IA + Painel Pro de Leitura (PDF.js + TTS OpenAI/Google + Auto-Scroll ancorado no texto + Telão de Leitura OBS).
- [ ] **Fase 4**: Módulo Cerimonial / Câmara Mirim completo (Gerenciador, Mestre de Cerimônias, Mesa Presidente, Mesa Secretária, Telão Eleição, GC OBS e Roteiro Impresso).
- [ ] **Fase 5**: Perfis de acesso, Auditoria avançada (Controle Interno) e refinamentos finais.
