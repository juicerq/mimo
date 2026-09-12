# Grupos de tools

A pessoa liga e desliga os grupos de tools de um Bot pelo Painel `/tools` ou pedindo ao Bot. Um grupo desligado tira as tools e o bloco de instruções dele.

## Verificação

1. Suba um sandbox, crie um bot e abra `/tools`. Confira os cinco grupos com `[x]`: `computer`, `web`, `gmail`, `routines` e `team`.
2. Escolha o número de `gmail`. O painel recarrega na hora com `[ ] gmail`, e a conversa ganha a linha `tools:` sem `gmail`. Volte com `/cancel`.
3. Pergunte ao bot quais tools de e-mail ele tem. Ele não lista `list_unread` nem `create_draft`. Peça para ler os não lidos: a tool não existe para ele.
4. Peça "ligue o gmail de novo". O bot chama `set_tools` e a aprovação `▌ ⏸ approval:` aparece, porque ligar um grupo exige aprovação no modo normal. Aprove com `1` e confira a linha `tools:` com `gmail`.
5. Peça "desligue o time". O bot chama `set_tools` **sem** aprovação e a linha `tools:` perde `team`. Peça para criar um bot filho: `create_bot` não existe mais.
6. Reabra `/tools`, religue `team` e aprove. Feche a TUI com `$CONTROL stop --keep-state` e suba de novo no mesmo diretório de dados: `/tools` mostra a escolha salva.
7. Confira o arquivo do bot em `<data>/bots/<id>.json`: o campo `tools` traz os grupos escolhidos e `version` é `1`.

Capture o pane em cada passo.
