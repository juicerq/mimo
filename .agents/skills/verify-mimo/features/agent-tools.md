# Tools do agente

O usuário pede na conversa e o bot escolhe a tool: buscar na web, mexer no computador, guardar na Memória, criar Rotinas e comandar a Equipe. Nenhuma dessas tools pede confirmação; só o envio de e-mail pede (veja [gmail.md](./gmail.md)). A prova é o nome da tool na tela mais o efeito em disco.

## Sub-features

- `tools-web` `web_search` responde com fonte (título, URL ou domínio).
- `tools-computer` `bash`, `read`, `write` e `edit` partem da pasta pessoal (`$HOME`).
- `tools-memory` `save_memory` e `remove_memory` gravam em `bots/<id>/memory.md`; o fato volta depois de reiniciar.
- `tools-routines` `create_routine`, `list_routines` e `delete_routine` gravam em `routines.json`; o disparo entra na conversa como `Rotina <nome> começou`.
- `tools-team` `create_bot`, `delegate`, `check_team`, `stop_bot` e `delete_bot`; as ações viram linhas `Criou`, `Delegou para`, `Parou` e `Apagou` com o nome do filho.

## How to get to it (user POV)

- Peça na conversa: "pesquise na web ...", "liste a pasta ...", "lembre que ...", "crie uma rotina ...", "crie um bot filho ...".

## Driving it with control-mimo

Preconditions:

- Um bot aberto em `parado`, com o Detalhe em `Completo` (veja [settings.md](./settings.md)); sem isso as linhas de tool não existem na árvore.
- `DATA="$($CONTROL data)"` e um token único por execução, `<run>`.

- **Web.** `$CONTROL send 'pesquise na web uma notícia recente sobre o OpenCode e diga a fonte'` e `$CONTROL wait 'web_search' 30`. A resposta contém um domínio ou `http`.
- **Computador.** `$CONTROL send 'grave MIMO-PC-<run> no arquivo /tmp/mimo-verify-<run>.txt'` e `$CONTROL wait 'write|bash' 30`. `cat /tmp/mimo-verify-<run>.txt` mostra o token. Apague o arquivo depois.
- **Memória.** `$CONTROL send 'lembre que o nome do meu gato é MIMO-MEM-<run>'` e `$CONTROL wait 'save_memory' 30`; `grep -r MIMO-MEM "$DATA"/bots` acha o fato em `memory.md`. `$CONTROL stop`, `$CONTROL launch --data "$DATA"`, abra o mesmo bot e pergunte o nome do gato: a resposta contém o token. `$CONTROL send 'remova essa memória'` e o `grep -rc` volta a `0`.
- **Rotina.** `$CONTROL send 'crie uma rotina chamada eco_<run> para responder apenas MIMO-ROTINA-<run> a cada 5 minutos, começando agora'` e `$CONTROL wait 'create_routine' 30`; `grep -c MIMO-ROTINA "$DATA/routines.json"` é maior que zero. `$CONTROL wait 'Rotina' 120` e `$CONTROL wait 'MIMO-ROTINA-<run>' 240` confirmam o disparo (um tick por minuto, mais o turno). `$CONTROL send 'apague a rotina eco_<run>'`: o nome some de `routines.json`.
- **Equipe.** `$CONTROL send 'crie um bot filho chamado Rex'` e `$CONTROL wait 'Criou' 60`. Um `bots/<id>.json` novo tem `parentId` do bot aberto. O filho **não** aparece na barra de bots. `$CONTROL send 'delegue ao Rex: pesquise a capital da Austrália'` e `$CONTROL wait 'Delegou para' 60`; o turno do pai fecha na hora e a resposta do filho chega depois como aviso na conversa.
- **Prova.** Um `capture` por tool, com o nome da tool na árvore, mais o trecho do arquivo em `$DATA`.

## Gotchas

- As rotinas disparam de dentro do app: com o app fechado, nenhuma dispara. Um disparo que chega com o bot ocupado é perdido, sem erro.
- Se a busca na web falha por cota (429) ou rede, a conversa mostra uma mensagem em português. Trate rede como precondição.
- Use caminhos de teste em `/tmp`. Não grave em arquivos do repositório nem no diretório de dados.
- O bot recusa salvar na Memória o que parece segredo; use um fato banal.
- As linhas de Rotina e de Equipe aparecem já em `Breve`; as de tool (`web_search`, `save_memory`) só em `Completo`.
- A aprovação de uma ação do filho sobe para a conversa do pai. Só o envio de e-mail gera aprovação.
