/**
 * Tipos de domínio do motor de regras.
 *
 * Identificadores em inglês por dois motivos: (a) i18n — a Fase 5 prevê pt-BR
 * + en, e rótulos ficam em `labels.ts`, não nos identificadores; (b) §2 do
 * roadmap exige terminologia própria, e nomes genéricos não carregam nada da
 * marca original.
 */

export const RESOURCES = ['lumber', 'brick', 'wool', 'grain', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];

export const TERRAINS = ['forest', 'hill', 'pasture', 'field', 'mountain', 'desert'] as const;
export type Terrain = (typeof TERRAINS)[number];

/** §3.1 — qual recurso cada terreno produz. O deserto não produz nada. */
export const TERRAIN_PRODUCES: Readonly<Record<Terrain, Resource | null>> = {
  forest: 'lumber',
  hill: 'brick',
  pasture: 'wool',
  field: 'grain',
  mountain: 'ore',
  desert: null,
};

/** §3.1 — distribuição dos 19 terrenos. */
export const TERRAIN_DISTRIBUTION: Readonly<Record<Terrain, number>> = {
  forest: 4,
  pasture: 4,
  field: 4,
  hill: 3,
  mountain: 3,
  desert: 1,
};

/** §3.1 — as 18 fichas numéricas, uma por hexágono exceto o deserto. */
export const NUMBER_TOKENS: readonly number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

/** Números "vermelhos": no modo equilibrado não podem ficar adjacentes entre si. */
export const RED_NUMBERS: readonly number[] = [6, 8];

/** `generic` = porto 3:1; um `Resource` = porto 2:1 daquele recurso. */
export type PortType = 'generic' | Resource;

/** §3.1 — 4 portos genéricos 3:1 e 5 específicos 2:1. */
export const PORT_DISTRIBUTION: readonly PortType[] = [
  'generic',
  'generic',
  'generic',
  'generic',
  'lumber',
  'brick',
  'wool',
  'grain',
  'ore',
];

export const DEV_CARDS = [
  'knight',
  'victoryPoint',
  'roadBuilding',
  'yearOfPlenty',
  'monopoly',
] as const;
export type DevCard = (typeof DEV_CARDS)[number];

/** §3.1 — o baralho de 25 Cartas de Progresso (com 2 Monopólio, como o doc pede). */
export const DEV_CARD_DISTRIBUTION: Readonly<Record<DevCard, number>> = {
  knight: 14,
  victoryPoint: 5,
  roadBuilding: 2,
  yearOfPlenty: 2,
  monopoly: 2,
};

export type PlayerId = string;
export type HexId = string; // "q,r"
export type VertexId = string; // "q,r|q,r|q,r" — tripla de hexágonos ordenada
export type EdgeId = string; // "vertexA::vertexB" — par ordenado

export const PLAYER_COLORS = ['red', 'blue', 'white', 'orange', 'green', 'brown'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export type ResourceCount = Record<Resource, number>;

export type BuildingType = 'settlement' | 'city';

/** §3.1 — custos de construção. */
export const COSTS: Readonly<Record<'road' | 'settlement' | 'city' | 'devCard', ResourceCount>> = {
  road: { lumber: 1, brick: 1, wool: 0, grain: 0, ore: 0 },
  settlement: { lumber: 1, brick: 1, wool: 1, grain: 1, ore: 0 },
  city: { lumber: 0, brick: 0, wool: 0, grain: 2, ore: 3 },
  devCard: { lumber: 0, brick: 0, wool: 1, grain: 1, ore: 1 },
};

/** §3.1 — peças por jogador. */
export const PIECE_LIMITS = { roads: 15, settlements: 5, cities: 4 } as const;

/** §3.1 — o banco começa com 19 cartas de cada recurso (95 no total). */
export const BANK_PER_RESOURCE = 19;

/** §3.3 — a partir de quantas cartas o jogador descarta metade num 7. */
export const DISCARD_THRESHOLD = 8;

/** §3.4 — mínimos para os bônus. */
export const MIN_LONGEST_ROAD = 5;
export const MIN_LARGEST_ARMY = 3;

export const DEFAULT_TARGET_VICTORY_POINTS = 10;

export function emptyResourceCount(): ResourceCount {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

export function totalResources(count: ResourceCount): number {
  return RESOURCES.reduce((sum, r) => sum + count[r], 0);
}
