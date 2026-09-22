# Interrupção

Enviar outra mensagem interrompe o trabalho atual e começa um novo Turno. A pessoa vê seu texto no Registro, sem Fila nem aviso “Você parou”. Esse aviso aparece apenas quando ela clica em Parar. Falas e ações concluídas continuam salvas.

## Sub-features

- `replace-working` interrompe uma ação demorada e responde ao novo pedido.
- `replace-approval` recusa uma Aprovação pendente e responde ao novo pedido.
- `replace-repeated` aceita várias mudanças de pedido sem sobrepor execuções.
- `replace-peer` impede uma resposta atrasada de outro Bot de retomar o pedido anterior.
- `replace-reopen` preserva as mensagens e a interrupção depois de reabrir.

## How to get to it (user POV)

- Abra um Bot, peça um trabalho e envie outra mensagem enquanto ele trabalha.
- O campo continua com `Mensagem para <nome>`. O botão `Parar` encerra o trabalho sem enviar nada.

## Driving it with control-mimo

Preconditions:

- Um Bot aberto e Detalhe Completo para acompanhar a ação demorada.

- **Trabalhar.** `$CONTROL send --no-wait 'Envie MIMO-ANTES com done false. Execute sleep 45 com bash. Só depois envie MIMO-ANTIGO com done true.'`. Aguarde a linha do comando e capture com `$CONTROL capture 01-antes`.
- **Interromper.** `$CONTROL send --no-wait 'Mudei o pedido. Responda apenas MIMO-NOVO.'`. Espere o marcador na resposta. Não existe `Na fila` nem um novo aviso `Você parou`; MIMO-ANTIGO não vira Fala.
- **No disco.** `$CONTROL db 'select id, status, failure from turns order by seq'` mostra o primeiro Turno interrompido e o segundo concluído. `$CONTROL db 'select id, turnId, entry from deliveries'` mostra uma entrega por Turno. `$CONTROL db 'select text from speeches'` preserva MIMO-ANTES e contém MIMO-NOVO, sem MIMO-ANTIGO.
- **Confirmação.** Peça envio para example@example.com, sem aprovar. Quando o card abrir, envie `Não envie. Responda MIMO-CANCELADO.`. O card fica recusado, a resposta chega e nenhum envio é executado.
- **Outro Bot.** Crie Buko, peça uma consulta com espera e faça Buko executar sleep 45. Envie outro pedido a quem perguntou. Os dois Turnos são interrompidos, a nova resposta chega e a antiga não reaparece.
- **Reabrir.** Capture, pare a instância e rode `launch --data` com a mesma Casa. As mensagens aparecem uma vez, sem Fila e sem reiniciar o trabalho interrompido.

## Gotchas

- O marcador escrito no pedido não prova a resposta: confira `speeches`.
- Espere a ação demorada começar antes de interromper; só o estado trabalhando não prova que a tool iniciou.
- Uma ação já concluída não é desfeita pela interrupção.
- Nunca aprove envio de e-mail nesta verificação.
