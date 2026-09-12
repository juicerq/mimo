---
name: verify-mimo
description: Drive mimo-tui like a user to prove behavior end to end — launch the TUI, converse through tmux, exercise tools (Gmail, web search, routines, memory, approvals), and keep transcript evidence. Use for changes under apps/mimo, apps/agent, or scripts.
---

# Verificar o mimo-tui

O mimo-tui é uma TUI (`apps/mimo`) que roda o agente (`apps/agent`) no mesmo processo, sobre a harness Pi. Não há servidor nem porta. O usuário digita na TUI; toda prova atravessa esse caminho e termina em estado observável (transcript, arquivo no diretório de dados). Não há suíte de testes: verificação é rodar de verdade.

Rode os comandos a partir da raiz do repositório:

```sh
CONTROL=.agents/skills/verify-mimo/scripts/control-mimo
```

## Launch

Uma instância por sessão tmux: o helper recusa `launch` se a sessão tmux `mimo-verify` já existe — nunca dirija uma instância que você não iniciou.

```sh
$CONTROL launch
$CONTROL doctor
```

- Por padrão o `launch` cria um sandbox em `.verify/runs/<UTC>/data` e sobe a TUI com `MIMO_DATA_DIR` apontando para lá: bots, memória, contas e rotinas da execução não tocam `.data`. `$CONTROL data` imprime o diretório em uso.
- O `launch` também cria um HOME de sandbox em `.verify/runs/<UTC>/home` e o passa para a TUI. Os arquivos de credencial (`.codex/auth.json` e `.local/share/opencode/auth.json`) entram como symlink para os reais: a execução lê a chave real, e qualquer escrita — um `/login`, uma renovação de token — troca o symlink por um arquivo dentro do run dir. Os arquivos reais não são tocados. `$CONTROL home` imprime o diretório.
- Por isso `/login` pode ser exercitado numa verificação. Nunca digite uma chave real: o que você digitar fica em texto claro no run dir. Use um valor sentinela.
- `doctor` e `stop` avisam quando a execução escreveu credencial, e confirmam "credenciais reais intactas" quando não escreveu.
- Para reusar um diretório (por exemplo, entre duas sessões de memória) use `--data <dir>`, relativo à raiz do repo ou absoluto; `MIMO_VERIFY_DATA_DIR` faz o mesmo por ambiente. Só aponte para `.data` quando a receita exigir os dados reais: o snapshot/restore protege bots e rotinas, mas Gmail continua real.
- O modelo inicial de um bot novo vem de `MIMO_MODEL`/`MIMO_REASONING`, repassados ao `launch`. Use `MIMO_MODEL=openai-codex/gpt-5.6-luna` quando o provedor padrão estiver sem saldo.
- `launch` sobe a TUI numa sessão tmux 140x42 na raiz do repo e espera até 60 s pela lista de bots (`/new <name>`). A lista de bots é a primeira tela.
- Antes de subir, salva `bots/`, `routines.json` e `actions.jsonl` do diretório de dados em `.verify/runs/<UTC>/state-before/` e grava o HEAD em `head.txt`.

Teardown:

```sh
$CONTROL stop
$CONTROL stop --keep-state
```

`stop` envia `Ctrl+C` e mata a sessão tmux; depois restaura o estado. `--keep-state` mantém o estado para provar memória entre execuções.

Se o app não subir, leia o final do pane (`$CONTROL capture /tmp/pane.txt`) e conserte a precondição antes de gerar prova.

## Doctor

`$CONTROL doctor` é somente leitura e responde "vale dirigir esta instância?":

- sessão `mimo-verify` viva e pane em `ready`;
- diretório de dados em uso (sandbox ou reais) e HEAD atual igual ao registrado no launch (se mudou, reinicie: a instância serve o checkout antigo);
- credenciais dos provedores (`~/.local/share/opencode/auth.json` e `~/.codex/auth.json`) e `GMAIL_CLIENT_ID` no `.env.local` da raiz;
- HOME em uso e se a execução escreveu alguma credencial;
- quantas contas Gmail estão conectadas e quantas rotinas existem.

Rode o doctor antes de qualquer receita e de novo quando algo parecer errado.

## Drive

Harness: tmux e teclas literais. A TUI é um terminal; não existe automação de clique.

```sh
$CONTROL send 'que horas são?'
$CONTROL wait '⚙ current_time' 180
$CONTROL capture .verify/runs/<id>/01-chat.txt
```

- `send` digita literalmente e pressiona Enter. Ele recusa quando o bot está ocupado e só retorna quando a linha viva some (termina em `ready` ou para em `waiting`). Se o texto ficar preso no composer, ele falha com aviso em vez de deixar o próximo envio se misturar.
- Depois do `send`, o turno já terminou; use `wait` para conferir conteúdo. Para turnos disparados fora do `send` (rotina), espere o marcador com `wait`.
- O estado vem da conversa, não do rodapé: a linha viva `⠙ thinking|working|stopping|loading · <n>s` significa ocupado; `▌ ⏸ approval:` sem `⏸ approved|denied` depois significa `waiting`; sem nenhum dos dois, `ready`. Dentro de um painel, o rodapé mostra `status: loading|saving|ready` e o helper usa esse valor.
- HITL aparece como `▌ ⏸ approval: <tool>` com `1. Approve   2. Cancel`. Responda pelo composer com `1` ou `2`; o `send` retorna quando o turno retomado termina.
- A TUI abre a lista de bots. Crie com `/new <nome>` ou escolha pelo número. `/bots` volta à lista; reabrir um bot retoma o transcript. Verifique memória reiniciando e abrindo o mesmo bot, e isolamento criando outro.

## Evidence

Os artefatos ficam em `.verify/runs/<UTC>/` (fora do git) e sobrevivem ao `stop`. Capture um arquivo por passo, nomeado (`00-launch.txt`, `01-chat.txt`, …).

Padrões de prova:

- exercite o caminho real do usuário pela TUI, não módulos internos nem atalhos;
- capture a ação e o estado resultante, não só a tela final;
- confirme efeitos colaterais onde eles vivem: `routines.json`, `bots/<id>/memory.md` e `actions.jsonl` no diretório de `$CONTROL data`; mensagem de sucesso sozinha não conta;
- o modelo é remoto e a redação varia: asserte tokens únicos, ids, nomes de tool e caminhos, não frases;
- Gmail, rascunhos e envios são reais. A prova padrão de aprovação é **recusar**; envio aprovado só para endereço próprio, com assunto identificável (`VERIFICACAO ...`), e limpeza manual depois.

## Cleanup

```sh
$CONTROL stop
```

- `stop` mata somente a sessão tmux do `launch` e restaura `bots/`, `routines.json` e `actions.jsonl` do snapshot.
- Com o sandbox padrão, os dados reais em `.data` não são tocados; o restore age no diretório da execução. Se o `launch` apontou para os dados reais, o restore devolve o snapshot — mas rascunhos e envios de Gmail continuam reais.
- Antes de restaurar, o estado atual é copiado para `.verify/runs/<id>/state-after/`: o efeito colateral vira prova.
- `stop --keep-state` não restaura; `$CONTROL restore [run-dir]` restaura um snapshot específico (padrão: o da execução atual).
- Rascunhos e e-mails enviados não são restaurados; registre os ids e apague no Gmail.
- Rode o `stop` também depois de uma tentativa que falhou, para não deixar sessão tmux pendurada.
- Nunca mate por nome de processo; encerre o que o `launch` iniciou.

## Helpers

`scripts/control-mimo` é executável e imprime a saída em stdout:

| Comando | Efeito |
| --- | --- |
| `launch [--data <dir>]` | sobe a TUI em tmux com sandbox de dados e de HOME, registra o run dir e o HEAD |
| `doctor` | checagem somente leitura (sessão, pane, dados, HEAD, credenciais, contas, rotinas) |
| `data` | imprime o diretório de dados da execução atual |
| `home` | imprime o HOME de sandbox da execução atual |
| `send <texto>` | digita, envia e espera o turno terminar (recusa se ocupado) |
| `wait <regex> [s]` | espera o padrão no pane (padrão 180 s) |
| `capture <arquivo>` | salva o pane atual |
| `stop [--keep-state]` | encerra e restaura (ou mantém) o estado |
| `restore [run-dir]` | restaura o snapshot de um run |

## Mapa de features

`features/README.md` é a fonte de verificação por feature: conversa, modelos, busca na web, Gmail, rotinas e memória. Leia o índice antes de dirigir e use o arquivo da feature como receita.
