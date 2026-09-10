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

## Gmail

As tools `list_accounts`, `list_unread` e `read_thread` leem a caixa de entrada; `create_draft` cria rascunhos e `send_draft` envia um rascunho com aprovação no terminal. Cada conta conectada guarda o refresh token em `apps/agent/.data/gmail/accounts.json`; o client id e o client secret ficam em `apps/agent/.env.local`.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a Gmail API.
2. Configure a tela de consentimento OAuth (tipo External, com você como usuário de teste).
3. Em Credenciais, crie um cliente OAuth do tipo App para computador.
4. Coloque o client id e o client secret em `apps/agent/.env.local` (`GMAIL_CLIENT_ID` e `GMAIL_CLIENT_SECRET`).
5. Rode `bun run gmail:auth`, abra a URL que aparecer e autorize a conta. O comando grava a conta e o refresh token sozinho; rode de novo para conectar outras contas.
6. Rode `bun run dev` e peça para o bot listar os não lidos. Com mais de uma conta, diga qual.

Com a tela de consentimento em Testing, o Google expira o refresh token em 7 dias e a conta precisa ser conectada de novo com `bun run gmail:auth`. Para evitar, publique o app em In production; o consentimento passa a mostrar o aviso de app não verificado, e para uso pessoal não é preciso concluir a verificação.

## Rotinas

As rotinas ficam em `apps/agent/.data/routines.json` e são criadas por conversa. Um dispatcher de um minuto entrega o prompt na sessão em que a rotina foi criada.

O `eve dev` não dispara cron sozinho, então o `bun run dev` chama a rota de dispatch a cada minuto. Num `eve build && eve start`, o eve dispara sozinho, mas o processo precisa estar de pé.
