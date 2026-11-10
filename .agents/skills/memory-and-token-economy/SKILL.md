---
name: memory-and-token-economy
description: >-
  Use this skill on every task to preserve project memory across turns and minimize
  token usage through progressive disclosure, targeted file reads, and concise state updates.
---

# Memory & Token Economy Workflow

## 1. Antes de Iniciar Qualquer Tarefa
1. Leia [`.agents/memory/PROJECT_STATE.md`](../../memory/PROJECT_STATE.md) (arquivo curto e direto) para saber o estado atual do projeto.
2. Se precisar consultar como o sistema antigo funcionava em determinado módulo, leia apenas a seção correspondente em [`.agents/memory/LEGACY_SYSTEM_SPEC.md`](../../memory/LEGACY_SYSTEM_SPEC.md) usando `StartLine` e `EndLine`.

## 2. Durante a Execução
- **Não releia arquivos inteiros sem necessidade**: Use `grep_search` para localizar símbolos ou linhas exatas e `read_file` com `StartLine`/`EndLine`.
- **Edições cirúrgicas**: Prefira `edit_file` em blocos específicos em vez de reescrever arquivos grandes inteiros.
- **Respostas objetivas**: Comunique resultados ao usuário de forma clara, estruturada e sem repetição desnecessária de código já salvo nos arquivos.

## 3. Ao Concluir uma Etapa
- Atualize [`.agents/memory/PROJECT_STATE.md`](../../memory/PROJECT_STATE.md) marcando os itens concluídos, registrando novas rotas/tabelas criadas e apontando o próximo passo lógico.
