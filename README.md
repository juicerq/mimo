# mimo

Bots pessoais num app de desktop, com a harness [Pi](https://www.npmjs.com/package/@earendil-works/pi-agent-core) e Electron. Cada bot mantém sua conversa e memória própria. Seu propósito se desenvolve pelo uso.

A tela e o agente rodam no mesmo processo: não há servidor nem daemon.

À esquerda fica a barra de bots, sempre visível: um bot por linha, com o rosto, a última mensagem e a marca do que ele faz agora — trabalhando, esperando aprovação, falhou, parado. O mais recente fica no topo. É como você sabe o que acontece nos outros bots sem sair da conversa. Clique num bot para abrir a conversa dele; trocar de bot não interrompe seu trabalho, e ao voltar o histórico e as aprovações pendentes estão lá.

Crie um bot pelo `+` no topo da barra: escreva o nome e confirme. Para apagar, clique com o botão direito no bot e escolha **Apagar bot**; a conversa, a memória e as rotinas daquele bot são apagadas. Toda exclusão entra no `actions.jsonl` com a hora, o nome e a origem. Não há limite de quantidade nem formulário de propósito.

O ⓘ no topo abre **Sobre o bot**, o painel da direita: a instrução permanente, o modelo, o esforço, a data de criação e, enquanto ele navega, a prévia do navegador. A escolha de modelo pertence ao bot e permanece salva ao reiniciar. Trocar de modelo não envia mensagem nenhuma e vale para a próxima resposta; uma resposta em andamento, inclusive a continuação depois de uma aprovação, termina com o modelo com que começou.

A engrenagem no pé da barra abre **Configurações**, com duas partes: **Aplicativo** (tema e detalhe) e **Contas** (entrar nos provedores de modelo, ver e desconectar as contas de Gmail).

Depois de enviar, uma linha viva acima do composer mostra o que o bot faz, com o tempo correndo e um botão para parar. Parar descarta a fila junto com o turno; ações já concluídas não são desfeitas. Depois de uma falha ou interrupção, escreva "continue", ajuste o pedido ou mude de assunto normalmente.

Você pode escrever enquanto o bot trabalha. A mensagem fica acima do composer e entra na conversa assim que ele termina o passo atual. Várias mensagens esperam em ordem e chegam juntas, num turno só.

O bot trabalha sem perguntar: `bash`, `write` e `edit` rodam direto, e cada ação fica registrada em `actions.jsonl`. A única exceção é enviar e-mail, que sempre para para você confirmar. Não há modo a escolher.

**Detalhe**, em Configurações › Aplicativo, controla quanto a conversa mostra além da sua mensagem e da resposta do bot. `Breve` mostra uma linha por item, como "Procurou na web"; `Completo` acrescenta a chamada da ferramenta e o resultado, cortados em 600 caracteres. Os cards que pedem uma resposta sua — conectar o Gmail, aprovar um envio, assumir o navegador — aparecem nos dois níveis.

O contexto é compactado automaticamente em 80% da janela do modelo: as mensagens antigas viram um resumo, que aparece na conversa como um bloco fechado, e a conversa anterior é arquivada. `search_history` busca em todas as conversas arquivadas do próprio bot e `read_history` lê as mensagens originais em volta dos trechos encontrados.

Um bot lê um `MIMO.md`: o geral, em `~/.mimo/MIMO.md`, que vale para todo bot. É lido a cada turno, então editar vale já no turno seguinte, sem reiniciar. É o único arquivo que o bot trata como instrução sua; o resto continua sendo dado. Só `MIMO.md`, sem `AGENTS.md`, `CLAUDE.md` nem `README.md` — as regras dos seus agentes de código não chegam aos bots. Um symlink resolve, e o mimo segue symlink. Não há teto no tamanho: quem regula é a compactação, que desconta o prompt de sistema antes de decidir quanto da conversa guardar, e avisa na conversa quando as instruções permanentes passam de metade da janela.

## Instalação

```sh
bun install
bun run build
cd apps/desktop && bun link
```

Isso dá o comando `mimo`, que abre o app compilado em qualquer pasta. O link aponta para o build dentro do repo, então atualizar é puxar o repo e rodar `bun run build` de novo. Coloque suas chaves em `~/.mimo/.env`, no formato do `.env.example`.

## Desenvolvimento

O `CONTEXT.md` é a primeira leitura de quem vai mexer no código: ele define cada palavra do domínio e diz qual arquivo é dono dela.

```sh
bun install
bun run check
```

Para mexer no app com recarga automática:

```sh
bun run dev
```

O `dev` sempre usa a Casa `.data-desktop`, nunca os seus bots reais, então ele e o app compilado convivem sem disputa. A tela recarrega sozinha; o processo principal (`apps/desktop/src/main`, `apps/agent/src`) exige reiniciar o comando.

Para conferir a versão compilada:

```sh
bun run build
bun start
```

O painel de modelo oferece os modelos da assinatura OpenAI conectada no Codex e os modelos da OpenCode Go. Uma falha no catálogo de um provedor não esconde o outro. Cada modelo oferece os esforços que sua integração aceita.

Para definir outro modelo como escolha inicial dos novos bots:

```sh
MIMO_MODEL=opencode-go/deepseek-v4-flash MIMO_REASONING=high bun run dev
```

A integração OpenAI usa as credenciais locais do Codex em `~/.codex/auth.json`; a OpenCode Go usa `~/.local/share/opencode/auth.json`. O catálogo vem das mesmas contas. A assinatura tem seus próprios limites de uso, separados de uma chave de API.

Configurações › Contas conecta uma conta sem sair do app: OpenCode Go por chave de API, OpenAI por OAuth e Gmail por OAuth. A credencial dos modelos é gravada nos mesmos arquivos do Codex e da OpenCode, e o token renovado é salvo a cada atualização. O Gmail grava a conta em `~/.mimo/gmail/accounts.json`; a autorização volta sozinha do navegador.

O modelo inicial padrão é `openai-codex/gpt-5.6-luna` com esforço `max`. Um bot salvo com um provedor que o mimo não tem mais volta para esse padrão ao abrir. `MIMO_MODEL` e `MIMO_REASONING` definem apenas a configuração inicial de um bot novo. As escolhas salvas por bot prevalecem sobre o ambiente.

Se uma chamada de modelo falhar, o erro aparece na conversa. Para mudar de provedor, troque o modelo em Sobre o bot e depois escreva, por exemplo, "continue". Se o envio falhar, o texto permanece no composer para editar ou enviar novamente.

## Dados

O mimo guarda tudo em `~/.mimo/`: bots, transcripts, memória, contas do Gmail, rotinas, registros de ações e as chaves em `~/.mimo/.env`. A casa não depende da pasta de onde você chamou o mimo. `MIMO_DATA_DIR` troca o lugar dos dados (relativo à pasta atual ou absoluto); as chaves e as credenciais seguem o `$HOME`, porque pertencem a você e não ao sandbox.

A verificação de ponta a ponta (`verify-mimo`) também roda em sandbox por padrão e só usa os dados reais se for apontada para eles de propósito.

## Memória

Cada bot tem memória isolada em `~/.mimo/bots/<id>/memory.md`. Ela registra fatos, preferências e decisões úteis para os próximos turnos. Peça ao bot para lembrar ou remover algo.

O registro do bot fica em `~/.mimo/bots/<id>.json` e o transcript atual em `~/.mimo/bots/<id>/messages.json`. Cada compactação arquiva a conversa anterior em `~/.mimo/bots/<id>/sessions/<session-id>.json`. As ferramentas de histórico consultam todos os arquivos do próprio bot e omitem metadados técnicos na leitura, preservando as mensagens e o estado das ações.

## Os outros bots

Todo bot é igual: não há bot filho nem hierarquia. Um bot vê os outros com `list_bots` e pergunta a qualquer um deles pelo nome com `ask_bot`. Escrever `@nome` na sua mensagem aponta para esse bot.

Cada par de bots ganha uma conversa à parte, uma por direção. Ela aparece como uma linha no meio da conversa; clicando nela você abre e lê, mas não escreve. Por padrão a pergunta não segura o turno: quem perguntou segue conversando com você e a resposta chega depois, num turno novo. Um bot que está esperando resposta sua não pode ser perguntado de volta.

## Navegador

A tool `browse` dá ao bot um navegador dentro do app. Ele abre uma página, lê, clica, preenche campos e aperta teclas. A página chega a ele em texto, com um `ref` por elemento que aceita clique — ele nunca vê uma foto, e por isso custa menos e erra menos o alvo.

Enquanto ele navega, a prévia da página aparece no topo de Sobre o bot. Ela some quando ele fecha o navegador.

Quando a página pede algo que só você pode fazer — senha, código, captcha, aceitar um termo — o bot chama `handoff` e a conversa mostra um card com o motivo. **Abrir o navegador** põe a página em tela cheia dentro da janela, com uma barra embaixo: **Terminei** devolve a página ao bot, **Deixa pra lá** avisa que não deu. O turno fica parado até você responder.

O navegador tem uma sessão própria, separada do seu navegador normal, e não abre nenhuma porta de depuração.

## Gmail

Gmail é uma integração disponível para os bots. As contas conectadas pertencem a você e podem ser usadas por qualquer bot. Memória e rotinas pertencem ao bot. A tool `connect_gmail` inicia a conexão pelo próprio bot: a linha da tool vira um card na conversa e autorizar abre o navegador. A tool `disconnect_gmail` apaga a conta guardada e revoga o acesso no Google. As tools `list_accounts`, `list_unread` e `read_thread` leem a caixa de entrada; `create_draft` cria um rascunho, que você revisa e envia no Gmail, e `send_email` envia um e-mail; com `threadId`, ele entra naquela thread como resposta. Só `send_email` espera a sua confirmação; o resto acontece direto. Cada conta conectada guarda o refresh token em `~/.mimo/gmail/accounts.json`; o client id e o client secret ficam em `~/.mimo/.env`.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a Gmail API.
2. Configure a tela de consentimento OAuth (tipo External, com você como usuário de teste).
3. Em Credenciais, crie um cliente OAuth do tipo App para computador.
4. Coloque o client id e o client secret em `~/.mimo/.env` (`GMAIL_CLIENT_ID` e `GMAIL_CLIENT_SECRET`).
5. Abra o mimo e peça ao bot para conectar sua conta do Gmail (ele chama `connect_gmail`), ou vá em Configurações › Contas. Autorize no navegador e o app grava a conta e o refresh token sozinho; repita para conectar outras contas.
6. Peça para o bot listar os não lidos. Com mais de uma conta, diga qual.

Com a tela de consentimento em Testing, o Google expira o refresh token em 7 dias e a conta precisa ser conectada de novo. Para evitar, publique o app em In production; o consentimento passa a mostrar o aviso de app não verificado, e para uso pessoal não é preciso concluir a verificação.

## Computador

O bot alcança a máquina pelas tools do próprio Pi: `bash` roda um comando, `read` lê um arquivo (texto ou imagem, com `offset` e `limit`), `write` grava o arquivo inteiro e `edit` troca trechos e mostra o diff. O Pi corta a saída longa e guarda o resto num arquivo temporário.

As tools partem da sua pasta pessoal (`$HOME`); caminhos absolutos valem, e basta dizer ao bot em que pasta trabalhar. Não há pasta proibida: o bot alcança o que o seu usuário alcança. `bash`, `write` e `edit` rodam direto, sem pedir aprovação.

## Busca na web

A tool `web_search` usa o MCP público da [Exa](https://exa.ai/) (`mcp.exa.ai/mcp`), o mesmo que o OpenCode usa: funciona sem conta e sem chave. Quem tiver uma `EXA_API_KEY` pode colocá-la em `~/.mimo/.env` para limites maiores.

```sh
EXA_API_KEY=
```

## Rotinas

As rotinas ficam em `~/.mimo/routines.json` e pertencem ao bot que as criou. Um dispatcher de um minuto roda dentro do app e entrega o prompt ao bot pelo mesmo caminho usado pela conversa. Com o app fechado, nenhuma rotina dispara.

Cada rotina tem um nome curto, escolhido na criação e único dentro do bot, como `check_emails`. As tools `update_routine` e `delete_routine` tratam a rotina pelo nome, e `list_routines` mostra os nomes.

O disparo aparece na conversa como "Rotina `<nome>` começou". Não é sua mensagem: você não escreveu aquilo. Com o detalhe em `Completo` a linha seguinte mostra o prompt da rotina, cortado em 600 caracteres. O bot recebe o prompt inteiro com a marca `[rotina: <nome>]`, então ele sabe de onde veio, e a marca sobrevive ao reabrir o bot.
