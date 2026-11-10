# PautaOnline — Diretrizes do Agente (Câmara Municipal de Itapoá)

Este arquivo define as regras permanentes do projeto **PautaOnline** para garantir máxima organização, fidelidade às regras regimentais, excelência de interface (UI/UX) e economia rigorosa de tokens em cada prompt.

## 1. Memória Persistente e Economia de Tokens
- **Fonte da Verdade do Estado**: Antes de planejar ou alterar qualquer módulo, consulte [`.agents/memory/PROJECT_STATE.md`](.agents/memory/PROJECT_STATE.md) para saber o estado atual, decisões de stack e próximos passos.
- **Especificação do Sistema Legado**: Nunca refaça crawling do sistema antigo sem necessidade. Consulte [`.agents/memory/LEGACY_SYSTEM_SPEC.md`](.agents/memory/LEGACY_SYSTEM_SPEC.md), onde todo o funcionamento do sistema original (`camara.itapoa.digital/pauta`) já está documentado.
- **Leitura Cirúrgica**: Use `grep_search`, `find_by_name` e `read_file` com intervalos de linhas (`StartLine`/`EndLine`). Evite ler arquivos inteiros grandes repetidamente.
- **Atualização de Memória**: Ao concluir uma funcionalidade ou decisão arquitetural, atualize de forma concisa o arquivo [`.agents/memory/PROJECT_STATE.md`](.agents/memory/PROJECT_STATE.md).

## 2. Uso de Skills (Progressive Disclosure)
Ative as skills em `.agents/skills/` conforme a tarefa do prompt:
- `frontend-excellence`: Ao criar ou refinar telas (Dashboard, Tablets de Plenário, Teleprompter PDF, Telões e Overlays OBS/GC).
- `clean-architecture`: Ao estruturar banco de dados, APIs, autenticação, auditoria (Controle Interno) e sincronização em tempo real (SSE/WebSockets).
- `sapl-and-ai-integration`: Ao implementar integração com o SAPL (`sapl.itapoa.sc.leg.br`), montagem de pauta/rito, revisão de texto com IA, TTS (OpenAI/Google) e rolagem ancorada em PDF.
- `memory-and-token-economy`: Para manter o contexto enxuto entre sessões e prompts.

## 3. Padrões de Código e Organização
- **Modularidade**: Arquivos pequenos e com responsabilidade única (evitar arquivos monolíticos que misturam banco, regra de negócio, HTML e JS inline como no legado).
- **Segurança e Controle Interno**:
  - Jamais expor credenciais ou chaves de API (como OpenAI ou usuários de OBS) no código-fonte cliente/JS. Todas as credenciais devem ficar em variáveis de ambiente (`.env`) ou criptografadas no banco.
  - Manter trilha de auditoria (logs de quem criou/alterou pauta, votos, presença e configurações).
- **Ergonomia de Plenário**: Interfaces operadas em tablets durante sessões (Presidente, Secretária, Mestre de Cerimônias, Deliberação) exigem botões amplos, alto contraste, prevenção contra cliques duplos acidentais e resiliência a oscilações de rede.
