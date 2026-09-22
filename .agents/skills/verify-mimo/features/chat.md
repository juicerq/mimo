# Conversa

O usuário escreve no campo `Mensagem`, aperta Enter e vê a resposta chegar aos poucos numa bolha. Enquanto o bot trabalha, uma linha acima do campo mostra o que ele faz, o tempo e o botão de parar.

## Sub-features

- `chat-send` envia com Enter ou com o botão `Enviar`; `Shift+Enter` quebra a linha.
- `chat-reply` mostra a resposta em markdown numa bolha do bot.
- `chat-status` mostra `Pensando`, `Trabalhando` ou `Respondendo`, com o relógio do turno.
- `chat-stop` para o turno pelo botão `Parar`; a conversa ganha `Você parou`.
- `chat-tools` mostra a linha de cada tool com o nome em `code`, só com o Detalhe em `Completo`.
- `chat-context` mantém o contexto entre turnos.
- `chat-error` mostra a falha do turno na conversa, sem derrubar o app; o bot fica `falhou`.

## How to get to it (user POV)

- Abra um bot na barra e escreva no campo `Mensagem para <nome>`.

## Driving it with control-mimo

Preconditions:

- Um bot aberto e `$CONTROL state` em `parado`.

- **Enviar.** `$CONTROL send 'responda apenas com MIMO-CHAT-OK'`. O comando imprime `estado: parado` quando o turno termina. `$CONTROL wait 'MIMO-CHAT-OK' 30` confirma a resposta na árvore.
- **No disco.** `$CONTROL db 'select text from speeches'` mostra `MIMO-CHAT-OK` uma vez; `records` contém seu evento `reply`.
- **Rótulo do turno.** `$CONTROL send --no-wait 'escreva um texto de 800 palavras sobre rios'` e `$CONTROL wait 'Pensando|Trabalhando|Respondendo' 20`. A árvore também mostra `button "Parar"`.
- **Parar.** `$CONTROL browser click '[aria-label="Parar"]'` e `$CONTROL wait 'Você parou' 20`. Um segundo depois, `$CONTROL state` volta a `parado`.
- **Tool na tela.** Ponha o Detalhe em `Completo` (veja [settings.md](./settings.md)). `$CONTROL send 'que horas são? use a tool e responda em uma linha'`; `$CONTROL wait 'current_time' 30` acha o nome da tool na árvore.
- **Contexto.** `$CONTROL send 'nesta conversa, guarde o código 73'` e `$CONTROL send 'qual código eu pedi para guardar?'`. A última resposta contém `73`.
- **Falha.** Escolha na barra Sobre um modelo de um provedor sem credencial ou sem saldo e envie qualquer mensagem. A conversa mostra a linha de erro e `$CONTROL state` imprime `falhou`. Troque para um modelo bom e envie `continue`: o estado volta ao normal. Reporte como não verificado quando não puder provocar a falha.
- **Prova.** `$CONTROL capture 02-chat`.

## Gotchas

- Com o Detalhe em `Breve` (padrão), as linhas de tool não existem na árvore. `wait` num nome de tool falha por isso, não porque a tool não rodou.
- `send` decide o fim do turno pelo estado do título, que atualiza a cada segundo. Um turno muito curto pode nem aparecer como `trabalhando`; o `send` avisa e retorna depois de 8 s.
- A resposta chega em pedaços; espere o marcador final, não o primeiro trecho.
- O campo guarda o rascunho por bot enquanto o app está aberto.
