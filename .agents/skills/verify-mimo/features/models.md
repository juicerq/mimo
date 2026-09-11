# Modelos por bot

`/model` abre o seletor dentro da conversa. O primeiro passo escolhe o provedor e mostra quantos modelos ele tem; o segundo lista os modelos desse provedor; o terceiro oferece os esforços compatíveis. `Ctrl+P` abre o mesmo seletor preservando o rascunho. Modelos com um único esforço salvam a escolha já no passo do modelo. `/cancel` e `Esc` voltam à conversa sem escolher.

## Verificação

1. Crie um bot em sandbox. Confira o modelo e o esforço no rodapé antes da primeira mensagem. Abra `/model`, escolha OpenAI, capture a lista do provedor e escolha um modelo. Escolha `max` quando disponível. Confira o rodapé e `model` em `bots/<id>.json`.
2. Envie um pedido com marcador único e uma ferramenta de leitura. Confira a resposta e a linha `⚙ <tool>`. O rodapé deve continuar mostrando a escolha salva.
3. Guarde um fato banal na memória e troque para outro modelo. Pergunte pelo fato sem repetir seu valor. Confira que o bot mantém o transcript e `bots/<id>/memory.md`.
4. Crie outro bot e escolha um modelo diferente. Alterne entre os bots e reinicie com os mesmos dados. Cada bot deve manter sua escolha, inclusive ao reexibir mensagens antigas de outros modelos.
5. Abra o seletor enquanto existe uma aprovação pendente. Escolher números nos passos de modelo e esforço não pode aprovar a ferramenta. Salve outro modelo, volte e aprove pelo caminho da TUI. A continuação usa o modelo anterior; a próxima mensagem usa a escolha nova.
6. Envie uma resposta longa e abra `/model` durante o streaming. Use teclas literais pelo tmux, pois `send` recusa envios durante `thinking`. Escolha outro modelo e confira que a resposta em curso termina com o anterior. Confirme o novo modelo na mensagem seguinte.
7. Abra `/model` e cancele com `/cancel`. Repita com `Esc`. Nenhum dos dois caminhos pode mudar o JSON nem resolver pedidos pendentes. Ao confirmar uma escolha, tente navegar durante a gravação: a TUI mostra `status: saving` e só volta com `Model saved for the next response.`. Confira números inválidos e um terminal de 70 colunas por 20 linhas.
8. Se a conta OpenCode estiver sem saldo, provoque o erro pela TUI. Confira a mensagem `✗ error: ...` com indicação de `/model`. Escolha OpenAI, confirme que nenhum turno começou sozinho e envie apenas “continue” no mesmo bot. O diagnóstico e o pedido original permanecem no transcript. A resposta precisa atender ao pedido anterior sem exigir que a pessoa o repita.

Para falha de catálogo, use uma instância isolada sem a credencial de um provedor. O outro deve continuar na lista, e o erro do provedor ausente aparece como aviso. Um bot já configurado deve abrir pelo registro salvo sem consultar o catálogo. Registre o caso como indisponível quando não puder controlar essa precondição.

O texto do modelo não prova qual provedor respondeu; compare `model` em `bots/<id>.json` e o rodapé. Grave os comandos, capturas e os trechos de estado que sustentam a conclusão, sem credenciais. Não envie e-mail durante esta receita.
