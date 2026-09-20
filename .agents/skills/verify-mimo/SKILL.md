---
name: verify-mimo
description: Drive the mimo desktop app (Electron, apps/desktop) like a user to prove behavior end to end — launch it in a sandbox, click and type through CDP with agent-browser, and keep screenshots, accessibility trees and on-disk state as evidence. Use for changes under apps/desktop or apps/agent.
---

# Verificar o mimo

O mimo é um app desktop Electron (`apps/desktop`). O processo main roda o agente (`apps/agent`) e fala com o renderer React por oRPC. O usuário clica e digita na janela; toda prova atravessa esse caminho e termina em estado observável: a tela e os arquivos do diretório de dados. Não há suíte de testes: verificação é rodar de verdade.

Carregue a skill **agent-browser** antes de dirigir. Rode os comandos a partir da raiz do repositório:

```sh
CONTROL=.agents/skills/verify-mimo/scripts/control-mimo
```

## Launch

```sh
$CONTROL launch
$CONTROL doctor
```

- O `launch` roda `electron-vite dev` em `apps/desktop`, o mesmo comando de `bun run dev`, com `REMOTE_DEBUGGING_PORT` numa porta livre entre 9340 e 9399. É essa variável que faz o electron-vite abrir o CDP.
- Os dados ficam num sandbox em `.verify/runs/<UTC>/data` (`MIMO_DATA_DIR`). O `.data-desktop` do dev e o `~/.mimo` real não são tocados. O helper recusa `--data` apontado para `~/.mimo`.
- O HOME também é sandbox (`.verify/runs/<UTC>/home`), com `XDG_CONFIG_HOME` dentro dele: o perfil do Electron e o `localStorage` nascem vazios a cada execução. As credenciais (`.codex/auth.json` e `.local/share/opencode/auth.json`) entram como symlink para as reais: o app lê a chave real, e qualquer escrita troca o symlink por um arquivo dentro do run dir. O `~/.mimo/.env` (chaves do Gmail) entra do mesmo jeito, quando existe. Nunca digite uma chave real numa verificação.
- Por isso duas instâncias convivem: o app de dev do usuário (`bun run dev`) e a instância da verificação têm porta, dados e perfil próprios. O helper mantém uma instância de verificação por checkout e recusa um segundo `launch`.
- Pronto significa: o log tem `DevTools listening` e a árvore de acessibilidade tem `complementary "Bots"`. O `launch` espera até 90 s por isso.
- Um sandbox novo não tem bots: a primeira tela pede o nome do primeiro bot. Para reusar dados entre duas execuções (persistência), use `$CONTROL launch --data <dir>` com o `data` de um run anterior.
- A janela abre de verdade no desktop do usuário. Não mexa nela à mão durante a execução.

Se o app não subir, o `launch` imprime o fim de `app.log`. Conserte a precondição antes de gerar prova.

## Doctor

`$CONTROL doctor` é somente leitura e responde "vale dirigir esta instância?":

- o processo é o que este `launch` iniciou (confere o pid e o `MIMO_DATA_DIR` dele), e a porta CDP responde;
- HEAD atual igual ao do launch;
- **main desatualizado**: o processo main não recarrega. Se algum arquivo de `apps/desktop/src/main`, `apps/desktop/src/preload`, `apps/agent/src` ou o `electron.vite.config.ts` mudou depois do launch, o doctor lista os arquivos e manda reiniciar. O renderer recarrega sozinho;
- credenciais dos provedores presentes, e se a execução escreveu alguma;
- estado do bot aberto e quantos bots existem no diretório de dados.

Rode o doctor antes de qualquer receita e de novo quando algo parecer errado.

## Drive

Harness: `agent-browser` ligado ao CDP da instância. `$CONTROL browser <args>` já passa a sessão e a porta certas.

```sh
$CONTROL browser snapshot
$CONTROL browser fill '[aria-label="Nome do novo bot"]' 'Ana'
$CONTROL browser press Enter
$CONTROL send 'responda apenas com MIMO-CHAT-OK'
$CONTROL wait 'MIMO-CHAT-OK' 30
$CONTROL capture 02-chat
```

- Use seletor CSS pelo `aria-label`: `[aria-label="Mensagem"]`, `[aria-label="Modelo"]`, `[aria-label="Sobre o bot"]`. Os interruptores de Ferramentas respondem pelo rótulo: `label[for="tool-gmail"]`.
- O que não tem `aria-label` (opções de lista, botões de texto como `Não` e `Completo`) sai do `snapshot`: clique na referência, `$CONTROL browser click @e30`. A referência muda a cada snapshot; tire um novo antes de clicar.
- `agent-browser find role|label ...` **não acha nada** nesta instância. Não use.
- `send` preenche o campo `Mensagem`, aperta Enter e só retorna quando o turno termina, imprimindo o estado final. `send --no-wait` retorna na hora; é o caminho para a Fila.
- `state` lê o estado do bot aberto no título da conversa: `parado`, `trabalhando`, `esperando aprovação` ou `falhou`. O título sai na árvore como `heading "<nome> , <estado>"`, com espaço antes da vírgula.
- `wait <regex> [seg]` procura na árvore de acessibilidade. Linhas de tool só aparecem na árvore com o Detalhe em `Completo` (veja `features/chat.md`).
- Depois que o Vite otimiza uma dependência nova, a janela pode ficar em branco com `Invalid hook call` no console. É artefato do dev server: `$CONTROL browser reload`.

## Evidence

Tudo fica em `.verify/runs/<UTC>/` (fora do git) e sobrevive ao `stop`. `$CONTROL capture <nome>` grava `<nome>.png` e `<nome>.aria.txt`. Numere os passos: `00-launch`, `01-bot-criado`, …

Padrões de prova:

- exercite o caminho real do usuário pela janela, não o router oRPC nem módulos internos;
- capture a ação e o estado resultante, não só a tela final;
- confirme efeitos colaterais onde eles vivem, no diretório de `$CONTROL data`: `bots/<id>.json` (modelo, tools, pasta), `bots/<id>/messages.json`, `bots/<id>/memory.md`, `routines.json`, `actions.jsonl`. Mensagem de sucesso sozinha não conta;
- o modelo é remoto e a redação varia: asserte tokens únicos, ids, nomes de tool e caminhos, não frases;
- Gmail, rascunhos e envios são reais. A prova padrão de aprovação é **recusar** (`Não`); envio aprovado só para endereço próprio, com assunto `VERIFICACAO ...`, e limpeza manual depois.

## Cleanup

```sh
$CONTROL stop
```

- `stop` encerra só o grupo de processos que o `launch` iniciou e fecha a sessão do agent-browser. Nunca mate por nome de processo: o app de dev do usuário também se chama `electron`.
- O run dir inteiro fica: capturas, `app.log`, `data/` e `home/`. O estado em disco do sandbox é parte da prova.
- Rode o `stop` também depois de uma tentativa que falhou, para não deixar janela nem porta presas.
- Rascunhos e e-mails enviados não são desfeitos; registre os ids e apague no Gmail.

## Helpers

`scripts/control-mimo` é executável:

| Comando | Efeito |
| --- | --- |
| `launch [--data <dir>]` | sobe o app com CDP, dados e HOME em sandbox, e registra run dir, porta, pid e HEAD |
| `doctor` | checagem somente leitura (processo, CDP, HEAD, main desatualizado, credenciais, bots) |
| `data` / `home` / `port` / `log` | imprime o diretório de dados, o HOME, a porta CDP ou o caminho do log |
| `state` | estado do bot aberto |
| `send [--no-wait] <texto>` | escreve, envia e espera o turno terminar |
| `wait <regex> [seg]` | espera o padrão na árvore de acessibilidade (padrão 180 s) |
| `capture <nome>` | grava `<nome>.png` e `<nome>.aria.txt` no run dir |
| `browser <args...>` | repassa ao `agent-browser` ligado a esta instância |
| `stop` | encerra o que o `launch` iniciou e mantém a evidência |

## Mapa de features

`features/README.md` é a fonte de verificação por feature. Leia o índice antes de dirigir e use o arquivo da feature como receita.
