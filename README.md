# Ilhavera

Jogo de tabuleiro multiplayer de colonização por hexágonos, jogável pelo
navegador, para partidas privadas entre amigos.

**Estado atual: Fases 0 e 1 concluídas; Fase 2 em andamento.** O motor de regras
está completo e testado, e já dá para jogar uma partida inteira pelo terminal —
do sorteio do tabuleiro à vitória por 10 pontos. O servidor existe como
esqueleto (sobe, responde `/health`, aceita sockets) e ainda não conhece o
motor: salas e partida em rede são os próximos marcos. Interface gráfica é a
Fase 3.

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
```

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
apps/server/            Fastify + Socket.IO — servidor autoritativo (Fase 2)
apps/cli/               partida hot-seat no terminal
docs/                   roadmap, ADRs, schema do banco
```

O motor é o coração do projeto e roda nos dois lados: no servidor decide o que
é válido, no navegador destaca as jogadas possíveis antes do round-trip.
Quando os dois discordam, **o servidor vence**.

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
  em busca dos segredos dos outros.

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
