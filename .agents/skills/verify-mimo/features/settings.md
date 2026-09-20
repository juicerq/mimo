# Configurações

Um diálogo com duas escolhas do app inteiro: o Tema (Claro ou Escuro) e o Detalhe da conversa (Breve ou Completo). As duas ficam no `localStorage`.

## Sub-features

- `settings-open` a engrenagem no pé da barra de bots abre o diálogo; `Esc` fecha.
- `settings-theme` troca entre Claro e Escuro na hora.
- `settings-detail` `Breve` mostra mensagens, confirmações, avisos, erros, rotinas e equipe; `Completo` soma as linhas de tool com entrada e resultado.

## How to get to it (user POV)

- Clique na engrenagem (`Configurações`) no canto de baixo, à esquerda.

## Driving it with control-mimo

Preconditions:

- App pronto. Para provar o Detalhe, a conversa aberta precisa ter um turno com tool (veja [chat.md](./chat.md)).

- **Abrir.** `$CONTROL browser click '[aria-label="Configurações"]'`. A árvore mostra `dialog "Configurações"` com `group "Tema"` e `group "Detalhe"`.
- **Tema.** Tire um `snapshot` e clique na referência de `button "Claro"`. `$CONTROL capture 06-tema-claro`: o fundo da janela fica claro. Volte com `button "Escuro"`.
- **Detalhe.** Clique na referência de `button "Completo"` e feche com `$CONTROL browser press Escape`. `$CONTROL browser snapshot | grep -c current_time` é maior que zero numa conversa que usou essa tool. Repita com `Breve`: a contagem cai para `0` e as bolhas continuam.
- **Prova.** Um `capture` por nível de Detalhe, com a mesma conversa na tela.

## Gotchas

- Os botões do diálogo não têm `aria-label` e a árvore não marca qual está escolhido. Prove a escolha pelo efeito: a cor da captura e as linhas de tool na árvore.
- O HOME de sandbox zera o `localStorage` a cada `launch`: o app abre com o tema do sistema e o Detalhe em `Breve`. A persistência entre execuções não é dirigível com o sandbox padrão; reporte como não verificada.
