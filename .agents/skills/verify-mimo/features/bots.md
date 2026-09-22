# Bots

A barra da esquerda lista os bots. Cada linha mostra o nome, a prévia da última mensagem e o estado. O usuário cria um bot pelo nome, troca de bot com um clique, e cada bot guarda a própria conversa.

## Sub-features

- `bots-first` sem nenhum bot, a barra já abre o campo do nome e o centro pede o primeiro bot.
- `bots-create` cria um bot pelo botão `Novo bot` e abre a conversa dele.
- `bots-cancel` `Esc` ou sair do campo vazio desiste da criação.
- `bots-select` troca de bot e mostra só a conversa dele.
- `bots-preview` a linha do bot mostra a última mensagem; `Você: ...` quando foi do usuário.
- `bots-persist` bots e conversas voltam depois de reiniciar com os mesmos dados.

## How to get to it (user POV)

- Abra o app. Sem bots, digite o nome no campo `Nome do bot` e aperte Enter.
- Com bots, clique no `+` (`Novo bot`) no topo da barra.
- Clique numa linha da barra para abrir aquele bot.

## Driving it with control-mimo

Preconditions:

- `$CONTROL launch` num sandbox novo; `$CONTROL doctor` mostra a contagem de bots em zero.

- **Primeira tela.** `$CONTROL browser snapshot`. A árvore tem `textbox "Nome do novo bot"` e o texto `Dê um nome ao seu primeiro bot na barra ao lado.`
- **Criar.** `$CONTROL browser fill '[aria-label="Nome do novo bot"]' 'Ana'` e `$CONTROL browser press Enter`. `$CONTROL wait 'heading "Ana , parado"' 20` confirma o bot aberto, e a árvore mostra `heading "Comece a conversa com Ana"`.
- **No disco.** `$CONTROL db 'select * from bots'` mostra Ana com seu modelo.
- **Segundo bot.** `$CONTROL browser click '[aria-label="Novo bot"]'`, preencha `Bia` e Enter. `$CONTROL wait 'heading "Bia , parado"' 20`.
- **Desistir.** `$CONTROL browser click '[aria-label="Novo bot"]'` e `$CONTROL browser press Escape`. O `textbox "Nome do novo bot"` some e nenhuma linha nova aparece em `bots`.
- **Trocar.** Envie `MIMO-ANA-<run>` para a Ana (veja [chat.md](./chat.md)). Tire um `snapshot` e clique na referência de `button "Bia ..."`. A conversa da Bia não contém `MIMO-ANA-<run>`. Volte para a Ana: o marcador está lá.
- **Prévia.** Na árvore, a linha da Ana é `button "Ana <última mensagem> parado"`.
- **Persistência.** `$CONTROL stop`, depois `$CONTROL launch --data <data do run anterior>`. A barra lista os mesmos bots e a conversa da Ana reaparece.
- **Prova.** `$CONTROL capture 01-bots`.

## Gotchas

- O título sai como `heading "Ana , parado"`, com espaço antes da vírgula.
- O bot aberto por último fica em `preferences` e volta mesmo com HOME novo, usando o mesmo `--data`.
- O campo aceita até 80 caracteres; um nome recusado pelo agente mostra o erro embaixo do campo, em vermelho.
- Apague pelo menu de contexto da linha do bot. Confira que Bot, conversas, Memória e Rotinas somem do banco, que há um registro em `actions`, e que o app continua respondendo.
