# ADR-002 — Decisões em aberto fechadas antes da Fase 0

- **Data:** 2026-08-10
- **Status:** aceito
- **Contexto:** §11 do [roadmap](./roadmap.md)

| #   | Questão                              | Decisão                     | Nota                                                                                                                                                                                         |
| --- | ------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Máximo de jogadores no MVP           | **3 a 4**, tabuleiro padrão | 19 hexágonos, 54 vértices, 72 arestas. O motor é genérico o bastante para estender depois; o tabuleiro estendido de 5–6 dobraria a superfície de teste da geração logo na fase mais crítica. |
| 2   | Colyseus vs Socket.IO                | **Socket.IO** (provisório)  | Nada da Fase 1 depende disso. Revisitar com o spike de 1 dia no começo da Fase 2.                                                                                                            |
| 3   | Nome e identidade                    | **Ilhavera**                | Escopo de pacotes `@ilhavera/*`. Nome próprio, sem relação com a marca registrada (§2).                                                                                                      |
| 4   | Hospedagem                           | em aberto                   | Decisão da Fase 6.                                                                                                                                                                           |
| 5   | Timer de turno                       | em aberto                   | Decisão da Fase 5.                                                                                                                                                                           |
| 6   | Persistência de partidas abandonadas | em aberto                   | Decisão da Fase 2, junto com o `GameRoom`.                                                                                                                                                   |

## Ambiente de desenvolvimento: tudo em container

`docker compose` sobe Node 22, Postgres 16 e Redis 7. Nenhum comando do
projeto exige nada instalado no host além do Docker — em particular, **não é
preciso instalar pnpm na máquina**.

Detalhe não óbvio: `node_modules` **não** pode viver no bind mount. O store
simlinkado do pnpm sobre VirtioFS é lento e quebra symlinks, então cada
`node_modules` do workspace tem um volume nomeado próprio (ver
`docker-compose.yml`). O código-fonte continua no bind mount, e editar no host
reflete no container na hora.

## Terminologia no código

Identificadores em inglês (`lumber`, `settlement`, `knight`), rótulos em pt-BR
isolados em `packages/rules/src/labels.ts` (`Madeira`, `Assentamento`,
`Soldado`). A Fase 5 prevê i18n com estrutura pronta para inglês; trocar de
idioma não pode significar renomear o domínio inteiro. A terminologia própria
exigida por §2 fica no que o jogador lê, que é onde ela importa.

## Desvios conscientes da estrutura de §6.3

- **`packages/config` não foi criado.** Num monorepo deste tamanho, um
  `tsconfig.base.json` e um `eslint.config.js` na raiz cumprem exatamente o
  mesmo papel, sem a ordem de instalação extra que um pacote de config traz.
- **`apps/server` e `apps/web` não foram criados.** Entram nas Fases 2 e 3;
  pastas vazias não agregam.
- **`game:playDevCard { card, params }` virou quatro ações no motor**
  (`playKnight`, `playRoadBuilding`, `playYearOfPlenty`, `playMonopoly`). Um
  union discriminado dá checagem de tipo real nos parâmetros de cada carta. O
  comando de rede continua como está em §5.1; a tradução é trabalho do
  `packages/protocol` na Fase 2.
- **`enumerateLegalActions` foi acrescentado** ao motor. Não está no roadmap,
  mas alimenta de uma vez o driver dos testes de propriedade, o menu da CLI e
  o destaque de jogadas válidas do cliente na Fase 3 — reaproveitando a mesma
  validação do reducer, sem uma segunda implementação para divergir.
