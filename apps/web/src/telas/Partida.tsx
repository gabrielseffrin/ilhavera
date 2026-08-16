/**
 * A mesa: o tabuleiro, a HUD e os modais.
 *
 * Aqui só há composição. Tudo o que a tela mostra sai de `mesa`, a projeção do
 * jogador local — e nenhum componente abaixo daqui conhece `GameState`, nem tem
 * como conhecer. Foi o que fez a Fase 4 trocar a fonte da verdade sem que uma
 * linha destes componentes mudasse: o motor local e o socket entregam a mesma
 * `ClientView`.
 *
 * Sobre o layout: `min-h-0` aparece em toda a cadeia de flex de propósito. Sem
 * ele o `overflow-y-auto` do histórico não segura nada e a página inteira cresce
 * até empurrar o tabuleiro para fora da tela — é o tropeço clássico de flexbox
 * aninhado, e custa caro descobrir depois.
 *
 * A divisão entre tabuleiro e coluna é decidida por **orientação**, e não por
 * largura. Ver `PainelLateral` para o porquê: `lg:` mede pixels, e o que decide
 * se as duas coisas cabem lado a lado é o formato da tela.
 */

import { useEffect, useMemo, useState } from 'react';
import { PHASE_LABELS, type Action, type ClientView } from '@ilhavera/rules';

import { rotuloDeErro } from '../rede/erros.js';

import { CamadaDoSaqueador } from '../board/CamadaDoSaqueador.js';
import { CamadaInterativa } from '../board/CamadaInterativa.js';
import { Pecas } from '../board/Pecas.js';
import { Tabuleiro } from '../board/Tabuleiro.js';
import { Alerta } from '../hud/base/Alerta.js';
import { Botao } from '../hud/base/Botao.js';
import { BarraDeAcoes } from '../hud/BarraDeAcoes.js';
import { BotaoDeSom } from '../hud/BotaoDeSom.js';
import { Cronometro } from '../hud/Cronometro.js';
import { FimDePartida } from '../hud/FimDePartida.js';
import { Modais } from '../hud/Modais.js';
import { PainelDaProposta } from '../hud/PainelDaProposta.js';
import { ID_DO_PAINEL_LATERAL, PainelLateral } from '../hud/PainelLateral.js';
import { useInterface, usePartida, useSala } from '../estado/contexto.js';
import { useSons } from '../som/useSons.js';
import { t } from '../i18n/pt-BR.js';

export function Partida({ mesa }: { mesa: ClientView }): React.JSX.Element {
  const modo = usePartida((s) => s.modo);
  const ativo = usePartida((s) => s.ativo);
  const legais = usePartida((s) => s.legais);
  const erro = usePartida((s) => s.erro);
  const executar = usePartida((s) => s.executar);
  const reiniciar = usePartida((s) => s.reiniciar);
  const limparErro = usePartida((s) => s.limparErro);
  const minhasJogadas = usePartida((s) => s.minhasJogadas);
  const prazo = usePartida((s) => s.prazo);
  const sair = useSala((s) => s.sair);

  const modalAberto = useInterface((s) => s.modalAberto);
  const hexDoSaqueador = useInterface((s) => s.hexDoSaqueador);
  const contrapondo = useInterface((s) => s.contrapondo);
  const abrirModal = useInterface((s) => s.abrirModal);
  const contrapor = useInterface((s) => s.contrapor);
  const escolherHex = useInterface((s) => s.escolherHex);
  const fechar = useInterface((s) => s.fechar);

  /**
   * Toda jogada **minha** aceita fecha o que estiver aberto: o que o modal
   * perguntava já foi respondido.
   *
   * Contar jogadas minhas, e não `mesa.version`, é o que separa o hot-seat da
   * rede. No hot-seat as duas contagens andam juntas, porque quem joga sou
   * sempre eu. Em rede, `mesa.version` anda a cada jogada de cada adversário —
   * e fecharia o compositor de troca no meio da digitação, toda vez que alguém
   * do outro lado da mesa colocasse uma estrada.
   */
  useEffect(() => {
    fechar();
  }, [minhasJogadas, fechar]);

  /**
   * A coluna de informação, aberta ou recolhida — e **só em retrato**, onde ela
   * está por cima do tabuleiro na vertical. Estado local porque não é da
   * partida: nenhum outro cliente precisa saber que este aqui escondeu o log.
   */
  const [painelAberto, setPainelAberto] = useState(true);

  /**
   * Os sons saem daqui e de mais lugar nenhum: o gatilho é o log projetado que
   * já chega no patch, então nenhum componente abaixo precisou aprender que
   * existe áudio.
   */
  useSons(mesa, ativo);

  const cores = useMemo(
    () => Object.fromEntries(mesa.players.map((p) => [p.id, p.color])),
    [mesa.players],
  );

  const alvosDoSaqueador = useMemo(() => legais.filter((a) => a.type === 'moveRobber'), [legais]);

  const jogador = mesa.players.find((p) => p.id === ativo);
  /**
   * Em rede vale dizer "você": a faixa é a única coisa na tela que separa
   * "espere" de "jogue". No hot-seat, não — lá `ativo` é sempre quem está com o
   * teclado, e "Vez de você" apagaria justamente a informação que a faixa
   * existe para dar: de quem é a cadeira agora.
   */
  const souEu = modo === 'rede' && ativo !== null && ativo === mesa.you?.id;

  const escolher = (acao: Action): void => {
    executar(acao);
  };

  return (
    <main className="flex h-full flex-col gap-2 p-2 sm:gap-3 sm:p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:gap-x-4">
        <h1 className="text-lg font-semibold text-white drop-shadow sm:text-xl">{t.jogo.nome}</h1>
        <span className="text-sm text-white/80">
          {modo === 'hot-seat' ? t.partida.hotSeat : (mesa.you?.name ?? t.partida.espectador)}
        </span>

        <span className="ml-auto text-sm text-white/90">
          {PHASE_LABELS[mesa.phase]} · {t.partida.turno(mesa.turnNumber)}
        </span>

        {/* Só existe em sala com relógio, que não é o padrão. */}
        {mesa.winner === null && <Cronometro prazo={prazo} />}

        <BotaoDeSom />

        {/* Só em retrato: em paisagem a coluna está ao lado e não disputa
            espaço com o tabuleiro, então recolhê-la não compraria nada. */}
        <Botao
          tom="secundario"
          data-testid="alternar-painel"
          aria-expanded={painelAberto}
          aria-controls={ID_DO_PAINEL_LATERAL}
          onClick={() => {
            setPainelAberto((antes) => !antes);
          }}
          className="hidden px-3 py-1 text-sm portrait:inline-flex"
        >
          {painelAberto ? t.partida.ocultarPainel : t.partida.mostrarPainel}
        </Botao>

        {/* Em rede não se sorteia outra partida: a mesa é dos outros também. */}
        <Botao
          tom="secundario"
          onClick={() => {
            if (modo === 'hot-seat') reiniciar();
            else void sair();
          }}
          className="px-3 py-1 text-sm"
        >
          {modo === 'hot-seat' ? t.partida.novaPartida : t.partida.sairDaSala}
        </Botao>
      </header>

      <FimDePartida mesa={mesa} />

      {/**
       * `assertive`, ao contrário do histórico e do chat, que são `polite`.
       * É a diferença entre "aconteceu alguma coisa" e "é a sua vez": esperar o
       * leitor de tela terminar de narrar o turno alheio para só então avisar
       * que a mesa está parada esperando por você é o anúncio chegar tarde.
       */}
      {jogador !== undefined && mesa.winner === null && (
        <p
          className="text-sm text-white"
          data-testid="vez-de"
          data-sou-eu={souEu}
          role="status"
          aria-live="assertive"
        >
          {t.partida.vezDe} <strong>{souEu ? t.partida.voce : jogador.name}</strong>
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3 landscape:flex-row">
        <section className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="min-h-0 flex-1">
            <Tabuleiro estado={mesa}>
              <Pecas
                board={mesa.board}
                buildings={mesa.buildings}
                roads={mesa.roads}
                cores={cores}
              />
              <CamadaDoSaqueador
                board={mesa.board}
                opcoes={alvosDoSaqueador}
                aoEscolherHex={(hexId) => {
                  const alvos = alvosDoSaqueador.filter((a) => a.hexId === hexId);
                  // Um alvo só não merece pergunta: ou não há ninguém para
                  // roubar, ou só há um. Perguntar seria cerimônia.
                  if (alvos.length === 1) escolher(alvos[0] as Action);
                  else escolherHex(hexId);
                }}
              />
              <CamadaInterativa board={mesa.board} legais={legais} onEscolher={escolher} />
            </Tabuleiro>
          </div>

          {/* A barra e o alerta ficam junto do tabuleiro: o erro precisa
              aparecer onde se errou, não do outro lado da tela. */}
          <BarraDeAcoes
            legais={legais}
            onEscolher={escolher}
            onAbrir={(tipo) => {
              // Abrir modal não é jogada e não limpa erro sozinho — sem isto o
              // "Recursos insuficientes" acompanha o jogador por três turnos.
              limparErro();
              abrirModal(tipo);
            }}
          />

          {erro !== null && <Alerta>{rotuloDeErro(erro)}</Alerta>}
        </section>

        <PainelLateral mesa={mesa} ativo={ativo} aberto={painelAberto}>
          <PainelDaProposta
            mesa={mesa}
            legais={legais}
            aoEscolher={escolher}
            aoContrapor={() => {
              const resposta = legais.find((a) => a.type === 'tradeRespond');
              if (resposta !== undefined) contrapor(resposta);
            }}
          />
        </PainelLateral>
      </div>

      <Modais
        mesa={mesa}
        legais={legais}
        modalAberto={modalAberto}
        hexDoSaqueador={hexDoSaqueador}
        contrapondo={contrapondo}
        aoEscolher={escolher}
        aoFechar={fechar}
      />
    </main>
  );
}
