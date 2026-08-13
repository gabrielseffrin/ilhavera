import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../src/App.js';

describe('App', () => {
  it('monta e mostra o nome do jogo', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Ilhavera' })).toBeInTheDocument();
  });
});
