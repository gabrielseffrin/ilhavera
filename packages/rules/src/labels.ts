/**
 * Rótulos em pt-BR — a terminologia própria exigida por §2 do roadmap.
 *
 * Ficam separados dos identificadores de propósito: a Fase 5 prevê i18n
 * (pt-BR no MVP, estrutura pronta para en), e trocar de idioma não pode
 * significar renomear o domínio inteiro.
 */

import type { DevCard, PortType, Resource, Terrain } from './types.js';

export const RESOURCE_LABELS: Readonly<Record<Resource, string>> = {
  lumber: 'Madeira',
  brick: 'Tijolo',
  wool: 'Lã',
  grain: 'Trigo',
  ore: 'Minério',
};

export const TERRAIN_LABELS: Readonly<Record<Terrain, string>> = {
  forest: 'Floresta',
  hill: 'Colina',
  pasture: 'Pasto',
  field: 'Campo',
  mountain: 'Montanha',
  desert: 'Deserto',
};

export const DEV_CARD_LABELS: Readonly<Record<DevCard, string>> = {
  knight: 'Soldado',
  victoryPoint: 'Ponto de Vitória',
  roadBuilding: 'Construção de Estradas',
  yearOfPlenty: 'Descoberta',
  monopoly: 'Monopólio',
};

export function portLabel(port: PortType): string {
  return port === 'generic' ? 'Porto 3:1' : `Porto 2:1 ${RESOURCE_LABELS[port]}`;
}

/** O "Ladrão" do jogo clássico; aqui, Saqueador (§2). */
export const ROBBER_LABEL = 'Saqueador';
export const LONGEST_ROAD_LABEL = 'Estrada Mais Longa';
export const LARGEST_ARMY_LABEL = 'Maior Exército';
