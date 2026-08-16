/**
 * A casca monta, e monta no modo certo.
 *
 * `<App/>` sem provedor cai no cliente padrão, que é hot-seat por padrão — é o
 * que faz `pnpm dev` sozinho abrir uma partida jogável, sem servidor ao lado.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/**
 * O **layout** responsivo não é testável aqui: o jsdom não faz layout, não
 * avalia `@media (orientation: …)` e não tem viewport de verdade. O que se pode
 * verificar é o comportamento que sobra quando se tira o CSS — que o controle
 * existe, que ele anuncia o estado a quem navega por leitor de tela, e que o
 * painel acompanha. O resto se confere no navegador, e está dito assim no
 * roadmap em vez de fingido por um teste que não olha para pixel nenhum.
 */
describe('coluna recolhível (retrato)', () => {
  it('nasce aberta e o controle diz isso', () => {
    montarHotSeat('app');

    expect(screen.getByTestId('alternar-painel')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('painel-lateral')).toHaveAttribute('data-aberto', 'true');
  });

  it('recolhe e reabre, e o controle aponta para o painel que governa', async () => {
    const usuario = userEvent.setup();
    montarHotSeat('app');
    const botao = screen.getByTestId('alternar-painel');

    // `aria-controls` apontando para um id que não existe é o defeito clássico
    // deste padrão: passa despercebido na tela e quebra o leitor de tela.
    expect(document.getElementById(botao.getAttribute('aria-controls') ?? '')).toBe(
      screen.getByTestId('painel-lateral'),
    );

    await usuario.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('painel-lateral')).toHaveAttribute('data-aberto', 'false');

    await usuario.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
  });

  it('recolhido, o painel continua no DOM — some por CSS, não por desmontagem', async () => {
    const usuario = userEvent.setup();
    montarHotSeat('app');

    await usuario.click(screen.getByTestId('alternar-painel'));

    // Desmontar perderia a rolagem do histórico e remontaria os painéis a cada
    // toque; e em paisagem, onde a regra de CSS não vale, o painel precisa
    // estar lá independentemente deste estado.
    expect(screen.getByTestId('painel-lateral')).toBeInTheDocument();
    expect(screen.getByTestId('log')).toBeInTheDocument();
  });
});
