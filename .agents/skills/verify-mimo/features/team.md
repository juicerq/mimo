# Equipe

Um bot sem pai cria bots filhos com `create_bot`, ajusta com `update_bot`, vê com `list_bots`, apaga com `delete_bot` e entrega trabalho com `delegate`. As tools tratam o filho pelo nome. O filho tem memória e sessão próprias, não aparece em `/bots` nem no painel de `/delete`, e é apagado junto com o pai. A aprovação de uma ação do filho sobe para a tela de quem o comanda.

## Verificação

1. Suba um sandbox e crie `/new dog`. Peça um filho com nome, instrução permanente e só um grupo de tools. Confira `⚙ create_bot` e o arquivo `bots/<id>.json` do filho: `parentId` aponta para o dog, `prompt` traz a instrução e `tools` traz só o grupo pedido.
2. Use `/bots`. O filho não pode aparecer na lista; só o dog.
3. Delegue ao filho um trabalho com efeito observável, por exemplo escrever uma frase num arquivo em `/tmp` com `bash`. A aprovação deve aparecer na tela do dog como `▌ ⏸ approval: bash · <nome do filho>`. Aprove e confira o arquivo e a resposta do dog.
4. Peça duas chamadas de `delegate` na mesma mensagem, para dois filhos, cada um escrevendo um arquivo diferente. Confira duas linhas `⚙ delegate`, uma aprovação por vez com o nome de cada filho e os dois arquivos no fim.
5. Delegue um trabalho longo e pare com dois `Esc`. A conversa deve mostrar `Interrupted.`, sem linha de erro. Delegue de novo ao mesmo filho: ele precisa atender, o que prova que parou junto.
6. Troque a instrução de um filho com `update_bot` e delegue outra vez, pedindo algo que mostre a instrução nova. A resposta precisa seguir a instrução nova sem reiniciar a TUI.
7. Delegue ao filho um pedido para criar outro bot. Ele deve responder que não tem `create_bot`: a equipe só tem um nível.
8. Peça um filho temporário e a exclusão dele. `delete_bot` deve parar em `▌ ⏸ approval: delete_bot`; aprove e confira que o arquivo e a pasta do filho sumiram. Repita recusando com `2` para provar que nada é apagado.
9. Use `/delete` e escolha o dog. O painel deve avisar `Its team goes too: <nomes>`. Confirme e confira que os arquivos do pai e dos filhos sumiram.

Capture a tela e o estado em disco a cada etapa.
