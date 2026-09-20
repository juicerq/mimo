# Mapa de verificação do mimo

Este diretório é a fonte mantida para verificar o comportamento visível do app desktop do mimo. Leia o índice antes de dirigir e use o arquivo da feature como receita.

## Precondições de linha de base

- Rode tudo da raiz do repo com `CONTROL=.agents/skills/verify-mimo/scripts/control-mimo`.
- Uma instância de verificação por checkout: `$CONTROL launch` recusa se a anterior ainda está no ar.
- `launch` roda em sandbox de dados e de HOME (`.verify/runs/<id>/data` e `/home`); `$CONTROL data` imprime o caminho. Um sandbox novo não tem bots nem `localStorage`.
- `$CONTROL doctor` precisa confirmar processo, CDP, HEAD e `main: igual ao do launch`.
- Nunca dirija uma instância que este `launch` não iniciou. O app de dev do usuário costuma estar aberto ao lado, em outra porta.
- O modelo é remoto; turnos levam segundos e a redação varia. Um bot novo nasce com `openai-codex/gpt-5.6-luna` e esforço `max`; troque pela barra Sobre quando a receita pedir.

## Convenções de condução

- Comece cada receita do estado de linha de base, salvo precondição em contrário.
- Seletor CSS por `aria-label` primeiro; referência `@eN` de um `snapshot` novo quando o elemento não tem rótulo. `agent-browser find` não funciona aqui.
- Prefira marcadores únicos (`MIMO-...-<run>`, ids, nomes de tool) a frases do modelo.
- `send` espera o turno terminar; `send --no-wait` é só para a Fila e para parar um turno.
- O estado do bot vem de uma consulta a cada segundo. Logo depois de um evento, `state` pode atrasar 1 s; use `wait` no marcador em vez de ler `state` na hora.
- Capture os passos-chave com `$CONTROL capture NN-nome`.
- Termine com `$CONTROL stop`; a evidência fica no run dir.

## Prova e skips

- Prova = ação do usuário na janela + estado resultante + efeito colateral observável onde ele vive.
- Não chame o router oRPC nem módulos do agente como atalho quando a feature é da janela.
- Se uma precondição faltar (conta Gmail, rede, credencial), reporte o caminho tentado e a precondição não atendida; não marque como verificado por outro caminho.
- Aprovação de envio de e-mail: a prova padrão recusa; envio real é opt-in, só para endereço próprio e com assunto `VERIFICACAO`.
- Nunca envie e-mail para terceiros durante verificação.

## Contrato de cada feature

Cada arquivo começa com um H1 e um parágrafo com o comportamento visível. Depois usa exatamente quatro H2, nesta ordem: `Sub-features`, `How to get to it (user POV)`, `Driving it with control-mimo` (começa com `Preconditions:` e pareia cada ação do usuário com o comando exato e o resultado observável) e `Gotchas`.

## Features

- [Bots](./bots.md) cobre o primeiro bot, criar outro, trocar de bot, a prévia na lista e a persistência.
- [Conversa](./chat.md) cobre envio, resposta, o rótulo do turno, parar, o nível de Detalhe e falha de turno.
- [Fila](./queue.md) cobre escrever durante o trabalho do bot, a ordem e o descarte ao parar.
- [Sobre o bot](./about.md) cobre a barra lateral: Modelo e Esforço.
- [Configurações](./settings.md) cobre Tema e Detalhe.
- [Tools do agente](./agent-tools.md) cobre web, computador, memória, rotinas e equipe pedidos na conversa.
- [Gmail](./gmail.md) cobre leitura, rascunho e a confirmação de envio.

## Sem superfície no desktop

Ainda não existem na janela: login de provedor, conectar conta Gmail e apagar bot. Um login pedido pelo bot falha na hora. Reporte essas features como sem superfície; não prove por outro caminho.
