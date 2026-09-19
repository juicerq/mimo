# mimo-tui

Bots pessoais no terminal, com a harness [Pi](https://www.npmjs.com/package/@earendil-works/pi-agent-core) e OpenTUI. Cada bot mantém sua conversa e memória própria. Seu propósito se desenvolve pelo uso.

A TUI e o agente rodam no mesmo processo: não há servidor nem daemon. Abrir até a lista de bots leva cerca de 200 ms.

O conteúdo fica junto ao composer: mensagens, listas e opções começam embaixo e sobem enquanto crescem.

A conversa não tem cabeçalho: cada mensagem traz quem falou, `you:` na sua e `<nome do bot>:` na resposta. O cabeçalho só aparece nos painéis, com o nome do passo.

À esquerda fica a barra de bots, sempre visível: um bot por linha, com a marca do que ele faz agora — `●` trabalhando, `⏸` parado numa aprovação, `✗` falhou, nada quando está parado, e `·2` quando tem duas frentes abertas. O bot aberto fica com o nome claro. É como você sabe o que acontece nos outros bots sem sair da conversa. `Ctrl+E` foca a barra e põe o cursor num campo de busca: digite para filtrar. A primeira seta tira o foco do campo e passa para a lista; cada `↑↓` já abre o bot daquela linha, então você lê a conversa enquanto anda. `Enter` fica nesse bot e devolve o foco ao composer; `Esc` fecha a busca. Em terminal com menos de 90 colunas a barra encolhe para uma coluna de marcas e `Ctrl+E` a expande.

Crie um bot com `/new <nome>`. Use `/bots` para ver a lista e digite o número para abrir uma conversa. `/delete` abre o painel com os bots: escolha o número e confirme com `1. Delete`; a conversa, a memória e as rotinas daquele bot são apagadas e a TUI volta para a lista. Toda exclusão entra no `actions.jsonl` com a hora, o nome e a origem — o painel, a tool de um bot pai ou a cascata que leva os filhos junto. Não há limite de quantidade nem formulário de propósito. Ao reabrir um bot, o histórico e as aprovações pendentes voltam à tela. Trocar de bot não interrompe seu trabalho.

Use `/model` dentro da conversa para escolher o provedor, o modelo e o esforço pelo número. `Ctrl+P` abre o mesmo painel preservando o rascunho. `/effort` pula direto para o esforço do modelo atual. A conversa continua recebendo respostas enquanto o painel está aberto. Antes de confirmar a escolha, `/cancel` ou `Esc` volta à conversa sem alterar o modelo. A configuração pertence ao bot e permanece salva ao reiniciar.

Use `/tools` para escolher os grupos de tools do bot. O painel lista `computer`, `web`, `gmail`, `routines` e `team` com `[x]` ou `[ ]`; o número liga e desliga um grupo na hora. Um grupo desligado tira as tools e também o bloco de instruções dele do contexto, então um bot de e-mail não carrega as regras do computador nem da equipe. Hora, memória, histórico e registro de ações ficam sempre disponíveis. A conversa também resolve: peça "desligue o gmail" e o bot chama `set_tools`. Ligar um grupo pede aprovação no modo normal; desligar não pede. A escolha aparece na conversa como `tools: <grupos>` e permanece salva.

Use `/folder` para dar uma pasta ao bot — o projeto dele. Digite o caminho inteiro; `~` vale e `-` tira a pasta. A partir daí `bash`, `read`, `write` e `edit` rodam de lá, e o bot sabe disso pelas instruções do grupo `computer`. O nome da pasta aparece no `/details`. Sem pasta, as tools rodam do seu `$HOME`, como antes. Um bot filho nasce com a pasta do pai. A pasta precisa existir na hora de salvar; se ela sumir depois, o `bash` falha apontando para ela.

Um bot lê dois `AGENTS.md`: o geral, em `~/.agents/AGENTS.md`, que vale para todo bot, e o do projeto, na raiz da pasta. São lidos a cada turno, então editar um vale já no turno seguinte, sem reiniciar. São os únicos arquivos que o bot trata como instrução sua; o resto continua sendo dado. Quando os dois brigam, vale o do projeto. Só `AGENTS.md`, sem `CLAUDE.md` nem `README.md` — um symlink resolve, e o mimo segue symlink. Não há teto no tamanho: quem regula é a compactação, que desconta o prompt de sistema antes de decidir quanto da conversa guardar, e avisa na conversa quando as instruções permanentes passam de metade da janela.

Um bot nasce no **modo autônomo**: `bash`, `write`, `edit` e os envios de e-mail acontecem sem perguntar, e cada ação fica registrada em `actions.jsonl` — `list_actions` lê de volta. Peça "entre no modo normal" e ele passa a esperar aprovação no terminal para essas ações. O `/details` mostra o modo do bot aberto, e a escolha permanece salva.

`Ctrl+O` alterna quanto detalhe a conversa mostra. Detalhe é tudo que não é sua mensagem nem a resposta do bot: a ferramenta, o disparo de uma rotina, a ação de equipe e a troca de grupos de tools. `brief` mostra uma linha por item, como `⚙ list_unread` ou `routine: check_emails started` (padrão); `full` acrescenta o detalhe cortado em 600 caracteres, como a entrada da ferramenta e o prompt da rotina; `off` esconde todos eles. A conversa é redesenhada inteira, então os turnos antigos acompanham.

Depois de enviar, a conversa mostra uma linha viva com o que o bot faz: `⠙ thinking · 3s · esc esc to stop` antes da primeira ferramenta e `working` depois dela. A linha some quando o texto da resposta começa a chegar e dá lugar ao streaming. Abrir um bot mostra `loading` no mesmo lugar.

Use `/details` para ver bot, modelo com esforço, contexto, modo, pasta, tools, detalhe e time. O estado do turno não fica ali: fica na conversa. A troca vale para a próxima resposta. Uma resposta em andamento, inclusive sua continuação após aprovação, termina com o modelo com que começou. A borda do composer fica mais clara quando ele está focado.

Enquanto os filhos trabalham, cada um aparece acima do composer como `team: <nome> · <tempo> · <tool>`, com a ferramenta do momento. A linha some quando o filho entrega o trabalho.

Você pode escrever enquanto o bot trabalha. A mensagem fica acima do composer como `queue: <texto>` e entra na conversa assim que o bot termina o passo atual. Várias mensagens esperam em ordem e chegam juntas, num turno só. Dois `Esc` descartam a fila junto com o turno.

Durante uma resposta, dois `Esc` em até 400 ms interrompem o turno. Um `Esc` isolado não interrompe; dentro do painel de modelos ele apenas volta à conversa. Se houver uma aprovação pendente, o atalho a recusa. Depois de uma falha ou interrupção, escreva “continue”, ajuste o pedido ou mude de assunto normalmente. Interromper não desfaz ações já concluídas.

## Instalação

```sh
bun install
cd apps/mimo && bun link
```

Isso dá o comando `mimo` em qualquer pasta. O link aponta para o código do repo, então `git pull` já atualiza o comando; não há build nem publicação no npm. Coloque suas chaves em `~/.mimo/.env`, no formato do `.env.example`.

## Desenvolvimento

O `CONTEXT.md` é a primeira leitura de quem vai mexer no código: ele define cada palavra do domínio e diz qual arquivo é dono dela.

```sh
bun install
bun run check
```

Para conversar de verdade:

```sh
bun run dev
```

O comando abre a TUI e a reinicia quando `apps/mimo/src` ou `apps/agent/src` mudam. `Ctrl+C` fecha tudo.

Para testar a versão compilada:

```sh
bun run build
bun start
```

O painel oferece os modelos da assinatura OpenAI conectada no Codex e os modelos da OpenCode Go. Uma falha no catálogo de um provedor não esconde o outro. Cada modelo oferece os esforços que sua integração aceita.

Para definir outro modelo como escolha inicial dos novos bots:

```sh
MIMO_MODEL=opencode-go/deepseek-v4-flash MIMO_REASONING=high bun run dev
```

A integração OpenAI usa as credenciais locais do Codex em `~/.codex/auth.json`; a OpenCode Go usa `~/.local/share/opencode/auth.json`. O catálogo vem das mesmas contas. A assinatura tem seus próprios limites de uso, separados de uma chave de API.

Use `/login` para conectar uma conta sem sair da TUI. O painel separa `providers` (OpenCode Go com chave de API, OpenAI com OAuth) de `plugins` (Gmail com OAuth), com numeração contínua. Na OpenAI, escolha login pelo navegador ou por código de dispositivo; a TUI mostra o link e `c` copia ele para a área de transferência. Cole o código de autorização no composer se o navegador não voltar sozinho. `/cancel` ou `Esc` aborta o login. `/logout` lista as contas de Gmail conectadas e desconecta pelo número. A credencial dos modelos é gravada nos mesmos arquivos do Codex e da OpenCode, e o token renovado é salvo a cada atualização. O Gmail segue o mesmo caminho e grava a conta em `~/.mimo/gmail/accounts.json`; a autorização volta sozinha do navegador.

O modelo inicial padrão é `openai-codex/gpt-5.6-luna` com esforço `max`. Um bot salvo com um provedor que o mimo não tem mais volta para esse padrão ao abrir. `MIMO_MODEL` e `MIMO_REASONING` definem apenas a configuração inicial de um bot novo. As escolhas salvas por bot prevalecem sobre o ambiente.

Se uma chamada de modelo falhar, a TUI mostra o erro. Para mudar de provedor, use `/model` e depois escreva, por exemplo, “continue”. Escolher um modelo não envia nenhuma mensagem. Se o envio falhar, o texto permanece no composer para editar ou enviar novamente.

O contexto é compactado automaticamente em 80% da janela do modelo: as mensagens antigas viram um resumo e a conversa anterior é arquivada. O rodapé mostra o consumo da última chamada e a janela do modelo selecionado.

`search_history` busca em todas as conversas arquivadas do próprio bot; `read_history` lê as mensagens e resultados originais próximos aos trechos encontrados, com limite de saída e continuação. A busca nos arquivos é textual e retorna trechos originais. Memória e rotinas permanecem disponíveis.

## Dados

O mimo guarda tudo em `~/.mimo/`: bots, transcripts, memória, contas do Gmail, rotinas, registros de ações e as chaves em `~/.mimo/.env`. A casa não depende da pasta de onde você chamou o mimo, então `bun run dev` e o comando `mimo` veem os mesmos bots. Para experimentar sem tocar neles, rode o sandbox:

```sh
bun run dev:sandbox
```

Ele usa `.data-dev` (ignorado pelo git). Qualquer outro diretório serve com `MIMO_DATA_DIR` (relativo à pasta atual ou absoluto). Para conectar contas no sandbox, rode `/login` dentro dele: a conta é gravada no diretório de dados em uso.

A verificação de ponta a ponta (`verify-mimo`) também roda em sandbox por padrão e só usa os dados reais se for apontada para eles de propósito.

## Memória

Cada bot tem memória isolada em `~/.mimo/bots/<id>/memory.md`. Ela registra fatos, preferências e decisões úteis para os próximos turnos. Peça ao bot para lembrar ou remover algo.

O registro do bot fica em `~/.mimo/bots/<id>.json` e o transcript atual em `~/.mimo/bots/<id>/messages.json`. Cada compactação arquiva a conversa anterior em `~/.mimo/bots/<id>/sessions/<session-id>.json`. As ferramentas de histórico consultam todos os arquivos do próprio bot e omitem metadados técnicos na leitura, preservando as mensagens e o estado das ações.

## Equipe

Um bot pode montar uma equipe de bots filhos. As tools `create_bot`, `update_bot`, `list_bots`, `delete_bot`, `delegate`, `check_team`, `stop_bot` e `list_models` vêm do grupo `team`, que só bots sem pai têm. Um filho é um bot comum, com memória e sessão próprias, mas não aparece em `/bots` nem em `/delete`: quem cuida dele é o pai. Apagar o pai apaga a equipe inteira, e o painel de `/delete` avisa quais bots vão junto.

Ao criar um filho, o pai escolhe o nome, a instrução permanente, os grupos de tools e o modelo. Os grupos são `computer`, `web`, `gmail` e `routines`; `team` não é oferecido a um filho, então a equipe não tem netos. Sem modelo escolhido, o filho nasce com o padrão; `list_models` mostra os valores aceitos. As tools da equipe tratam o filho pelo nome, que é único dentro da equipe.

As instruções do grupo `team` fazem do pai um gerente: ele divide o trabalho em frentes e cuida delas para você, que fala só com ele. Toda feature, todo bug e toda investigação é uma frente, e cada frente vira um filho, com o problema inteiro do começo ao fim. O filho vive enquanto a frente está aberta, então voltar ao assunto delega de novo para o mesmo bot, que já tem a memória dela. O pai conta o que o filho trouxe; ele não refaz o trabalho nem manda outro filho revisar.

Duas frentes no mesmo repositório se atropelam, então o pai pode pedir `worktree` no `create_bot`: o filho nasce numa cópia isolada do projeto, num git worktree com branch próprio em `~/.mimo/worktrees/<id>`. A cópia vira a pasta daquele filho e dura o que ele dura; apagar o filho apaga a cópia e deixa o branch, para você juntar o trabalho quando quiser. Só o que teve commit fica no branch, então `delete_bot` recusa fechar uma frente com trabalho sem commit e pede o commit primeiro; `discard` força o fechamento e joga fora. O rail mostra o nome da cópia embaixo da task do filho.

`delegate` começa o trabalho no filho e volta na hora: o turno do pai fecha e a pessoa continua conversando com ele. O filho não vê a conversa da pessoa, então o pedido precisa ser completo. Cada filho atende um trabalho por vez; vários filhos trabalham ao mesmo tempo. Um filho não delega e não cria bots, então a equipe tem um nível só.

As tools que mexem na equipe não aparecem como `⚙ delegate`: viram uma linha de conversa com o nome do filho, `▌ created ana`, `▌ delegated to ana`, `▌ stopped ana` e `▌ deleted ana`. A linha sai quando a ação termina, então uma tool recusada na aprovação ou que falhou não deixa linha nenhuma. Elas são detalhe, então `Ctrl+O off` as esconde junto com as ferramentas, e o trabalho fica no transcript ao reabrir o bot.

Quando o filho termina, a resposta dele chega sozinha como um aviso na conversa, `▌ O filho <nome> terminou e respondeu:`, e o pai fala em seguida. Se o pai estiver no meio de um turno, o aviso espera o fim dele. `check_team` diz o que cada filho faz agora e `stop_bot` para um filho que saiu do rumo.

O filho não tem tela. Quando uma ação dele precisa de aprovação, ela sobe para quem o comanda e aparece com o nome dele: `⏸ approval: bash · mate`. Pedidos em fila aparecem um de cada vez. O modo do filho é o do pai; ele não muda de modo sozinho. Dois `Esc` param a resposta do pai; o filho continua o trabalho dele, e para com `stop_bot`.

## Gmail

Gmail é uma integração disponível para os bots. As contas conectadas pertencem à pessoa e podem ser usadas por qualquer bot. Memória e rotinas pertencem ao bot. A tool `connect_gmail` inicia a conexão de uma conta pelo próprio bot: o link aparece no terminal e a pessoa autoriza no navegador. A tool `disconnect_gmail` apaga a conta guardada e revoga o acesso no Google; no modo normal ela espera aprovação. As tools `list_accounts`, `list_unread` e `read_thread` leem a caixa de entrada; `create_draft` cria rascunhos, `send_draft` envia um rascunho e `send_email` inicia um e-mail novo; no modo normal, ambos esperam aprovação. Cada conta conectada guarda o refresh token em `~/.mimo/gmail/accounts.json`; o client id e o client secret ficam em `~/.mimo/.env`.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a Gmail API.
2. Configure a tela de consentimento OAuth (tipo External, com você como usuário de teste).
3. Em Credenciais, crie um cliente OAuth do tipo App para computador.
4. Coloque o client id e o client secret em `~/.mimo/.env` (`GMAIL_CLIENT_ID` e `GMAIL_CLIENT_SECRET`).
5. Rode `bun run dev` e peça ao bot para conectar sua conta do Gmail (ele chama `connect_gmail`), ou digite `/login` e escolha Gmail. Abra o link (`c` copia), autorize a conta e a TUI grava a conta e o refresh token sozinha; repita para conectar outras contas.
6. Peça para o bot listar os não lidos. Com mais de uma conta, diga qual.

Com a tela de consentimento em Testing, o Google expira o refresh token em 7 dias e a conta precisa ser conectada de novo com `/login`. Para evitar, publique o app em In production; o consentimento passa a mostrar o aviso de app não verificado, e para uso pessoal não é preciso concluir a verificação.

## Computador

O bot alcança a máquina pelas tools do próprio Pi: `bash` roda um comando, `read` lê um arquivo (texto ou imagem, com `offset` e `limit`), `write` grava o arquivo inteiro e `edit` troca trechos e mostra o diff. O Pi corta a saída longa e guarda o resto num arquivo temporário.

As tools partem da pasta do bot, ou da pasta pessoal quando ele não tem uma; caminhos absolutos valem. Não há pasta proibida: o bot alcança o que o seu usuário alcança. No modo normal, `bash`, `write` e `edit` esperam aprovação no terminal; no modo autônomo, rodam direto.

## Busca na web

A tool `web_search` usa o MCP público da [Exa](https://exa.ai/) (`mcp.exa.ai/mcp`), o mesmo que o OpenCode usa: funciona sem conta e sem chave. Quem tiver uma `EXA_API_KEY` pode colocá-la em `~/.mimo/.env` para limites maiores.

```sh
EXA_API_KEY=
```

## Rotinas

As rotinas ficam em `~/.mimo/routines.json` e pertencem ao bot que as criou. Um dispatcher de um minuto roda dentro da TUI e entrega o prompt ao bot pelo mesmo caminho usado pela conversa. Com a TUI fechada, nenhuma rotina dispara.

Cada rotina tem um nome curto, escolhido na criação e único dentro do bot, como `check_emails`. As tools `update_routine` e `delete_routine` tratam a rotina pelo nome, e `list_routines` mostra os nomes.

O disparo aparece na conversa como `routine: <nome> started`. Não é `you:`: você não escreveu aquilo. Com `Ctrl+O full` a linha seguinte mostra o prompt da rotina, cortado em 600 caracteres. O bot recebe o prompt inteiro com a marca `[rotina: <nome>]`, então ele sabe de onde veio, e a marca sobrevive ao reabrir o bot. O aviso de um filho carrega a marca `[equipe]` do mesmo jeito.
