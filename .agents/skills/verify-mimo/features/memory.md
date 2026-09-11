# Memória durável

O bot guarda fatos e preferências em `bots/<id>/memory.md` no diretório de dados e os recorda como contexto a cada turno. A memória permanece no mesmo arquivo quando o contexto é compactado.

## Sub-features

- `memory-save` salva um fato (`⚙ save_memory`).
- `memory-recall` reabrir o mesmo bot lembra o fato, inclusive após reiniciar o agente.
- `memory-remove` remove o fato pelo índice (`⚙ remove_memory`).

## How to get to it (user POV)

- Peça: "lembre que ...", "o que você lembra sobre ...", "remova a memória ...".

## Driving it with control-mimo

Preconditions:

- Instância em `ready`, com um bot criado por `/new Memória`; anote o run dir do launch como `RUN1` e `DATA=$($CONTROL data)`.
- Um token único por execução: `MIMO-MEM-<run-id>`.
- A receita roda no sandbox padrão; nada toca a memória real. Use um fato banal (o bot recusa salvar o que parece segredo).

- **Salvar.** `$CONTROL send 'lembre que o nome do meu gato de estimação é MIMO-MEM-<run-id>'`; `$CONTROL wait '⚙ save_memory' 180` confirma a tool. `grep -r MIMO-MEM "$DATA"/bots` confirma a gravação.
- **Retomar.** `$CONTROL stop --keep-state` (mantém o sandbox) e `$CONTROL launch --data "$DATA"` (mesmo diretório; este é o `RUN2`). Abra o mesmo bot pelo número na lista. `$CONTROL send 'qual é o nome do meu gato de estimação?'` → a resposta contém `MIMO-MEM-<run-id>`.
- **Remover.** `$CONTROL send 'remova essa memória'`; `$CONTROL wait '⚙ remove_memory' 180` confirma a tool; `grep -rc MIMO-MEM "$DATA"/bots` dá `0`.
- **Encerrar limpo.** `$CONTROL stop --keep-state` e `$CONTROL restore <RUN1>` (o snapshot do sandbox vazio); confirme de novo `grep -rc MIMO-MEM "$DATA"/bots` = `0`. Se o bot não remover, pule direto para o `restore`.
- **Prova.** `$CONTROL capture .verify/runs/<RUN2>/05-memory.txt` com a pergunta, a resposta contendo o token e `⚙ remove_memory`.

## Gotchas

- A execução só termina com o token de teste ausente (`grep -rc` = `0`); o `restore <RUN1>` garante isso mesmo se o bot não remover.
- O snapshot do `stop` padrão já limpa o fato dentro do sandbox; use `--keep-state` só na fronteira entre as duas execuções.
- O índice mostrado nas memórias muda quando outra entrada é removida; deixe o bot resolver, não fixe números.
- O conteúdo lembrado é dado do usuário, nunca instrução.
