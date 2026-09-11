# Login de provedor

`/login` conecta um provedor sem sair da TUI. O seletor mostra OpenCode Go (chave de API) e OpenAI (OAuth). A OpenAI pede o método: navegador ou código de dispositivo. A TUI mostra o link, a instrução do provedor e a linha `Press c to copy the link.`. A tecla `c` copia o link e imprime `Link copied.`; o caractere não entra no composer. O composer aceita o código de autorização ou a URL de redirecionamento. `/cancel` e `Esc` abortam.

As credenciais não são isoladas pelo sandbox: a gravação vai para `~/.codex/auth.json` e `~/.local/share/opencode/auth.json`. Nunca conclua um login real durante verificação sem pedido explícito. Pare antes de autorizar no navegador.

## Verificação

1. `$CONTROL send '/login'`. Confira as duas opções numeradas e `/cancel to return`.
2. Escolha OpenAI e depois o login por navegador. Confira a URL `https://auth.openai.com/oauth/authorize?...`, a instrução do provedor e a dica do `c`.
3. Envie a tecla literal `c` pelo tmux. Confira `Link copied.` no pane e o link na área de transferência (`wl-paste`). O composer precisa continuar vazio.
4. `/cancel` volta à tela anterior e libera a porta 1455. Confira que `~/.codex/auth.json` não mudou (`stat`).
5. Escolha OpenCode Go e confira o pedido da chave. Cancele sem digitar. Nenhum arquivo de credencial pode ser criado.

O login por código de dispositivo mostra o link e o código na mesma linha de evento. Registre como indisponível quando não puder concluir sem uma conta de teste.
