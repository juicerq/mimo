# Fila

A pessoa escreve enquanto o Bot trabalha. A entrega espera acima do composer como `queue: <texto>` e entra na Sessão quando o Bot termina o passo atual. Várias entregas esperam em ordem. Interromper o Turno descarta a Fila.

## Verificação

1. Suba um sandbox, crie um bot e peça um texto longo. Enquanto a linha viva aparece, envie duas mensagens com `tmux send-keys` (o `send` do helper recusa bot ocupado). Confira duas linhas `queue:` acima do composer, na ordem enviada.
2. Espere o turno seguir. As duas linhas `queue:` somem juntas, viram `you:` na conversa na mesma ordem, e o bot responde a elas.
3. Peça outro texto longo, enfileire uma mensagem e pare com dois `Esc`. A conversa mostra `Interrupted.` e a linha `queue:` some sem virar `you:`.
4. Peça uma ação que exige aprovação, por exemplo `bash`. Com `▌ ⏸ approval:` na tela, envie uma mensagem. A linha `queue:` aparece, a aprovação continua visível e **nenhuma** linha viva `working` surge.
5. Aprove com `1`. A mensagem da fila vira `you:` e o bot a responde no mesmo turno.

Capture o pane em cada passo.
