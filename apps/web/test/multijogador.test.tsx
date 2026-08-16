/**
 * O aceite da Fase 4: **três pessoas concluem uma partida pela rede, e quem
 * fecha a aba volta e continua.**
 *
 * Três `<App/>` de verdade, cada um com a própria identidade e o próprio socket,
 * contra um servidor Fastify + Socket.IO rodando no mesmo processo. Nada é
 * simulado no meio: o caminho exercitado é o inteiro — clique → store → socket →
 * `GameRoom` → `reduce` → `state:patch` → as três telas.
 *
 * O robô é o mesmo da Fase 3, sem uma linha a mais. Isso importa: se ele
 * soubesse alguma coisa a mais em rede, o aceite provaria o robô, não a
 * interface. Ele lê o DOM de um contêiner e clica; quem sabe de quem é a vez é o
 * servidor, e a tela de quem não pode agir simplesmente não oferece nada.
 *
 * A asserção que carrega a fase roda depois de cada clique: **nenhum
 * `role="alert"` em nenhuma das telas.** Aqui ela é mais forte que na Fase 3 —
 * lá provava que o destaque saía do mesmo enumerador que valida; aqui prova que
 * a lista que atravessou o fio e a validação do servidor não divergiram.
 *
 * O que este teste **não** cobre, e está na dívida da fase: navegador de
 * verdade, duas máquinas, layout, e a diferença entre o WebSocket do jsdom e o
 * do Chrome.
 */

import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ate, subirMesa, type Jogador, type MesaEmRede } from './helpers/mesaEmRede.js';
import { proximoClique } from './helpers/robo.js';

/** Teto de segurança: as sementes daqui terminam em torno de mil cliques. */
const MAXIMO_DE_CLIQUES = 4000;

let mesa: MesaEmRede | null = null;

afterEach(async () => {
  await mesa?.fechar();
  mesa = null;
});

/** Digita o apelido e clica — o lobby inteiro pela interface, sem atalho. */
async function preencher(jogador: Jogador, campo: string, texto: string): Promise<void> {
  const entrada = within(jogador.tela.container).getByTestId(campo);
  await act(async () => {
    fireEvent.change(entrada, { target: { value: texto } });
    await Promise.resolve();
  });
}

async function clicar(jogador: Jogador, nome: string | RegExp): Promise<void> {
  const botao = within(jogador.tela.container).getByRole('button', { name: nome });
  await act(async () => {
    fireEvent.click(botao);
    await Promise.resolve();
  });
}

function estado(jogador: Jogador): ReturnType<Jogador['cliente']['partida']['getState']> {
  return jogador.cliente.partida.getState();
}

function sala(jogador: Jogador): ReturnType<NonNullable<Jogador['cliente']['sala']>['getState']> {
  const store = jogador.cliente.sala;
  if (store === null) throw new Error('cliente de rede sem store de sala');
  return store.getState();
}

/** Monta a mesa e leva os três do apelido ao tabuleiro, só clicando. */
async function ateOTabuleiro(semente: string): Promise<MesaEmRede> {
  const atual = await subirMesa(semente);
  mesa = atual;

  const ana = await atual.entrar('Ana');
  await preencher(ana, 'apelido', 'Ana');
  await clicar(ana, 'Criar sala');
  await ate(() => sala(ana).sala !== null, 'a sala da Ana');

  const codigo = sala(ana).sala?.code;
  if (codigo === undefined) throw new Error('sala criada sem código');

  for (const nome of ['Bruno', 'Carla']) {
    const jogador = await atual.entrar(nome);
    await preencher(jogador, 'apelido', nome);
    await preencher(jogador, 'codigo', codigo);
    await clicar(jogador, 'Entrar');
    await ate(() => sala(jogador).sala !== null, `${nome} na sala`);
  }

  await ate(() => sala(ana).sala?.canStart === true, 'a mesa completa');
  await clicar(ana, 'Iniciar partida');

  // O tabuleiro nasce no `room:start`, e chega a cada um pelo próprio snapshot.
  await ate(
    () => atual.jogadores.every((j) => estado(j).mesa !== null),
    'o tabuleiro nas três telas',
  );

  return atual;
}

/** O que a tela mostra além da partida: modal aberto, alvo do Saqueador. */
function tela(jogador: Jogador): string {
  const t = jogador.cliente.tela.getState();
  return `${t.modalAberto ?? '-'}|${t.hexDoSaqueador ?? '-'}|${t.contrapondo?.tradeId ?? '-'}`;
}

/**
 * Espera todas as telas alcançarem a mesma versão.
 *
 * O ack volta para quem jogou antes de o `state:patch` assentar nas outras
 * telas, e clicar nesse intervalo seria clicar num destaque que já não existe.
 * Não é frescura de teste: é a mesma corrida que uma pessoa tem, e a resposta
 * dela também é esperar a tela chegar em vez de adivinhar.
 */
async function sincronizar(atual: MesaEmRede): Promise<void> {
  await ate(() => {
    const versoes = atual.jogadores.map((j) => estado(j).mesa?.version ?? -1);
    return versoes.every((v) => v >= 0 && v === versoes[0]);
  }, 'as telas na mesma versão');
}

/**
 * Joga até o vencedor.
 *
 * A cada volta, procura em todas as telas alguma coisa para clicar. Quem pode
 * agir é quem tem jogada oferecida — e é o servidor quem decide isso, inclusive
 * no descarte paralelo, em que mais de uma tela oferece ao mesmo tempo.
 */
async function jogarAteOFim(atual: MesaEmRede): Promise<number> {
  let cliques = 0;
  await sincronizar(atual);

  while (estado(atual.jogadores[0] as Jogador).mesa?.winner == null) {
    if (cliques >= MAXIMO_DE_CLIQUES) {
      throw new Error(`a partida não terminou em ${MAXIMO_DE_CLIQUES} cliques`);
    }

    const quem = atual.jogadores
      .map((j) => ({ j, alvo: proximoClique(j.tela.container, cliques) }))
      .find(({ alvo }) => alvo !== null);

    if (quem === undefined) {
      throw new Error(
        `nenhuma tela oferece jogada após ${cliques} cliques ` +
          `(fase ${estado(atual.jogadores[0] as Jogador).mesa?.phase ?? '?'})`,
      );
    }

    const minhasAntes = estado(quem.j).minhasJogadas;
    const telaAntes = tela(quem.j);

    await act(async () => {
      fireEvent.click(quem.alvo as Element);
      await Promise.resolve();
    });
    cliques++;

    /**
     * Ou a jogada foi aceita, ou o clique só abriu um modal. Esperar por
     * "apareceu algo para clicar" não serviria: o destaque velho ainda está lá
     * enquanto o patch não chega, e o robô clicaria numa lista vencida — que foi
     * exatamente como este teste falhou da primeira vez.
     */
    await ate(
      () => estado(quem.j).minhasJogadas > minhasAntes || tela(quem.j) !== telaAntes,
      `resposta ao clique ${cliques} de ${quem.j.nome}`,
    );

    // A tese da fase, verificada em todas as telas depois de cada clique.
    for (const j of atual.jogadores) {
      const alerta = within(j.tela.container).queryByRole('alert');
      if (alerta !== null) {
        throw new Error(
          `clique ${cliques} recusado na tela de ${j.nome}: ${alerta.textContent ?? ''}`,
        );
      }
    }

    if (estado(quem.j).minhasJogadas > minhasAntes) await sincronizar(atual);
  }

  return cliques;
}

describe('aceite da Fase 4: partida completa pela rede', () => {
  it('três telas vão do lobby ao vencedor, cada uma no seu socket', async () => {
    const atual = await ateOTabuleiro('multi-1');
    const [ana, bruno, carla] = atual.jogadores as [Jogador, Jogador, Jogador];

    // Cada um se vê como `you`, e vê os outros sem a mão.
    for (const j of atual.jogadores) {
      expect(estado(j).mesa?.you?.id).toBe(j.id());
      for (const p of estado(j).mesa?.players ?? []) {
        if (p.id === j.id()) continue;
        expect(p).not.toHaveProperty('resources');
      }
    }

    const cliques = await jogarAteOFim(atual);

    const final = estado(ana).mesa;
    expect(final?.winner, `partida não terminou em ${cliques} cliques`).not.toBeNull();
    expect(final?.phase).toBe('finished');

    // As três telas contam a mesma partida — a versão e o vencedor batem.
    for (const j of [bruno, carla]) {
      expect(estado(j).mesa?.version).toBe(final?.version);
      expect(estado(j).mesa?.winner).toBe(final?.winner);
    }

    // E a partida foi de verdade: comércio entre jogadores aconteceu.
    const tipos = new Set((final?.log ?? []).map((e) => e.type));
    expect(tipos).toContain('diceRolled');
    expect(tipos).toContain('turnEnded');
    expect(tipos).toContain('gameWon');
  }, 180_000);

  it('quem fecha a aba volta pelo token e continua de onde parou', async () => {
    const atual = await ateOTabuleiro('multi-2');
    const bruno = atual.jogadores[1] as Jogador;

    // Anda um pouco antes de derrubar: reconectar no setup não prova muito.
    await sincronizar(atual);
    for (let i = 0; i < 12; i++) {
      const quem = atual.jogadores
        .map((j) => ({ j, alvo: proximoClique(j.tela.container, i) }))
        .find(({ alvo }) => alvo !== null);
      if (quem === undefined) break;

      const minhasAntes = estado(quem.j).minhasJogadas;
      const telaAntes = tela(quem.j);

      await act(async () => {
        fireEvent.click(quem.alvo as Element);
        await Promise.resolve();
      });

      await ate(
        () => estado(quem.j).minhasJogadas > minhasAntes || tela(quem.j) !== telaAntes,
        `jogada ${i + 1} do aquecimento`,
      );
      if (estado(quem.j).minhasJogadas > minhasAntes) await sincronizar(atual);
    }

    const versaoAntes = estado(bruno).mesa?.version ?? -1;
    const idAntes = bruno.id();
    expect(versaoAntes).toBeGreaterThan(0);

    // A aba fecha: tela desmontada, socket fora.
    bruno.tela.unmount();
    bruno.cliente.conexao?.fechar();
    atual.jogadores.splice(atual.jogadores.indexOf(bruno), 1);

    // E volta — **com a mesma sessão**, que é o que carrega o token.
    const devolta = await atual.entrar('Bruno', bruno.sessao);

    expect(devolta.id()).toBe(idAntes);
    // O servidor reencontra o assento sozinho e empurra o snapshot: quem volta
    // não pede nada, e é por isso que o teste não clica em nada aqui.
    await ate(() => estado(devolta).mesa !== null, 'o snapshot da reconexão');

    expect(estado(devolta).mesa?.version).toBe(versaoAntes);
    expect(estado(devolta).mesa?.you?.id).toBe(idAntes);

    // E a mesa continua: a partida vai até o fim com o jogador que voltou.
    const cliques = await jogarAteOFim(atual);
    expect(estado(devolta).mesa?.winner, `não terminou em ${cliques} cliques`).not.toBeNull();
  }, 180_000);
});
