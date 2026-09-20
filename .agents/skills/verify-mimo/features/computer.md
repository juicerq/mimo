# Computador

O bot alcança a máquina pelas tools do Pi: `bash`, `read`, `write` e `edit`. Elas partem da pasta pessoal e aceitam caminho absoluto. `read` corta a saída longa e marca a truncagem. Nenhuma delas pede aprovação.

## Verificação

1. Peça a lista de uma pasta conhecida (`~/projects/<repo>`). A TUI mostra `⚙ bash` com o comando, sem parar para aprovar. Compare os nomes com `ls` no mesmo caminho.
2. Peça a leitura de um arquivo de texto e um dado verificável dele, como o título. Confira a linha `⚙ read` e compare com o arquivo real.
3. Peça a gravação de um arquivo em `/tmp`. A TUI mostra `⚙ write` com o caminho e o conteúdo, sem aprovação; confira o conteúdo com `cat`.
4. Peça uma troca de trecho nesse mesmo arquivo. Confira o resultado com `cat`. Apague o arquivo depois.
5. Peça um caminho inexistente. O erro deve aparecer como `✗ tool failed:` e o bot deve seguir a conversa.

Use sempre caminhos de teste fora do diretório de dados. Não grave em arquivos do repositório durante a receita.
