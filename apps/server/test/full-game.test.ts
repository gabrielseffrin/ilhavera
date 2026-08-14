/**
 * O aceite da Fase 2: clientes de teste jogam uma **partida completa** por
 * WebSocket, do `room:start` até haver um vencedor.
 *
 * Nada aqui toca no motor: toda jogada sai de um socket e volta como ack, e a
 * escolha da próxima sai da lista de legais que o **servidor** mandou no
 * `state:snapshot`/`state:patch` — exatamente como o cliente da Fase 4 joga. O
 * estado do servidor só é lido para saber quando a partida acabou.
 *
 * Isso faz do aceite da Fase 2 também o teste mais forte da lista de legais: se
 * ela vier errada, a partida trava ou uma jogada é recusada, e as duas coisas
 * quebram aqui.
 *
 * As jogadas são sorteadas com peso, e não uniformemente. Com peso uniforme a
 * partida encerraria turno o tempo todo e quase nunca chegaria a 10 PV — o
 * mesmo motivo que o driver de propriedade do motor documenta.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { Action, ActionType, GameState } from '@ilhavera/rules';

import { toCommand } from '@ilhavera/protocol';
import { startTestServer, type Client, type TestServer } from './helpers/server.js';
import type { GameRoom } from '../src/game/room.js';
import type { RoomView } from '../src/rooms/registry.js';

let atual: TestServer | null = null;

afterEach(async () => {
  await atual?.close();
  atual = null;
});

const PESOS: Partial<Record<ActionType, number>> = {
  endTurn: 8,
  placeSettlement: 30,
  buildCity: 40,
  placeRoad: 20,
  buyDevCard: 18,
  playKnight: 12,
  playRoadBuilding: 12,
  playYearOfPlenty: 12,
  playMonopoly: 12,
  tradeBank: 10,
  tradeOffer: 4,
  // Proposta aberta trava a mesa: precisa ser resolvida, não ficar rolando.
  tradeRespond: 40,
  tradeConfirm: 40,
};

const PESO_PADRAO = 20;

/** LCG minúsculo: as escolhas do roteiro precisam ser reproduzíveis. */
function sorteio(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Sorteia primeiro o **tipo**, depois um candidato daquele tipo.
 *
 * Pesar candidato a candidato seria o erro fácil: numa fase principal existem
 * ~40 arestas livres, 1 ou 2 cidades construíveis e dezenas de propostas de
 * comércio possíveis. Somando peso por candidato, "propor troca" afoga
 * "encerrar turno" na proporção de 40 para 1 e a partida nunca acaba — que é
 * exatamente o que acontece se este comentário for ignorado.
 */
function escolherComPeso(acoes: Action[], proximo: () => number): Action {
  const porTipo = new Map<ActionType, Action[]>();
  for (const acao of acoes) {
    const lista = porTipo.get(acao.type) ?? [];
    lista.push(acao);
    porTipo.set(acao.type, lista);
  }

  const tipos = [...porTipo.keys()];
  const total = tipos.reduce((soma, t) => soma + (PESOS[t] ?? PESO_PADRAO), 0);
  let alvo = proximo() * total;

  let escolhido = tipos[tipos.length - 1] as ActionType;
  for (const tipo of tipos) {
    alvo -= PESOS[tipo] ?? PESO_PADRAO;
    if (alvo <= 0) {
      escolhido = tipo;
      break;
    }
  }

  const candidatos = porTipo.get(escolhido) as Action[];
  return candidatos[Math.floor(proximo() * candidatos.length) % candidatos.length] as Action;
}

/**
 * Espera todos os clientes alcançarem a versão do servidor.
 *
 * O ack volta para quem jogou antes de o `state:patch` chegar aos outros, e ler
 * a lista de legais nesse intervalo daria a lista da jogada anterior. Não é
 * frescura de teste: é a mesma corrida que um cliente de verdade tem, e a
 * resposta dele também é esperar o patch em vez de adivinhar.
 */
async function aguardarSincronia(clientes: Client[], versao: number): Promise<void> {
  const limite = Date.now() + 3000;
  while (clientes.some((c) => c.versao < versao)) {
    if (Date.now() > limite) throw new Error(`clientes não alcançaram a versão ${versao}`);
    await new Promise((r) => setTimeout(r, 2));
  }
}

const MAX_PASSOS = 3000;

type Resultado = { passos: number; final: GameState; tipos: Set<ActionType> };

/** Uma partida inteira, do lobby ao vencedor, falando só por socket. */
async function jogarPartidaCompleta(semente: string, sementeDoRoteiro: number): Promise<Resultado> {
  atual = await startTestServer({ registry: { makeSeed: () => semente } });
  const s = atual;

  const host = await s.connect();
  const criada = await host.send<RoomView>('room:create', { nickname: 'Ana' });
  if (!criada.ok) throw new Error('falhou ao criar a sala');

  const porId = new Map<string, Client>();
  porId.set(host.playerId ?? '', host);
  for (const nome of ['Bruno', 'Carla']) {
    const cliente = await s.connect();
    await cliente.send('room:join', { code: criada.data.code, nickname: nome });
    porId.set(cliente.playerId ?? '', cliente);
  }

  const inicio = await host.send('room:start');
  if (!inicio.ok) throw new Error('falhou ao iniciar a partida');

  const jogo = (): GameRoom => {
    const room = s.server.rooms.byCode(criada.data.code);
    if (room?.game === null || room?.game === undefined) throw new Error('sala sem partida');
    return room.game;
  };

  const proximo = sorteio(sementeDoRoteiro);
  const tipos = new Set<ActionType>();
  let passos = 0;

  const clientes = [...porId.values()];
  await aguardarSincronia(clientes, 0);

  while (jogo().state.phase !== 'finished' && passos < MAX_PASSOS) {
    /**
     * Quem pode agir são os clientes cuja lista do servidor não está vazia — e
     * mais ninguém. Não há `quemAge` aqui: a própria lista responde a pergunta,
     * inclusive no descarte paralelo, em que vários agem ao mesmo tempo. Se o
     * servidor errasse a lista, a mesa travaria neste laço.
     */
    const comAcoes = clientes.filter((c) => c.legais.length > 0);

    if (comAcoes.length === 0) {
      throw new Error(
        `partida travada na fase ${jogo().state.phase} após ${passos} jogadas: ` +
          'nenhum cliente recebeu jogada legal',
      );
    }

    const cliente = comAcoes[Math.floor(proximo() * comAcoes.length) % comAcoes.length] as Client;
    const acao = escolherComPeso(cliente.legais, proximo);
    const { name, payload } = toCommand(acao);

    const ack = await cliente.send(name, payload);
    if (!ack.ok) {
      throw new Error(
        `jogada ${passos + 1} (${acao.type} de ${cliente.playerId ?? '?'}) recusada: ${ack.error}`,
      );
    }

    tipos.add(acao.type);
    passos += 1;

    await aguardarSincronia(clientes, passos);
  }

  const resultado = { passos, final: jogo().state, tipos };

  // Cada partida sobe o próprio servidor; fecha antes da seguinte.
  await s.close();
  atual = null;

  return resultado;
}

describe('aceite da Fase 2: partida completa por WebSocket', () => {
  it('quatro partidas vão do lobby ao vencedor, e juntas exercitam todo o protocolo', async () => {
    const sementes = ['aceite-1', 'aceite-2', 'aceite-3', 'aceite-4'];
    const exercitadas = new Set<ActionType>();

    for (const [i, semente] of sementes.entries()) {
      const { passos, final, tipos } = await jogarPartidaCompleta(semente, 20260812 + i * 7919);

      expect(final.phase, `${semente} não terminou em ${MAX_PASSOS} jogadas`).toBe('finished');
      expect(final.winner, `${semente} terminou sem vencedor`).not.toBeNull();
      // Toda jogada aceita andou a versão exatamente uma vez.
      expect(final.version).toBe(passos);
      expect(passos).toBeGreaterThan(100);

      for (const t of tipos) exercitadas.add(t);
    }

    /**
     * Nenhuma partida sozinha passa por tudo — uma pode chegar a 10 PV sem
     * construir cidade, outra sem rolar 7. Exigir a lista inteira de uma só
     * partida seria caçar semente até passar; exigir da união é o que
     * realmente prova que os treze comandos atravessam a rede.
     */
    for (const obrigatoria of [
      'rollDice',
      'endTurn',
      'placeSettlement',
      'placeRoad',
      'buildCity',
      'buyDevCard',
      'moveRobber',
      'discard',
      'tradeBank',
      'tradeOffer',
      'tradeRespond',
      'playKnight',
      'playRoadBuilding',
      'playYearOfPlenty',
      'playMonopoly',
    ] as const) {
      expect(exercitadas, `nenhuma partida exercitou ${obrigatoria}`).toContain(obrigatoria);
    }
  }, 120_000);
});
