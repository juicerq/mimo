# Mimo no terminal

Este contexto define como uma pessoa cria e usa Bots pessoais pelo terminal.

## Linguagem

**Bot**:
Um agente pessoal criado e nomeado pela pessoa, com Memória e Registro próprios. Seu propósito se desenvolve pelo uso, sem especialidade predeterminada, e a pessoa pode criar quantos Bots quiser.
_Evitar_: Assistente, agente
_Dono_: `apps/agent/src/bot/bot.ts` (classe `Bot`); em disco, `apps/agent/src/bot/store.ts`; quem está aberto, `apps/agent/src/bot/registry.ts`

**Registro**:
A conversa inteira de um Bot, que só cresce e nunca perde nada. Sobrevive a reinícios e à troca de Bot, e é o que a pessoa rola na tela. A pessoa nunca começa outro Registro nem o compacta à mão. Ele é gravado enquanto o Turno acontece, a cada mensagem e a cada resultado de tool, e não só no fim: uma queda no meio do Turno não apaga o que já foi feito.
_Evitar_: Sessão, chat, conversa nova, histórico arquivado
_Dono_: `apps/agent/src/bot/bot.ts` (`log`, `writeLog`, `keepLog`); em disco, `apps/agent/src/bot/store.ts` (`messages.json`); o trecho fora da Janela, `apps/agent/src/history/history.ts`

**Selo**:
O que fecha uma ação que ficou sem resposta no Registro. Ao abrir o Bot, toda chamada de tool sem resultado ganha um resultado com o aviso de que o mimo fechou antes dela terminar e que ela pode ou não ter acontecido. O Bot lê esse aviso como qualquer outro resultado, a pessoa vê a linha `⚠` na tela, e a Janela volta válida para o modelo. O Selo não refaz a ação nem promete que ela falhou.
_Evitar_: Recuperar, retomar, replay
_Dono_: `apps/agent/src/bot/seal.ts` (`sealTranscript`); quando roda, `apps/agent/src/bot/bot.ts` (`open`)

**Janela**:
O trecho do Registro que vai para o modelo. Começa no Resumo mais novo. O prompt de sistema ocupa um piso dentro da janela que a Compactação não corta, então ela mede o que guardar pelo espaço que sobra e avisa quando esse piso passa da metade. Quando o Registro passa do teto do modelo, a Compactação anexa outro Resumo e a Janela encolhe; o resto do Registro continua no lugar, e o Bot alcança ele por `search_history`.
_Evitar_: Contexto, sessão
_Dono_: `apps/agent/src/bot/events.ts` (`summaryStart`); o corte e o Resumo, `apps/agent/src/bot/compaction.ts`; quando roda, `apps/agent/src/bot/bot.ts` (`compact`)

**Resumo**:
O que a Compactação escreve no Registro quando a Janela chega a 80% do modelo: um texto que substitui o trecho antigo na Janela. Entra marcado com `[resumo]`, aparece na conversa como `─ resumo do que veio antes ─` (no desktop, um bloco fechado "Resumo do que veio antes") e nunca como fala da pessoa. Uma Compactação que falha avisa e o Turno segue.
_Evitar_: Sumário, compactação manual
_Dono_: `apps/agent/src/bot/compaction.ts`; a marca, `apps/agent/src/bot/events.ts`; na tela, `apps/mimo/src/view.ts`; no desktop, `apps/desktop/src/renderer/transcript.tsx`

**Turno**:
Uma entrega da pessoa ou um disparo de Rotina e todo o trabalho que ela provoca até a resposta.
_Evitar_: Ciclo, execução
_Dono_: `apps/agent/src/bot/bot.ts` (`drain`, `translate`); na tela, `apps/mimo/src/turn.ts`

**Modelo do Bot**:
A escolha de provedor, modelo e esforço para as próximas respostas de um Bot. Permanece salva e pode mudar a qualquer momento. Uma resposta em andamento mantém a escolha com que começou, inclusive enquanto espera Aprovação.
_Evitar_: Modelo global, modelo da sessão
_Dono_: `apps/agent/src/model/catalog.ts`; o Painel, `apps/mimo/src/panels/model.ts`

**Bot filho**:
Um Bot criado por outro Bot, com Memória e Registro próprios. Pertence a quem o criou, não aparece na lista de Bots da pessoa e é apagado junto com o pai.
_Evitar_: Subagente, worker
_Dono_: `apps/agent/src/team/tools.ts`; o registro, `apps/agent/src/bot/store.ts` (`parentId`)

**Equipe**:
Os Bots filhos de um Bot. O pai cria, ajusta e apaga os membros, e escolhe a instrução permanente e o modelo de cada um.
_Evitar_: Time, squad, pool
_Dono_: `apps/agent/src/bot/bot.ts` (`crew`, `team`); as tools, `apps/agent/src/team/tools.ts`

**Delegação**:
Um trabalho que um Bot entrega a um Bot filho e que segue sozinho. O Turno de quem delega fecha na hora, então a pessoa continua conversando enquanto a Equipe trabalha. Começar, parar, criar e apagar um filho aparecem na conversa como uma linha com o nome dele, não como tool. Só um Bot sem pai delega, então a equipe não tem laços nem netos. As Aprovações do filho aparecem na tela de quem o comanda.
_Evitar_: Chamada, mensagem entre bots
_Dono_: `apps/agent/src/bot/bot.ts` (`delegate`, `work`)

**Aviso**:
A resposta de um Bot filho, entregue sozinha no Registro de quem delegou quando o trabalho termina ou falha. Espera o fim do Turno em andamento e entra junto com a Fila.
_Evitar_: Callback, notificação
_Dono_: `apps/agent/src/bot/bot.ts` (`work`); a marca `[equipe]`, `apps/agent/src/bot/events.ts`

**Fila**:
As entregas que a pessoa escreve enquanto o Bot trabalha. Esperam acima do composer e entram no Registro juntas e na ordem, num Turno só, assim que o Bot termina o passo atual. Interromper o Turno descarta a Fila.
_Evitar_: Buffer, rascunho
_Dono_: `apps/agent/src/bot/queue.ts` (as entradas e a promessa de cada uma); quando ela entra, `apps/agent/src/bot/bot.ts` (`push`, `drain`, `steerQueue`); na tela, `apps/mimo/src/bar.ts`

**Rotina**:
Um trabalho de um Bot, executado numa frequência escolhida enquanto a TUI está aberta e entregue em seu Registro. Tem um nome curto e único dentro do Bot, que as tools usam para tratá-la. Aparece na conversa como `routine: <nome> started` (no desktop, "Rotina <nome> começou"), nunca como entrega da pessoa. Continua pertencendo ao mesmo Bot depois de uma Compactação.
_Evitar_: Agendamento, cron job, automação
_Dono_: `apps/agent/src/routines/routines.ts`; o disparo, `apps/agent/src/routines/dispatcher.ts`; a marca `[rotina: <nome>]`, `apps/agent/src/bot/events.ts`

**Detalhe**:
Tudo que aparece na conversa e não é a entrega da pessoa nem a resposta do Bot: a tool, o disparo de uma Rotina e a ação de equipe. A pessoa escolhe quanto ver com `Ctrl+O`: `off` esconde, `brief` mostra uma linha por item e `full` acrescenta o conteúdo. No desktop os níveis são Breve e Completo, e a chamada de tool só aparece no Completo.
_Evitar_: Tool view, log, verbosidade
_Dono_: `apps/mimo/src/transcript.ts` (`DETAIL_LEVELS`, `cycle`); no desktop, `apps/desktop/src/renderer/transcript.tsx`

**Barra de bots**:
A coluna da esquerda, sempre visível, com todos os Bots sem pai e a marca do estado de cada um: trabalhando, esperando Aprovação, falhou, parado. Também é por onde se troca de Bot, com `Ctrl+E`. Responde "o que está acontecendo"; a Sidebar da equipe (`Ctrl+T`) responde "o que os filhos deste Bot fazem". No desktop cada Bot mostra também um rosto e a última mensagem, e o mais recente fica no topo.
_Evitar_: sidebar, lista de bots, rail
_Dono_: `apps/mimo/src/sidebar.ts`; no desktop, `apps/desktop/src/renderer/bar.tsx`, a lista e a ordem em `apps/desktop/src/renderer/bots.ts` e o rosto em `apps/desktop/src/renderer/avatar.tsx`; o estado de cada Bot, `apps/agent/src/bot/registry.ts` (`activity`); a última mensagem, `apps/agent/src/bot/events.ts` (`lastMessage`)

**Regras**:
O `~/.agents/AGENTS.md`, que entra no prompt de todo Turno de um Bot. É o único arquivo tratado como instrução da pessoa, e não como dado. Lido a cada Turno, então editar vale no Turno seguinte, sem reiniciar.
_Evitar_: Configuração, perfil, memória
_Dono_: `apps/agent/src/rules/rules.ts` (`botRules`); no prompt, `apps/agent/src/bot/bot.ts` (`systemPrompt`)

**Memória**:
Fatos, preferências e decisões duráveis que um Bot guarda para os próximos turnos, inclusive depois de uma compactação. Pertence ao Bot e não é compartilhada automaticamente com outros Bots.
_Evitar_: Contexto, histórico
_Dono_: `apps/agent/src/memory/memory.ts`

**Aprovação**:
A confirmação da pessoa antes de enviar um e-mail. É o único freio do app: o resto das ações acontece direto e fica no registro de ações. O Turno para até a pessoa responder; ela não perde o pedido ao trocar de Bot, porque ele volta à tela quando o Bot reabre.
_Evitar_: Permissão, consentimento, modo
_Dono_: quais tools pedem, `apps/agent/src/gmail/tools.ts` (`approvalInput`); a fila de pendentes, `apps/agent/src/bot/approvals.ts`; quem pergunta, `apps/agent/src/bot/bot.ts` (`approve`); na tela, `apps/mimo/src/view.ts`; no desktop, `apps/desktop/src/renderer/transcript.tsx`

**Rascunho**:
Um e-mail escrito pelo Bot que fica no Gmail para a pessoa revisar e enviar por lá. O Bot não envia um Rascunho.
_Evitar_: Minuta
_Dono_: `apps/agent/src/gmail/tools.ts`

**Painel**:
A tela que substitui a conversa para uma escolha ou uma conexão: modelo, esforço, login e logout. Tem título, itens numerados e volta à conversa com `/cancel` ou `Esc`, preservando o rascunho.
_Evitar_: Seletor, modal, picker
_Dono_: `apps/mimo/src/panel.ts`; cada um, `apps/mimo/src/panels/`

**Casa**:
Onde o mimo guarda tudo: `~/.mimo`, com os bots, as rotinas, o registro de ações, e as chaves em `.env`. Não depende da pasta de onde o mimo foi chamado. `MIMO_DATA_DIR` troca o lugar dos dados; as chaves e as credenciais seguem o `$HOME`, porque pertencem à pessoa e não ao Sandbox.
_Evitar_: Diretório de dados, data dir, raiz
_Dono_: `apps/agent/src/storage/home.ts` (`dataPath`, `homePath`, `loadEnv`)

**Sandbox**:
Uma Casa separada (`MIMO_DATA_DIR`) usada para experimentar sem tocar nos dados reais.
_Evitar_: Máquina, VM, computador
_Dono_: `apps/agent/src/storage/home.ts` (`dataPath`); a receita, `.agents/skills/verify-mimo`

## Onde as coisas rodam

A TUI e o agente moram no mesmo processo. A entrada é `apps/mimo/src/index.ts`: ele sobe o renderizador, chama `startRoutines()` e abre a `MimoApp`. `apps/mimo` é a tela e `apps/agent` é o agente; o alias `@agent/*` aponta para `apps/agent/src`. A seta vai só num sentido: a tela importa do agente, nunca o contrário.

O app desktop (`apps/desktop`, Electron) está nascendo e vai substituir a TUI; a ordem está em `DESKTOP.md`. Ele roda o mesmo agente no processo principal do Electron, entrada em `apps/desktop/src/main/index.ts`. A tela fala com o agente por oRPC sobre `MessagePort`, e o router em `apps/desktop/src/main/router.ts` é a única porta. `bun run dev:desktop` abre o app com a Casa `.data-desktop`.

O dispatcher de Rotinas vive **dentro do processo da TUI** (ou do processo principal do desktop) e faz um tick por minuto. Com o app fechado, nenhuma Rotina dispara.

Os blocos de instruções ficam em `apps/agent/src/<área>/instructions.md`, e `botInstructions` em `apps/agent/src/tools/index.ts` junta todos. Só o bloco da equipe depende de o Bot não ter pai.

Tudo o que dura fica na Casa (`MIMO_DATA_DIR`, padrão `~/.mimo`): `bots/<id>.json`, `bots/<id>/messages.json`, `routines.json` e `actions.jsonl`. As chaves entram por `loadEnv()`, chamado no começo de `main()`: ele lê `~/.mimo/.env` e não sobrescreve variável já definida no ambiente.

Quem está aberto agora mora em `apps/agent/src/bot/registry.ts`: ele guarda o mapa dos Bots vivos, garante que dois pedidos para abrir o mesmo Bot recebem a mesma instância (`openOnce`), responde o que a barra e o trilho mostram (`activity`) e apaga um Bot com os filhos (`deleteBot`).

A verificação não tem suíte: ela é dirigir a TUI de verdade. A receita por feature está em `.agents/skills/verify-mimo/features/`.
