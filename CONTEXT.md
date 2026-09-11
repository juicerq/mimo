# Mimo no terminal

Este contexto define como uma pessoa cria e usa Bots pessoais pelo terminal.

## Linguagem

**Bot**:
Um agente pessoal criado e nomeado pela pessoa, com Memória própria e uma Sessão atual. Seu propósito se desenvolve pelo uso, sem especialidade predeterminada, e a pessoa pode criar quantos Bots quiser.
_Evitar_: Assistente, agente

**Sessão**:
A conversa durável atual de um Bot, que sobrevive a reinícios e à troca de Bot e mantém sua identidade ao compactar o contexto automaticamente. Quando terminar, um novo Turno começa outra Sessão com aviso, preservando a Memória e o acesso às Sessões anteriores.
_Evitar_: Chat, conversa nova

**Turno**:
Uma entrega da pessoa ou um disparo de Rotina e todo o trabalho que ela provoca até a resposta.
_Evitar_: Ciclo, execução

**Modelo do Bot**:
A escolha de provedor, modelo e esforço para as próximas respostas de um Bot. Permanece salva e pode mudar sem abrir outra Sessão. Uma resposta em andamento mantém a escolha com que começou, inclusive enquanto espera Aprovação.
_Evitar_: Modelo global, modelo da sessão

**Rotina**:
Um trabalho de um Bot, executado numa frequência escolhida e entregue em sua Sessão atual. Continua pertencendo ao mesmo Bot quando a Sessão muda.
_Evitar_: Agendamento, cron job, automação

**Modo normal**:
O Bot executa o trabalho e pede Aprovação para as ações que a exigem, como enviar e-mails, apagar Rotinas e ativar o Modo autônomo.
_Evitar_: Padrão, cauteloso

**Modo autônomo**:
Todas as ações acontecem sem aprovação e a pessoa revisa o registro depois.
_Evitar_: Automático, férias

**Memória**:
Fatos, preferências e decisões duráveis que um Bot guarda para os próximos turnos, inclusive após a substituição de uma Sessão encerrada. Pertence ao Bot e não é compartilhada automaticamente com outros Bots.
_Evitar_: Contexto, histórico

**Aprovação**:
A confirmação da pessoa no terminal antes de uma ação que a exige.
_Evitar_: Permissão, consentimento

**Rascunho**:
Uma resposta escrita pelo Bot que só vira e-mail enviado por ação da pessoa ou no Modo autônomo.
_Evitar_: Minuta

**Sandbox**:
O ambiente isolado do eve onde o Bot executa comandos e mexe em arquivos.
_Evitar_: Máquina, VM, computador
