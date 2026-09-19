# mimo no desktop

O mimo deixa de ser TUI e vira um app Electron. No fim fica só um: o Electron.

## Decisões

- O app nasce neste repo, em `apps/desktop`, com o mesmo `apps/agent`. Não há cópia do agent.
- O agent roda no processo principal do Electron. Não há engine separado nem servidor.
- A TUI continua sendo o app do dia a dia até o Electron cobrir tudo que ela faz.
- Enquanto isso, o Electron usa uma Casa separada (`MIMO_DATA_DIR`) e não disputa os bots reais com a TUI.

## Ordem

1. **Ponte.** O agent roda no processo principal; a tela abre um bot, entrega mensagens e recebe os eventos pelo IPC. `Bun.serve` em `gmail/connect.ts` e os imports de `.md` deixam de depender do Bun.
2. **Conversa.** Barra de bots e composer.
3. **Turno.** Aprovação, Fila, parar e as linhas da Equipe.
4. **Painéis.** Modelo, tools, Pasta, login, apagar e details.
5. **Troca.** Apagar `apps/mimo` e renomear o repo.
