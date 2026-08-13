/**
 * Ponto de entrada do cliente. Só monta a árvore — tudo que decide alguma coisa
 * mora em `App` e abaixo dela.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './index.css';

const raiz = document.getElementById('raiz');
if (raiz === null) throw new Error('elemento #raiz não encontrado no index.html');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
