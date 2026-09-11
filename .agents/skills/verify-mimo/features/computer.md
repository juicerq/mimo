# Computador

O bot alcança a máquina pelas tools do Pi: `bash`, `read`, `write` e `edit`. Elas partem da pasta pessoal e aceitam caminho absoluto. `read` corta a saída longa e marca a truncagem. No modo normal, `bash`, `write` e `edit` esperam aprovação no terminal.

## Verificação

1. Peça a lista de uma pasta conhecida (`~/projects/<repo>`). A TUI deve mostrar `⏸ approval: bash` com o comando. Aprove e compare os nomes com `ls` no mesmo caminho.
2. Peça a leitura de um arquivo de texto e um dado verificável dele, como o título. Confira a linha `⚙ read` e compare com o arquivo real.
3. Peça a gravação de um arquivo em `/tmp` no modo normal. A TUI deve mostrar `⏸ approval: write` com o caminho e o conteúdo. Recuse uma vez e confirme que o arquivo não existe. Repita e aprove; confira o conteúdo com `cat`.
4. Peça uma troca de trecho nesse mesmo arquivo. Aprove o `edit` e confira o resultado com `cat`. Apague o arquivo depois.
5. Peça um caminho inexistente. O erro deve aparecer como `✗ tool failed:` e o bot deve seguir a conversa.

Use sempre caminhos de teste fora do diretório de dados. Não grave em arquivos do repositório durante a receita.
