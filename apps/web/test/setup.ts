/**
 * Matchers de DOM para o vitest (`toBeInTheDocument`, `toHaveAttribute`...).
 *
 * Carregado por `setupFiles` no `vite.config.ts`, então vale para todo arquivo
 * de teste sem import repetido.
 */
import '@testing-library/jest-dom/vitest';

/**
 * O jsdom não implementa `scrollIntoView` — não é que ele falhe, é que o método
 * não existe. Sem este preenchimento, todo componente que rola sozinho quebra
 * no teste por um motivo que não tem nada a ver com o que se está testando.
 *
 * Fica aqui, e não numa guarda dentro do componente, porque é lacuna do
 * ambiente de teste: no navegador o método existe desde sempre.
 */
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // Sem efeito: não há viewport para rolar.
  };
}
