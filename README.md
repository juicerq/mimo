# mimo-tui

Bots pessoais no terminal, com eve e OpenTUI. Cada bot mantém sua conversa e memória própria. Seu propósito se desenvolve pelo uso.

Crie um bot com `/new <nome>`. Use `/bots` para ver a lista e digite o número para abrir uma conversa. Não há limite de quantidade nem formulário de propósito. Ao reabrir um bot, o histórico e as aprovações pendentes voltam à tela. Trocar de bot não interrompe seu trabalho.

Use `/model` dentro da conversa para escolher um modelo e seu esforço pelo número. Antes de confirmar a escolha, `/cancel` ou `Esc` volta à conversa sem alterar o modelo. A configuração pertence ao bot e permanece salva ao reiniciar.

O rodapé mostra contexto, modelo e esforço selecionados, modo e estado. A troca vale para a próxima resposta. Uma resposta em andamento, inclusive sua continuação após aprovação, termina com o modelo com que começou. Histórico, memória e aprovações continuam na mesma sessão. A borda do composer fica mais clara quando ele está focado.

Durante uma resposta, dois `Esc` em até 400 ms interrompem o turno. Se houver uma aprovação pendente, o atalho encerra a sessão sem aprovar a ação; o próximo envio começa outra com acesso ao histórico anterior. Um `Esc` isolado não interrompe; dentro do seletor de modelos ele apenas volta à conversa. Depois de uma falha ou interrupção, escreva “continue”, ajuste o pedido ou mude de assunto normalmente. Interromper não desfaz ações já concluídas.

Aprovações criadas antes desse recurso não têm o modelo registrado. Sua retomada usa a escolha salva atual.

## Desenvolvimento

```sh
bun install
bun run check
```

Para conversar de verdade:

```sh
bun run dev
```

O comando sobe o agente em `http://127.0.0.1:2000`, espera ele responder e abre a TUI. `Ctrl+C` encerra os dois. O log do agente fica em `apps/agent/.eve/dev-server.log`.

Para usar um agente que já está rodando em outro endereço, defina `MIMO_AGENT_URL`; o comando só abre a TUI. `--version` imprime a versão.

Com o agente em execução, `BENCH_RUNS=1 bun run bench` mede uma resposta em um novo bot `Benchmark` e imprime o tempo, os tokens e o ID do bot.

O seletor oferece os modelos da assinatura OpenAI conectada no Codex e os modelos conhecidos da OpenCode Go. Uma falha no catálogo de um provedor não esconde o outro. Cada modelo oferece os esforços que sua integração aceita.

Para definir GPT-5.6 Luna com esforço `max` como escolha inicial dos novos bots:

```sh
MIMO_MODEL=openai-oauth/gpt-5.6-luna MIMO_REASONING=max bun run dev
```

A integração OpenAI usa as credenciais locais do Codex em `~/.codex/auth.json` e o SDK OpenAI para streaming e ferramentas. O catálogo vem da mesma conta. A assinatura tem seus próprios limites de uso, separados de uma chave de API.

O modelo inicial padrão continua `opencode-go/deepseek-flash`, exibido como `deepseek-v4.1-flash`. `MIMO_MODEL`, `MIMO_REASONING` e `MIMO_CONTEXT_WINDOW` definem apenas a configuração inicial. As escolhas salvas por bot prevalecem sobre o ambiente. Bots anteriores recebem essa configuração uma vez ao abrir ou listar.

Se uma chamada de modelo falhar, a TUI mostra o erro. Para mudar de provedor, use `/model` e depois escreva, por exemplo, “continue”. Escolher um modelo não envia nenhuma mensagem. Se o envio ao agente falhar, o texto permanece no composer para editar ou enviar novamente. Se o Eve tiver encerrado a sessão, a próxima mensagem abre outra no mesmo bot, com aviso, a última mensagem anterior como referência e acesso ao histórico completo.

O contexto usa a compactação automática padrão do Eve: o histórico mais antigo é resumido conforme a janela do modelo se aproxima do limite, mantendo a mesma sessão. O rodapé mostra o consumo da última chamada e a janela do modelo selecionado. Quando uma sessão encerrar, o próximo envio abre outra no mesmo bot e a TUI mostra um aviso curto.

O bot recebe o caminho do arquivo anterior. `search_history` busca em todas as sessões arquivadas do próprio bot; `read_history` lê as mensagens e resultados originais próximos aos trechos encontrados, com limite de saída e continuação. A busca nos arquivos é textual e retorna trechos originais. Memória e rotinas permanecem disponíveis. A nova sessão começa no modo normal, sem retomar aprovações antigas nem incluir todo o histórico no contexto.

## Dados

Por padrão o agente guarda bots, memória, contas do Gmail, rotinas e registros de ações em `apps/agent/.data`, que são os dados reais. Para experimentar sem tocar neles, rode o sandbox:

```sh
bun run dev:sandbox
```

Ele usa `apps/agent/.data-dev` (ignorado pelo git). Qualquer outro diretório serve com `MIMO_DATA_DIR` (relativo ao `apps/agent` ou absoluto); a subida do agente imprime o caminho em uso. Para conectar contas no sandbox:

```sh
MIMO_DATA_DIR=.data-dev bun run gmail:auth
```

A verificação de ponta a ponta (`verify-mimo`) também roda em sandbox por padrão e só usa os dados reais se for apontada para eles de propósito.

## Memória

Cada bot tem memória isolada no slot `profile`, guardada em `apps/agent/.data/memory/` (ou no `MIMO_DATA_DIR`). Ela registra fatos, preferências e decisões úteis para os próximos turnos. Peça ao bot para lembrar ou remover algo. As memórias compartilhadas da versão anterior são preservadas em disco, mas não são atribuídas automaticamente aos novos bots.

O cadastro em `bots/` aponta para a sessão atual de cada bot. Quando uma sessão encerrada é substituída, seus eventos, rotinas e registros de ações ficam em `bots/<bot-id>/sessions/<session-id>.json`. As ferramentas de histórico consultam todos os arquivos do próprio bot e omitem fragmentos de streaming e metadados técnicos na leitura, preservando as mensagens e o estado das ações. O arquivo completo permanece intacto. A memória mantém a chave da primeira sessão.

O eve guarda o histórico e o estado durável em `apps/agent/.eve/.workflow-data/`; no desenvolvimento, preserve também as gerações em `.eve/`, às quais as sessões se vinculam. Faça backup de `.data/` e `.eve/` juntos. `MIMO_DATA_DIR` muda os dados do aplicativo, mas não o armazenamento de workflows do eve.

O Eve é usado sem patches, com a compactação padrão. Os limites acumulados de duração e tokens de entrada da sessão ficam desativados. Uma mensagem que sozinha excede a janela do modelo ainda precisa ser reduzida pela pessoa.

O rodapé usa a janela da integração selecionada. Na OpenAI, ela vem do catálogo da conta, que pode diferir da janela da API pública. A seleção salva essa capacidade com o modelo para permitir abrir o bot sem consultar o catálogo. `MIMO_CONTEXT_WINDOW` permite definir outra janela inicial em tokens.

## Gmail

Gmail é uma integração disponível para os bots. As contas conectadas pertencem à pessoa e podem ser usadas por qualquer bot. Memória e rotinas pertencem ao bot; modo e registros de ações pertencem à sessão. As tools `list_accounts`, `list_unread` e `read_thread` leem a caixa de entrada; `create_draft` cria rascunhos e `send_draft` envia um rascunho com aprovação no terminal. Cada conta conectada guarda o refresh token em `apps/agent/.data/gmail/accounts.json`; o client id e o client secret ficam em `apps/agent/.env.local`.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a Gmail API.
2. Configure a tela de consentimento OAuth (tipo External, com você como usuário de teste).
3. Em Credenciais, crie um cliente OAuth do tipo App para computador.
4. Coloque o client id e o client secret em `apps/agent/.env.local` (`GMAIL_CLIENT_ID` e `GMAIL_CLIENT_SECRET`).
5. Rode `bun run gmail:auth`, abra a URL que aparecer e autorize a conta. O comando grava a conta e o refresh token sozinho; rode de novo para conectar outras contas.
6. Rode `bun run dev` e peça para o bot listar os não lidos. Com mais de uma conta, diga qual.

Com a tela de consentimento em Testing, o Google expira o refresh token em 7 dias e a conta precisa ser conectada de novo com `bun run gmail:auth`. Para evitar, publique o app em In production; o consentimento passa a mostrar o aviso de app não verificado, e para uso pessoal não é preciso concluir a verificação.

## Busca na web

A tool `web_search` usa o MCP público da [Exa](https://exa.ai/) (`mcp.exa.ai/mcp`), o mesmo que o OpenCode usa: funciona sem conta e sem chave. Quem tiver uma `EXA_API_KEY` pode colocá-la em `apps/agent/.env.local` para limites maiores.

```sh
EXA_API_KEY=
```

## Rotinas

As rotinas ficam em `apps/agent/.data/routines.json` (ou no `MIMO_DATA_DIR`) e pertencem ao bot que as criou. Um dispatcher de um minuto entrega o prompt ao bot pelo mesmo caminho usado pela conversa. A sessão atual é resolvida no envio, incluindo a recuperação de uma sessão encerrada. A TUI acompanha a nova sessão mesmo quando a troca foi provocada por uma rotina.

Rotinas antigas são associadas ao bot pela sessão de origem, incluindo sessões arquivadas. A referência de origem continua no arquivo para compatibilidade com execuções antigas; o destino é o bot. Registros cujo bot não pode ser identificado são preservados e desativados com um erro explicativo.

O `eve dev` não dispara cron sozinho, então o `bun run dev` chama a rota de dispatch a cada minuto. Num `eve build && eve start`, o eve dispara sozinho, mas o processo precisa estar de pé.
