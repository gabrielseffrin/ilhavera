/**
 * Renderização em texto do tabuleiro e do painel.
 *
 * O tabuleiro é desenhado numa grade de caracteres a partir das coordenadas em
 * pixel que o `BoardGraph` já traz prontas (§4.3) — as mesmas que a Fase 3 vai
 * usar no SVG. Nada de geometria reinventada aqui.
 */

import {
  DEV_CARD_LABELS,
  RESOURCE_LABELS,
  TERRAIN_LABELS,
  RESOURCES,
  portLabel,
  victoryPoints,
  type GameState,
  type PlayerId,
  type Resource,
  type Terrain,
} from '@ilhavera/rules';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const PLAYER_COLOR_CODES: Record<string, string> = {
  red: '\x1b[31m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  orange: '\x1b[33m',
  green: '\x1b[32m',
  brown: '\x1b[35m',
};

const TERRAIN_SHORT: Record<Terrain, string> = {
  forest: 'FLO',
  hill: 'COL',
  pasture: 'PAS',
  field: 'CAM',
  mountain: 'MON',
  desert: 'DES',
};

const TERRAIN_COLOR: Record<Terrain, string> = {
  forest: '\x1b[32m',
  hill: '\x1b[31m',
  pasture: '\x1b[92m',
  field: '\x1b[33m',
  mountain: '\x1b[90m',
  desert: '\x1b[37m',
};

export function colorFor(state: GameState, playerId: PlayerId): string {
  const player = state.players.find((p) => p.id === playerId);
  return PLAYER_COLOR_CODES[player?.color ?? ''] ?? '';
}

export function playerTag(state: GameState, playerId: PlayerId): string {
  const player = state.players.find((p) => p.id === playerId);
  return `${colorFor(state, playerId)}${player?.name ?? playerId}${RESET}`;
}

/**
 * Desenha os 19 hexágonos posicionados pelas coordenadas reais. Cada hexágono
 * mostra terreno, ficha numérica e um marcador quando o Saqueador está nele.
 */
export function renderBoard(state: GameState): string {
  const cells = state.board.hexOrder.map((id) => {
    const hex = state.board.hexes[id]!;
    return { hex, x: hex.pixel.x, y: hex.pixel.y };
  });

  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));

  // Uma linha de texto por fileira de hexágonos; colunas escalonadas para
  // reproduzir o encaixe da malha.
  const rows = new Map<number, { col: number; text: string }[]>();
  for (const cell of cells) {
    const row = Math.round((cell.y - minY) / 90);
    const col = Math.round((cell.x - minX) / 52);
    const hex = cell.hex;

    const numero = hex.number === null ? '  ' : String(hex.number).padStart(2, ' ');
    const saqueador = state.robberHex === hex.id ? '☠' : ' ';
    const destaque = hex.number === 6 || hex.number === 8 ? BOLD : '';
    const text = `${TERRAIN_COLOR[hex.terrain]}${destaque}[${TERRAIN_SHORT[hex.terrain]}${numero}${saqueador}]${RESET}`;

    const list = rows.get(row);
    if (list === undefined) rows.set(row, [{ col, text }]);
    else list.push({ col, text });
  }

  const lines: string[] = [];
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    const cols = rows.get(row)!.sort((a, b) => a.col - b.col);
    const minCol = Math.min(...cols.map((c) => c.col));
    const indent = ' '.repeat(Math.round(((cols[0]!.col - minCol) / 2) * 4));
    lines.push(indent + cols.map((c) => c.text).join(' '));
  }

  // Centraliza as fileiras curtas para o desenho ficar com cara de hexágono.
  const larguraMax = Math.max(...lines.map(visibleLength));
  return lines
    .map((line) => ' '.repeat(Math.floor((larguraMax - visibleLength(line)) / 2)) + line)
    .join('\n');
}

function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function renderHand(state: GameState, playerId: PlayerId): string {
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return '';

  const recursos = RESOURCES.filter((r) => player.resources[r] > 0)
    .map((r) => `${RESOURCE_LABELS[r]} ×${player.resources[r]}`)
    .join(', ');

  const cartas = player.devCards.filter((c) => !c.played);
  const naoJogadas =
    cartas.length === 0
      ? 'nenhuma'
      : cartas
          .map((c) => {
            const bloqueada = c.boughtOnTurn >= state.turnNumber ? ' (comprada neste turno)' : '';
            return `${DEV_CARD_LABELS[c.card]}${bloqueada}`;
          })
          .join(', ');

  const portos = playerPortsLabel(state, playerId);

  return [
    `  Recursos: ${recursos === '' ? 'nenhum' : recursos}`,
    `  Cartas de Progresso: ${naoJogadas}`,
    `  Portos: ${portos}`,
  ].join('\n');
}

function playerPortsLabel(state: GameState, playerId: PlayerId): string {
  const tipos = new Set<string>();
  for (const [vertexId, building] of Object.entries(state.buildings)) {
    if (building.owner !== playerId) continue;
    const port = state.board.vertices[vertexId]?.port;
    if (port != null) tipos.add(portLabel(port));
  }
  return tipos.size === 0 ? 'nenhum' : [...tipos].join(', ');
}

export function renderScoreboard(state: GameState): string {
  const linhas = state.players.map((p) => {
    const pv = victoryPoints(state, p.id, false);
    const total = RESOURCES.reduce((sum, r) => sum + p.resources[r], 0);
    const daVez = state.players[state.currentPlayerIndex]!.id === p.id ? '▶' : ' ';
    const bonus = [
      state.longestRoad.owner === p.id ? `estrada(${state.longestRoad.length})` : null,
      state.largestArmy.owner === p.id ? `exército(${state.largestArmy.size})` : null,
    ]
      .filter((x) => x !== null)
      .join(' ');

    return (
      `${daVez} ${playerTag(state, p.id).padEnd(20)} ` +
      `PV público ${String(pv.total).padStart(2)}  ` +
      `cartas ${String(total).padStart(2)}  ` +
      `progresso ${p.devCards.filter((c) => !c.played).length}  ` +
      `soldados ${p.knightsPlayed}  ` +
      `${DIM}peças ${p.piecesLeft.roads}/${p.piecesLeft.settlements}/${p.piecesLeft.cities}${RESET}` +
      (bonus === '' ? '' : `  ${bonus}`)
    );
  });
  return linhas.join('\n');
}

export function renderBank(state: GameState): string {
  return RESOURCES.map((r) => `${RESOURCE_LABELS[r]} ${state.bank[r]}`).join('  ');
}

/** Descreve um vértice de forma legível: quais terrenos ele toca. */
export function describeVertex(state: GameState, vertexId: string): string {
  const vertex = state.board.vertices[vertexId];
  if (vertex === undefined) return vertexId;

  const partes = vertex.hexes.map((h) => {
    const hex = state.board.hexes[h]!;
    const numero = hex.number === null ? '' : `-${hex.number}`;
    return `${TERRAIN_LABELS[hex.terrain]}${numero}`;
  });
  const porto = vertex.port === null ? '' : ` [${portLabel(vertex.port)}]`;
  return `${partes.join('/')}${porto}`;
}

export function describeEdge(state: GameState, edgeId: string): string {
  const edge = state.board.edges[edgeId];
  if (edge === undefined) return edgeId;
  return `entre ${describeVertex(state, edge.vertices[0])} e ${describeVertex(state, edge.vertices[1])}`;
}

export function describeHex(state: GameState, hexId: string): string {
  const hex = state.board.hexes[hexId];
  if (hex === undefined) return hexId;
  const numero = hex.number === null ? 'sem ficha' : `ficha ${hex.number}`;
  return `${TERRAIN_LABELS[hex.terrain]} (${numero})`;
}

export function describeResources(counts: Record<Resource, number>): string {
  const partes = RESOURCES.filter((r) => counts[r] > 0).map(
    (r) => `${counts[r]}× ${RESOURCE_LABELS[r]}`,
  );
  return partes.length === 0 ? 'nada' : partes.join(', ');
}
