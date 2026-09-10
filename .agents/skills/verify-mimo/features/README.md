# Mapa de verificação do mimo-tui

Este diretório é a fonte mantida para verificar o comportamento visível do mimo-tui. Leia o índice antes de dirigir e use o arquivo da feature como receita.

## Precondições de linha de base

- Rode tudo da raiz do repo com `CONTROL=.agents/skills/verify-mimo/scripts/control-mimo`.
- Uma instância por vez: `$CONTROL launch` exige a porta 2000 livre e a sessão tmux `mimo-verify` ausente.
- `launch` roda em sandbox de dados por padrão (`.verify/runs/<id>/data`); `$CONTROL data` imprime o caminho. Só use `--data apps/agent/.data` quando a receita exigir os dados reais.
- `$CONTROL doctor` precisa confirmar health, HEAD, env e pane em `ready`.
- Cada abertura da TUI é uma conversa nova; nada é retomado entre aberturas, exceto a memória durável.
- O modelo é remoto (`opencode-go/deepseek-flash`); turnos levam segundos e a redação varia.

## Convenções de condução

- Comece cada receita do estado de linha de base, salvo precondição em contrário.
- Prefira marcadores únicos (`MIMO-...-<run>`, ids, nomes de tool) a frases do modelo.
- Envie uma mensagem por vez; o `send` recusa se o bot está `thinking` e só retorna quando o turno termina.
- Use `wait` para conferir marcadores de conteúdo (tokens únicos, nomes de tool, ids).
- Capture o pane nos passos-chave em `.verify/runs/<id>/NN-nome.txt`.
- Termine com `$CONTROL stop`; a evidência fica no run dir.

## Prova e skips

- Prova = ação do usuário na TUI + estado resultante + efeito colateral observável onde ele vive.
- Não use endpoint interno como atalho quando a feature é da TUI.
- Se uma precondição faltar (conta Gmail, rede, rotina), reporte o caminho tentado e a precondição não atendida; não marque como verificado por outro caminho.
- Aprovação de envio de e-mail: a prova padrão recusa; envio real é opt-in, só para endereço próprio e com assunto `VERIFICACAO`.
- Nunca envie e-mail para terceiros durante verificação.

## Features

- [Conversa](./chat.md) cobre envio, streaming, ferramentas, contexto e erros na TUI.
- [Buscar na web](./web-search.md) cobre a tool `web_search` sem chave e seus erros acionáveis.
- [Gmail](./gmail.md) cobre contas, não lidos, thread, rascunho, aprovação de envio e multi-conta.
- [Rotinas](./routines.md) cobre criar, persistir, disparar, listar e apagar com aprovação.
- [Memória durável](./memory.md) cobre salvar, recordar entre sessões e remover.
