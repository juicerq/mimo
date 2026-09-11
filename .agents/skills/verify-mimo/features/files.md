# Arquivos do computador

O bot alcança a máquina por `list_files`, `read_file`, `search_files` e `write_file`. Caminhos absolutos valem, `~` é a pasta pessoal e um caminho relativo parte dela. `read_file` devolve no máximo 20 mil caracteres e marca `truncated`. `write_file` grava o arquivo inteiro e, no modo normal, espera aprovação no terminal.

## Verificação

1. Peça a lista de uma pasta conhecida (`~/projects/<repo>`). Confira a linha `⚙ list_files` e compare os nomes com `ls` no mesmo caminho.
2. Peça a leitura de um arquivo de texto e um dado verificável dele, como o título. Compare com o arquivo real.
3. Peça uma busca por um termo presente no repositório. Confira arquivo e linha com `rg` no terminal.
4. Peça a gravação de um arquivo em `/tmp` no modo normal. A TUI deve mostrar `⏸ approval: write_file` com o caminho e o conteúdo. Recuse uma vez e confirme que o arquivo não existe. Repita e aprove; confira o conteúdo com `cat` e apague o arquivo depois.
5. Peça um caminho inexistente. O erro deve aparecer como `✗ tool failed:` e o bot deve seguir a conversa.

Use sempre caminhos de teste fora do diretório de dados. Não grave em arquivos do repositório durante a receita.
