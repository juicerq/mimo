# Rotinas

O usuário cria uma rotina por conversa; o dispatcher entrega o prompt de volta na mesma sessão de tempos em tempos. As rotinas ficam em `apps/agent/.data/routines.json`.

## Sub-features

- `routine-create` cria a rotina e devolve id e próximo disparo (`⚙ create_routine`).
- `routine-persist` grava `routines.json` com escrita atômica.
- `routine-fire` entrega o prompt na sessão criadora no próximo tick.
- `routine-list` lista as rotinas (`⚙ list_routines`).
- `routine-delete` apaga com aprovação no terminal (`⏸ aprovação: delete_routine`).

## How to get to it (user POV)

- Peça na conversa: "crie uma rotina ...", "liste minhas rotinas", "apague a rotina ...".

## Driving it with control-mimo

Preconditions:

- Instância iniciada por `$CONTROL launch`: é o `bun run dev` que chama o tick de dispatch a cada 60 s.
- Nenhuma rotina com o token da execução (`grep <run-id> apps/agent/.data/routines.json` vazio).

- **Criar.** `$CONTROL send 'crie uma rotina para responder apenas "MIMO-ROTINA-<run-id>" a cada 5 minutos, começando agora'` (o `send` retorna quando o turno termina); `$CONTROL wait '⚙ create_routine' 180` confirma a tool. Anote o id que a resposta mostrar.
- **Persistiu.** `grep -c 'MIMO-ROTINA' apps/agent/.data/routines.json` maior que `0`. O estado pós-execução vira prova em `.verify/runs/<id>/state-after/routines.json` no `stop`.
- **Disparar.** `$CONTROL wait 'MIMO-ROTINA-<run-id>' 240` (tick ≤ 60 s mais o turno do modelo). O prompt chega como novo turno na sessão, com o status passando por `pensando`.
- **Listar.** `$CONTROL send 'liste minhas rotinas'`; `$CONTROL wait '⚙ list_routines' 180` confirma a tool. A resposta contém o id e o próximo disparo.
- **Apagar.** `$CONTROL send 'apague a rotina <id>'` → `$CONTROL wait '⏸ aprovação: delete_routine' 180`; `$CONTROL send '1'` (Aprovar) → `$CONTROL wait '⏸ aprovado' 180`. Confirme que `grep <id> apps/agent/.data/routines.json` não acha mais nada.
- **Prova.** `$CONTROL capture .verify/runs/<id>/04-routines.txt` com `⚙ create_routine`, o token entregue e `⏸ aprovado` no delete.

## Gotchas

- Só o `bun run dev` dispara o tick; um agente de pé sem o launcher não entrega rotina.
- O primeiro disparo precisa de `nextRunAt` vencido em algum tick; "começando agora" deixa a rotina vencida imediatamente.
- A entrega acontece na sessão que criou a rotina; mantenha a TUI aberta e só mande outra mensagem depois que o `send` liberar (ele bloqueia até o turno terminar).
- O token precisa ser único por execução para a espera não casar com outra coisa.
- `stop` restaura o snapshot e remove a rotina de teste do estado do usuário.
