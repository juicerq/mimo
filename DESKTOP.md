# mimo no desktop

O mimo deixa de ser TUI e vira um app Electron. No fim fica só um: o Electron.

## Decisões

- O app nasce neste repo, em `apps/desktop`, com o mesmo `apps/agent`. Não há cópia do agent.
- O agent roda no processo principal do Electron. Não há engine separado nem servidor.
- A TUI continua sendo o app do dia a dia até o Electron cobrir tudo que ela faz.
- Enquanto isso, o Electron usa uma Casa separada (`MIMO_DATA_DIR`) e não disputa os bots reais com a TUI.
- A tela fala com o agent por oRPC sobre `MessagePort`, com router sem contrato. O TanStack Query cuida da lista de bots e do que mais for consulta; os erros do agent chegam inteiros.
- O agent fica no processo principal. Gravar a maior conversa real (3,3 MB) custa até 10 ms; se pesar, o mesmo router muda para um `utilityProcess`.
- A conversa chega num fluxo só: o main começa a escutar o bot, manda o histórico e segue com os eventos ao vivo. O fluxo existe enquanto a tela mostra o bot. Até o passo 4 ele só observa o bot (`observe`) e não conta como tela: um login pedido pelo bot falha na hora com o aviso de abrir o bot na TUI. Esse fluxo alimenta um estado que cresce a cada evento, fora do TanStack Query.
- A tela é React.
- A Barra de bots pede o estado de cada bot (`activity`) a cada segundo, como a TUI. A lista de bots só relê o disco quando muda.
- A resposta do bot vira markdown pelo react-markdown, que não passa HTML cru. Um link abre no navegador.
- O app lembra o último bot aberto; o texto do composer fica guardado por bot enquanto o app está aberto.
- O visual segue o protótipo E (`prototype-ui/e-caixa.html`), que fica no repo como referência até o passo 4. A pessoa fala pela direita, o bot pela esquerda, e o que acontece em volta fica centralizado e curto.
- O estilo é Tailwind v4 com os componentes do shadcn (estilo `base-nova`, sobre o Base UI). Cores, raios e utilitários do app ficam em `styles.css`; a tela usa esses tokens e nunca uma cor solta. `components/ui` é do shadcn: entra e atualiza pela CLI (`bunx shadcn add`), fora do lint e dos exports do knip. As classes se juntam com `cn` e os ícones são do lucide.
- A janela não tem moldura: minimizar, maximizar e fechar ficam no topo, à direita do ⓘ, e passam pelo router, que recebe a janela no contexto. No Wayland o app desliga a composição pela GPU: com NVIDIA, a janela sem moldura para de desenhar depois de maximizar.
- A última mensagem de cada bot vem do agent (`lastMessage`): do bot aberto, pela memória; dos outros, pelo disco. A Barra ordena pela hora dela.
- O Aviso de um Bot filho aparece com o texto do agent, em inglês (`finished`, `failed`), até o passo 3.
- O build é electron-vite 5 com Vite 7. O electron-vite 5 não suporta o Vite 8 e, com ele, embute o próprio `electron` no bundle; só o 6, ainda beta, suporta.

## Ordem

1. **Ponte.** O agent roda no processo principal; a tela abre um bot, entrega mensagens e recebe os eventos pelo IPC. `Bun.serve` em `gmail/connect.ts` e os imports de `.md` deixam de depender do Bun.
2. **Conversa.** Barra de bots, composer, markdown na resposta e Detalhe.
3. **Turno.** Aprovação, Fila, parar e as linhas da Equipe.
4. **Painéis.** Modelo, tools, Pasta, login, apagar e details. Com o login na tela, o fluxo troca `observe` por `subscribe` e passa a contar como tela.
5. **Troca.** Apagar `apps/mimo` e renomear o repo.
