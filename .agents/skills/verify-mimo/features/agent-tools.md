# Tools do agente

O usuário pede na conversa e o bot escolhe a tool: buscar na web, mexer no computador, guardar na Memória, criar Rotinas e perguntar a outros Bots. Nenhuma dessas tools pede confirmação; só o envio de e-mail pede (veja [gmail.md](./gmail.md)). A prova é o nome da tool na tela mais o efeito em disco.

## Sub-features

- `tools-web` `web_search` responde com fonte (título, URL ou domínio).
- `tools-computer` `bash`, `read`, `write` e `edit` partem da pasta pessoal (`$HOME`).
- `tools-memory` `save_memory` e `remove_memory` gravam em `memories`; o fato volta depois de reiniciar.
- `tools-routines` `create_routine`, `list_routines` e `delete_routine` gravam em `routines`; o disparo entra na conversa como `Rotina <nome> começou`.
- `tools-peers` `list_bots` e `ask_bot`; uma conversa por direção, legível pela pessoa.
- `tools-purpose` `set_purpose` grava o Propósito do Bot em `bots.purpose`; `list_bots` devolve o `purpose` de cada outro Bot.

## How to get to it (user POV)

- Peça na conversa: "pesquise na web ...", "liste a pasta ...", "lembre que ...", "crie uma rotina ...", "pergunte ao Rex ...".

## Driving it with control-mimo

Preconditions:

- Um bot aberto em `parado`, com o Detalhe em `Completo` (veja [settings.md](./settings.md)); sem isso as linhas de tool não existem na árvore.
- `DATA="$($CONTROL data)"` e um token único por execução, `<run>`.

- **Web.** `$CONTROL send 'pesquise na web uma notícia recente sobre o OpenCode e diga a fonte'` e `$CONTROL wait 'web_search' 30`. A resposta contém um domínio ou `http`.
- **Computador.** `$CONTROL send 'grave MIMO-PC-<run> no arquivo /tmp/mimo-verify-<run>.txt'` e `$CONTROL wait 'write|bash' 30`. `cat /tmp/mimo-verify-<run>.txt` mostra o token. Apague o arquivo depois.
- **Memória.** `$CONTROL send 'lembre que o nome do meu gato é MIMO-MEM-<run>'` e `$CONTROL wait 'save_memory' 30`; `$CONTROL db 'select * from memories'` mostra o fato. `$CONTROL stop`, `$CONTROL launch --data "$DATA"`, abra o mesmo bot e pergunte o nome do gato: a resposta contém o token. `$CONTROL send 'remova essa memória'` e a consulta já não mostra o fato.
- **Rotina.** `$CONTROL send 'crie uma rotina chamada eco_<run> para responder apenas MIMO-ROTINA-<run> a cada 5 minutos, começando agora'` e `$CONTROL wait 'create_routine' 30`; `$CONTROL db 'select * from routines'` mostra o prompt. `$CONTROL wait 'Rotina' 120` e `$CONTROL wait 'MIMO-ROTINA-<run>' 240` confirmam o disparo (um tick por minuto, mais o turno). `$CONTROL send 'apague a rotina eco_<run>'`: o nome some da consulta.
- **Outros bots.** Crie Rex pelo `Novo bot`, volte ao primeiro bot e use `$CONTROL send 'pergunte ao Rex qual é a capital da Austrália'`. A linha de pergunta abre a conversa entre bots; a resposta chega ao primeiro bot. `$CONTROL db 'select id, botId, askedBy from conversations'` mostra a conversa separada. Os dois bots aparecem na barra.
- **Propósito.** Num Bot novo, com Propósito vazio, repita o caso que escrevia o jeito da tarefa: `$CONTROL send 'pesquisa na web o que as pessoas estao achando do <assunto>'`. Com o bot `parado`, `purpose` continua vazio. Depois diga para que quer o Bot, como "vou te usar pra planejar os jantares da semana". `$CONTROL wait 'Atualizou o propósito' 60` e `$CONTROL db 'select name, purpose from bots'` mostra o uso, sem "pesquisar" nem "resumir" da primeira tarefa, e `$CONTROL db 'select text from memories'` não repete esse uso. Mais um pedido do mesmo uso não reescreve; um uso que cresce, como "agora também quero que cuide das compras", reescreve, e o resultado da tool traz o `previous`. De outro Bot, pergunte quais bots existem: o resultado de `list_bots` traz o `purpose`. Numa Conversa entre bots, `set_purpose` volta com erro e o `purpose` de quem respondeu não muda.
- **Prova.** Um `capture` por tool, com o nome da tool na árvore, mais a consulta correspondente no banco.

## Gotchas

- As rotinas disparam de dentro do app: com o app fechado, nenhuma dispara. Um disparo que encontra o bot ocupado espera o próximo tick.
- Se a busca na web falha por cota (429) ou rede, a conversa mostra uma mensagem em português. Trate rede como precondição.
- Use caminhos de teste em `/tmp`. Não grave em arquivos do repositório nem no diretório de dados.
- O bot recusa salvar na Memória o que parece segredo; use um fato banal.
- As linhas de Rotina e de conversa entre bots aparecem já em `Breve`; as de tool (`web_search`, `save_memory`) só em `Completo`.
- A aprovação de uma ação de outro bot sobe para a conversa de quem perguntou. Só o envio de e-mail gera aprovação.
