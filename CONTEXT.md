# Mimo no terminal

Este contexto define como uma pessoa cria e usa Bots pessoais pelo terminal.

## Linguagem

**Bot**:
Um agente pessoal criado e nomeado pela pessoa, com Memória e Registro próprios. Seu propósito se desenvolve pelo uso, sem especialidade predeterminada, e a pessoa pode criar quantos Bots quiser.
_Evitar_: Assistente, agente
_Dono_: `apps/agent/src/bot/bot.ts` (classe `Bot`); em disco, `apps/agent/src/bot/store.ts`; quem está aberto, `apps/agent/src/bot/registry.ts`

**Registro**:
A conversa inteira de um Bot, que só cresce e nunca perde nada. Sobrevive a reinícios e à troca de Bot, e é o que a pessoa rola na tela. A pessoa nunca começa outro Registro nem o compacta à mão.
_Evitar_: Sessão, chat, conversa nova, histórico arquivado
_Dono_: `apps/agent/src/bot/bot.ts` (`log`, `writeLog`); em disco, `apps/agent/src/bot/store.ts` (`messages.json`); o trecho fora da Janela, `apps/agent/src/history/history.ts`

**Janela**:
O trecho do Registro que vai para o modelo. Começa no Resumo mais novo. Quando o Registro passa do teto do modelo, a Compactação anexa outro Resumo e a Janela encolhe; o resto do Registro continua no lugar, e o Bot alcança ele por `search_history`.
_Evitar_: Contexto, sessão
_Dono_: `apps/agent/src/bot/events.ts` (`summaryStart`); o corte e o Resumo, `apps/agent/src/bot/compaction.ts`; quando roda, `apps/agent/src/bot/bot.ts` (`compact`)

**Resumo**:
O que a Compactação escreve no Registro quando a Janela chega a 80% do modelo: um texto que substitui o trecho antigo na Janela. Entra marcado com `[resumo]`, aparece na conversa como `─ resumo do que veio antes ─` e nunca como fala da pessoa. Uma Compactação que falha avisa e o Turno segue.
_Evitar_: Sumário, compactação manual
_Dono_: `apps/agent/src/bot/compaction.ts`; a marca, `apps/agent/src/bot/events.ts`; na tela, `apps/mimo/src/view.ts`

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
Os Bots filhos de um Bot. O pai cria, ajusta e apaga os membros, e escolhe a instrução permanente, os grupos de tools e o modelo de cada um.
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
Um trabalho de um Bot, executado numa frequência escolhida enquanto a TUI está aberta e entregue em seu Registro. Tem um nome curto e único dentro do Bot, que as tools usam para tratá-la. Aparece na conversa como `routine: <nome> started`, nunca como entrega da pessoa. Continua pertencendo ao mesmo Bot depois de uma Compactação.
_Evitar_: Agendamento, cron job, automação
_Dono_: `apps/agent/src/routines/routines.ts`; o disparo, `apps/agent/src/routines/dispatcher.ts`; a marca `[rotina: <nome>]`, `apps/agent/src/bot/events.ts`

**Detalhe**:
Tudo que aparece na conversa e não é a entrega da pessoa nem a resposta do Bot: a tool, o disparo de uma Rotina, a ação de equipe e a troca de Grupo de tools. A pessoa escolhe quanto ver com `Ctrl+O`: `off` esconde, `brief` mostra uma linha por item e `full` acrescenta o conteúdo.
_Evitar_: Tool view, log, verbosidade
_Dono_: `apps/mimo/src/transcript.ts` (`DETAIL_LEVELS`, `cycle`)

**Grupo de tools**:
Um conjunto de tools que um Bot tem ou não tem: `computer`, `web`, `gmail`, `routines` e `team`. O grupo pode carregar junto um bloco de instruções, e aí desligá-lo também tira esse bloco do contexto do Bot. A pessoa escolhe pelo Painel de tools ou pedindo ao Bot. Um Bot filho nunca recebe `team`.
_Evitar_: Permissão, capacidade, plugin
_Dono_: `apps/agent/src/tools/index.ts` (`botTools`, `botInstructions`); o Painel, `apps/mimo/src/panels/tools.ts`

**Pasta**:
A pasta em que as tools do grupo `computer` de um Bot rodam — o projeto dele. É opcional: sem Pasta, elas rodam a partir de `$HOME`, como sempre. A pessoa escolhe por `/folder`, e o nome dela aparece no rodapé. Um Bot filho nasce com a Pasta do pai.
_Evitar_: Diretório de trabalho, projeto, cwd
_Dono_: a regra, `apps/agent/src/computer/folder.ts` (`resolveFolder`, `workDir`); o estado, `apps/agent/src/bot/bot.ts` (`setFolder`); o Painel, `apps/mimo/src/panels/folder.ts`

**Modo normal**:
O Bot executa o trabalho e pede Aprovação para as ações que a exigem, como enviar e-mails, apagar Rotinas e ativar o Modo autônomo.
_Evitar_: Padrão, cauteloso
_Dono_: quem decide, `apps/agent/src/tools/index.ts` (`needsApproval`); o estado, `apps/agent/src/bot/bot.ts` (`setMode`)

**Modo autônomo**:
Todas as ações acontecem sem aprovação e a pessoa revisa o registro depois.
_Evitar_: Automático, férias
_Dono_: a troca, `apps/agent/src/tools/index.ts` (`set_mode`); ela pede Aprovação em `needsApproval`

**Memória**:
Fatos, preferências e decisões duráveis que um Bot guarda para os próximos turnos, inclusive depois de uma compactação. Pertence ao Bot e não é compartilhada automaticamente com outros Bots.
_Evitar_: Contexto, histórico
_Dono_: `apps/agent/src/memory/memory.ts`

**Aprovação**:
A confirmação da pessoa no terminal antes de uma ação que a exige.
_Evitar_: Permissão, consentimento
_Dono_: `apps/agent/src/bot/approvals.ts` (a fila de pendentes); quem decide se pede, `apps/agent/src/bot/bot.ts` (`approve`); na tela, `apps/mimo/src/view.ts`

**Rascunho**:
Uma resposta escrita pelo Bot que só vira e-mail enviado por ação da pessoa ou no Modo autônomo.
_Evitar_: Minuta
_Dono_: `apps/agent/src/gmail/tools.ts`

**Painel**:
A tela que substitui a conversa para uma escolha ou uma conexão: modelo, esforço, tools, login e logout. Tem título, itens numerados e volta à conversa com `/cancel` ou `Esc`, preservando o rascunho.
_Evitar_: Seletor, modal, picker
_Dono_: `apps/mimo/src/panel.ts`; cada um, `apps/mimo/src/panels/`

**Sandbox**:
Um diretório de dados separado (`MIMO_DATA_DIR`) usado para experimentar sem tocar nos dados reais.
_Evitar_: Máquina, VM, computador
_Dono_: `apps/agent/src/storage/data.ts` (`dataPath`); a receita, `.agents/skills/verify-mimo`

## Onde as coisas rodam

A TUI e o agente moram no mesmo processo. A entrada é `apps/mimo/src/index.ts`: ele sobe o renderizador, chama `startRoutines()` e abre a `MimoApp`. `apps/mimo` é a tela e `apps/agent` é o agente; o alias `@agent/*` aponta para `apps/agent/src`. A seta vai só num sentido: a tela importa do agente, nunca o contrário.

O dispatcher de Rotinas vive **dentro do processo da TUI** e faz um tick por minuto. Com a TUI fechada, nenhuma Rotina dispara.

Um Grupo de tools pode carregar um bloco de instruções, em `apps/agent/src/<grupo>/instructions.md`. Hoje `gmail`, `routines`, `computer` e `team` têm um; `web` não tem. `botInstructions` em `apps/agent/src/tools/index.ts` monta o texto, então desligar o grupo tira as tools e também o bloco.

Tudo o que dura fica no diretório de dados (`MIMO_DATA_DIR`, padrão `.data`): `bots/<id>.json`, `bots/<id>/messages.json`, `routines.json` e `actions.jsonl`.

Quem está aberto agora mora em `apps/agent/src/bot/registry.ts`: ele guarda o mapa dos Bots vivos, responde o que a barra e o trilho mostram (`activity`) e apaga um Bot com os filhos (`deleteBot`).

A verificação não tem suíte: ela é dirigir a TUI de verdade. A receita por feature está em `.agents/skills/verify-mimo/features/`.
