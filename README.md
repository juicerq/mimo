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
