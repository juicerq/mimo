# Modelos por bot

`/model` abre a lista numerada dentro da conversa. O segundo passo oferece os esforços compatíveis. Modelos com um único esforço salvam a escolha no primeiro passo. `/cancel` e `Esc` voltam à conversa sem escolher.

## Verificação

1. Crie um bot em sandbox. Confira o modelo e o esforço antes da primeira mensagem. Abra `/model`, capture as opções e escolha um modelo da assinatura OpenAI. Escolha `max` quando disponível. Confira o rodapé e `model` em `bots/<id>.json`.
2. Envie um pedido com marcador único e uma ferramenta de leitura. Confira a resposta, os eventos `step.started` e as opções do modelo no estado durável. O rodapé deve continuar mostrando a escolha salva.
3. Guarde um fato banal na memória e troque para outro modelo. Pergunte pelo fato sem repetir seu valor. Confira que o bot mantém o mesmo `sessionId`, o histórico e o arquivo de memória.
4. Crie outro bot e escolha um modelo diferente. Alterne entre os bots e reinicie com os mesmos dados. Cada bot deve manter sua escolha, inclusive ao reproduzir eventos históricos de outros modelos.
5. Abra o seletor enquanto existe uma aprovação pendente. Escolher números nos passos de modelo e esforço não pode aprovar a ferramenta. Salve outro modelo e reinicie. Aprove pelo caminho da TUI. A continuação deve usar o modelo anterior, e a próxima mensagem deve usar a escolha nova.
6. Envie uma resposta longa e abra `/model` durante o streaming. Use teclas literais pelo tmux, pois `send` recusa envios durante `thinking`. Escolha outro modelo e confira que a resposta em curso termina com o anterior. Confirme o novo modelo na mensagem seguinte.
7. Abra `/model` e cancele com `/cancel`. Repita com `Esc`. Nenhum dos dois caminhos pode mudar o JSON nem resolver pedidos pendentes. Ao confirmar uma escolha, tente navegar durante a gravação. A TUI deve aguardar a resposta e exibir o modelo salvo. Confira números inválidos e um terminal de 70 colunas por 20 linhas.
8. Se a conta OpenCode estiver sem saldo, provoque o erro pela TUI. Confira uma mensagem com indicação de `/model`. Escolha OpenAI, confirme que nenhum turno começou sozinho e envie apenas “continue” no mesmo bot. Se o Eve encerrou a sessão, confira o novo `sessionId`, o aviso, o arquivo da sessão anterior e a resposta. O diagnóstico e o pedido original devem permanecer no histórico. A resposta precisa atender ao pedido anterior sem exigir que a pessoa o repita.

Para falha de catálogo, use uma instância isolada sem a credencial de um provedor. O outro deve continuar na lista. Um bot já configurado deve abrir pelo registro salvo sem consultar o catálogo. Registre o caso como indisponível quando não puder controlar essa precondição.

Compare os IDs dos modelos nos eventos e no estado durável. O texto do modelo não prova qual provedor respondeu. Grave os comandos, capturas e os trechos de estado que sustentam a conclusão, sem credenciais. Não envie e-mail durante esta receita.
