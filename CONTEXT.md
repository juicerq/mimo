# Mimo no terminal

Este contexto define como uma pessoa conversa com um Bot que opera a caixa de e-mail pelo terminal.

## Linguagem

**Bot**:
O agente eve com identidade, instruções e memória próprias que trabalha na caixa de e-mail no lugar da pessoa.
_Evitar_: Assistente, agente

**Sessão**:
A conversa durável entre a pessoa e o Bot. Sobrevive a reinícios do processo e não termina ao fechar o terminal.
_Evitar_: Chat, conversa nova

**Turno**:
Uma entrega da pessoa ou um disparo de Rotina e todo o trabalho que ela provoca até a resposta.
_Evitar_: Ciclo, execução

**Rotina**:
Um trabalho que o Bot executa sozinho, numa frequência escolhida, criado por conversa.
_Evitar_: Agendamento, cron job, automação

**Modo normal**:
Arquivar, rotular, marcar lido e rascunhar são automáticos. Enviar pede aprovação.
_Evitar_: Padrão, cauteloso

**Modo autônomo**:
Todas as ações acontecem sem aprovação e a pessoa revisa o registro depois.
_Evitar_: Automático, férias

**Memória**:
Fatos e preferências duráveis que o Bot guarda entre sessões.
_Evitar_: Contexto, histórico

**Aprovação**:
A confirmação da pessoa no terminal antes de uma ação gateada.
_Evitar_: Permissão, consentimento

**Rascunho**:
Uma resposta escrita pelo Bot que só vira e-mail enviado por ação da pessoa ou no Modo autônomo.
_Evitar_: Minuta

**Sandbox**:
O ambiente isolado do eve onde o Bot executa comandos e mexe em arquivos.
_Evitar_: Máquina, VM, computador
