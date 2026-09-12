# Mimo no terminal

Este contexto define como uma pessoa cria e usa Bots pessoais pelo terminal.

## Linguagem

**Bot**:
Um agente pessoal criado e nomeado pela pessoa, com Memória própria e uma Sessão atual. Seu propósito se desenvolve pelo uso, sem especialidade predeterminada, e a pessoa pode criar quantos Bots quiser.
_Evitar_: Assistente, agente

**Sessão**:
A conversa durável atual de um Bot, que sobrevive a reinícios e à troca de Bot. Quando o contexto é compactado, a Sessão atual é arquivada e outra começa com um resumo, preservando a Memória e o acesso às Sessões anteriores.
_Evitar_: Chat, conversa nova

**Turno**:
Uma entrega da pessoa ou um disparo de Rotina e todo o trabalho que ela provoca até a resposta.
_Evitar_: Ciclo, execução

**Modelo do Bot**:
A escolha de provedor, modelo e esforço para as próximas respostas de um Bot. Permanece salva e pode mudar sem abrir outra Sessão. Uma resposta em andamento mantém a escolha com que começou, inclusive enquanto espera Aprovação.
_Evitar_: Modelo global, modelo da sessão

**Bot filho**:
Um Bot criado por outro Bot, com Memória e Sessão próprias. Pertence a quem o criou, não aparece na lista de Bots da pessoa e é apagado junto com o pai.
_Evitar_: Subagente, worker

**Equipe**:
Os Bots filhos de um Bot. O pai cria, ajusta e apaga os membros, e escolhe a instrução permanente, os grupos de tools e o modelo de cada um.
_Evitar_: Time, squad, pool

**Delegação**:
Um trabalho que um Bot entrega a um Bot filho e que segue sozinho. O Turno de quem delega fecha na hora, então a pessoa continua conversando enquanto a Equipe trabalha. Começar, parar, criar e apagar um filho aparecem na conversa como uma linha com o nome dele, não como tool. Só um Bot sem pai delega, então a equipe não tem laços nem netos. As Aprovações do filho aparecem na tela de quem o comanda.
_Evitar_: Chamada, mensagem entre bots

**Aviso**:
A resposta de um Bot filho, entregue sozinha na Sessão de quem delegou quando o trabalho termina ou falha. Espera o fim do Turno em andamento e entra junto com a Fila.
_Evitar_: Callback, notificação

**Fila**:
As entregas que a pessoa escreve enquanto o Bot trabalha. Esperam acima do composer e entram na Sessão juntas e na ordem, num Turno só, assim que o Bot termina o passo atual. Interromper o Turno descarta a Fila.
_Evitar_: Buffer, rascunho

**Rotina**:
Um trabalho de um Bot, executado numa frequência escolhida enquanto a TUI está aberta e entregue em sua Sessão atual. Tem um nome curto e único dentro do Bot, que as tools usam para tratá-la. Aparece na conversa como `routine: <nome> started`, nunca como entrega da pessoa. Continua pertencendo ao mesmo Bot quando a Sessão muda.
_Evitar_: Agendamento, cron job, automação

**Detalhe**:
Tudo que aparece na conversa e não é a entrega da pessoa nem a resposta do Bot: a tool, o disparo de uma Rotina, a ação de equipe e a troca de Grupo de tools. A pessoa escolhe quanto ver com `Ctrl+O`: `off` esconde, `brief` mostra uma linha por item e `full` acrescenta o conteúdo.
_Evitar_: Tool view, log, verbosidade

**Grupo de tools**:
Um conjunto de tools que um Bot tem ou não tem: `computer`, `web`, `gmail`, `routines` e `team`. O grupo carrega junto o seu bloco de instruções, então desligá-lo também o tira do contexto do Bot. A pessoa escolhe pelo Painel de tools ou pedindo ao Bot. Um Bot filho nunca recebe `team`.
_Evitar_: Permissão, capacidade, plugin

**Modo normal**:
O Bot executa o trabalho e pede Aprovação para as ações que a exigem, como enviar e-mails, apagar Rotinas e ativar o Modo autônomo.
_Evitar_: Padrão, cauteloso

**Modo autônomo**:
Todas as ações acontecem sem aprovação e a pessoa revisa o registro depois.
_Evitar_: Automático, férias

**Memória**:
Fatos, preferências e decisões duráveis que um Bot guarda para os próximos turnos, inclusive depois de uma compactação. Pertence ao Bot e não é compartilhada automaticamente com outros Bots.
_Evitar_: Contexto, histórico

**Aprovação**:
A confirmação da pessoa no terminal antes de uma ação que a exige.
_Evitar_: Permissão, consentimento

**Rascunho**:
Uma resposta escrita pelo Bot que só vira e-mail enviado por ação da pessoa ou no Modo autônomo.
_Evitar_: Minuta

**Painel**:
A tela que substitui a conversa para uma escolha ou uma conexão: modelo, esforço, tools, login e logout. Tem título, itens numerados e volta à conversa com `/cancel` ou `Esc`, preservando o rascunho.
_Evitar_: Seletor, modal, picker

**Sandbox**:
Um diretório de dados separado (`MIMO_DATA_DIR`) usado para experimentar sem tocar nos dados reais.
_Evitar_: Máquina, VM, computador
