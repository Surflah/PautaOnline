---
name: clean-architecture
description: >-
  Use this skill when designing or implementing backend services, database schemas,
  real-time synchronization (WebSockets/SSE), authentication, audit logging (Controle Interno),
  and VPS/Docker deployment configurations for PautaOnline.
---

# Clean Architecture & Controle Interno — PautaOnline

## 1. Organização de Pastas e Camadas
Separe rigorosamente responsabilidades:
- **`domain/` ou `core/`**: Regras regimentais puras (cálculo de quórum `floor(total/2) + 1`, regra de voto do Presidente apenas em empate exceto em Projeto de Lei Complementar, elegibilidade de itens para revisão IA em 1ª ou Única Votação, agrupamento de Indicações).
- **`services/`**: Integração com SAPL, serviço de IA (OpenAI/Google TTS + limpeza de texto de PDF), geração de roteiros e sincronização de estado.
- **`api/` / `controllers/`**: Rotas validadas com schemas tipados (ex.: Zod), autenticação e tratamento padronizado de erros.
- **`ui/` / `components/`**: Componentes visuais desacoplados da lógica de banco de dados.

## 2. Sincronização em Tempo Real (Substituindo Polling Legado)
No sistema legado, vários clientes faziam polling HTTP a cada `500ms` ou `1000ms` (`ajax_sync_leitura.php`, `api_eleicao.php`, `ajax_estado_pauta.php`).
Na nova arquitetura:
- Utilize **Server-Sent Events (SSE)** ou **WebSockets** por canal (`sessao:{id}`, `leitura:{id}`, `cerimonial:{id}`), mantendo reconexão automática e fallback seguro.
- Para o Telão e GC do OBS Studio, utilize **Tokens de Exibição (Display Tokens)** assinados ou rotas de leitura autenticadas por token na URL, eliminando o `obsUsuario`/`obsSenha` hardcoded no código-fonte cliente.

## 3. Requisitos de Controle Interno e Segurança
- **Trilha de Auditoria (`AuditLog`)**: Toda criação/edição/exclusão de sessão, alteração de ordem de pauta, registro de presença, voto, limpeza de votação ou alteração de parâmetros deve registrar: `usuario_id`, `acao`, `entidade`, `entidade_id`, `dados_anteriores`, `dados_novos`, `ip` e `timestamp`.
- **Segredos Seguros**: Chaves de API (OpenAI, banco de dados, sessão) devem residir em `.env` ou cofre criptografado no servidor, nunca expostas ao navegador.
- **Pronto para VPS**: Manter `Dockerfile` e `docker-compose.yml` enxutos (App + Banco + Reverse Proxy/HTTPS) para deploy rápido quando o domínio e a VPS forem fornecidos.
