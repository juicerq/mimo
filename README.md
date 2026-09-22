# mimo

Bots pessoais num app de desktop, feito com Electron e a harness [Pi](https://www.npmjs.com/package/@earendil-works/pi-agent-core). Cada bot tem sua conversa, sua memória e suas rotinas, e o propósito dele se desenvolve pelo uso.

O bot conversa, usa o computador (`bash`, arquivos), busca na web, navega num navegador dentro do app, lê e escreve e-mails no Gmail e pergunta coisas aos outros bots. Só o envio de e-mail pede sua confirmação. Os modelos vêm da assinatura OpenAI (Codex) e da OpenCode Go.

## Instalação

```sh
bun install
bun run build
cd apps/desktop && bun link
```

Isso dá o comando `mimo`. Para atualizar, puxe o repo e rode `bun run build` de novo.

As chaves ficam em `~/.mimo/.env`, no formato do `.env.example`. As contas de modelo e de Gmail se conectam em Configurações › Contas. O Gmail precisa de um cliente OAuth do tipo App para computador, criado no Google Cloud com a Gmail API ativa.

O `~/.mimo/MIMO.md` é a instrução que vale para todos os bots.

## Desenvolvimento

```sh
bun run dev
bun run check
```

O `dev` usa dados próprios em `.data-desktop`, separados dos seus bots reais. O `CONTEXT.md` explica o domínio e diz qual arquivo é dono de cada parte: leia antes de mexer no código. Depois de mudar `apps/agent/src/storage/schema.ts`, rode `bun run db:generate` e revise a migração; não use `drizzle-kit push`.

## Dados

Tudo fica em `~/.mimo/`, principalmente em `mimo.sqlite`. `MIMO_DATA_DIR` troca esse lugar.
