# Mimo

Este contexto define como uma pessoa cria e usa Bots pessoais num app de desktop.

## Linguagem

**Bot**:
Um agente pessoal criado e nomeado pela pessoa, com Memória e Registro próprios. Seu propósito se desenvolve pelo uso, sem especialidade predeterminada, e a pessoa pode criar quantos Bots quiser.
_Evitar_: Assistente, agente
_Dono_: `apps/agent/src/bot/chat.ts` (classe `Chat`); em disco, `apps/agent/src/bot/store.ts`; quem está aberto, `apps/agent/src/bot/registry.ts`

**Registro**:
A conversa inteira de um Bot, que só cresce e nunca perde nada. Sobrevive a reinícios e à troca de Bot, e é o que a pessoa rola na tela. A pessoa nunca começa outro Registro nem o compacta à mão. Ele é gravado enquanto o Turno acontece, a cada mensagem e a cada resultado de tool, e não só no fim: uma queda no meio do Turno não apaga o que já foi feito. Um Bot tem o Registro da conversa com a pessoa e mais um por Conversa entre bots.
_Evitar_: Sessão, chat, conversa nova, histórico arquivado
_Dono_: `apps/agent/src/bot/chat.ts` (`writeLog`, `keepLog`); em disco, `apps/agent/src/bot/store.ts` (`messages.json`); o trecho fora da Janela, `apps/agent/src/history/history.ts`

**Selo**:
O que fecha uma ação que ficou sem resposta no Registro. Ao abrir o Bot, toda chamada de tool sem resultado ganha um resultado com o aviso de que o mimo fechou antes dela terminar e que ela pode ou não ter acontecido. O Bot lê esse aviso como qualquer outro resultado, a pessoa vê a linha `⚠` na tela, e a Janela volta válida para o modelo. O Selo não refaz a ação nem promete que ela falhou.
_Evitar_: Recuperar, retomar, replay
_Dono_: `apps/agent/src/bot/seal.ts` (`sealTranscript`); quando roda, `apps/agent/src/bot/chat.ts` (`open`)

**Janela**:
O trecho do Registro que vai para o modelo. Começa no Resumo mais novo. O prompt de sistema ocupa um piso dentro da janela que a Compactação não corta, então ela mede o que guardar pelo espaço que sobra e avisa quando esse piso passa da metade. Quando o Registro passa do teto do modelo, a Compactação anexa outro Resumo e a Janela encolhe; o resto do Registro continua no lugar, e o Bot alcança ele por `search_history`.
_Evitar_: Contexto, sessão
_Dono_: `apps/agent/src/bot/events.ts` (`summaryStart`); o corte e o Resumo, `apps/agent/src/bot/compaction.ts`; quando roda, `apps/agent/src/bot/chat.ts` (`compact`)

**Resumo**:
O que a Compactação escreve no Registro quando a Janela chega a 80% do modelo: um texto que substitui o trecho antigo na Janela. Entra marcado com `[resumo]`, aparece na conversa como um bloco fechado "Resumo do que veio antes" e nunca como fala da pessoa. Uma Compactação que falha avisa e o Turno segue.
_Evitar_: Sumário, compactação manual
_Dono_: `apps/agent/src/bot/compaction.ts`; a marca, `apps/agent/src/bot/events.ts`; na tela, `apps/desktop/src/renderer/transcript.tsx`

**Turno**:
Uma entrega da pessoa ou um disparo de Rotina e todo o trabalho que ela provoca até a resposta.
_Evitar_: Ciclo, execução
_Dono_: `apps/agent/src/bot/chat.ts` (`drain`, `translate`); na tela, `apps/desktop/src/renderer/status.tsx` (`turnLabel`)

**Modelo do Bot**:
A escolha de provedor, modelo e esforço para as próximas respostas de um Bot. Permanece salva e pode mudar a qualquer momento. Uma resposta em andamento mantém a escolha com que começou, inclusive enquanto espera Aprovação.
_Evitar_: Modelo global, modelo da sessão
_Dono_: `apps/agent/src/model/catalog.ts`; na tela, `apps/desktop/src/renderer/about.tsx`

**Imagem colada**:
Uma imagem que a pessoa cola no campo de mensagem e manda junto com o texto. Os bytes ficam em arquivo (`bots/<id>/images/<hash>.png`) e o Registro guarda só a marca `[imagem: <hash>.png]` na frente do texto, do mesmo jeito que `[resumo]` e `[rotina:]`; a imagem de verdade entra só na Janela, montada a cada chamada do modelo, e nunca é gravada em `messages.json`. Na conversa ela aparece acima do balão da pessoa, fora dele. Um Bot com Modelo que não lê imagem recusa antes de gravar qualquer coisa, e a pessoa recebe o texto e a imagem de volta no campo.
_Evitar_: Anexo, upload, arquivo
_Dono_: `apps/agent/src/images/images.ts`; a marca no Registro, `apps/agent/src/bot/events.ts`; na tela, `apps/desktop/src/renderer/composer.tsx` e `apps/desktop/src/renderer/transcript.tsx`; quem serve o arquivo, `apps/desktop/src/main/pictures.ts`

**Conversa entre bots**:
O Registro que dois Bots têm à parte, um por direção. Nasce quando um Bot chama `ask_bot`, e a pessoa abre pela linha no meio da conversa: ela lê e não escreve. Todo Bot é igual, então qualquer um pergunta a qualquer outro. Por padrão a pergunta não segura o Turno: quem perguntou continua com a pessoa e a resposta chega depois, num Turno novo. Um Bot que já está na corrente de perguntas não pode ser perguntado de volta, e a corrente para em três.
_Evitar_: Bot filho, equipe, delegação, subagente
_Dono_: `apps/agent/src/peers/tools.ts`; em disco, `apps/agent/src/bot/store.ts` (`bots/<id>/peers/<askedBy>.json`); na tela, `apps/desktop/src/renderer/conversation.ts` (`useConversation`)

**Fila**:
As entregas que a pessoa escreve enquanto o Bot trabalha. Esperam acima do composer e entram no Registro juntas e na ordem, num Turno só, assim que o Bot termina o passo atual. Interromper o Turno descarta a Fila.
_Evitar_: Buffer, rascunho
_Dono_: `apps/agent/src/bot/queue.ts` (as entradas e a promessa de cada uma); quando ela entra, `apps/agent/src/bot/chat.ts` (`push`, `drain`, `steerQueue`); na tela, `apps/desktop/src/renderer/transcript.tsx`

**Rotina**:
Um trabalho de um Bot, executado numa frequência escolhida enquanto o app está aberto e entregue em seu Registro. Tem um nome curto e único dentro do Bot, que as tools usam para tratá-la. Aparece na conversa como "Rotina <nome> começou", nunca como entrega da pessoa. Continua pertencendo ao mesmo Bot depois de uma Compactação.
_Evitar_: Agendamento, cron job, automação
_Dono_: `apps/agent/src/routines/routines.ts`; o disparo, `apps/agent/src/routines/dispatcher.ts`; a marca `[rotina: <nome>]`, `apps/agent/src/bot/events.ts`

**Detalhe**:
Tudo que aparece na conversa e não é a entrega da pessoa nem a resposta do Bot: a tool e o disparo de uma Rotina. A pessoa escolhe quanto ver em Configurações: Breve mostra uma linha por item e Completo acrescenta a chamada da tool e o conteúdo. O card do Gmail e o card do Navegador aparecem nos dois níveis, porque pedem uma resposta dela.
_Evitar_: Tool view, log, verbosidade
_Dono_: `apps/desktop/src/renderer/transcript.tsx` (`DETAIL_LEVELS`, `verbose`)

**Barra de bots**:
A coluna da esquerda, sempre visível, com todos os Bots e a marca do estado de cada um: trabalhando, esperando Aprovação, falhou, parado. Também é por onde se troca de Bot. Cada Bot mostra um rosto e a última mensagem, e o mais recente fica no topo.
_Evitar_: sidebar, lista de bots, rail
_Dono_: `apps/desktop/src/renderer/bar.tsx`, a lista e a ordem em `apps/desktop/src/renderer/bots.ts` e o rosto em `apps/desktop/src/renderer/avatar.tsx`; o estado de cada Bot, `apps/agent/src/bot/registry.ts` (`activity`); a última mensagem, `apps/agent/src/bot/events.ts` (`lastMessage`)

**Regras**:
O `~/.agents/AGENTS.md`, que entra no prompt de todo Turno de um Bot. É o único arquivo tratado como instrução da pessoa, e não como dado. Lido a cada Turno, então editar vale no Turno seguinte, sem reiniciar.
_Evitar_: Configuração, perfil, memória
_Dono_: `apps/agent/src/rules/rules.ts` (`botRules`); no prompt, `apps/agent/src/bot/chat.ts` (`systemPrompt`)

**Memória**:
Fatos, preferências e decisões duráveis que um Bot guarda para os próximos turnos, inclusive depois de uma compactação. Pertence ao Bot e não é compartilhada automaticamente com outros Bots.
_Evitar_: Contexto, histórico
_Dono_: `apps/agent/src/memory/memory.ts`

**Aprovação**:
A confirmação da pessoa antes de enviar um e-mail. É o único freio do app: o resto das ações acontece direto e fica no registro de ações. O Turno para até a pessoa responder; ela não perde o pedido ao trocar de Bot, porque ele volta à tela quando o Bot reabre.
_Evitar_: Permissão, consentimento, modo
_Dono_: quais tools pedem, `apps/agent/src/gmail/tools.ts` (`approvalInput`); a fila de pendentes, `apps/agent/src/bot/approvals.ts`; quem pergunta, `apps/agent/src/bot/chat.ts` (`approve`); na tela, `apps/desktop/src/renderer/transcript.tsx`

**Rascunho**:
Um e-mail escrito pelo Bot que fica no Gmail para a pessoa revisar e enviar por lá. O Bot não envia um Rascunho.
_Evitar_: Minuta
_Dono_: `apps/agent/src/gmail/tools.ts`

**Navegador**:
A página que um Bot abre e usa pela tool `browse`. Ele lê a página em texto, com um `ref` por elemento que aceita clique, e nunca vê uma foto. A pessoa acompanha pela prévia em Sobre o bot e, quando o Bot chama `handoff`, assume o Navegador em tela cheia pelo card da conversa.
_Evitar_: Browser, aba, webview
_Dono_: `apps/agent/src/browser/browser.ts` (`BrowserSession`); quem abre de verdade, `apps/desktop/src/main/browser/view.ts`; na tela, `apps/desktop/src/renderer/preview.tsx` e `apps/desktop/src/renderer/browsing.tsx`

**Sobre o bot**:
O painel da direita, com a Instrução, o Modelo do Bot, o esforço, a data de criação e, enquanto ele navega, a prévia do Navegador. Abre e fecha pelo ⓘ e lembra se ficou aberto.
_Evitar_: Sidebar, drawer, detalhes
_Dono_: `apps/desktop/src/renderer/info.tsx` (abrir e fechar); o conteúdo, `apps/desktop/src/renderer/about.tsx`

**Configurações**:
A janela da engrenagem, com Aplicativo (tema e Detalhe) e Contas (entrar num provedor, ver e desconectar as contas de Gmail). É administração: o que vale para o app todo, não para um Bot.
_Evitar_: Preferências, opções, painel
_Dono_: `apps/desktop/src/renderer/settings.tsx`; as contas, `apps/desktop/src/renderer/accounts.tsx`

**Casa**:
Onde o mimo guarda tudo: `~/.mimo`, com os bots, as rotinas, o registro de ações, e as chaves em `.env`. Não depende da pasta de onde o mimo foi chamado. `MIMO_DATA_DIR` troca o lugar dos dados; as chaves e as credenciais seguem o `$HOME`, porque pertencem à pessoa e não ao Sandbox.
_Evitar_: Diretório de dados, data dir, raiz
_Dono_: `apps/agent/src/storage/home.ts` (`dataPath`, `homePath`, `loadEnv`)

**Sandbox**:
Uma Casa separada (`MIMO_DATA_DIR`) usada para experimentar sem tocar nos dados reais.
_Evitar_: Máquina, VM, computador
_Dono_: `apps/agent/src/storage/home.ts` (`dataPath`); a receita, `.agents/skills/verify-mimo`

## Onde as coisas rodam

O mimo é um app Electron. A tela e o agente moram no mesmo processo: a entrada é `apps/desktop/src/main/index.ts`, que lê as chaves, chama `startRoutines()` e abre a janela. `apps/desktop` é a tela e `apps/agent` é o agente; o alias `@agent/*` aponta para `apps/agent/src`. A seta vai só num sentido: a tela importa do agente, nunca o contrário.

O agente roda no processo principal do Electron. A tela fala com ele por oRPC sobre `MessagePort`, e o router em `apps/desktop/src/main/router.ts` é a única porta. `bun run dev` abre o app em desenvolvimento, sempre na Casa `.data-desktop`; `bun run build` compila e o comando `mimo` abre o app compilado, na Casa real.

O dispatcher de Rotinas vive dentro do processo principal e faz um tick por minuto. Com o app fechado, nenhuma Rotina dispara.

Os blocos de instruções ficam em `apps/agent/src/<área>/instructions.md`, e `botInstructions` em `apps/agent/src/tools/index.ts` junta todos, sempre os mesmos: todo Bot recebe o prompt inteiro e todas as tools.

Tudo o que dura fica na Casa (`MIMO_DATA_DIR`, padrão `~/.mimo`): `bots/<id>.json`, `bots/<id>/messages.json`, `routines.json` e `actions.jsonl`. As chaves entram por `loadEnv()`, chamado no começo de `main()`: ele lê `~/.mimo/.env` e não sobrescreve variável já definida no ambiente.

Quem está aberto agora mora em `apps/agent/src/bot/registry.ts`: ele guarda o mapa das conversas vivas por `chatId`, garante que dois pedidos para abrir a mesma conversa recebem a mesma instância (`openOnce`), responde o que a Barra de bots mostra (`activity`) e apaga um Bot com as rotinas e as Conversas entre bots dele (`deleteBot`).

Algumas armadilhas do app. O build é electron-vite 5 com Vite 7: o electron-vite 5 não suporta o Vite 8 e, com ele, embute o próprio `electron` no bundle. A janela não tem moldura e, no Wayland, o app desliga a composição pela GPU, porque com NVIDIA a janela sem moldura para de desenhar depois de maximizar. O app nunca abre `--remote-debugging-port`: com essa porta, qualquer processo local lê a janela do mimo, e o CDP do Navegador já é interno ao processo. A tela roda com uma política de segurança declarada em `apps/desktop/src/renderer/index.html`: um esquema novo, como o `mimo-image://` das imagens coladas, só carrega depois de entrar nela. `apps/desktop/src/renderer/components/ui` é do shadcn e entra pela CLI (`bunx shadcn add`), por isso fica fora do lint e do knip.

A verificação não tem suíte: ela é dirigir o app de verdade. A receita por feature está em `.agents/skills/verify-mimo/features/`.
