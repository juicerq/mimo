# Conversa com o agente

O usuário abre a TUI, digita no composer e vê a resposta chegar em streaming, com linhas `⚙ <tool>` quando o bot usa uma ferramenta e o estado do turno na linha de status.

## Sub-features

- `chat-send` envia uma mensagem e mostra a resposta completa.
- `chat-tools` mostra `⚙ <tool>` quando uma ferramenta roda.
- `chat-details` alterna com `Ctrl+O` entre `names`, `details` e `hidden` para as ferramentas.
- `chat-context` mantém o contexto entre turnos.
- `chat-status` mostra a linha viva `⠙ thinking|working · <n>s · esc esc to stop` durante o turno.
- `chat-error` mostra falha de turno sem derrubar a TUI.

## How to get to it (user POV)

- Rode `bun run dev` na raiz do repo e digite no composer.
- Crie com `/new <nome>` ou escolha um bot pelo número. Cada bot retoma seu transcript.

## Driving it with control-mimo

Preconditions:

- `$CONTROL launch` concluiu com a lista de bots na tela.
- `$CONTROL doctor` confirma HEAD, credenciais e pane em `ready`.

- **Primeira mensagem.** Envie um eco determinístico: `$CONTROL send 'responda apenas com MIMO-CHAT-OK'`. O comando retorna quando o turno termina; `$CONTROL wait 'MIMO-CHAT-OK' 180` confirma a resposta. O transcript mostra `you: responda apenas com MIMO-CHAT-OK` e a resposta com o prefixo `<nome do bot>:`. Não há cabeçalho acima da conversa.
- **Linha viva.** Logo depois de um `$CONTROL send`, capture o pane: sob a sua mensagem aparece `⠙ thinking · <n>s · esc esc to stop`; depois da primeira ferramenta o rótulo vira `working`; quando o texto começa, a linha some. O rodapé não mostra estado nenhum fora dos seletores.
- **Detalhes.** Depois de um turno com ferramenta, envie a tecla literal `C-o` pelo tmux três vezes. A primeira mostra a entrada e o resultado recuados sob `⚙ <tool>`, cortados em 600 caracteres; a segunda esconde a linha da ferramenta; a terceira volta ao padrão. O rodapé mostra `tools: details|hidden|names` por 2 segundos e o transcript inteiro é redesenhado, inclusive turnos antigos.
- **Ferramenta local.** `$CONTROL send 'que horas são? responda em uma linha'`; `$CONTROL wait '⚙ current_time' 180` confirma a tool. A resposta contém hora ou data.
- **Contexto.** `$CONTROL send 'nesta conversa, guarde o código 73'`; `$CONTROL send 'qual código eu pedi para guardar?'`. A última resposta antes do status contém `73`.
- **Prova.** `$CONTROL capture .verify/runs/<id>/01-chat.txt`. O arquivo contém `you:`, `⚙ current_time` e a resposta com `73`.

## Gotchas

- `send` recusa com `bot ocupado` se o status está `thinking`; espere o turno terminar (o próprio comando já bloqueia até lá).
- `send` só retorna quando o turno sai de `thinking`; turnos longos bloqueiam o comando, e o timeout padrão é 300 s.
- A TUI usa tela alternativa: o `capture` mostra o viewport atual. Capture a cada passo em vez de contar com scrollback.
- A resposta chega em deltas; espere o conteúdo final, não o primeiro pedaço.
- Sem credencial do provedor o turno falha com `✗ error:` no transcript; confira `$CONTROL doctor`.

## Interrupção e nova tentativa

Envie uma resposta longa pela TUI. Durante o streaming, use teclas literais pelo tmux: um Esc não deve interromper, dois separados por mais de 400 ms também não; dois com cerca de 200 ms de intervalo devem mostrar `Interrupted.`. O rodapé mantém o contexto da última chamada válida. O bot continua aceitando mensagens. Repita com uma aprovação pendente: a ação não deve ser aprovada e o turno termina em `cancelled`.

No seletor de modelos, Esc continua apenas fechando o seletor. Depois de um erro ou interrupção, envie “continue” sem repetir o pedido original e confirme que o bot o retoma. Para erro de saldo, troque o modelo antes de continuar: escolher o modelo sozinho não deve enviar uma mensagem. Repita com uma orientação diferente e com uma pergunta nova, confirmando que a mensagem atual dirige a resposta. Verifique também após reiniciar a TUI.
