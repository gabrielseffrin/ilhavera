# Ilhavera

Jogo de tabuleiro multiplayer de colonização por hexágonos, jogável pelo
navegador, para partidas privadas entre amigos.

**Estado atual: Fases 0 a 5 entregues.** Dá para jogar de verdade: três ou
quatro pessoas em máquinas diferentes entram numa sala por código e jogam do
sorteio do tabuleiro à vitória por 10 pontos, com comércio entre jogadores,
conversa na sala e reconexão — quem fecha a aba volta e continua de onde parou.
Quem some de vez também não trava a mesa, se o anfitrião tiver ligado o relógio
de turno.

A partida é jogável **só pelo teclado**, cada jogador tem uma forma própria além
da cor, e o fim mostra de onde veio cada ponto de cada um.

Falta o playtest de usabilidade que fecha a Fase 5 — e o deploy (Fase 6).

Especificação completa em [`docs/roadmap.md`](docs/roadmap.md).

---

## Começar

Só é preciso ter Docker. Nada mais é instalado na máquina — nem Node, nem pnpm.

```bash
make up          # sobe app + postgres + redis e instala as dependências
make test        # roda a suíte inteira
make demo        # assiste a uma partida completa se jogando sozinha
make play        # joga uma partida hot-seat no terminal
make dev         # servidor de jogo em watch, na porta 3000
make web         # cliente no navegador, na porta 5173
```

Para jogar em rede são dois terminais: `make dev` e `make web`. Depois,
`http://localhost:5173` em três abas — a primeira cria a sala, as outras entram
pelo código de seis caracteres, e o anfitrião começa.

Para mexer na interface sem servidor ao lado, `make web-hotseat`: o motor roda
no próprio navegador e a partida acontece na mesma tela, uma pessoa por vez.

Sem `make`, os mesmos comandos:

```bash
docker compose up -d --build
docker compose exec app pnpm install
docker compose exec app pnpm test
docker compose exec app pnpm play
```

## Como está organizado

```
packages/rules/      ⭐ motor de regras: puro, determinístico, sem I/O
packages/protocol/      esquemas dos comandos/eventos de rede
apps/server/            Fastify + Socket.IO — servidor autoritativo
apps/web/               React + Vite — o tabuleiro e a HUD no navegador
apps/cli/               partida hot-seat no terminal
docs/                   roadmap, ADRs, schema do banco
```

O motor é o coração do projeto. No servidor ele decide o que é válido; no
navegador ele roda só no hot-seat, para desenvolver sem servidor ao lado. Em
rede o cliente **não tem motor**: recebe o estado e a lista de jogadas legais
prontos, porque enumerar exige informação que a projeção esconde de propósito —
saber se o parceiro pode pagar uma troca, por exemplo.

Três restrições sustentam isso, e todas são verificadas pelo CI:

1. `packages/rules` não importa nada de `apps/`, nenhum builtin de Node, nenhum
   I/O, e não usa `Date` nem `Math.random`. É regra de lint, não combinado.
2. Toda aleatoriedade vem de um PRNG semeado cujo cursor mora no estado. Uma
   partida inteira se reproduz a partir da semente + o log de ações.
3. Nenhum estado vai para o cliente sem passar por `toClientView`, que remove a
   mão dos adversários, o baralho e as cartas de Ponto de Vitória alheias —
   inclusive filtrando o **log de eventos**, que é onde o vazamento costuma
   escapar.

## Testes

```bash
make test        # unitários + propriedade (tier rápido) — ~1 min
make coverage    # com relatório de cobertura (falha abaixo de 90% no rules)
make heavy       # 10.000 partidas aleatórias — critério de aceite da Fase 1
```

A suíte tem quatro camadas, na ordem em que pegam problema:

- **unitários** — cada ação, caso feliz e todas as rejeições, mais os casos de
  borda catalogados no roadmap (banco esgotado com vários beneficiários,
  estrada quebrada por assentamento adversário, empate no desempate de bônus,
  Monopólio sem ninguém ter o recurso, vitória por carta de PV oculta...);
- **propriedade** — milhares de partidas jogadas com ações aleatórias legais,
  com os invariantes checados **após cada ação**: conservação de 95 cartas,
  25 Cartas de Progresso, limites de peças, regra de distância, nenhum recurso
  negativo;
- **replay** — o log reexecutado com a mesma semente reproduz o estado idêntico,
  em qualquer ponto da partida, não só no fim;
- **segurança de informação** — a visão de um jogador é varrida recursivamente
  em busca dos segredos dos outros. Inclui o placar final, que é a única coisa
  que **deixa** de ser oculta: o teste cobre os dois lados, porque provar só que
  ele não vaza antes passaria mesmo se ele nunca aparecesse.

Duas coisas a suíte não alcança, e estão ditas assim no roadmap em vez de
fingidas por um teste: **layout** (o jsdom não faz layout nem avalia
`@media (orientation: …)`) e **som** (se o timbre ficou bom, alguém precisa
ouvir).

## Jogar pelo terminal

`make play` abre uma partida hot-seat. O menu é montado a partir das ações que
o motor considera legais naquele instante, então não dá para tentar uma jogada
inválida por acidente — qualquer rejeição que apareça é bug de regra de
verdade, e é para isso que a CLI existe já na Fase 1.

Durante a partida: `l` mostra o log completo, `s` salva o replay, `q` sai. Um
replay salvo pode ser recarregado no início de outra sessão, o que reproduz a
partida ação por ação — o mecanismo de reprodução de bug que o roadmap pede.

## Propriedade intelectual

As mecânicas de jogos de tabuleiro não são protegidas por direito autoral; a
marca, a arte e os textos das cartas são. Este projeto usa nome, terminologia
e (futuramente) arte próprios, e é privado, sem distribuição comercial. Ver §2
do roadmap.
