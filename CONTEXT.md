# Mimo

Este contexto define como uma pessoa cria e usa Bots pessoais num app de desktop.

## Linguagem

**Bot**:
Um agente pessoal criado e nomeado pela pessoa, com Memória e Registro próprios. Seu Propósito se desenvolve pelo uso, sem especialidade predeterminada, e a pessoa pode criar quantos Bots quiser.
_Evitar_: Assistente, agente
_Dono_: `apps/agent/src/conversation/conversation.ts` (classe `Conversation`); em disco, `apps/agent/src/bot/store.ts`; quem está aberto, `apps/agent/src/bot/registry.ts`

**Registro**:
A conversa inteira de um Bot, que só cresce e nunca perde nada. Sobrevive a reinícios e à troca de Bot, e é o que a pessoa rola na tela. A pessoa nunca começa outro Registro nem o compacta à mão. Ele guarda os fatos aceitos pela aplicação, separados da transcrição técnica do modelo. A tela recebe uma fotografia inicial e depois os fatos seguintes, numerados; reabrir e acompanhar ao vivo mostram o mesmo Registro. Ele é gravado enquanto o Turno acontece, e não só no fim: uma queda no meio do Turno não apaga o que já foi feito. Um Bot tem o Registro da conversa com a pessoa e mais um por Conversa entre bots.
_Evitar_: Sessão, chat, conversa nova, histórico arquivado
_Dono_: `apps/agent/src/conversation/record.ts` (`ConversationRecord`); tabelas em `apps/agent/src/storage/schema.ts`;  o trecho fora da Janela, `apps/agent/src/history/history.ts`

**Selo**:
O que fecha uma ação que ficou sem resposta no Registro. Ao abrir o Bot, toda chamada de tool sem resultado ganha um resultado com o aviso de que o mimo fechou antes dela terminar e que ela pode ou não ter acontecido. O Bot lê esse aviso como qualquer outro resultado, a pessoa vê a linha `⚠` na tela, e a Janela volta válida para o modelo. O Selo não refaz a ação nem promete que ela falhou.
_Evitar_: Recuperar, retomar, replay
_Dono_: `apps/agent/src/bot/seal.ts` (`unansweredCalls`); gravação, `apps/agent/src/conversation/record.ts` (`seal`)

**Janela**:
O trecho do Registro que vai para o modelo. Começa no Resumo mais novo. O prompt de sistema ocupa um piso dentro da janela que a Compactação não corta, então ela mede o que guardar pelo espaço que sobra e avisa quando esse piso passa da metade. Quando o Registro passa do teto do modelo, a Compactação anexa outro Resumo e a Janela encolhe; o resto do Registro continua no lugar, e o Bot alcança ele por `search_history`.
_Evitar_: Contexto, sessão
_Dono_: `apps/agent/src/conversation/record.ts` (`window`, `archive`, `compact`); o Resumo, `apps/agent/src/bot/compaction.ts`; quando roda, `apps/agent/src/bot/execution.ts` (`compact`)

**Resumo**:
O que a Compactação escreve no Registro quando a Janela chega a 80% do modelo: um texto que substitui o trecho antigo na Janela. Entra marcado com `[resumo]`, aparece na conversa como um bloco fechado "Resumo do que veio antes" e nunca como fala da pessoa. Uma Compactação que falha avisa e o Turno segue.
_Evitar_: Sumário, compactação manual
_Dono_: `apps/agent/src/bot/compaction.ts`; a marca, `apps/agent/src/bot/events.ts`; na tela, `apps/desktop/src/renderer/transcript.tsx`

**Turno**:
O trabalho iniciado por uma mensagem da pessoa, uma pergunta de outro Bot, uma resposta que chega depois ou um disparo de Rotina. Uma nova mensagem da pessoa interrompe o Turno atual em silêncio e começa outro, sem fila; Falas e ações já concluídas permanecem no Registro. Confirmar de novo o mesmo envio não cria outro Turno nem interrompe o atual. “Você parou” aparece apenas ao usar o botão Parar. Uma Aprovação pendente é recusada ao interromper. Fechar o app encerra o trabalho em aberto, sem refazê-lo ao reabrir.
_Evitar_: Rodada, requisição, tarefa em fila
_Dono_: `apps/agent/src/conversation/conversation.ts` (`submit`, `cancel`); estado e entrega aceita, `apps/agent/src/conversation/record.ts` (`start`, `finish`, `recover`); execução, `apps/agent/src/bot/execution.ts`

**Modelo do Bot**:
A escolha de provedor, modelo e esforço para as próximas respostas de um Bot. Permanece salva e pode mudar a qualquer momento. Uma resposta em andamento mantém a escolha com que começou, inclusive enquanto espera Aprovação.
_Evitar_: Modelo global, modelo da sessão
_Dono_: `apps/agent/src/model/catalog.ts`; os modelos novos da OpenAI, `apps/agent/src/model/codex.ts`; na tela, `apps/desktop/src/renderer/about.tsx`

**Imagem colada**:
Uma imagem que a pessoa cola no campo de mensagem e manda junto com o texto. Os bytes ficam em arquivo (`bots/<id>/images/<hash>.png`) e o Registro guarda só a marca `[imagem: <hash>.png]` na frente do texto, do mesmo jeito que `[resumo]` e `[rotina:]`; a imagem de verdade entra só na Janela, montada a cada chamada do modelo, e não duplica seus bytes no Registro. Na conversa ela aparece acima do balão da pessoa, fora dele. Um Bot com Modelo que não lê imagem recusa antes de gravar qualquer coisa, e a pessoa recebe o texto e a imagem de volta no campo.
_Evitar_: Anexo, upload, arquivo
_Dono_: `apps/agent/src/images/images.ts`; a marca no Registro, `apps/agent/src/bot/events.ts`; na tela, `apps/desktop/src/renderer/composer.tsx` e `apps/desktop/src/renderer/transcript.tsx`; quem serve o arquivo, `apps/desktop/src/main/pictures.ts`

**Conversa entre bots**:
O Registro que dois Bots têm à parte, um por direção. Nasce quando um Bot chama `ask_bot`, e a pessoa abre pela linha no meio da conversa: ela lê e não escreve. Todo Bot é igual, então qualquer um pergunta a qualquer outro. Por padrão a pergunta não segura o Turno: quem perguntou continua com a pessoa e a resposta chega depois, num Turno novo. Quando a pessoa muda o pedido ou para, as perguntas pendentes são interrompidas e respostas atrasadas não retomam o pedido anterior. Um Bot que já está na corrente de perguntas não pode ser perguntado de volta, e a corrente para em três.
_Evitar_: Bot filho, equipe, delegação, subagente
_Dono_: `apps/agent/src/peers/tools.ts`; a conversa, `apps/agent/src/conversation/conversation.ts` (`ask`, `relay`); em disco, `apps/agent/src/conversation/record.ts`; na tela, `apps/desktop/src/renderer/conversation.ts` (`useConversation`)

**Rotina**:
Um trabalho de um Bot, executado numa frequência escolhida enquanto o app está aberto e entregue em seu Registro. Tem um nome curto e único dentro do Bot, que as tools usam para tratá-la. Aparece na conversa como "Rotina <nome> começou", nunca como entrega da pessoa. Continua pertencendo ao mesmo Bot depois de uma Compactação.
_Evitar_: Agendamento, cron job, automação
_Dono_: `apps/agent/src/routines/routines.ts`; o disparo, `apps/agent/src/routines/dispatcher.ts`; a marca `[rotina: <nome>]`, `apps/agent/src/bot/events.ts`

**Fala**:
O que o Bot manda para a pessoa com `send_message`, e o único jeito de ele falar com ela. Cada Fala vira um balão na conversa; o texto que o modelo escreve fora dessa tool é rascunho e não aparece em lugar nenhum, nem ao vivo, nem no Registro reaberto, nem na Barra de bots. O Bot fala durante o Turno para contar o que vai fazer e o que muda o trabalho, não cada passo, e a Fala aceita com `done: true` encerra o Turno depois do passo atual. A Fala e seu recibo são gravados juntos antes de aparecerem na tela. Uma tentativa recusada nunca vira Fala; repetir o mesmo identificador e conteúdo devolve o recibo já salvo, sem outro balão. Textos iguais enviados por chamadas diferentes continuam sendo Falas diferentes. A última Fala do Turno é o que outro Bot recebe de volta numa Conversa entre bots.
_Evitar_: Resposta livre, texto do modelo, streaming
_Dono_: `apps/agent/src/speech/tools.ts`; aceitação e Registro, `apps/agent/src/conversation/record.ts` (`speak`, `lastMessage`); como falar, `apps/agent/src/instructions.md`

**Detalhe**:
Tudo que aparece na conversa e não é a entrega da pessoa nem a Fala do Bot: a tool e o disparo de uma Rotina. A pessoa escolhe quanto ver em Configurações: Breve mostra uma linha por item e Completo acrescenta a chamada da tool e o conteúdo. O card do Gmail e o card do Navegador aparecem nos dois níveis, porque pedem uma resposta dela.
_Evitar_: Tool view, log, verbosidade
_Dono_: `apps/desktop/src/renderer/transcript.tsx` (`DETAIL_LEVELS`, `verbose`)

**Barra de bots**:
A coluna da esquerda, sempre visível, com todos os Bots e a marca do estado de cada um: trabalhando, esperando Aprovação, falhou, parado. Também é por onde se troca de Bot. Cada Bot mostra um rosto e a última mensagem, e o mais recente fica no topo.
_Evitar_: sidebar, lista de bots, rail
_Dono_: `apps/desktop/src/renderer/bar.tsx`, a lista e a ordem em `apps/desktop/src/renderer/bots.ts` e o rosto em `apps/desktop/src/renderer/avatar.tsx`; o estado de cada Bot, `apps/agent/src/bot/registry.ts` (`activity`); a última mensagem, `apps/agent/src/conversation/record.ts` (`lastMessage`)

**Regras**:
O `~/.mimo/MIMO.md`, que entra no prompt de todo Turno de um Bot. É só do mimo: as regras que a pessoa escreve para agentes de código não chegam aos Bots. É o único arquivo tratado como instrução da pessoa, e não como dado. Lido a cada Turno, então editar vale no Turno seguinte, sem reiniciar.
_Evitar_: Configuração, perfil, memória
_Dono_: `apps/agent/src/rules/rules.ts` (`botRules`); no prompt, `apps/agent/src/bot/execution.ts` (`run`)

**Memória**:
Fatos, preferências e decisões duráveis que um Bot guarda para os próximos turnos, inclusive depois de uma compactação. Pertence ao Bot e não é compartilhada automaticamente com outros Bots.
_Evitar_: Contexto, histórico
_Dono_: `apps/agent/src/memory/memory.ts`

**Propósito**:
Para que a pessoa usa um Bot, em uma ou duas frases. Ao fechar cada Turno, o próprio Bot procura um padrão nos pedidos da pessoa e escreve ou ajusta o Propósito quando acha um que o texto ainda não diz, ou quando a pessoa diz para que quer o Bot; um pedido só não forma padrão. O Propósito diz o uso, não o jeito de uma tarefa, e não se repete na Memória. A pessoa lê e edita em Sobre o bot, e o Bot reescreve partindo do texto atual. Só a conversa com a pessoa muda o Propósito, nunca uma Conversa entre bots. Entra no prompt de todo Turno do Bot, e os outros Bots leem o Propósito para saber a quem perguntar. Cada troca feita pelo Bot aparece na conversa como Detalhe.
_Evitar_: Instrução, papel, descrição, perfil
_Dono_: `apps/agent/src/peers/tools.ts` (`set_purpose`, `list_bots`); em disco, `apps/agent/src/bot/store.ts`; como o Bot escreve, `apps/agent/src/instructions.md`; na tela, `apps/desktop/src/renderer/about.tsx`

**Aprovação**:
A confirmação da pessoa antes de enviar um e-mail. É o único freio do app: o resto das ações acontece direto e fica no registro de ações. A resposta fica gravada antes de liberar a ação. Reiniciar encerra pedidos pendentes como recusados. O Turno para até a pessoa responder; ela não perde o pedido ao trocar de Bot, porque ele volta à tela quando o Bot reabre.
_Evitar_: Permissão, consentimento, modo
_Dono_: quais tools pedem, `apps/agent/src/gmail/tools.ts` (`approvalInput`); a fila de pendentes, `apps/agent/src/bot/approvals.ts`; quem pergunta, `apps/agent/src/conversation/conversation.ts`; na tela, `apps/desktop/src/renderer/transcript.tsx`

**Rascunho**:
Um e-mail escrito pelo Bot que fica no Gmail para a pessoa revisar e enviar por lá. O Bot não envia um Rascunho.
_Evitar_: Minuta
_Dono_: `apps/agent/src/gmail/tools.ts`

**Navegador**:
A página que um Bot abre e usa pela tool `browse`. Ele lê a página em texto, com um `ref` por elemento que aceita clique, e nunca vê uma foto. A pessoa acompanha pela prévia em Sobre o bot e, quando o Bot chama `handoff`, assume o Navegador em tela cheia pelo card da conversa.
_Evitar_: Browser, aba, webview
_Dono_: `apps/agent/src/browser/browser.ts` (`BrowserSession`); quem abre de verdade, `apps/desktop/src/main/browser/view.ts`; na tela, `apps/desktop/src/renderer/preview.tsx` e `apps/desktop/src/renderer/browsing.tsx`

**Sobre o bot**:
O painel da direita, com o Propósito, o Modelo do Bot, o esforço, a data de criação e, enquanto ele navega, a prévia do Navegador. Abre e fecha pelo ⓘ e lembra se ficou aberto.
_Evitar_: Sidebar, drawer, detalhes
_Dono_: `apps/desktop/src/renderer/info.tsx` (abrir e fechar); o conteúdo, `apps/desktop/src/renderer/about.tsx`

**Configurações**:
A janela da engrenagem, com Aplicativo (tema e Detalhe) e Contas (entrar num provedor, ver e desconectar as contas de Gmail). É administração: o que vale para o app todo, não para um Bot.
_Evitar_: Preferências, opções, painel
_Dono_: `apps/desktop/src/renderer/settings.tsx`; as contas, `apps/desktop/src/renderer/accounts.tsx`

**Casa**:
Onde o mimo guarda tudo: `~/.mimo`, com o banco `mimo.sqlite`, as imagens, as regras e as chaves em `.env`. Não depende da pasta de onde o mimo foi chamado. `MIMO_DATA_DIR` troca o lugar dos dados; as chaves e as credenciais seguem o `$HOME`, porque pertencem à pessoa e não ao Sandbox.
_Evitar_: Diretório de dados, data dir, raiz
_Dono_: `apps/agent/src/storage/home.ts` (`dataPath`, `homePath`, `loadEnv`)

**Sandbox**:
Uma Casa separada (`MIMO_DATA_DIR`) usada para experimentar sem tocar nos dados reais.
_Evitar_: Máquina, VM, computador
_Dono_: `apps/agent/src/storage/home.ts` (`dataPath`); a receita, `.agents/skills/verify-mimo`

## Onde as coisas rodam

O mimo é um app Electron. A janela e o agente pertencem ao mesmo app, sem servidor externo: a entrada é `apps/desktop/src/main/index.ts`, que lê as chaves, chama `startRoutines()` e abre a janela. `apps/desktop` é a tela e `apps/agent` é o agente; o alias `@agent/*` aponta para `apps/agent/src`. A seta vai só num sentido: a tela importa do agente, nunca o contrário. `apps/site` é a landing page, servida pelo Bun com `bun run --filter @mimo/site dev`; ela importa o rosto dos Bots de `apps/desktop/src/renderer/face.ts` e nada importa dela.

O agente roda no processo principal do Electron. A tela fala com ele por oRPC sobre `MessagePort`, e o router em `apps/desktop/src/main/router.ts` é a única porta. `bun run dev` abre o app em desenvolvimento, sempre na Casa `.data-desktop`; `bun run build` compila e o comando `mimo` abre o app compilado, na Casa real.

O dispatcher de Rotinas vive dentro do processo principal e faz um tick por minuto. Com o app fechado, nenhuma Rotina dispara.

Os blocos de instruções ficam em `apps/agent/src/<área>/instructions.md`, e `botInstructions` em `apps/agent/src/tools/index.ts` junta todos, sempre os mesmos: todo Bot recebe o prompt inteiro e todas as tools.

Tudo o que dura fica na Casa (`MIMO_DATA_DIR`, padrão `~/.mimo`): `mimo.sqlite`, acessado pelo Drizzle. O schema e as migrações versionadas ficam em `apps/agent/src/storage/`. O banco guarda Bots, Registros, transcrições técnicas, Turnos, entregas aceitas, Falas, Memória, Rotinas, ações, preferências da tela e os modelos do Codex que a integração não conhece. Imagens, `MIMO.md`, `.env` e credenciais continuam em arquivos. As chaves entram por `loadEnv()`, chamado no começo de `main()`: ele lê `~/.mimo/.env` e não sobrescreve variável já definida no ambiente.

Quem está aberto agora mora em `apps/agent/src/bot/registry.ts`: ele guarda o mapa das conversas vivas por identificador de conversa, garante que dois pedidos para abrir a mesma conversa recebem a mesma instância (`openOnce`), responde o que a Barra de bots mostra (`activity`) e apaga um Bot com as rotinas e as Conversas entre bots dele (`deleteBot`).

Algumas armadilhas do app. O build é electron-vite 5 com Vite 7: o electron-vite 5 não suporta o Vite 8 e, com ele, embute o próprio `electron` no bundle. A janela não tem moldura e, no Wayland, o app desliga a composição pela GPU, porque com NVIDIA a janela sem moldura para de desenhar depois de maximizar. O app nunca abre `--remote-debugging-port`: com essa porta, qualquer processo local lê a janela do mimo, e o CDP do Navegador já é interno ao processo. A tela roda com uma política de segurança declarada em `apps/desktop/src/renderer/index.html`: um esquema novo, como o `mimo-image://` das imagens coladas, só carrega depois de entrar nela. `apps/desktop/src/renderer/components/ui` é do shadcn e entra pela CLI (`bunx shadcn add`), por isso fica fora do lint e do knip.

A verificação não tem suíte: ela é dirigir o app de verdade. A receita por feature está em `.agents/skills/verify-mimo/features/`.
