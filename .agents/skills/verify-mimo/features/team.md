# Equipe

Um bot sem pai cria bots filhos com `create_bot`, ajusta com `update_bot`, vê com `list_bots`, apaga com `delete_bot`, entrega trabalho com `delegate`, acompanha com `check_team` e interrompe com `stop_bot`. A delegação não bloqueia: o turno do pai fecha na hora e a resposta do filho volta como aviso. As tools tratam o filho pelo nome. O filho tem memória e sessão próprias, não aparece em `/bots` nem no painel de `/delete`, e é apagado junto com o pai. A aprovação de uma ação do filho sobe para a tela de quem o comanda. Cada filho em trabalho aparece acima do composer com o tempo e a tool do momento. As tools que mexem na equipe viram linha de conversa com o nome do filho, não `⚙`.

## Verificação

1. Suba um sandbox e crie `/new dog`. Peça um filho com nome, instrução permanente e só um grupo de tools. Confira a linha `▌ created <nome>` — e **nenhuma** linha `⚙ create_bot` — e o arquivo `bots/<id>.json` do filho: `parentId` aponta para o dog, `prompt` traz a instrução e `tools` traz só o grupo pedido.
2. Use `/bots`. O filho não pode aparecer na lista; só o dog.
3. Delegue ao filho um trabalho com efeito observável, por exemplo escrever uma frase num arquivo em `/tmp` com `bash`. A aprovação deve aparecer na tela do dog como `▌ ⏸ approval: bash · <nome do filho>`. Aprove e confira o arquivo e a resposta do dog.
4. Delegue um `sleep 60`. O turno do dog precisa **fechar na hora**, com o filho ainda na barra da equipe. Com o filho trabalhando, pergunte o andamento ao dog: ele responde por `⚙ check_team`, que continua sendo linha de tool, num turno próprio. No fim, a conversa recebe `▌ O filho <nome> terminou e respondeu:` sozinha e o dog conta o resultado.
5. Delegue outro `sleep` longo e peça ao dog para parar o filho. Confira a linha `▌ stopped <nome>`, o aviso `▌ O filho <nome> não terminou: O trabalho foi parado.` e que o arquivo do comando **não** existe.
6. Delegue um trabalho curto e, logo depois, peça um texto longo ao dog. O aviso do filho tem que esperar o fim desse turno e só então entrar na conversa.
7. Peça duas chamadas de `delegate` na mesma mensagem, para dois filhos, cada um escrevendo um arquivo diferente. Confira duas linhas `▌ delegated to <nome>`, uma por filho, uma aprovação por vez com o nome de cada filho e os dois arquivos no fim.
8. Com os dois filhos num trabalho longo (`sleep`), confira acima do composer uma linha por filho: `team: <nome> · <tempo> · <tool>`. O tempo tem que subir e a tool tem que ser a do momento. As linhas somem quando os filhos entregam.
9. Com um filho trabalhando, pare o turno do dog com dois `Esc`. A conversa mostra `Interrupted.` e o filho **continua** na barra da equipe: parar o pai não para a equipe.
10. Troque a instrução de um filho com `update_bot` e delegue outra vez, pedindo algo que mostre a instrução nova. A resposta precisa seguir a instrução nova sem reiniciar a TUI.
11. Delegue ao filho um pedido para criar outro bot. Ele deve responder que não tem `create_bot`: a equipe só tem um nível.
12. Peça um filho temporário e a exclusão dele. `delete_bot` deve parar em `▌ ⏸ approval: delete_bot` **sem** nenhuma linha `▌ deleted` antes; aprove e confira a linha `▌ deleted <nome>` e que o arquivo e a pasta do filho sumiram. Repita recusando com `2`: nada é apagado e nenhuma linha aparece.
13. Use `/delete` e escolha o dog. O painel deve avisar `Its team goes too: <nomes>`. Confirme e confira que os arquivos do pai e dos filhos sumiram.

14. Com `▌ created` e `▌ delegated to` na tela, aperte `Ctrl+O` até `tool view: hidden`. As linhas da equipe **continuam** visíveis, e as `⚙` somem. Passe por `details` e confira que nenhuma linha solta de resultado (`{"bot":...,"status":"started"}`) aparece embaixo delas.
15. Volte para `/bots`, reabra o dog e confira que as linhas da equipe voltam no transcript, no lugar certo.

Capture a tela e o estado em disco a cada etapa.
