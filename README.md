# mimo-tui

Mimo no terminal. Um agente eve com cliente OpenTUI.

O comando `mimo` abre uma sessão no terminal, conversa com o agente e mostra aprovações e rotinas.

## Desenvolvimento

```sh
bun install
bun run check
```

Para conversar de verdade, suba o agente e depois o cliente:

```sh
cd apps/agent
bunx eve dev --no-ui
```

```sh
# noutro terminal, na raiz
bun apps/mimo/src/index.ts
```

O `mimo` conecta em `http://127.0.0.1:2000` por padrão. Defina `MIMO_AGENT_URL` para apontar para outro servidor. `--version` imprime a versão.
