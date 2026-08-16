/**
 * O texto da interface, em pt-BR — Fase 5, M7.
 *
 * ## O que está aqui, e o que não está
 *
 * Aqui mora o texto **da interface**: rótulos de tela, cabeçalhos de painel,
 * placeholders, `aria-label`. O vocabulário do **jogo** — recursos, terrenos,
 * cartas, fases, erros, nomes de jogada — não está aqui e não deve vir para cá:
 * ele mora em `packages/rules/src/labels.ts`, e a narração dos eventos em
 * `packages/rules/src/narracao/pt-BR.ts`. São três arquivos, e cada um é dono de
 * um assunto:
 *
 * | onde                            | o quê                                   |
 * | ------------------------------- | --------------------------------------- |
 * | `rules/labels.ts`               | vocabulário do domínio                  |
 * | `rules/narracao/pt-BR.ts`       | as frases do histórico                  |
 * | `protocol` (`ROOM_ERROR_LABELS`)| recusas que são do servidor, não do jogo|
 * | **este arquivo**                | o que se lê na tela e não é nem um nem outro |
 *
 * Trazer os rótulos do motor para cá pareceria mais arrumado e seria errado: a
 * CLI também os usa, e `apps/` é o que `packages/` não pode importar.
 *
 * ## Por que um módulo, e não um contexto
 *
 * Um idioma só. Enquanto for assim, importar `t` direto é o suficiente e não
 * custa nem uma re-renderização. O dia em que um segundo pacote existir, `t`
 * vira um hook e **só este arquivo e as importações mudam** — nenhuma string
 * volta para dentro do JSX. É esse o ponto de "estrutura pronta para en": o
 * texto já está fora dos componentes.
 *
 * Nada de `Ilhavera`: nome próprio não se traduz (§2).
 */

export const t = {
  jogo: { nome: 'Ilhavera' },

  entrada: {
    apelido: 'Seu apelido',
    tempoPorTurno: 'Tempo por turno',
    semLimite: 'sem limite',
    umMinuto: '1 minuto',
    doisMinutos: '2 minutos',
    cincoMinutos: '5 minutos',
    criarSala: 'Criar sala',
    codigoDaSala: 'Código da sala',
    entrar: 'Entrar',
  },

  sala: {
    codigo: 'Código da sala',
    suaCor: 'Sua cor',
    anfitriao: 'anfitrião',
    desconectado: 'desconectado',
    iniciar: 'Iniciar partida',
    esperandoAnfitriao: 'Esperando o anfitrião começar.',
    faltamJogadores: 'Faltam jogadores para começar.',
    sair: 'Sair da sala',
  },

  partida: {
    hotSeat: 'hot-seat local',
    espectador: 'espectador',
    turno: (n: number) => `turno ${n}`,
    vezDe: 'Vez de',
    voce: 'você',
    novaPartida: 'Nova partida',
    sairDaSala: 'Sair da sala',
    ocultarPainel: 'Ocultar painel',
    mostrarPainel: 'Mostrar painel',
    reconectando: 'Reconectando…',
  },

  tabuleiro: {
    rotulo: 'Tabuleiro da partida',
    construirEstrada: 'Construir estrada aqui',
    construirAssentamento: 'Construir assentamento',
    evoluirParaCidade: 'Evoluir para cidade',
    moverSaqueador: 'Mover o Saqueador para cá',
    /** Os `aria-label` dos alvos dizem **onde**, e não só o quê. */
    entre: (o: string, onde: string) => `${o} entre ${onde}`,
    moverSaqueadorPara: (rotulo: string, onde: string) => `Mover o ${rotulo} para ${onde}`,
    foraDoTabuleiro: 'fora do tabuleiro',
    agua: 'a água',
  },

  mao: {
    cartasDeProgresso: 'Cartas de Progresso',
    nenhuma: 'nenhuma',
    portos: 'Portos:',
    nenhum: 'nenhum',
    compradaNesteTurno: '· comprada neste turno',
  },

  jogadores: {
    titulo: 'Jogadores',
    jogadorDaVez: 'jogador da vez',
    pvPublicos: 'pontos de vitória públicos',
    cartasDeRecurso: 'cartas de recurso',
    cartasDeProgresso: 'Cartas de Progresso',
    soldadosJogados: 'Soldados jogados',
    pecasRestantes: 'peças restantes: estradas / assentamentos / cidades',
    descartando: (n: number) => `precisa descartar ${n} cartas`,
    seloEstrada: 'Estrada',
    seloExercito: 'Exército',
  },

  dados: {
    titulo: 'Dados',
    aindaNaoRolou: '— ainda não rolou neste turno',
  },

  historico: {
    titulo: 'Histórico',
    rotulo: 'Histórico da partida',
  },

  chat: {
    titulo: 'Conversa',
    rotulo: 'Mensagens da sala',
    vazio: 'Ninguém disse nada ainda.',
    campo: 'Mensagem para a sala',
    placeholder: 'Falar com a mesa',
    enviar: 'Enviar',
  },

  troca: {
    voceOferece: 'Você oferece',
    vocePede: 'Você pede',
    paraQuem: 'Para quem',
    aguardando: 'aguardando',
    aceitou: 'aceitou',
    recusou: 'recusou',
  },

  fimDePartida: {
    rotuloDaTabela: 'Placar final: de onde vieram os pontos de cada jogador',
    jogador: 'Jogador',
    total: 'Total',
    venceuCom: (nome: string, pv: number) => `${nome} venceu com ${pv} pontos de vitória.`,
    assentamentos: 'Assent.',
    assentamentosLongo: 'Assentamentos (1 ponto cada)',
    cidades: 'Cidades',
    cidadesLongo: 'Cidades (2 pontos cada)',
    exercito: 'Exército',
    estrada: 'Estrada',
    cartas: 'Cartas',
  },

  som: {
    ligar: 'Ligar o som',
    desligar: 'Desligar o som',
  },

  cronometro: {
    restante: (s: number) => `${s} segundos até a jogada automática`,
  },

  modal: {
    cancelar: 'Cancelar',
  },

  conexao: {
    ligando: 'Conectando…',
    reconectando: 'Reconectando…',
    caido: 'Sem conexão com o servidor.',
    /**
     * "Fora do ar", e não "sem conexão": a diferença importa para quem lê. Quem
     * nunca conectou raramente tem problema de rede — na esmagadora maioria das
     * vezes é o servidor que não está de pé, e é isso que a frase precisa dizer.
     */
    inacessivel: 'Servidor fora do ar.',
    /** Só em desenvolvimento. Ver `Reconectando.tsx`. */
    dicaDeDesenvolvimento: 'Rode `make dev` num outro terminal.',
  },
} as const;

export type Dicionario = typeof t;
