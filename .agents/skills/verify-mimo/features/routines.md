# Rotinas

O usuário cria uma rotina por conversa; o dispatcher da TUI entrega o prompt ao mesmo bot de tempos em tempos. As rotinas ficam em `routines.json` no diretório de dados (`$CONTROL data`).

## Sub-features

- `routine-create` cria a rotina com um nome e devolve o nome e o próximo disparo (`⚙ create_routine`).
- `routine-persist` grava `routines.json` com escrita atômica.
- `routine-fire` entrega o prompt ao bot no próximo tick.
- `routine-list` lista as rotinas (`⚙ list_routines`).
- `routine-delete` apaga pelo nome, com aprovação no terminal (`⏸ approval: delete_routine`).

## How to get to it (user POV)

- Peça na conversa: "crie uma rotina ...", "liste minhas rotinas", "apague a rotina ...".

## Driving it with control-mimo

Preconditions:

- Instância iniciada por `$CONTROL launch`: o dispatcher roda dentro da TUI e faz um tick a cada 60 s. Fechar a TUI para o dispatcher.
- `DATA=$($CONTROL data)` e nenhuma rotina com o token da execução (`grep <run-id> "$DATA/routines.json"` vazio).

- **Criar.** `$CONTROL send 'crie uma rotina chamada eco_<run-id> para responder apenas "MIMO-ROTINA-<run-id>" a cada 5 minutos, começando agora'` (o `send` retorna quando o turno termina); `$CONTROL wait '⚙ create_routine' 180` confirma a tool. A resposta mostra o nome `eco_<run-id>`.
- **Persistiu.** `grep -c 'MIMO-ROTINA' "$DATA/routines.json"` maior que `0`. O estado pós-execução vira prova em `.verify/runs/<id>/state-after/routines.json` no `stop`.
- **Etiqueta.** O disparo entra na conversa como `routine: eco_<run-id> started`, nunca como `you:`. Aperte `C-o` até `detail: full`: o prompt da rotina aparece recuado embaixo, cortado em 600 caracteres. Em `detail: off` a linha toda desaparece. Reabra o bot por `/bots` e confira que a linha continua igual depois do replay.
- **Disparar.** `$CONTROL wait 'MIMO-ROTINA-<run-id>' 240` (tick ≤ 60 s mais o turno do modelo). O prompt chega como novo turno na conversa, com o status passando por `thinking`.
- **Listar.** `$CONTROL send 'liste minhas rotinas'`; `$CONTROL wait '⚙ list_routines' 180` confirma a tool. A resposta contém o nome e o próximo disparo.
- **Apagar.** `$CONTROL send 'apague a rotina eco_<run-id>'` → `$CONTROL wait '⏸ approval: delete_routine' 180`; `$CONTROL send '1'` (Aprovar) → `$CONTROL wait '⏸ approved' 180`. Confirme que `grep eco_<run-id> "$DATA/routines.json"` não acha mais nada.
- **Perder o disparo.** Ponha o bot num turno longo (`sleep 150` no `bash`) e espere o tick chegar durante esse turno. O disparo é descartado: o prompt da rotina **não** entra na conversa, `nextRunAt` já aponta para o intervalo seguinte, `lastRunAt` fica **sem mudar** e `lastError` continua vazio. Não há fila nem `leaseUntil`.
- **Falhar.** Com a rotina criada, use `/model` para escolher um provedor sem saldo e espere o próximo tick. A rotina falhada precisa gravar o erro: `routines.json` tem `lastError` com a mensagem do provedor, e não `lastError: undefined`. Uma rotina cujo turno falha nunca pode ser registrada como sucesso.
- **Prova.** `$CONTROL capture .verify/runs/<id>/04-routines.txt` com `⚙ create_routine`, o token entregue e `⏸ approved` no delete.

## Gotchas

- O dispatcher vive no processo da TUI: com a TUI fechada, nenhuma rotina dispara.
- O primeiro disparo precisa de `nextRunAt` vencido em algum tick; "começando agora" deixa a rotina vencida imediatamente.
- Mantenha a TUI aberta e só mande outra mensagem depois que o `send` liberar (ele bloqueia até o turno terminar).
- O token precisa ser único por execução para a espera não casar com outra coisa.
- O nome é único por bot: criar outra rotina com o mesmo nome falha com `Você já tem uma rotina chamada ...`.
- Uma `routines.json` gravada por uma versão antiga não tem nome; a leitura dá `rotina-1`, `rotina-2` na ordem do arquivo.
- Um turno que falha não lança: quem chama a rotina só descobre a falha porque o `Bot` guarda a mensagem e a levanta no fim.
- O `claimDue` avança o `nextRunAt` na hora do tick, antes de olhar o bot. Se o bot estiver ocupado, o disparo é perdido em silêncio: nada é gravado em `lastRunAt` nem em `lastError`.
- `stop` restaura o snapshot e remove a rotina de teste do estado do usuário.

## Continuidade

Depois de criar uma rotina, deixe o contexto compactar e a rotina vencer. O tick deve entregar o prompt ao mesmo bot e a TUI deve acompanhar a resposta. Liste, edite e apague a mesma rotina depois da compactação; o nome e o bot precisam permanecer iguais.
