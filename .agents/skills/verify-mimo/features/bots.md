# Bots

Cada bot mantém seu transcript, com compactação automática, e memória isolada. Quando o contexto é compactado, as mensagens anteriores vão para `bots/<id>/sessions/` e a conversa segue com um resumo. A lista é a tela inicial; `/new <nome>` cria e abre um bot, `/bots` volta à lista e o número abre a conversa.

## Verificação

1. Suba um sandbox e capture a lista vazia. Crie `/new Estudos` e envie um pedido sobre um assunto sem relação com Gmail. Confira o nome no topo, modelo e esforço no rodapé e resposta em streaming.
2. Peça para salvar um fato banal com marcador único. Confira `⚙ save_memory` e o arquivo `bots/<id>/memory.md` no diretório de dados.
3. Crie `/new Escrita`. Pergunte pelo mesmo fato sem citar seu valor: ele não deve conhecê-lo. Salve outro fato e confirme que está no `memory.md` do outro bot.
4. Use `/bots` e abra Estudos pelo número. Confira que o transcript reaparece uma vez e só contém as mensagens desse bot.
5. Encerre com `stop --keep-state`, suba com o mesmo `--data`, abra Estudos e converse. O transcript em `bots/<id>/messages.json` e o rodapé de contexto devem permanecer.
6. Crie uma rotina com intervalo longo e confirme que só aparece no bot que a criou. Peça para apagá-la, volte à lista enquanto aguarda aprovação e reabra o bot: a aprovação deve continuar respondível. Recuse para provar a retomada sem executar a exclusão.
7. Para conferir a compactação automática, acumule contexto até passar de 80% da janela do modelo. Confira que a conversa responde, que um arquivo novo aparece em `bots/<id>/sessions/` e que a memória continua disponível.
8. Depois da compactação, peça para consultar a conversa anterior: `search_history` e `read_history` devem recuperar mensagens e resultados reais. Confira isolamento entre bots e continuação de um registro longo.

Capture a tela e o estado em disco a cada etapa. Não apague o histórico real para preparar uma verificação.
