# Bots

Cada bot mantém a mesma sessão, com compactação automática, sem expiração por tempo, e memória isolada. Se a sessão terminar, a próxima mensagem abre outra e informa ao bot onde consultar os dados da anterior. A lista é a tela inicial; `/new <nome>` cria e abre um bot, `/bots` volta à lista e o número abre a conversa.

## Verificação

1. Suba um sandbox e capture a lista vazia. Crie `/new Estudos` e envie um pedido sobre um assunto sem relação com Gmail. Confira o nome no topo, modelo e esforço no rodapé e resposta em streaming.
2. Peça para salvar um fato banal com marcador único. Confira a chamada de memória e o arquivo em `memory/` no diretório de dados.
3. Crie `/new Escrita`. Pergunte pelo mesmo fato sem citar seu valor: ele não deve conhecê-lo. Salve outro fato e confirme que está em outro arquivo de memória.
4. Use `/bots` e abra Estudos pelo número. Confira que o histórico reaparece uma vez e só contém as mensagens desse bot.
5. Anote os `sessionId` em `bots/*.json`. Encerre com `stop --keep-state`, suba com o mesmo `--data`, abra Estudos e converse. O histórico e o id devem permanecer os mesmos.
6. Crie uma rotina com intervalo longo e confirme que só aparece no bot que a criou. Peça para apagá-la, volte à lista enquanto aguarda aprovação e reabra o bot: a aprovação deve continuar respondível. Recuse para provar a retomada sem executar a exclusão.
7. Para conferir a compactação automática, rode um sandbox com `MIMO_CONTEXT_WINDOW=16000`, mantendo o modelo real. Acumule contexto até observar eventos `compaction.*` e envie outra mensagem. Confira que o ID permanece igual, a conversa responde e a memória continua disponível. A janela reduzida é uma precondição da verificação, sem mudar a janela física do provedor.

8. Em um bot sintético com memória salva e aprovação pendente, encerre a sessão pelo controle público do Eve. Envie outra mensagem pela TUI. Confira um novo `sessionId`, o aviso, a mesma memória e a ausência da aprovação antiga. Peça para consultar a sessão anterior: search_history e read_history devem recuperar mensagens e resultados reais. Repita a troca, reinicie e consulte também a primeira sessão. Confira isolamento entre bots e continuação de um registro longo.

Capture a tela e o estado em disco a cada etapa. O reinício deve usar o mesmo checkout: as sessões locais do eve dependem de `.eve/`, além do diretório de dados do aplicativo. Não apague o histórico real para preparar uma verificação.
