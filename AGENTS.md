# Código

Antes de escrever ou alterar código, use o Skill tool com name `code-practices` e o Skill tool com name `codebase-design`. As duas chamadas são obrigatórias mesmo em mudanças pequenas.

# Verificação

Não crie testes por enquanto. A verificação vem de rodar a coisa de verdade e registrar a evidência no PR: o comando, a saída real e, quando houver interface, o que apareceu na tela. Todo PR tem a seção Verificação no corpo.

# Checks

`bun run check` roda oxlint, o typecheck e o knip. Corrija os defeitos e rode de novo antes da entrega. O CI roda o mesmo comando e exige árvore limpa.

# Idioma

README, CONTEXT.md, `docs/plano.md` e os corpos de PR ficam em português. Código, nomes de símbolos e mensagens de commit ficam em inglês.
