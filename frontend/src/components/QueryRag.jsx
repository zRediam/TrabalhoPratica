function QueryRag({ question, setQuestion, onSubmit, isLoading, result, error }) {
  return (
    <section className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-violet-700 mb-2">3 · Consulta inteligente</p>
      <p className="text-sm text-violet-950 font-medium mb-4">
        Faça perguntas sobre o banco de dados e obtenha uma resposta elaborada pelo agente RAG.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          placeholder="Ex: Quais fornecedores ativos possuem notas pendentes?"
          className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />

        <button
          type="submit"
          disabled={isLoading || !question.trim()}
          className={`w-full rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${isLoading || !question.trim()
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-violet-700 hover:bg-violet-800'}`}
        >
          {isLoading ? 'Consultando...' : 'Perguntar ao agente'}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      )}

      {result?.answer && (
        <div className="mt-4 rounded-3xl border border-violet-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-violet-900 mb-3">Resposta do agente</p>
          <div className="whitespace-pre-line text-sm text-slate-800">{result.answer}</div>

          {result.context && (
            <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <summary className="cursor-pointer font-medium text-slate-900">Contexto extraído do banco de dados</summary>
              <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                {result.context}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

export default QueryRag;
