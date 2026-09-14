# Padrões do Renderer

Leia este arquivo antes de criar ou alterar código no Renderer.

Leia `DESIGN.md` antes de criar, alterar ou revisar a interface. Ele define os tokens, a hierarquia visual e a anatomia dos componentes do Mimo.

## React

`useEffect` é proibido, exceto quando uma sincronização externa não puder ser feita durante a renderização, por um evento, pelo TanStack Query, pelo TanStack Store ou por uma API de assinatura. O uso exige uma explicação durante a revisão mostrando por que essas opções não resolvem o caso.

## Estado

- TanStack Query controla dados recebidos do Bun Engine.
- TanStack Store controla estado compartilhado no Renderer.
- `chat/chat-events.ts` assina `conversations.events` uma vez, em `main.tsx`, e alimenta o `chatStore` com todo turno de todo Bot. Componentes não consomem streams do Engine.
- O estado do componente controla dados usados somente por aquela parte da interface.

Use selectors ao ler o TanStack Store para evitar renderizações causadas por mudanças que o componente não usa.

## Importações de `src/shared`

O Renderer não valida dados: o Bun Engine já validou tudo que envia. Importe de `src/shared` apenas tipos, com `import type`, ou arquivos sem schemas, como `bot-efforts.ts` e `weekdays.ts`. Um valor importado de um arquivo com schemas constrói todos os schemas dele no boot do Renderer e inclui o Zod no bundle.

## Scroll da conversa

`ChatScroller` revela mensagens anteriores com `startTransition` e deixa a ancoragem de scroll do Chromium manter as mensagens em vista no lugar. A ancoragem não age com `scrollTop` em 0, por isso `revealAbove` garante 1 px antes de revelar, e o botão de revelar usa `overflow-anchor: none` para não virar a âncora.

## Classes repetidas em massa

Um `className` longo repetido em centenas de elementos custa na abertura da conversa: o Chromium tokeniza o atributo `class` de cada elemento criado. Estilo para descendentes de um elemento repetido, como as cores `hljs-*` dos blocos de código, fica numa classe própria em `styles.css` dentro de `@layer components`, hoje `.chat-code`. Uma variante arbitrária do Tailwind troca `_` por espaço, então `[&_.hljs-built_in]` nunca casa; a regra CSS não tem esse problema.

## Mobile

O breakpoint é o `md` do Tailwind, 48rem. Estilo que muda no celular usa `max-md:`. Estrutura que muda, como a lista em tela cheia, a navegação do Bot e a sheet do composer, lê `useIsMobile()` de `ui/use-is-mobile.ts`, uma assinatura em `matchMedia` via `useSyncExternalStore`. O bloco `@media (width < 48rem)` no fim de `styles.css` fica fora de `@layer` de propósito: ele reestiliza primitivos que já carregam utilities, como `.chat-control-popover`, `.mobile-sheet` e `.mobile-screen`, e utilities vencem qualquer layer.

Rascunhos ficam no `chatStore` e são persistidos pelo `chat-draft-storage`. A lista mobile combina o resumo persistido de `conversations.overview` com os estados vivos do `chatStore`; não carrega cada histórico para descobrir pendências. `workspace-navigation` sincroniza o `botsStore` com o histórico do navegador no computador e no celular; o Chromium do Electron já navega nesse histórico com os botões voltar e avançar do mouse, então o Renderer não trata esses botões.  `chat-reading-position` preserva a leitura durante a sessão.

## Navegador do Bot

`BrowserPanel` recebe um `BrowserActions`: `control` existe apenas no Electron, onde `browser-desktop.tsx` posiciona a `WebContentsView` nativa. No celular, `browser-remote.tsx` permite apenas acompanhar e ampliar a imagem; sair da visualização preserva a página e o controle no computador. A lista de páginas chega por `browser.pages`, assinado uma vez em `main.tsx` por `browser-pages.ts`, e os quadros por `browser.frame`. O Engine não expõe comandos remotos de controle do navegador.
