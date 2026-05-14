import { useState } from 'react';

function JsonViewer({ data }) {
  const [copied, setCopied] = useState(false);
  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);
  const database = data?.database;

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderEntity = (title, entity) => {
    if (!entity) {
      return null;
    }

    const name =
      entity.razaoSocial ||
      entity.razao_social ||
      entity.nome ||
      entity.nomeFantasia ||
      entity.nome_fantasia ||
      entity.descricao ||
      '—';
    const docLabel = entity.cnpj ? 'CNPJ' : entity.documento ? 'CPF / CNPJ' : null;
    const docValue = entity.cnpj || entity.documento || null;
    const statusText = entity.exists ? `Cadastro encontrado · id ${entity.id}` : 'Ainda não cadastrado';
    const statusClass = entity.exists ? 'text-sky-600' : 'text-red-600';

    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</p>
        <p className="text-lg font-semibold text-gray-900 leading-snug">{name}</p>
        {docValue && (
          <p className="text-sm text-gray-600 mt-1">{docLabel}: <span className="font-medium text-gray-900">{docValue}</span></p>
        )}
        {entity.endereco && (
          <p className="text-sm text-gray-600 mt-1">Endereço: <span className="font-medium text-gray-900">{entity.endereco}</span></p>
        )}
        <p className={`mt-4 text-sm font-semibold ${statusClass}`}>{statusText}</p>
      </div>
    );
  };

  const renderClassifications = (title, items) => {
    if (!items || items.length === 0) {
      return null;
    }

    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">{title}</p>
        <div className="space-y-2 text-sm text-gray-700">
          {items.map((item, index) => {
            const desc = typeof item === 'object' && item !== null ? item.descricao : item;
            const key = `${String(desc ?? '')}-${index}`;
            const hasLookup = typeof item === 'object' && item !== null && 'exists' in item;
            const statusText = hasLookup ? (item.exists ? `Cadastro encontrado · id ${item.id}` : 'Ainda não cadastrado') : null;
            const statusClass = hasLookup ? (item.exists ? 'text-sky-600' : 'text-red-600') : '';

            return (
              <div key={key} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="font-medium text-slate-900">{desc ?? '—'}</p>
                {item?.status && <p className="text-xs text-slate-500">Status cadastro: {item.status}</p>}
                {statusText && (
                  <p className={`mt-2 text-sm font-semibold ${statusClass}`}>{statusText}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMovement = () => {
    if (!database?.movimentoConta) {
      return (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm mb-6">
          <p className="text-sm text-amber-950 font-semibold">Nenhum lançamento gravado nesta sessão</p>
          <p className="text-sm text-amber-900 mt-2">Quando os dados estiverem corretos, use &quot;Confirmar e registrar&quot; acima para criar o movimento e as parcelas no banco.</p>
        </div>
      );
    }

    const tipoMov = database.movimentoConta.tipo || database.tipo || 'APAGAR';

    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm mb-6">
        <p className="text-sm text-emerald-950 font-semibold mb-3">Lançamento registrado</p>
        <div className="grid gap-2 text-sm text-gray-800">
          <p>Movimento ID: <span className="font-medium text-gray-950">{database.movimentoConta.id}</span></p>
          <p>Tipo: <span className="font-medium text-gray-950">{tipoMov}</span></p>
          <p>Status: <span className="font-medium text-gray-950">{database.movimentoConta.status}</span></p>
          <p>Valor total: <span className="font-medium text-gray-950">{database.movimentoConta.valorTotal}</span></p>
          <p>Nota fiscal: <span className="font-medium text-gray-950">{database.movimentoConta.numeroNotaFiscal || '—'}</span></p>
          {database.cliente?.id != null && (
            <p>Cliente (cadastro): <span className="font-medium text-gray-950">ID {database.cliente.id}{database.cliente.exists === false ? ' (novo)' : ''}</span></p>
          )}
          {tipoMov === 'APAGAR' && database.contasPagarId != null && (
            <p>Conta a pagar: <span className="font-medium text-gray-950">ID {database.contasPagarId}</span></p>
          )}
          {tipoMov === 'ARECEBER' && database.contasReceberId != null && (
            <p>Conta a receber: <span className="font-medium text-gray-950">ID {database.contasReceberId}</span></p>
          )}
          {database.parcelas?.length > 0 && (
            <>
              <p>Parcelas: <span className="font-medium text-gray-950">{database.parcelas.length}</span></p>
              {database.parcelas[0]?.identificacao && (
                <p>Identificação das parcelas: <span className="font-medium text-gray-950">{database.parcelas[0].identificacao}</span></p>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const tipoConsulta = database?.tipo || 'APAGAR';

  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden animate-slide-up border border-gray-100 mt-6">
      <div className="p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Conferência</p>
        <h2 className="text-2xl font-semibold mb-1 text-gray-900">Dados x cadastro</h2>
        <p className="text-sm text-gray-500 mb-6">Cada bloco mostra o que saiu do documento e se já há registro equivalente. Revise antes de confirmar o lançamento.</p>

        {database ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
              {renderEntity('Fornecedor', database.fornecedor)}
              {renderEntity('Cliente', database.cliente)}
              {renderEntity('Faturado', database.faturado)}
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Tipo de movimento</p>
                <p className="text-lg font-semibold text-gray-900">{tipoConsulta}</p>
              </div>
            </div>
            {tipoConsulta === 'APAGAR' && renderClassifications('Classificações de despesa', database.classificacoes || [])}
            {tipoConsulta === 'ARECEBER' && renderClassifications('Classificações de receita', database.classificacoes || [])}
          </>
        ) : (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            Não foi possível verificar os registros no banco.
          </div>
        )}

        {renderMovement()}

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Resposta técnica (JSON)</p>
              <p className="text-xs text-slate-500">Só precisa abrir se for depurar integração ou copiar o payload.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRawJsonOpen((o) => !o)}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
              >
                {rawJsonOpen ? 'Ocultar JSON' : 'Mostrar JSON'}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${copied ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
              >
                {copied ? 'Copiado' : 'Copiar JSON'}
              </button>
            </div>
          </div>
        </div>

        {rawJsonOpen && (
          <div className="relative rounded-3xl overflow-hidden bg-slate-950 shadow-inner">
            <pre className="p-6 overflow-x-auto text-sm text-slate-200 font-mono leading-relaxed max-h-[360px] styled-scrollbar">
              <code>{jsonString}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default JsonViewer;
