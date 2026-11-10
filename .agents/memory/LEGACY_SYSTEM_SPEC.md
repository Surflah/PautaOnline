# Especificação Técnica Reversa — Sistema Legado (`camara.itapoa.digital/pauta`)

Este documento registra toda a engenharia reversa funcional do sistema atual para consulta rápida pelos agentes, economizando tokens e garantindo 100% de paridade funcional antes das melhorias.

---

## 1. Visão Geral e Estrutura
O sistema atual foi construído em PHP (com páginas misturando HTML/CSS/JS inline e endpoints `ajax_*.php`), banco de dados relacional e suporte básico a PWA (`manifest.json` + `service-worker.js`).
Divide-se em **dois grandes núcleos**:
1. **Núcleo Legislativo (Sessões Plenárias / Comissões)** (`/pauta/` e `/pauta/pages/`)
2. **Núcleo Cerimonial / Câmara Mirim e Eleições de Mesa** (`/pauta/cerimonial/`)

---

## 2. Núcleo Legislativo (`/pauta/pages/`)

### 2.1. Cadastro de Vereadores e Configurações (`vereadores.php`)
- **Ordem de Chamada**: Sempre em ordem alfabética pelo nome parlamentar; o **Presidente** fica sempre **por último** na lista de votação.
- **Campos do Vereador**:
  - `id`, `tratamento` (`Vereador` | `Vereadora`), `nome` (como é chamado na sessão, ex.: Ademar, Daniel, Diego, Jessica, Marta, Odinei, Valdecir, Wagner, Ivan).
  - Status: `Ativo`, `Presidente` (único por vez; definir um novo remove o anterior), `Licenciado` (fica cinza/desabilitado nas chamadas e votações).
- **Regra de Voto do Presidente**:
  - Por padrão, os botões de voto do Presidente ficam **desabilitados** (`disabled`), pois ele só vota em caso de **empate**.
  - **Exceção Regimental**: Quando `tipo_item == "Projeto de Lei Complementar"`, o Presidente **vota sempre** (exibe aviso amarelo `.aviso-lei-complementar`).
- **Chave da OpenAI (`acao=chave_openai`)**:
  - Armazena e testa a chave `sk-...` da OpenAI usada para revisão de texto via LLM e geração de voz (TTS).
  - Possui fallback automático para a voz do Google caso a OpenAI falhe.

### 2.2. Seleção e Criação de Sessões (`selecionar_sessao.php` e `montar_pauta.php`)
Duas formas de criar sessão:
1. **Manual**: Informando o nome livre (ex.: `34ª Reunião Ordinária da 2ª Sessão Legislativa da 10ª Legislatura`).
2. **Montar Pauta do SAPL (`montar_pauta.php`)**:
   - Busca as últimas sessões na API do SAPL (`ajax_buscar_sessoes_sapl.php`).
   - Parâmetros configuráveis antes de gravar:
     - `artigo_ri` (1 a 265): Busca o artigo vigente na compilação do Regimento Interno no SAPL para o Item 2.
     - `servidor` + `servidor_feminino` (`Servidor` / `Servidora`): Nome de quem fará a leitura em plenário (ex.: Servidora Patrícia / Servidor Daniel).
     - `modo_pdf`: `texto` (só texto original — usado em sessão ordinária) ou `mesclado` (texto + documentos acessórios mesclados — usado em comissões).
   - **Triagem automática do Expediente (`ajax_montar_triagem.php`)**:
     - Analisa os PDFs das matérias dando entrada no expediente para detectar automaticamente pedidos de **Regime de Urgência (Art. 51 LOM)** na exposição de motivos e identificar **Leis Orçamentárias**.
     - Caso o PDF seja digitalizado/sem texto extraível, alerta `sem_texto` para conferência manual.
   - **Geração do Rito Padrão (`ajax_montar_previa.php`)**:
     Gera automaticamente os itens não-votáveis do rito com os textos que o Presidente lê em plenário (campo `ementa`):
     1. `SAUDAÇÃO`
     2. `Leitura do Regimento Interno` (com o texto do artigo buscado no SAPL)
     3. `Chamada nominal` (contém a tag `[CHAMADA]` que renderiza a tabela de presença no `delibe.php`)
     4. `Leitura das correspondências`
     5. `Deliberação da ata da sessão anterior` (preenche número da ata anterior)
     6. `Matérias do Expediente (Dando Entrada na Casa)` (conta quantos projetos do Executivo e do Legislativo estão entrando)
     7. `Deliberação - Regime de Urgência (Art. 51 LOM)` (gerado se houver matérias marcadas como urgentes na triagem)
     8. `Distribuição dos Projetos` (lista os projetos em regime ordinário ou de urgência)
     9. `Chamada para ordem do dia` (contém a tag `[CHAMADA]`)
   - **Importação da Ordem do Dia do SAPL**:
     - Importa todas as matérias da Ordem do Dia como itens votáveis na sequência do SAPL, baixando os PDFs.
     - **Regra das Indicações**: Todas as `Indicações` selecionadas são **agrupadas em um único item não-votável** (`Leitura das Indicações`, ex.: "Solicito a Leitura das Indicações 316 a 324 de 2026. ESSE É O FIM DA PAUTA..."), com todos os PDFs mesclados em um único arquivo `indicacoes.pdf`.

### 2.3. Gerenciamento de Pauta (`cadastro.php` e `editar.php`)
- **Importação entre sessões locais (`importar_selecao.php`)**: Permite copiar itens selecionados de outra sessão já cadastrada.
- **Importação avulsa do SAPL (`importar_sapl_progresso.php`)**: Permite buscar a Ordem do Dia de uma sessão do SAPL e importar itens selecionados (`modo_pdf`: `texto` ou `mesclado`).
- **Cadastro/Edição de Item**:
  - `numero` (ordem numérica), `titulo`, `ementa` (texto lido pelo presidente ou descrição da matéria).
  - `tipo_item`:
    - `Projeto de Lei Ordinária`
    - `Projeto de Lei Complementar`
    - `Projeto de Lei Substitutivo`
    - `Projeto de Resolução`
    - `Proposta de Emenda a Lei Orgânica`
    - `Projeto de Decreto Legislativo`
    - `Requerimento`
    - `Indicação`
    - `Moção`
    - `Emenda Legislativa`
    - `Subemenda legislativa`
    - `Veto Parcial ou Total`
    - `Denúncia de Infração Político-Administrativa`
  - `autor` (string com autores separados por vírgula).
  - `votacao_etapa`: `Primeira Votação` | `Segunda Votação` | `Única Votação` | vazio.
  - `votavel`: `sim` | `nao`.
  - `pdf_anexo`: Upload/substituição/remoção de PDF.
- **Reordenação Drag-and-Drop**: Usa SortableJS na tabela (`#pauta-tbody`) e envia a nova ordem para `salvar_ordem_pauta.php`.
- **Exclusão de Votações**: Botão para zerar todas as votações da sessão sem apagar os itens da pauta.

### 2.4. Roteiro para Impressão (`roteiro_imprimir.php`)
- Exibe cabeçalho oficial com Brasão da Câmara Municipal de Itapoá e lista sequencial de todos os itens da sessão com `Título`, `Autor`, `Ementa` e `Etapa de Votação`, formatado com `@media print` para impressão A4 limpa.

### 2.5. Revisão de Leituras em Lote com IA (`revisar_lote.php` + `ajax_revisar_lote.php`)
- Filtra apenas os itens **elegíveis** da sessão:
  - Devem ser **votáveis** (`votavel == 'sim'`), ter **PDF anexado**, estar em **Primeira Votação** ou **Única Votação** (itens em *Segunda Votação* são ignorados automaticamente pois já foram lidos na primeira votação) e ainda não terem leitura revisada.
- Dispara jobs assíncronos em background (`acao=iniciar`, monitorados via `acao=status` a cada 3s) que enviam o PDF para a IA:
  - Remover textos tachados;
  - Converter tabelas (ex.: dotações orçamentárias) em texto corrido (prosa);
  - Escrever números, valores monetários, datas, nº, § e incisos por extenso para leitura fluida pelo TTS.

### 2.6. Painel Pro de Leitura e Telão de Leitura (`leitura_roteiro.php` e `telao_leitura.php`)
- **Interface**:
  - Barra lateral retrátil com os itens da pauta que possuem PDF e badges coloridos (`Única votação` verde, `1ª votação` azul, `2ª votação` laranja).
  - Barra superior (auto-oculta após 2s de reprodução e reaparece ao mover o mouse) com controles:
    - Velocidade de rolagem (`1.2` Lenta, `0.9` Normal, `0.7` Rápida, `0.5` Muito Rápida);
    - Seleção de Voz OpenAI TTS (`nova`, `shimmer`, `marin`, `coral`, `sage`, `onyx`, `echo`, `fable`, `ash`, `cedar`, `alloy`);
    - Velocidade de reprodução no navegador (`0.85x` a `1.25x`, padrão `1.25x` via `playbackRate`, sem precisar regenerar o áudio);
    - Botões Página Anterior (`⏮`), Play/Pause (`▶`/`⏸`), Próxima Página (`⏭`);
    - Ganho de volume via Web Audio API (`VOLUME_BOOST = 1.7`).
- **Modal de Preparação do Roteiro (`#modal-prep`)**:
  - Exibe o texto extraído/revisado separado por página (`Página 1`, `Página 2`, ...).
  - Permite marcar páginas específicas com `🚫 Não ler esta página` (`pag.pular = true`, ex.: exposição de motivos ou páginas de assinatura).
  - Botão `✨ Revisar formatações` (`ajax_limpar_ia_start.php` + `ajax_limpar_ia_status.php`): processa com IA apenas as páginas não marcadas para pular.
  - Botão `🔄 Recarregar Original do PDF` (`ajax_obter_paginas.php?ignore_cache=1`).
  - Botão `💾 Salvar e Gerar Áudios` (`ajax_salvar_texto.php` + `ajax_gerar_audio_ia.php`): gera o MP3 da 1ª página legível imediatamente e pré-carrega as demais páginas em background usando dois elementos `<audio>` alternados.
- **Motor de Auto-Scroll Ancorado no Texto (`construirAncorasTexto` + `alvoScroll`)**:
  - Usa `pdf.js` (`page.getTextContent()`) para extrair as coordenadas Y reais do texto na página.
  - Remove automaticamente blocos de assinatura digital (`ICP-Brasil`, `assinado digitalmente`, `verificador`) para não rolar para o rodapé em branco.
  - Casa palavras-marco do PDF com o texto revisado falado para ancorar a posição vertical exata (mantendo a linha lida a ~42% da altura da tela).
  - Em páginas de tabela densa (`pageCoberturaDensa`), combina interpolação ancorada (45%) + linear (55%) para rolagem suave.
  - Mantém a rolagem ativa mesmo com a aba em segundo plano (`visibilitychange` timer de 250ms).
  - Se o operador rolar manualmente (`wheel`/`touchstart`), ativa `⚠️ Rolagem Manual Ativa` e exibe botão `▶ Retomar Auto-Scroll`.
- **GC Flutuante ("Em Leitura")**: Aparece 3 segundos após iniciar a leitura com animação lateral.
- **Sincronização Master -> Slave (`telao_leitura.php` + `ajax_sync_leitura.php`)**:
  - Envia a cada 500ms o estado (`pauta_id`, `titulo`, `pagina`, `scroll`, `max_scroll`, `audio_url`, `is_playing`, `current_time`, `playback_rate`).
  - `telao_leitura.php` aplica um amortecedor contínuo (`diferenca * 0.025` no `requestAnimationFrame`) para deslizar o PDF no telão/OBS com fluidez cinematográfica.

### 2.7. Deliberação em Plenário (`delibe.php` + `ajax_estado_pauta.php`)
- Conduz a sessão item a item (`?item=proximo&sessao_id=X`).
- **Três modos de renderização conforme o item**:
  1. **Item Não-Votável Comum**: Exibe o título do item, a `ementa` destacada em caixa amarela (`.ementa-padrao`) para leitura do Presidente e o botão `➡️ Próximo Item`.
  2. **Item com `[CHAMADA]` na Ementa** (ex.: Item 3 Chamada Nominal e Item 9 Chamada para Ordem do Dia):
     - Substitui a tag `[CHAMADA]` por uma tabela interativa de presença (`Presente` / `Ausente`) para cada vereador ativo.
     - Calcula em tempo real quando todos foram marcados e exibe: `"Há quórum regimental."` ou `"Não há quórum regimental."` (`maioria = floor(total / 2) + 1`).
     - Se tentar avançar sem marcar todos, abre modal listando os vereadores faltantes (`Voltar e marcar` ou `Avançar mesmo assim`).
     - Possui botão `Limpar Chamada`.
  3. **Item Votável (`votavel == 'sim'`)**:
     - Exibe ementa em itálico, barra de etapa + autor, e os **3 passos narrados** para o Presidente ler:
       - `1 - Solicito que seja feita a leitura do(a) [Título]`
       - `2 - Em DISCUSSÃO o(a) [Título]`
       - `3 - Em [Etapa de Votação] o(a) [Título]`
     - Tabela de votação com colunas: `Vereador`, `Sim`, `Não`, `Justificar` (checkbox que destaca a linha em amarelo `.justificando`), `Abstenção`, `Ausente/Atestado`.
     - O botão `➡️ Próximo Item` fica desabilitado até que a votação seja salva (`💾 Salvar Votação`).
     - Ao salvar, exibe popup (`#faixaResultado`) e texto fixo (`#resultadoFixo`) com o resultado da deliberação (Aprovado / Rejeitado / placar) e libera o avanço.
- **Detector de Alteração de Pauta em Tempo Real (`ajax_estado_pauta.php`)**:
  - A cada 5s confere o hash MD5 da pauta (`PAUTA_CARIMBO`).
  - Se a secretaria alterar a pauta durante a sessão, exibe uma faixa de alerta no topo do tablet do Presidente ("A pauta foi alterada. Toque para atualizar esta tela"), mantendo-o ancorado no item atual e avisando caso haja votos marcados ainda não salvos na tela.

### 2.8. Espaço Regimental / Palavra Livre (`palavralivre.php`)
- Permite marcar quais vereadores vão usar a palavra (`Vai Falar?` checkbox circular customizado) e exibe o status/ordem.
- Textos regimentais de abertura e concessão da palavra na tela.
- Botões: `💾 Salvar Alterações`, `🧹 Limpar Tabela`, `🚫 Finalizar Sessão`, `🔙 Voltar à Dashboard`.

---

## 3. Núcleo Cerimonial / Câmara Mirim (`/pauta/cerimonial/`)

Sistema multipainel sincronizado para Sessões Solenes, Posse, Câmara Mirim e Eleição de Mesa Diretora:

1. **Dashboard de Cerimoniais (`cerimonial/index.php`)**:
   - Criar novo evento (Título + Data), Editar nome/data, Duplicar evento inteiro (copiando roteiro e configurações).
2. **Gerenciador do Evento (`gerenciar_cerimonial.php` + `ajax_gerenciar.php`)**:
   - **Aba 1 — Pessoas & Fotos**: Cadastro de vereadores/participantes com Nome, Partido/Escola, Data de Nascimento (para critério de desempate por idade) e Foto.
   - **Aba 2 — Votações / Cargos**: Cadastro de cargos em disputa (Ordem, Nome do Cargo ex.: `Presidente`, Tag de substituição automática no roteiro ex.: `[presidente]`).
   - **Aba 3 — Roteiro Completo**:
     - Itens reordenáveis via Drag-and-Drop (`Orador`, `Texto`, `Observação em amarelo`, e `Ação Automática do Sistema`).
     - Colagem inteligente no campo de texto: remove quebras de linha de PDFs automaticamente ao colar.
     - Ações automáticas vinculadas ao item do roteiro:
       - `juramento` (Todos em pé)
       - `candidatura_<Cargo>` (Abre inscrições de candidatos no tablet do Presidente e Telão)
       - `votacao_<Cargo>` (Inicia votação no tablet da Secretária, chamada no Presidente e gráfico ao vivo no Telão/GC)
       - `resultado_<Cargo>` (Exibe resultado final para leitura da Secretária e destaca vencedor no Telão/GC)
3. **Telas de Operação Sincronizadas (`api_eleicao.php`)**:
   - **🎤 Mestre de Cerimônias (`painel_cerimonial.php`)**: Teleprompter com modo claro/escuro e tela cheia; botões `⬅ Anterior` e `Próximo ➡` que comandam o ponteiro global (`atualizar_ponteiro`) de todos os demais tablets e telões!
   - **👔 Mesa Presidente (`tela_presidente.php`)**:
     - Em modo leitura: acompanha o roteiro e destaca em verde (`🎤 SUA VEZ DE FALAR`) quando o orador contém "Presidente".
     - Em modo eleição (`candidatura`): exibe botões com os nomes dos vereadores para o Presidente tocar e registrar/remover candidatos ao vivo no telão, mais botão `▶️ ENCERRAR INSCRIÇÕES E VOTAR`.
     - Em modo eleição (`votacao`): exibe lista de chamada nominal interativa e botão `🏁 ENCERRAR VOTAÇÃO`.
   - **✍️ Mesa Secretária (`tela_secretaria.php`)**:
     - Em modo leitura: destaca em rosa (`SUA VEZ DE FALAR`) quando o orador é "Secretária" ou "Todos".
     - Em modo votação: exibe cada vereador eleitor com botões para os candidatos inscritos; ao clicar registra o voto imediatamente (`registrar_voto`).
     - Em modo encerrado/resultado: exibe a lista ordenada por votos para leitura oficial.
   - **🖥️ Telão / Projetor (`telao_eleicao.php`)**:
     - Tela de descanso animada com brasão -> Grid de fotos e nomes dos candidatos registrados -> Gráfico de barras animado em tempo real durante a votação -> Destaque dourado `ELEITO` no encerramento.
   - **🎥 GC Transmissão OBS (`telao_gc.php`)**:
     - Fundo transparente (`background: transparent`) com barra inferior (lower-third) exibindo logo, cargo, status e mini-cards com fotos, barras e contagem de votos ao vivo para sobreposição no OBS Studio.
   - **📄 Roteiro Impresso (`ver_roteiro.php`)**: Folha A4 formatada para impressão/PDF com todos os itens numerados, orador, texto e observações.
