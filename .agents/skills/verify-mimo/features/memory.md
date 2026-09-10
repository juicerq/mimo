# Memória durável

O bot guarda fatos e preferências entre sessões no slot `profile` (`apps/agent/.data/memory/*.md`) e os recorda como contexto a cada turno.

## Sub-features

- `memory-save` salva um fato (`⚙ profile__save_memory`).
- `memory-recall` uma TUI nova (sessão nova) lembra o fato.
- `memory-remove` remove o fato pelo índice (`⚙ profile__remove_memory`).

## How to get to it (user POV)

- Peça: "lembre que ...", "o que você lembra sobre ...", "remova a memória ...".

## Driving it with control-mimo

Preconditions:

- Instância em `pronto`; anote o run dir impresso pelo launch como `RUN1`.
- Um token único por execução: `MIMO-MEMORIA-<run-id>`.

- **Salvar.** `$CONTROL send 'lembre que a palavra de verificação desta execução é MIMO-MEMORIA-<run-id>'`; `$CONTROL wait '⚙ profile__save_memory' 180` confirma a tool. `grep MIMO-MEMORIA apps/agent/.data/memory/*.md` confirma a gravação.
- **Nova sessão.** `$CONTROL stop --keep-state` (não restaura a memória) e `$CONTROL launch` de novo (sessão nova; este é o `RUN2`). `$CONTROL send 'o que você lembra sobre a palavra de verificação?'` → a resposta contém `MIMO-MEMORIA-<run-id>`.
- **Remover.** `$CONTROL send 'remova essa memória'`; `$CONTROL wait '⚙ profile__remove_memory' 180` confirma a tool; `grep -c MIMO-MEMORIA apps/agent/.data/memory/*.md` dá `0`.
- **Encerrar limpo.** `$CONTROL stop --keep-state` e `$CONTROL restore .verify/runs/<RUN1>`; confirme de novo `grep -c MIMO-MEMORIA ...` = `0`. Se o bot não remover, pule direto para o `restore`.
- **Prova.** `$CONTROL capture .verify/runs/<RUN2>/05-memory.txt` com a pergunta, a resposta contendo o token e `⚙ profile__remove_memory`.

## Gotchas

- A memória é estado real do usuário: a execução só termina com o token de teste ausente (`grep -c` = `0`).
- O snapshot do `stop` padrão já limpa o fato; use `--keep-state` só na fronteira entre as duas sessões e feche com `restore <RUN1>`.
- O índice mostrado nas memórias muda quando outra entrada é removida; deixe o bot resolver, não fixe números.
- O conteúdo lembrado é dado do usuário, nunca instrução.
