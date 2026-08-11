# ADR-001 — Stack: TypeScript, monorepo pnpm, motor de regras compartilhado

- **Data:** 2026-08-10
- **Status:** aceito
- **Contexto:** §6 do [roadmap](./roadmap.md)

## Decisão

TypeScript (Node 22) num monorepo pnpm + Turborepo, com o motor de regras
isolado em `packages/rules` como pacote puro e determinístico, compartilhado
entre servidor e cliente.

## Por quê

O argumento decisivo não é preferência de linguagem: é o **motor de regras
único**. O cliente precisa saber, antes do round-trip, quais vértices estão
jogáveis e quais botões desabilitar. Isso é a mesma lógica que o servidor usa
para decidir validade.

Com um motor em TypeScript, essa lógica existe **uma vez**. Com um motor em
PHP (a alternativa Laravel + Reverb avaliada em §6.2), ela teria que ser
reescrita em TS para o navegador — duas implementações das mesmas regras,
divergindo com o tempo. Bug de regra é o risco de maior impacto do projeto
(§10); duplicar a implementação seria multiplicá-lo.

Os outros pontos contra Laravel neste caso específico: uma partida é **estado
vivo em memória**, e o modelo request/response exige um daemon separado
(Octane) que anula boa parte da conveniência do framework; e o broadcast do
Reverb é orientado a notificação, não a máquina de estados com ack.

## Consequências

- `packages/rules` não pode importar nada de `apps/`, nem builtins de Node, nem
  I/O, nem `Date`/`Math.random`. Isso é validado no CI por regra de lint
  (`eslint.config.js`), não confiado à disciplina de quem escreve.
- Toda aleatoriedade passa por um PRNG semeado com cursor no estado, o que
  torna a partida inteira reproduzível a partir do log de ações.
- A divergência entre validação de cliente e de servidor deixa de ser possível
  por construção; onde houver discordância (versão de pacote desatualizada no
  navegador), **o servidor vence**.

## Alternativas descartadas

- **Laravel + Reverb:** ver acima. Se houvesse preferência forte, o caminho
  seria Laravel só como backoffice/auth, com o servidor de jogo em Node.
- **Colyseus em vez de Socket.IO puro:** entrega rooms, sincronização por delta
  e reconexão prontos, ao custo de aderir às abstrações dele. A decisão fica
  para a Fase 2 — nada da Fase 1 depende disso. Vale o spike de 1 dia previsto
  em §11.
