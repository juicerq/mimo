# Equipe

Um bot sem pai pode criar bots filhos com `create_bot`, ajustá-los com `update_bot`, vê-los com `list_bots` e apagá-los com `delete_bot`. O filho tem memória e sessão próprias, não aparece em `/bots` nem no painel de `/delete`, e é apagado junto com o pai. `list_models` mostra os modelos aceitos.

## Verificação

1. Suba um sandbox e crie `/new dog`. Peça um filho com nome, instrução permanente e só um grupo de tools (por exemplo `web`). Confira `⚙ create_bot` e o arquivo `bots/<id>.json` do filho no diretório de dados: `parentId` aponta para o dog, `prompt` traz a instrução e `tools` traz só o grupo pedido.
2. Use `/bots`. O filho não pode aparecer na lista; só o dog.
3. Peça para listar os filhos e trocar a instrução de um deles. Confira `⚙ list_bots`, `⚙ update_bot` e o novo `prompt` no arquivo do filho.
4. Peça um filho temporário e a exclusão dele no mesmo turno. `delete_bot` deve parar em `▌ ⏸ approval: delete_bot`; aprove com `1` e confirme que o arquivo e a pasta do filho sumiram. Repita recusando com `2` para provar que nada é apagado.
5. Use `/delete` e escolha o dog. O painel deve avisar `Its team goes too: <nomes>`. Confirme com `1` e confira que os arquivos do pai e dos filhos sumiram do diretório de dados.

Capture a tela e o estado em disco a cada etapa.
