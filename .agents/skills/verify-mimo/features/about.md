# Sobre o bot

A barra da direita mostra e muda o bot aberto: Propósito, Modelo e Esforço, mais a data de criação. Cada mudança grava na hora em a tabela `bots`.

## Sub-features

- `about-toggle` o botão `Sobre o bot` abre e fecha a barra; em janela estreita (menos de 960 px) ela vira uma gaveta por cima da conversa, e `Esc` ou um clique fora fecha.
- `about-purpose` o campo Propósito grava ao sair dele e mostra sozinho, em até 1 s, o texto que o próprio Bot escreve com `set_purpose`.
- `about-model` o seletor Modelo tem busca e agrupa por provedor; o botão fechado mostra o modelo e o provedor.
- `about-effort` o Esforço lista só os níveis do modelo escolhido, e trava quando há um só.
- `about-error` uma gravação que falha mostra o erro em vermelho no fim da barra.

## How to get to it (user POV)

- Clique no `i` (`Sobre o bot`) no topo da conversa. A barra já vem aberta numa instalação nova.

## Driving it with control-mimo

Preconditions:

- Um bot aberto. A árvore tem `complementary "Sobre <nome>"`; se não tiver, `$CONTROL browser click '[aria-label="Sobre o bot"]'`.
- Consulte o bot por `$CONTROL db 'select id, name, provider, modelId, reasoning, purpose from bots'`.

- **Propósito.** `$CONTROL browser fill '[aria-label="Propósito"]' 'MIMO-PURPOSE-<run>'` e `$CONTROL browser press Tab`. A linha do bot tem `purpose` igual ao token.
- **Buscar modelo.** `$CONTROL browser click '[aria-label="Modelo"]'` e `$CONTROL browser fill '[placeholder="Procurar modelo"]' 'terra'`. O `snapshot` mostra um `group "<provedor>"` por provedor que tem o modelo, cada um com a sua `option "GPT-5.6 Terra"`.
- **Escolher.** Clique na referência da `option` debaixo de `group "OpenAI"`: `$CONTROL browser click @eN`. `$CONTROL wait 'combobox "Modelo".*GPT-5.6 Terra OpenAI' 10`. Na linha do bot, `provider` é `openai-codex`, `modelId` é `gpt-5.6-terra` e `reasoning` é o esforço padrão do modelo.
- **Busca vazia.** Preencha `zzzz`: a árvore mostra `Nenhum modelo com esse nome.` `$CONTROL browser press Escape` fecha sem mudar a linha do bot.
- **Esforço.** `$CONTROL browser click '[aria-label="Esforço"]'`, tire um `snapshot` e clique na `option "Alto"`. a linha do bot passa a ter `"reasoning": "high"`. A lista abre embaixo do botão, não por cima do topo da janela.
- **Esforço travado.** Escolha `Grok Build 0.1` (um nível só). A árvore mostra `combobox "Esforço" [expanded=false, disabled]`.
- **Fechar e abrir.** `$CONTROL browser click '[aria-label="Sobre o bot"]'`: a `complementary "Sobre <nome>"` some da árvore. Clique de novo para voltar.
- **Prova.** `$CONTROL capture 03-sobre`, com a lista de modelos aberta e outra com a barra final, mais o consulta do bot.

## Gotchas

- Há uns 100 modelos e vários nomes se repetem entre provedores. Escolha sempre a `option` pelo `group` do provedor, nunca a primeira com aquele nome.
- O texto do modelo não prova qual provedor respondeu; compare provedor e modelo na linha do bot.
- A troca vale para a próxima resposta. Um turno em curso termina com o modelo anterior.
- Deixe o bot como achou quando usar dados que não são do sandbox.
