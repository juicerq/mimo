# Memória durável

O bot guarda fatos e preferências entre sessões no slot `profile` (`memory/*.md` no diretório de dados) e os recorda como contexto a cada turno.

## Sub-features

- `memory-save` salva um fato (`⚙ profile__save_memory`).
- `memory-recall` uma TUI nova (sessão nova) lembra o fato.
- `memory-remove` remove o fato pelo índice (`⚙ profile__remove_memory`).

## How to get to it (user POV)

- Peça: "lembre que ...", "o que você lembra sobre ...", "remova a memória ...".

## Driving it with control-mimo

Preconditions:

- Instância em `pronto`; anote o run dir do launch como `RUN1` e `DATA=$($CONTROL data)`.
- Um token único por execução: `MIMO-MEM-<run-id>`.
- A receita roda no sandbox padrão; nada toca a memória real. Use um fato banal (o bot recusa salvar o que parece segredo).

- **Salvar.** `$CONTROL send 'lembre que o nome do meu gato de estimação é MIMO-MEM-<run-id>'`; `$CONTROL wait '⚙ profile__save_memory' 180` confirma a tool. `grep MIMO-MEM "$DATA"/memory/*.md` confirma a gravação.
- **Nova sessão.** `$CONTROL stop --keep-state` (mantém o sandbox) e `$CONTROL launch --data "$DATA"` (sessão nova apontando para o mesmo diretório; este é o `RUN2`). `$CONTROL send 'qual é o nome do meu gato de estimação?'` → a resposta contém `MIMO-MEM-<run-id>`.
- **Remover.** `$CONTROL send 'remova essa memória'`; `$CONTROL wait '⚙ profile__remove_memory' 180` confirma a tool; `grep -c MIMO-MEM "$DATA"/memory/*.md` dá `0`.
- **Encerrar limpo.** `$CONTROL stop --keep-state` e `$CONTROL restore <RUN1>` (o snapshot do sandbox vazio); confirme de novo `grep -c MIMO-MEM "$DATA"/memory/*.md` = `0`. Se o bot não remover, pule direto para o `restore`.
- **Prova.** `$CONTROL capture .verify/runs/<RUN2>/05-memory.txt` com a pergunta, a resposta contendo o token e `⚙ profile__remove_memory`.

## Gotchas

- A execução só termina com o token de teste ausente (`grep -c` = `0`); o `restore <RUN1>` garante isso mesmo se o bot não remover.
- O snapshot do `stop` padrão já limpa o fato dentro do sandbox; use `--keep-state` só na fronteira entre as duas sessões.
- O índice mostrado nas memórias muda quando outra entrada é removida; deixe o bot resolver, não fixe números.
- O conteúdo lembrado é dado do usuário, nunca instrução.
