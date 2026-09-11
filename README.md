# mimo-tui

Bots pessoais no terminal, com a harness [Pi](https://www.npmjs.com/package/@earendil-works/pi-agent-core) e OpenTUI. Cada bot mantém sua conversa e memória própria. Seu propósito se desenvolve pelo uso.

A TUI e o agente rodam no mesmo processo: não há servidor nem daemon. Abrir até a lista de bots leva cerca de 200 ms.

O conteúdo fica junto ao composer: mensagens, listas e opções começam embaixo e sobem enquanto crescem.

A conversa não tem cabeçalho: cada mensagem traz quem falou, `you:` na sua e `<nome do bot>:` na resposta. O cabeçalho só aparece nos painéis, com o nome do passo.

Crie um bot com `/new <nome>`. Use `/bots` para ver a lista e digite o número para abrir uma conversa. `/delete` abre o painel com os bots: escolha o número e confirme com `1. Delete`; a conversa, a memória e as rotinas daquele bot são apagadas e a TUI volta para a lista. Não há limite de quantidade nem formulário de propósito. Ao reabrir um bot, o histórico e as aprovações pendentes voltam à tela. Trocar de bot não interrompe seu trabalho.

Use `/model` dentro da conversa para escolher o provedor, o modelo e o esforço pelo número. `Ctrl+P` abre o mesmo painel preservando o rascunho. `/effort` pula direto para o esforço do modelo atual. A conversa continua recebendo respostas enquanto o painel está aberto. Antes de confirmar a escolha, `/cancel` ou `Esc` volta à conversa sem alterar o modelo. A configuração pertence ao bot e permanece salva ao reiniciar.

`Ctrl+O` alterna como as ferramentas aparecem na conversa: `names` mostra só a linha `⚙ tool` (padrão), `details` acrescenta a entrada e o resultado cortados em 600 caracteres, e `hidden` esconde a ferramenta por completo. O rodapé mostra o modo escolhido por 2 segundos e a conversa é redesenhada inteira, então os turnos antigos acompanham. Uma ferramenta que falha aparece sempre.

Depois de enviar, a conversa mostra uma linha viva com o que o bot faz: `⠙ thinking · 3s · esc esc to stop` antes da primeira ferramenta e `working` depois dela. A linha some quando o texto da resposta começa a chegar e dá lugar ao streaming. Abrir um bot mostra `loading` no mesmo lugar.

O rodapé mostra contexto e o modelo com o esforço. Modo e ferramentas aparecem por 2 segundos quando você os muda, e depois somem. O estado do turno não fica no rodapé: fica na conversa. Dentro dos painéis, o rodapé mostra `status:` enquanto carrega ou grava. A troca vale para a próxima resposta. Uma resposta em andamento, inclusive sua continuação após aprovação, termina com o modelo com que começou. A borda do composer fica mais clara quando ele está focado.

Durante uma resposta, dois `Esc` em até 400 ms interrompem o turno. Um `Esc` isolado não interrompe; dentro do painel de modelos ele apenas volta à conversa. Se houver uma aprovação pendente, o atalho a recusa. Depois de uma falha ou interrupção, escreva “continue”, ajuste o pedido ou mude de assunto normalmente. Interromper não desfaz ações já concluídas.

## Desenvolvimento

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

Para definir GPT-5.6 Luna com esforço `max` como escolha inicial dos novos bots:

```sh
MIMO_MODEL=openai-codex/gpt-5.6-luna MIMO_REASONING=max bun run dev
```

A integração OpenAI usa as credenciais locais do Codex em `~/.codex/auth.json`; a OpenCode Go usa `~/.local/share/opencode/auth.json`. O catálogo vem das mesmas contas. A assinatura tem seus próprios limites de uso, separados de uma chave de API.

Use `/login` para conectar uma conta sem sair da TUI. O painel separa `providers` (OpenCode Go com chave de API, OpenAI com OAuth) de `plugins` (Gmail com OAuth), com numeração contínua. Na OpenAI, escolha login pelo navegador ou por código de dispositivo; a TUI mostra o link e `c` copia ele para a área de transferência. Cole o código de autorização no composer se o navegador não voltar sozinho. `/cancel` ou `Esc` aborta o login. `/logout` lista as contas de Gmail conectadas e desconecta pelo número. A credencial dos modelos é gravada nos mesmos arquivos do Codex e da OpenCode, e o token renovado é salvo a cada atualização. O Gmail segue o mesmo caminho e grava a conta em `.data/gmail/accounts.json`; a autorização volta sozinha do navegador.

O modelo inicial padrão é `opencode-go/deepseek-v4-flash`. `MIMO_MODEL` e `MIMO_REASONING` definem apenas a configuração inicial de um bot novo. As escolhas salvas por bot prevalecem sobre o ambiente.

Se uma chamada de modelo falhar, a TUI mostra o erro. Para mudar de provedor, use `/model` e depois escreva, por exemplo, “continue”. Escolher um modelo não envia nenhuma mensagem. Se o envio falhar, o texto permanece no composer para editar ou enviar novamente.

O contexto é compactado automaticamente em 80% da janela do modelo: as mensagens antigas viram um resumo e a conversa anterior é arquivada. O rodapé mostra o consumo da última chamada e a janela do modelo selecionado.

`search_history` busca em todas as conversas arquivadas do próprio bot; `read_history` lê as mensagens e resultados originais próximos aos trechos encontrados, com limite de saída e continuação. A busca nos arquivos é textual e retorna trechos originais. Memória e rotinas permanecem disponíveis.

## Dados

Por padrão os dados reais ficam em `.data/` na raiz: bots, transcripts, memória, contas do Gmail, rotinas e registros de ações. Para experimentar sem tocar neles, rode o sandbox:

```sh
bun run dev:sandbox
```

Ele usa `.data-dev` (ignorado pelo git). Qualquer outro diretório serve com `MIMO_DATA_DIR` (relativo à raiz ou absoluto). Para conectar contas no sandbox, rode `/login` dentro dele: a conta é gravada no diretório de dados em uso.

A verificação de ponta a ponta (`verify-mimo`) também roda em sandbox por padrão e só usa os dados reais se for apontada para eles de propósito.

## Memória

Cada bot tem memória isolada em `.data/bots/<id>/memory.md`. Ela registra fatos, preferências e decisões úteis para os próximos turnos. Peça ao bot para lembrar ou remover algo.

O registro do bot fica em `.data/bots/<id>.json` e o transcript atual em `.data/bots/<id>/messages.json`. Cada compactação arquiva a conversa anterior em `.data/bots/<id>/sessions/<session-id>.json`. As ferramentas de histórico consultam todos os arquivos do próprio bot e omitem metadados técnicos na leitura, preservando as mensagens e o estado das ações.

## Equipe

Um bot pode montar uma equipe de bots filhos. As tools `create_bot`, `update_bot`, `list_bots` e `delete_bot` só existem em bots sem pai. Um filho é um bot comum, com memória e sessão próprias, mas não aparece em `/bots` nem em `/delete`: quem cuida dele é o pai. Apagar o pai apaga a equipe inteira, e o painel de `/delete` avisa quais bots vão junto.

Ao criar um filho, o pai escolhe o nome, a instrução permanente, os grupos de tools e o modelo. Os grupos são `computer`, `web`, `gmail` e `routines`; hora, memória, histórico e registro de ações ficam sempre disponíveis. Sem modelo escolhido, o filho nasce com o padrão; `list_models` mostra os valores aceitos. No modo normal, `delete_bot` espera aprovação no terminal.

## Gmail

Gmail é uma integração disponível para os bots. As contas conectadas pertencem à pessoa e podem ser usadas por qualquer bot. Memória e rotinas pertencem ao bot. A tool `connect_gmail` inicia a conexão de uma conta pelo próprio bot: o link aparece no terminal e a pessoa autoriza no navegador. A tool `disconnect_gmail` apaga a conta guardada e revoga o acesso no Google; no modo normal ela espera aprovação. As tools `list_accounts`, `list_unread` e `read_thread` leem a caixa de entrada; `create_draft` cria rascunhos, `send_draft` envia um rascunho e `send_email` inicia um e-mail novo, ambos com aprovação no terminal. Cada conta conectada guarda o refresh token em `.data/gmail/accounts.json`; o client id e o client secret ficam em `.env.local` na raiz.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a Gmail API.
2. Configure a tela de consentimento OAuth (tipo External, com você como usuário de teste).
3. Em Credenciais, crie um cliente OAuth do tipo App para computador.
4. Coloque o client id e o client secret em `.env.local` (`GMAIL_CLIENT_ID` e `GMAIL_CLIENT_SECRET`).
5. Rode `bun run dev` e peça ao bot para conectar sua conta do Gmail (ele chama `connect_gmail`), ou digite `/login` e escolha Gmail. Abra o link (`c` copia), autorize a conta e a TUI grava a conta e o refresh token sozinha; repita para conectar outras contas.
6. Peça para o bot listar os não lidos. Com mais de uma conta, diga qual.

Com a tela de consentimento em Testing, o Google expira o refresh token em 7 dias e a conta precisa ser conectada de novo com `/login`. Para evitar, publique o app em In production; o consentimento passa a mostrar o aviso de app não verificado, e para uso pessoal não é preciso concluir a verificação.

## Computador

O bot alcança a máquina pelas tools do próprio Pi: `bash` roda um comando, `read` lê um arquivo (texto ou imagem, com `offset` e `limit`), `write` grava o arquivo inteiro e `edit` troca trechos e mostra o diff. O Pi corta a saída longa e guarda o resto num arquivo temporário.

As tools partem da pasta pessoal e caminhos absolutos valem. Não há pasta proibida: o bot alcança o que o seu usuário alcança. No modo normal, `bash`, `write` e `edit` esperam aprovação no terminal; no modo autônomo, rodam direto.

## Busca na web

A tool `web_search` usa o MCP público da [Exa](https://exa.ai/) (`mcp.exa.ai/mcp`), o mesmo que o OpenCode usa: funciona sem conta e sem chave. Quem tiver uma `EXA_API_KEY` pode colocá-la em `.env.local` para limites maiores.

```sh
EXA_API_KEY=
```

## Rotinas

As rotinas ficam em `.data/routines.json` e pertencem ao bot que as criou. Um dispatcher de um minuto roda dentro da TUI e entrega o prompt ao bot pelo mesmo caminho usado pela conversa. Com a TUI fechada, nenhuma rotina dispara.
