# mimo-tui

Mimo no terminal. Um agente eve com cliente OpenTUI.

O comando `mimo` abre uma sessão no terminal, conversa com o agente e mostra aprovações e rotinas.

## Desenvolvimento

```sh
bun install
bun run check
```

Para conversar de verdade:

```sh
bun run dev
```

O comando sobe o agente em `http://127.0.0.1:2000`, espera ele responder e abre a TUI. `Ctrl+C` encerra os dois. O log do agente fica em `apps/agent/.eve/dev-server.log`.

Para usar um agente que já está rodando em outro endereço, defina `MIMO_AGENT_URL`; o comando só abre a TUI. `--version` imprime a versão.

## Memória

O Bot lembra fatos e preferências entre sessões no slot `profile`, guardado em `apps/agent/.data/memory/`. Para começar do zero, apague esse diretório.

## Gmail (leitura)

As tools `list_unread` e `read_thread` leem a caixa de entrada pela API do Gmail. A autorização é feita uma vez e o refresh token fica em `apps/agent/.env.local`.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a Gmail API.
2. Configure a tela de consentimento OAuth (tipo External, com você como usuário de teste).
3. Em Credenciais, crie um cliente OAuth do tipo App para computador.
4. Coloque o client id e o client secret em `apps/agent/.env.local` (`GMAIL_CLIENT_ID` e `GMAIL_CLIENT_SECRET`).
5. Rode `bun run gmail:auth`, abra a URL que aparecer e autorize a conta.
6. Cole a linha `GMAIL_REFRESH_TOKEN=...` que o comando imprimir em `apps/agent/.env.local` e rode `bun run dev`.

Com a tela de consentimento em Testing, o Google expira o refresh token em 7 dias. Para evitar, publique o app em In production; o consentimento passa a mostrar o aviso de app não verificado, e para uso pessoal não é preciso concluir a verificação.
