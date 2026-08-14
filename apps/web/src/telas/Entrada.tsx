/**
 * A porta de entrada: apelido, e depois criar ou entrar numa sala.
 *
 * O código é de seis caracteres de um alfabeto sem `0/O` nem `1/I/L`, porque é
 * ditado em voz alta ou colado de uma mensagem. O zod do contrato aceita
 * minúsculas e normaliza — quem digita não precisa saber disso, e o campo aqui
 * não briga com quem escreve em caixa baixa.
 */

import { useState } from 'react';

import { useSala } from '../estado/contexto.js';
import { rotuloDeErro } from '../rede/erros.js';

export function Entrada(): React.JSX.Element {
  const apelido = useSala((s) => s.apelido);
  const definirApelido = useSala((s) => s.definirApelido);
  const criar = useSala((s) => s.criar);
  const entrar = useSala((s) => s.entrar);
  const erro = useSala((s) => s.erro);
  const ocupado = useSala((s) => s.ocupado);

  const [codigo, setCodigo] = useState('');

  const semApelido = apelido.trim().length === 0;

  return (
    <main className="flex h-full items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white/10 p-6 backdrop-blur">
        <h1 className="text-2xl font-semibold text-white drop-shadow">Ilhavera</h1>

        <label className="flex flex-col gap-1 text-sm text-white/90">
          Seu apelido
          <input
            value={apelido}
            onChange={(e) => {
              definirApelido(e.target.value);
            }}
            maxLength={24}
            className="rounded-lg bg-white/90 px-3 py-2 text-slate-900"
            data-testid="apelido"
          />
        </label>

        <button
          type="button"
          disabled={semApelido || ocupado}
          onClick={() => {
            void criar();
          }}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-white transition hover:bg-emerald-500 disabled:opacity-40"
        >
          Criar sala
        </button>

        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm text-white/90">
            Código da sala
            <input
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.toUpperCase());
              }}
              maxLength={6}
              className="rounded-lg bg-white/90 px-3 py-2 font-mono tracking-widest text-slate-900 uppercase"
              data-testid="codigo"
            />
          </label>
          <button
            type="button"
            disabled={semApelido || ocupado || codigo.trim().length < 6}
            onClick={() => {
              void entrar(codigo);
            }}
            className="rounded-lg bg-white/20 px-3 py-2 text-white transition hover:bg-white/30 disabled:opacity-40"
          >
            Entrar
          </button>
        </div>

        {erro !== null && (
          <p role="alert" className="rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-50">
            {rotuloDeErro(erro)}
          </p>
        )}
      </div>
    </main>
  );
}
