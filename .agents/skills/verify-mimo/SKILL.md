---
name: verify-mimo
description: Drive mimo-tui like a user to prove behavior end to end — launch the TUI against a local eve agent, converse through tmux, exercise tools (Gmail, web search, routines, memory, approvals), and keep transcript evidence. Use for changes under apps/mimo, apps/agent, or scripts/dev.ts.
---

# Verificar o mimo-tui

O mimo-tui é uma TUI (`apps/mimo`) conversando com um agente eve (`apps/agent`) por HTTP em `http://127.0.0.1:2000`. O usuário digita na TUI; toda prova atravessa esse caminho e termina em estado observável (transcript, arquivo em `apps/agent/.data`, log). Não há suíte de testes: verificação é rodar de verdade.

Rode os comandos a partir da raiz do repositório:

```sh
CONTROL=.agents/skills/verify-mimo/scripts/control-mimo
```

## Launch

Uma instância por vez. A porta 2000 e `apps/agent/.data` são fixos, então o helper recusa `launch` se a sessão tmux `mimo-verify` existe ou se há agente respondendo — nunca dirija uma instância que você não iniciou.

```sh
$CONTROL launch
$CONTROL doctor
```

- `launch` sobe `bun run dev` numa sessão tmux 140x42 na raiz do repo e espera até 150 s pelo estado `pronto` na linha `mimo · <url> · pronto`. `bun run dev` sobe o agente, espera o health e só então abre a TUI.
- Antes de subir, salva `apps/agent/.data/routines.json` e `apps/agent/.data/memory/` em `.verify/runs/<UTC>/state-before/` e grava o HEAD em `head.txt`; ao final, também grava o PID do listener em `agent.pid`.
- O log do agente fica em `apps/agent/.eve/dev-server.log`.

Teardown:

```sh
$CONTROL stop
$CONTROL stop --keep-state
```

`stop` envia `Ctrl+C`, mata a sessão tmux e, se preciso, só o processo registrado no launch; depois restaura o estado. `--keep-state` mantém o estado para provar memória entre sessões.

Se o app não subir, a primeira coisa é ler `$CONTROL log` e o final do pane (`$CONTROL capture /tmp/pane.txt`); conserte a precondição antes de gerar prova.

## Doctor

`$CONTROL doctor` é somente leitura e responde "vale dirigir esta instância?":

- sessão `mimo-verify` viva e pane em `pronto`;
- `GET /eve/v1/health` respondendo;
- HEAD atual igual ao registrado no launch (se mudou, reinicie: a instância serve o checkout antigo);
- chave do modelo presente (`OPENCODE_API_KEY` no `.env.local` ou `~/.local/share/opencode/auth.json`) e `GMAIL_CLIENT_ID` no `.env.local`;
- quantas contas Gmail estão conectadas e quantas rotinas existem.

Rode o doctor antes de qualquer receita e de novo quando algo parecer errado.

## Drive

Harness: tmux e teclas literais. A TUI é um terminal; não existe automação de clique.

```sh
$CONTROL send 'que horas são?'
$CONTROL wait '⚙ current_time' 180
$CONTROL capture .verify/runs/<id>/01-chat.txt
```

- `send` digita literalmente e pressiona Enter. Ele recusa quando o status está `pensando` ou `conectando` e só retorna quando o turno sai de `pensando` (termina em `pronto`, para em `aguardando resposta` ou falha em `erro`). Se o texto ficar preso no composer, ele falha com aviso em vez de deixar o próximo envio se misturar.
- Depois do `send`, o turno já terminou; use `wait` para conferir conteúdo (a espera casa na hora). Para turnos disparados fora do `send` (rotina), espere o marcador com `wait`.
- Estados do status: `conectando`, `pronto`, `pensando`, `aguardando resposta`, `cancelado`, `erro`, `offline`.
- HITL aparece como `⏸ aprovação: <tool>` ou como pergunta com opções. Responda pelo composer com número, id, rótulo ou texto livre (`1` aprova, `2` cancela); o `send` retorna quando o turno retomado termina.
- Cada abertura da TUI é uma conversa nova; é assim que se prova memória entre sessões.

## Evidence

Os artefatos ficam em `.verify/runs/<UTC>/` (fora do git) e sobrevivem ao `stop`. Capture um arquivo por passo, nomeado (`00-launch.txt`, `01-chat.txt`, …).

Padrões de prova:

- exercite o caminho real do usuário pela TUI, não endpoints internos nem atalhos;
- capture a ação e o estado resultante, não só a tela final;
- confirme efeitos colaterais onde eles vivem: `apps/agent/.data/routines.json`, `apps/agent/.data/memory/*.md`, log do agente; mensagem de sucesso sozinha não conta;
- o modelo é remoto e a redação varia: asserte tokens únicos, ids, nomes de tool e caminhos, não frases;
- Gmail, rascunhos e envios são reais. A prova padrão de aprovação é **recusar**; envio aprovado só para endereço próprio, com assunto identificável (`VERIFICACAO ...`), e limpeza manual depois.

## Cleanup

```sh
$CONTROL stop
```

- `stop` mata somente o que o `launch` criou e restaura `routines.json`/`memory/` do snapshot. Se ainda houver um listener que ele não consegue identificar como seu, ele para e avisa em vez de matar.
- Antes de restaurar, o estado atual é copiado para `.verify/runs/<id>/state-after/`: o efeito colateral vira prova.
- `stop --keep-state` não restaura; `$CONTROL restore [run-dir]` restaura um snapshot específico (padrão: o da execução atual).
- Rascunhos e e-mails enviados não são restaurados; registre os ids e apague no Gmail.
- Rode o `stop` também depois de uma tentativa que falhou, para não deixar instância nem porta ocupada.
- Nunca mate por nome de processo; encerre o que o `launch` iniciou.

## Helpers

`scripts/control-mimo` é executável e imprime a saída em stdout:

| Comando | Efeito |
| --- | --- |
| `launch` | sobe a instância em tmux, registra o run dir e o HEAD |
| `doctor` | checagem somente leitura (sessão, health, HEAD, env, contas, rotinas) |
| `send <texto>` | digita, envia e espera o turno terminar (recusa se ocupado) |
| `wait <regex> [s]` | espera o padrão no pane (padrão 180 s) |
| `capture <arquivo>` | salva o pane atual |
| `log [n]` | últimos n (padrão 40) do log do agente |
| `stop [--keep-state]` | encerra e restaura (ou mantém) o estado |
| `restore [run-dir]` | restaura o snapshot de um run |

## Mapa de features

`features/README.md` é a fonte de verificação por feature: conversa, busca na web, Gmail, rotinas e memória. Leia o índice antes de dirigir e use o arquivo da feature como receita.
