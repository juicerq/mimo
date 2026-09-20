# mimo no desktop

O mimo deixa de ser TUI e vira um app Electron. No fim fica só um: o Electron.

## Decisões

- O app nasce neste repo, em `apps/desktop`, com o mesmo `apps/agent`. Não há cópia do agent.
- O agent roda no processo principal do Electron. Não há engine separado nem servidor.
- A TUI continua sendo o app do dia a dia até o Electron cobrir tudo que ela faz.
- Enquanto isso, o Electron usa uma Casa separada (`MIMO_DATA_DIR`) e não disputa os bots reais com a TUI.
- A tela fala com o agent por oRPC sobre `MessagePort`, com router sem contrato. O TanStack Query cuida da lista de bots e do que mais for consulta; os erros do agent chegam inteiros.
- O agent fica no processo principal. Gravar a maior conversa real (3,3 MB) custa até 10 ms; se pesar, o mesmo router muda para um `utilityProcess`.
- A conversa chega num fluxo só: o main começa a escutar o bot, manda o histórico e segue com os eventos ao vivo. O fluxo existe enquanto a tela mostra o bot e alimenta um estado que cresce a cada evento, fora do TanStack Query.
- O login não é do bot: ele mora num registro do processo principal, um por alvo. O bot chama `connect_gmail` e a pessoa clica em Entrar nas Configurações; os dois caem na mesma sessão. Por isso a janela pode fechar no meio e voltar depois, e o bot não precisa estar aberto para pedir autorização. A janela segue um fluxo só com tudo que acontece em qualquer login.
- A porta do login é a conversa. Quando o bot chama `connect_gmail`, a própria linha da tool vira um card do Gmail, do mesmo jeito que a aprovação de envio é a linha do `send_email`: ele pede, mostra a espera e congela no resultado, e volta do disco quando a conversa é relida. Conectar abre o navegador sozinho; recusar não é erro, é uma resposta que o bot lê e o turno segue. Configurações › Contas fica como administração: entrar nos provedores, ver e desconectar as contas do Gmail.
- A tela é React.
- A Barra de bots pede o estado de cada bot (`activity`) a cada segundo, como a TUI. A lista de bots só relê o disco quando muda.
- A resposta do bot vira markdown pelo react-markdown, que não passa HTML cru. Um link abre no navegador.
- O app lembra o último bot aberto; o texto do composer fica guardado por bot enquanto o app está aberto.
- O visual segue o protótipo E (`prototype-ui/e-caixa.html`), que fica no repo como referência até o passo 4. A pessoa fala pela direita, o bot pela esquerda, e o que acontece em volta fica centralizado e curto.
- O estilo é Tailwind v4 com os componentes do shadcn (estilo `base-nova`, sobre o Base UI). Cores, raios e utilitários do app ficam em `styles.css`; a tela usa esses tokens e nunca uma cor solta. `components/ui` é do shadcn: entra e atualiza pela CLI (`bunx shadcn add`), fora do lint e dos exports do knip. As classes se juntam com `cn` e os ícones são do lucide.
- A janela não tem moldura: minimizar, maximizar e fechar ficam no topo, à direita do ⓘ, e passam pelo router, que recebe a janela no contexto. No Wayland o app desliga a composição pela GPU: com NVIDIA, a janela sem moldura para de desenhar depois de maximizar.
- A última mensagem de cada bot vem do agent (`lastMessage`): do bot aberto, pela memória; dos outros, pelo disco. A Barra ordena pela hora dela.
- Não há Bot filho. Todo bot é igual e pergunta a outro pelo nome (`ask_bot`). Cada par ganha uma conversa à parte, uma por direção, que a pessoa abre pela linha do meio e só lê. Por padrão a pergunta não segura o turno: a resposta chega depois e começa um turno novo.
- O build é electron-vite 5 com Vite 7. O electron-vite 5 não suporta o Vite 8 e, com ele, embute o próprio `electron` no bundle; só o 6, ainda beta, suporta.

## Ordem

1. **Ponte.** O agent roda no processo principal; a tela abre um bot, entrega mensagens e recebe os eventos pelo IPC. `Bun.serve` em `gmail/connect.ts` e os imports de `.md` deixam de depender do Bun.
2. **Conversa.** Barra de bots, composer, markdown na resposta e Detalhe.
3. **Turno.** Aprovação, Fila, parar e as linhas do meio.
4. **Painéis.** Modelo, Instrução, apagar, Sobre, o card de login na conversa e as Contas em Configurações.
5. **Troca.** Apagar `apps/mimo` e renomear o repo.
