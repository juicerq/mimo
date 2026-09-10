# Conversa com o agente

O usuário abre a TUI, digita no composer e vê a resposta chegar em streaming, com linhas `⚙ <tool>` quando o bot usa uma ferramenta e o estado do turno na linha de status.

## Sub-features

- `chat-send` envia uma mensagem e mostra a resposta completa.
- `chat-tools` mostra `⚙ <tool>` quando uma ferramenta roda.
- `chat-context` mantém o contexto entre turnos da mesma sessão.
- `chat-status` reflete `ready` → `thinking` → `ready` durante o turno.
- `chat-error` mostra falha de turno sem derrubar a TUI.

## How to get to it (user POV)

- Rode `bun run dev` na raiz do repo e digite no composer.
- Cada abertura cria uma conversa nova; não há retomada de sessão.

## Driving it with control-mimo

Preconditions:

- `$CONTROL launch` concluiu com `· ready`.
- `$CONTROL doctor` confirma health, HEAD e env.

- **Primeira mensagem.** Envie um eco determinístico: `$CONTROL send 'responda apenas com MIMO-CHAT-OK'`. O comando retorna quando o turno termina; `$CONTROL wait 'MIMO-CHAT-OK' 180` confirma a resposta. O transcript mostra `você: responda apenas com MIMO-CHAT-OK`.
- **Ferramenta local.** `$CONTROL send 'que horas são? responda em uma linha'`; `$CONTROL wait '⚙ current_time' 180` confirma a tool. A resposta contém hora ou data.
- **Contexto.** `$CONTROL send 'nesta conversa, guarde o código 73'`; `$CONTROL send 'qual código eu pedi para guardar?'`. A última resposta antes do status contém `73`.
- **Prova.** `$CONTROL capture .verify/runs/<id>/01-chat.txt`. O arquivo contém `you:`, `⚙ current_time` e a resposta com `73`.

## Gotchas

- `send` recusa com `bot ocupado` se o status está `thinking`; espere o turno terminar (o próprio comando já bloqueia até lá).
- `send` só retorna quando o turno sai de `thinking`; turnos longos bloqueiam o comando, e o timeout padrão é 300 s.
- A TUI usa tela alternativa: o `capture` mostra o viewport atual. Capture a cada passo em vez de contar com scrollback.
- A resposta chega em deltas; espere o conteúdo final, não o primeiro pedaço.
- Sem a chave do modelo o turno falha com `erro:` no transcript; confira `$CONTROL doctor`.
