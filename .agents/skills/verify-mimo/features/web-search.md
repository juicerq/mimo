# Buscar na web

O usuário pede uma pesquisa na conversa e o bot usa a tool `web_search` (MCP público da Exa, sem chave) para responder com títulos, links e trechos atuais.

## Sub-features

- `search-run` executa `⚙ web_search` a partir de um pedido em linguagem natural.
- `search-answer` responde citando fonte (título, URL ou domínio).
- `search-recent` traz informação atual (data ou notícia).
- `search-fail` mostra mensagem acionável quando a busca falha (429, timeout, rede).

## How to get to it (user POV)

- Peça na conversa: "pesquise na web ...".

## Driving it with control-mimo

Preconditions:

- Instância de `$CONTROL launch` em `ready`; rede disponível.
- `EXA_API_KEY` é opcional (cota maior); a busca funciona sem chave.

- **Busca.** `$CONTROL send 'pesquise na web uma notícia recente sobre o OpenCode e diga a fonte'` (o comando retorna quando o turno termina; a busca leva de segundos a ~30 s). `$CONTROL wait '⚙ web_search' 180` confirma a tool no transcript.
- **Prova.** `$CONTROL capture .verify/runs/<id>/02-web-search.txt`. A resposta contém um domínio ou URL (`http`) e um título ou data.

## Gotchas

- A Exa pública limita por IP; excesso de pedidos (429) vira uma mensagem em português no transcript, não um erro cru.
- Resultados mudam a cada dia: asserte a presença de fonte, não a URL exata.
- O modelo pode chamar `web_search` mais de uma vez; o `send` só retorna quando o turno termina, então capture depois dele.
- `maxResults` vai até 10 e a tool trunca a saída em 6.000 caracteres.
