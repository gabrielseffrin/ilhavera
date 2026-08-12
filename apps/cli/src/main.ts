/**
 * Partida hot-seat no terminal — entrega jogável da Fase 1 (§9 do roadmap).
 *
 * Aqui vive TODO o I/O: leitura do teclado, escrita em disco, aleatoriedade de
 * semente. O `@ilhavera/rules` continua puro do outro lado da fronteira, e é
 * essa separação que a regra de lint de import boundaries protege.
 *
 * O objetivo desta CLI não é ser bonita: é jogar uma partida completa, do setup
 * à vitória, com todas as regras, antes de existir uma linha de UI — e poder
 * salvar o log para reproduzir qualquer bug encontrado.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { argv, exit, stdin, stdout } from 'node:process';

import {
  RESOURCES,
  RESOURCE_LABELS,
  createGame,
  emptyResourceCount,
  enumerateLegalActions,
  reduce,
  rng,
  victoryPoints,
  type Action,
  type GameState,
  type PlayerColor,
  type PlayerId,
  type ResourceCount,
} from '@ilhavera/rules';

import { EndOfInputError, LineReader } from './input.js';
import { describeEvent } from './events.js';
import { describeAction, groupActions, ACTION_GROUP_LABELS } from './menu.js';
import { renderBank, renderBoard, renderHand, renderScoreboard, playerTag } from './render.js';

const CORES: PlayerColor[] = ['red', 'blue', 'white', 'orange'];

type Replay = {
  seed: string;
  players: { id: PlayerId; name: string; color: PlayerColor }[];
  actions: Action[];
};

type Sessao = {
  state: GameState;
  actions: Action[];
  players: { id: PlayerId; name: string; color: PlayerColor }[];
};

async function main(): Promise<void> {
  console.log('\n=== ILHAVERA — partida hot-seat no terminal ===\n');

  const demo = argv.indexOf('--demo');
  if (demo >= 0) {
    await autoJogar(argv[demo + 1] ?? 'demo');
    return;
  }

  const rl = new LineReader(stdin, stdout);
  try {
    const sessao = await iniciarSessao(rl);
    await jogar(rl, sessao);
  } catch (erro) {
    if (erro instanceof EndOfInputError) {
      console.log('\nEntrada encerrada.');
      rl.close();
      exit(0);
    }
    throw erro;
  } finally {
    rl.close();
  }
}

/**
 * Autojogo: joga uma partida inteira sozinho, escolhendo entre as ações legais
 * com o mesmo PRNG semeado do motor. Não é bot nem IA — é o caminho de código
 * completo da CLI (render, menu, log, fim de partida) exercitado de ponta a
 * ponta de forma reproduzível, sem depender de alguém digitando 400 turnos.
 */
async function autoJogar(seed: string): Promise<void> {
  const players = CORES.slice(0, 4).map((color, i) => ({
    id: `p${i}`,
    name: `Jogador ${i + 1}`,
    color,
  }));

  let state = createGame({ id: `demo-${seed}`, seed, players });
  let cursor = 0;
  let passos = 0;
  let jaMostrado = 0;

  console.log(`Autojogo com semente "${seed}".\n`);

  while (state.phase !== 'finished' && passos < 5000) {
    const ator = atorDaVez(state);
    const legais = enumerateLegalActions(state, ator, {
      includeTradeOffers: state.phase === 'main',
    });
    if (legais.length === 0) {
      throw new Error(`sem ações legais para ${ator} na fase ${state.phase} — bug do motor`);
    }

    const escolha = escolherPonderado(legais, seed, cursor);
    cursor = escolha.cursor;
    const acao = escolha.action;

    const resultado = reduce(state, acao);
    if (!resultado.ok) {
      throw new Error(`ação legal rejeitada: ${acao.type} → ${resultado.error}`);
    }
    state = resultado.state;
    passos++;

    // Mostra o tabuleiro de tempos em tempos, para dar o que ver.
    if (passos % 150 === 0) {
      console.log(renderBoard(state));
      console.log(renderScoreboard(state));
      console.log('');
    }
    for (const evento of state.log.slice(jaMostrado)) {
      if (evento.type === 'diceRolled' || evento.type === 'resourcesProduced') continue;
      console.log(`  · ${describeEvent(state, evento)}`);
    }
    jaMostrado = state.log.length;
  }

  console.log('');
  console.log(renderBoard(state));
  mostrarFim(state);
  console.log(`Ações aplicadas: ${passos}`);
  if (state.phase !== 'finished') {
    throw new Error('a partida não terminou dentro do limite de passos');
  }
}

async function iniciarSessao(rl: LineReader): Promise<Sessao> {
  const arquivo = (await rl.question('Carregar replay de um arquivo? (caminho ou vazio) ')).trim();
  if (arquivo !== '') return carregarReplay(arquivo);

  const quantidade = await perguntarNumero(rl, 'Quantos jogadores? (3 ou 4) ', 3, 4, 4);

  const players: Sessao['players'] = [];
  for (let i = 0; i < quantidade; i++) {
    const nome = (await rl.question(`Nome do jogador ${i + 1}: `)).trim();
    players.push({
      id: `p${i}`,
      name: nome === '' ? `Jogador ${i + 1}` : nome,
      color: CORES[i] as PlayerColor,
    });
  }

  const seedInformada = (await rl.question('Semente (vazio = aleatória): ')).trim();
  // A aleatoriedade vive AQUI, no mundo externo. O motor só recebe a semente
  // já decidida — é o que mantém a partida reproduzível.
  const seed = seedInformada === '' ? `${Date.now().toString(36)}` : seedInformada;

  const modo = (await rl.question('Tabuleiro equilibrado (6/8 não adjacentes)? [S/n] ')).trim();
  const boardMode = modo.toLowerCase() === 'n' ? 'random' : 'balanced';

  console.log(`\nSemente desta partida: ${seed}\n`);

  return {
    state: createGame({ id: `cli-${seed}`, seed, players, settings: { boardMode } }),
    actions: [],
    players,
  };
}

async function carregarReplay(caminho: string): Promise<Sessao> {
  const bruto = await readFile(caminho, 'utf8');
  const replay = JSON.parse(bruto) as Replay;

  let state = createGame({
    id: `cli-${replay.seed}`,
    seed: replay.seed,
    players: replay.players,
  });

  for (const action of replay.actions) {
    const resultado = reduce(state, action);
    if (!resultado.ok) {
      throw new Error(`replay divergiu na ação ${action.type}: ${resultado.error}`);
    }
    state = resultado.state;
  }

  console.log(`\nReplay carregado: ${replay.actions.length} ações reproduzidas.`);
  console.log(`Semente: ${replay.seed}\n`);
  return { state, actions: [...replay.actions], players: replay.players };
}

async function jogar(rl: LineReader, sessao: Sessao): Promise<void> {
  let ultimoLogMostrado = sessao.state.log.length;

  while (sessao.state.phase !== 'finished') {
    const state = sessao.state;
    const ator = atorDaVez(state);

    mostrarTela(state, ator, ultimoLogMostrado);
    ultimoLogMostrado = state.log.length;

    const acao = await escolherAcao(rl, state, ator);
    if (acao === 'sair') {
      console.log('\nPartida encerrada pelo jogador.');
      return;
    }
    if (acao === 'salvar') {
      await salvar(rl, sessao);
      ultimoLogMostrado = state.log.length;
      continue;
    }
    if (acao === 'log') {
      mostrarLogCompleto(state);
      ultimoLogMostrado = state.log.length;
      continue;
    }

    const resultado = reduce(state, acao);
    if (!resultado.ok) {
      // Não deveria acontecer: o menu só oferece jogada legal. Se aparecer,
      // é divergência entre enumerar e validar — ou seja, bug de regra.
      console.log(`\n⚠ AÇÃO REJEITADA: ${resultado.error} — isso é um bug do motor.\n`);
      continue;
    }

    sessao.state = resultado.state;
    sessao.actions.push(acao);
  }

  mostrarFim(sessao.state);
  await ofertaDeSalvar(rl, sessao);
}

/**
 * Peso por **tipo** de ação. Sortear uniformemente entre os candidatos faria
 * as ~20 propostas de troca possíveis afogarem as jogadas que fazem a partida
 * andar, e o autojogo nunca chegaria a 10 PV.
 */
const PESOS: Partial<Record<Action['type'], number>> = {
  endTurn: 8,
  placeSettlement: 30,
  buildCity: 40,
  placeRoad: 20,
  buyDevCard: 18,
  tradeBank: 10,
  tradeOffer: 4,
  tradeRespond: 40,
  tradeConfirm: 40,
};

function escolherPonderado(
  acoes: Action[],
  seed: string,
  cursor: number,
): { action: Action; cursor: number } {
  const porTipo = new Map<Action['type'], Action[]>();
  for (const acao of acoes) {
    const lista = porTipo.get(acao.type);
    if (lista === undefined) porTipo.set(acao.type, [acao]);
    else lista.push(acao);
  }

  const tipos = [...porTipo.keys()].sort();
  let total = 0;
  const pesos = tipos.map((t) => {
    const p = PESOS[t] ?? 15;
    total += p;
    return p;
  });

  const sorteioTipo = rng.randomInt(seed, cursor, total);
  let acumulado = 0;
  let tipoEscolhido = tipos[tipos.length - 1] as Action['type'];
  for (let i = 0; i < tipos.length; i++) {
    acumulado += pesos[i] as number;
    if (sorteioTipo.value < acumulado) {
      tipoEscolhido = tipos[i] as Action['type'];
      break;
    }
  }

  const candidatos = porTipo.get(tipoEscolhido) as Action[];
  const sorteio = rng.randomInt(seed, sorteioTipo.cursor, candidatos.length);
  return { action: candidatos[sorteio.value] as Action, cursor: sorteio.cursor };
}

/**
 * De quem é a vez de agir. No descarte, quem age é qualquer jogador com
 * pendência — não o jogador do turno.
 */
function atorDaVez(state: GameState): PlayerId {
  if (state.phase === 'discarding') {
    const pendentes = Object.keys(state.pendingDiscards);
    if (pendentes.length > 0) return pendentes[0] as PlayerId;
  }

  const trade = state.activeTrade;
  if (trade !== null && state.phase === 'main') {
    const semResposta = trade.targets.filter((t) => trade.responses[t] === undefined);
    if (semResposta.length > 0) return semResposta[0] as PlayerId;
  }

  return (state.players[state.currentPlayerIndex] as { id: PlayerId }).id;
}

function mostrarTela(state: GameState, ator: PlayerId, desdeLog: number): void {
  console.log('\n' + '─'.repeat(78));
  console.log(renderBoard(state));
  console.log('─'.repeat(78));
  console.log(renderScoreboard(state));
  console.log(`Banco: ${renderBank(state)}   Baralho: ${state.devDeck.length} cartas`);

  const novos = state.log.slice(desdeLog);
  if (novos.length > 0) {
    console.log('');
    for (const evento of novos) console.log(`  · ${describeEvent(state, evento)}`);
  }

  console.log('');
  console.log(`Vez de ${playerTag(state, ator)}  [${nomeFase(state)}]`);
  console.log(renderHand(state, ator));
}

function nomeFase(state: GameState): string {
  switch (state.phase) {
    case 'setup1':
      return `preparação — rodada 1 (${state.setupStep === 'settlement' ? 'assentamento' : 'estrada'})`;
    case 'setup2':
      return `preparação — rodada 2 (${state.setupStep === 'settlement' ? 'assentamento' : 'estrada'})`;
    case 'awaitingRoll':
      return 'aguardando rolagem';
    case 'discarding':
      return 'descarte obrigatório';
    case 'movingRobber':
      return 'mover o Saqueador';
    case 'main':
      return `turno ${state.turnNumber}`;
    default:
      return state.phase;
  }
}

async function escolherAcao(
  rl: LineReader,
  state: GameState,
  ator: PlayerId,
): Promise<Action | 'sair' | 'salvar' | 'log'> {
  // O descarte tem prompt próprio: enumerar todas as combinações possíveis de
  // uma mão de 15 cartas não faz sentido.
  if (state.phase === 'discarding') {
    const acao = await perguntarDescarte(rl, state, ator);
    if (acao !== null) return acao;
  }

  const grupos = groupActions(
    enumerateLegalActions(state, ator, { includeTradeOffers: state.phase === 'main' }),
  );

  if (grupos.length === 0) {
    throw new Error(`estado sem ações legais para ${ator} na fase ${state.phase} — bug do motor`);
  }

  console.log('');
  grupos.forEach((grupo, i) => {
    const quantidade = grupo.actions.length > 1 ? ` (${grupo.actions.length} opções)` : '';
    console.log(`  ${i + 1}. ${ACTION_GROUP_LABELS[grupo.type]}${quantidade}`);
  });
  console.log('  l. ver o log completo    s. salvar replay    q. sair');

  while (true) {
    const escolha = (await rl.question('> ')).trim().toLowerCase();
    if (escolha === 'q') return 'sair';
    if (escolha === 's') return 'salvar';
    if (escolha === 'l') return 'log';

    const indice = Number(escolha) - 1;
    const grupo = grupos[indice];
    if (grupo === undefined) {
      console.log('Opção inválida.');
      continue;
    }
    if (grupo.actions.length === 1) return grupo.actions[0] as Action;
    return escolherAlvo(rl, state, grupo.actions);
  }
}

async function escolherAlvo(rl: LineReader, state: GameState, acoes: Action[]): Promise<Action> {
  console.log('');
  acoes.forEach((acao, i) => {
    console.log(`   ${i + 1}. ${describeAction(state, acao)}`);
  });

  while (true) {
    const escolha = (await rl.question('   alvo > ')).trim();
    const acao = acoes[Number(escolha) - 1];
    if (acao !== undefined) return acao;
    console.log('   Opção inválida.');
  }
}

/** Prompt dedicado de descarte: o jogador monta as cartas que vai devolver. */
async function perguntarDescarte(
  rl: LineReader,
  state: GameState,
  ator: PlayerId,
): Promise<Action | null> {
  const total = state.pendingDiscards[ator];
  if (total === undefined) return null;

  const player = state.players.find((p) => p.id === ator);
  if (player === undefined) return null;

  console.log(`\n  Você precisa descartar ${total} carta(s).`);
  console.log('  Digite quantas de cada recurso, ou "auto" para descartar dos mais abundantes.');

  while (true) {
    const linha = (
      await rl.question(
        `  [${RESOURCES.map((r) => `${RESOURCE_LABELS[r]} ${player.resources[r]}`).join(' | ')}] > `,
      )
    )
      .trim()
      .toLowerCase();

    if (linha === 'auto') return descarteAutomatico(state, ator, total);

    const resources = emptyResourceCount();
    const partes = linha.split(/\s+/).filter((p) => p !== '');
    let ok = partes.length > 0;
    for (const parte of partes) {
      const [nome, quantidade] = parte.split(':');
      const recurso = RESOURCES.find(
        (r) => RESOURCE_LABELS[r].toLowerCase().startsWith(nome ?? '') || r === nome,
      );
      const n = Number(quantidade);
      if (recurso === undefined || !Number.isInteger(n) || n < 0) {
        ok = false;
        break;
      }
      resources[recurso] += n;
    }

    const soma = RESOURCES.reduce((sum, r) => sum + resources[r], 0);
    if (!ok || soma !== total) {
      console.log(`  Formato: "madeira:2 lã:1" somando exatamente ${total}. Ou "auto".`);
      continue;
    }
    if (RESOURCES.some((r) => resources[r] > player.resources[r])) {
      console.log('  Você não tem essas cartas.');
      continue;
    }
    return { type: 'discard', player: ator, resources };
  }
}

function descarteAutomatico(state: GameState, ator: PlayerId, total: number): Action {
  const player = state.players.find((p) => p.id === ator);
  const resources: ResourceCount = emptyResourceCount();
  if (player === undefined) return { type: 'discard', player: ator, resources };

  let restante = total;
  const ordem = [...RESOURCES].sort((a, b) => player.resources[b] - player.resources[a]);
  for (const r of ordem) {
    const pega = Math.min(restante, player.resources[r]);
    resources[r] = pega;
    restante -= pega;
    if (restante === 0) break;
  }
  return { type: 'discard', player: ator, resources };
}

function mostrarLogCompleto(state: GameState): void {
  console.log('\n=== LOG DA PARTIDA ===');
  state.log.forEach((evento, i) => {
    console.log(`  ${String(i + 1).padStart(3)}. ${describeEvent(state, evento)}`);
  });
  console.log('======================\n');
}

async function salvar(rl: LineReader, sessao: Sessao): Promise<void> {
  const caminho = (await rl.question('Salvar em qual arquivo? ')).trim();
  if (caminho === '') return;

  const replay: Replay = {
    seed: sessao.state.seed,
    players: sessao.players,
    actions: sessao.actions,
  };
  await writeFile(caminho, JSON.stringify(replay, null, 2), 'utf8');
  console.log(`Replay salvo em ${caminho} (${sessao.actions.length} ações).`);
}

async function ofertaDeSalvar(rl: LineReader, sessao: Sessao): Promise<void> {
  const resposta = (await rl.question('Salvar o replay desta partida? (caminho ou vazio) ')).trim();
  if (resposta === '') return;
  const replay: Replay = {
    seed: sessao.state.seed,
    players: sessao.players,
    actions: sessao.actions,
  };
  await writeFile(resposta, JSON.stringify(replay, null, 2), 'utf8');
  console.log(`Replay salvo em ${resposta}.`);
}

function mostrarFim(state: GameState): void {
  console.log('\n' + '='.repeat(78));
  console.log('FIM DE PARTIDA');
  console.log('='.repeat(78));

  const placar = [...state.players]
    .map((p) => ({ p, pv: victoryPoints(state, p.id, true) }))
    .sort((a, b) => b.pv.total - a.pv.total);

  for (const { p, pv } of placar) {
    const detalhe =
      `assentamentos ${pv.settlements}  cidades ${pv.cities}  ` +
      `exército ${pv.largestArmy}  estrada ${pv.longestRoad}  cartas de PV ${pv.devCards}`;
    console.log(
      `  ${playerTag(state, p.id).padEnd(20)} ${String(pv.total).padStart(2)} PV   ${detalhe}`,
    );
  }

  console.log('');
  if (state.winner !== null) {
    console.log(`🏆 Vencedor: ${playerTag(state, state.winner)}`);
  }
  console.log(`Turnos jogados: ${state.turnNumber}   Semente: ${state.seed}\n`);
}

async function perguntarNumero(
  rl: LineReader,
  pergunta: string,
  min: number,
  max: number,
  padrao: number,
): Promise<number> {
  while (true) {
    const resposta = (await rl.question(pergunta)).trim();
    if (resposta === '') return padrao;
    const n = Number(resposta);
    if (Number.isInteger(n) && n >= min && n <= max) return n;
    console.log(`Informe um número entre ${min} e ${max}.`);
  }
}

await main();
