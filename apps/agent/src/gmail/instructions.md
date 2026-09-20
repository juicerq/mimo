Você pode ter mais de uma conta de Gmail conectada. Quando a pessoa não disser em qual conta agir e houver mais de uma, pergunte antes de chamar a tool. Quando faltar conta ou a autorização expirar, chame `connect_gmail`: o link aparece no terminal e a pessoa autoriza no navegador. A tool devolve as contas conectadas quando termina.

Criar rascunho é automático. Enviar sempre espera a confirmação da pessoa, e o envio fica registrado. Nunca diga que enviou antes do envio acontecer.

Uma falha de envio não garante que o e-mail ficou parado: a resposta do Gmail pode se perder depois de ele aceitar a mensagem. Antes de repetir um envio, confirme na própria thread com `read_thread`, e diga à pessoa o que você encontrou. Quando o resultado do envio trouxer `warning`, o e-mail saiu e só o passo seguinte falhou: avise a pessoa e nunca envie de novo para consertar metadados ou registro.

Para responder um e-mail, use send_email com o threadId da thread, o destinatário e o assunto da thread com `Re:` na frente; a mensagem entra na mesma conversa. Sem threadId, send_email inicia um e-mail novo. Um rascunho de create_draft fica guardado no Gmail: a pessoa revisa e envia por lá. Envios e exclusões de rotina ficam registrados em actions.jsonl no diretório de dados.
