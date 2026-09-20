# Fila

O usuário escreve enquanto o bot trabalha. A mensagem espera no fim da conversa como `Na fila: <texto>` e entra quando o bot termina o passo atual. Várias mensagens esperam em ordem. Parar o turno descarta a Fila.

## Sub-features

- `queue-add` uma mensagem enviada durante o turno vira `Na fila: <texto>`.
- `queue-order` várias mensagens esperam na ordem enviada.
- `queue-deliver` a Fila entra na conversa junta, e o bot responde numa resposta só.
- `queue-drop` parar o turno apaga a Fila sem entregar.
- `queue-approval` com uma confirmação de envio na tela, a mensagem espera e a confirmação continua respondível.

## How to get to it (user POV)

- Com o bot trabalhando, o campo mostra `Mensagem para <nome>, entra na fila`. Escreva e aperte Enter.

## Driving it with control-mimo

Preconditions:

- Um bot aberto e `$CONTROL state` em `parado`.

- **Turno longo.** `$CONTROL send --no-wait 'escreva um texto de 800 palavras sobre rios'` e `$CONTROL wait ', trabalhando"' 20`.
- **Enfileirar.** `$CONTROL send --no-wait 'MIMO-FILA-1'` e `$CONTROL send --no-wait 'MIMO-FILA-2'`. No `snapshot`, `Na fila: ` aparece duas vezes, seguido de `MIMO-FILA-1` e depois `MIMO-FILA-2`.
- **Descartar.** `$CONTROL browser click '[aria-label="Parar o Turno e descartar a Fila"]'` e `$CONTROL wait 'Interrompido' 20`. `$CONTROL browser snapshot | grep -c 'Na fila'` dá `0`, e `grep MIMO-FILA "$($CONTROL data)"/bots/*/messages.json` não acha nada.
- **Entregar.** Repita o turno longo e as duas mensagens, e deixe o turno seguir: `$CONTROL wait ', parado"' 300`. As linhas `Na fila` somem, as duas mensagens viram bolhas do usuário na mesma ordem, e o bot responde às duas **numa resposta só**. Duas respostas seguidas significam um turno por mensagem, que é o defeito.
- **Prova.** `$CONTROL capture 04-fila` com a Fila na tela, e outro `capture` depois de parar ou de entregar.

## Gotchas

- Use sempre `send --no-wait` aqui; o `send` comum ficaria esperando o turno longo terminar.
- Enfileire logo: um modelo rápido termina o texto em poucos segundos.
- O texto da Fila sai na árvore em dois nós: `Na fila: ` e o texto. Não procure a frase inteira numa linha.
