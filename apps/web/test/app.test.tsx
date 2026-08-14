/**
 * A casca monta, e monta no modo certo.
 *
 * `<App/>` sem provedor cai no cliente padrão, que é hot-seat por padrão — é o
 * que faz `pnpm dev` sozinho abrir uma partida jogável, sem servidor ao lado.
 */

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { montarHotSeat } from './helpers/hotseat.js';

describe('App', () => {
  it('monta e mostra o nome do jogo', () => {
    montarHotSeat('app');
    expect(screen.getByRole('heading', { name: 'Ilhavera' })).toBeInTheDocument();
  });

  it('no hot-seat cai direto na mesa, sem passar pelo lobby', () => {
    montarHotSeat('app');
    expect(screen.getByText('hot-seat local')).toBeInTheDocument();
    expect(screen.queryByTestId('codigo')).not.toBeInTheDocument();
  });
});
