function DatabaseViewer({ data, onToggleStatus, statusUpdateLoading }) {
  if (!data) {
    return null;
  }

  const renderList = (title, items, fields, entityKey) => {
    if (!items || !items.length) {
      return (
        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-sm text-gray-500 mt-2">Nenhum registro encontrado.</p>
        </div>
      );
    }

    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-900 mb-3">{title} ({items.length})</p>
        <div className="space-y-3 text-sm text-gray-700">
          {items.slice(0, 6).map((item) => {
            const canToggleStatus = entityKey && item.status && typeof onToggleStatus === 'function';
            const nextAction = item.status === 'ATIVO' ? 'Inativar' : 'Reativar';

            return (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                {fields.map((field) => (
                  <p key={field.key} className="truncate"><span className="font-medium text-slate-900">{field.label}:</span> {item[field.key] ?? '—'}</p>
                ))}
                {canToggleStatus && (
                  <button
                    type="button"
                    onClick={() => onToggleStatus(entityKey, item.id)}
                    className="mt-3 inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-black"
                    disabled={statusUpdateLoading}
                  >
                    {nextAction}
                  </button>
                )}
              </div>
            );
          })}
          {items.length > 6 && (
            <p className="text-xs text-slate-500">Exibindo 6 de {items.length} registros.</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 mt-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-5">Consulta de cadastros</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {renderList('Fornecedores', data.fornecedores, [
          { key: 'razaoSocial', label: 'Razão social' },
          { key: 'nomeFantasia', label: 'Nome fantasia' },
          { key: 'cnpj', label: 'CNPJ' }
        ], 'fornecedor')}
        {renderList('Clientes', data.clientes, [
          { key: 'nome', label: 'Nome' },
          { key: 'documento', label: 'Documento' },
          { key: 'endereco', label: 'Endereço' }
        ], 'cliente')}
        {renderList('Faturados', data.faturados, [
          { key: 'nome', label: 'Nome' },
          { key: 'documento', label: 'Documento' },
          { key: 'endereco', label: 'Endereço' }
        ], 'faturado')}
        {renderList('Despesas', data.despesas, [
          { key: 'descricao', label: 'Descrição' },
          { key: 'status', label: 'Status' }
        ], 'despesa')}
        {renderList('Receitas', data.receitas, [
          { key: 'descricao', label: 'Descrição' },
          { key: 'status', label: 'Status' }
        ], 'receita')}
        {renderList('Movimentos', data.movimentos, [
          { key: 'numeroNotaFiscal', label: 'Nota fiscal' },
          { key: 'dataEmissao', label: 'Emissão' },
          { key: 'valorTotal', label: 'Valor' },
          { key: 'tipo', label: 'Tipo' }
        ], null)}
        {renderList('Parcelas', data.parcelas, [
          { key: 'movimentoContasId', label: 'Movimento ID' },
          { key: 'parcelaNumero', label: 'Parcela' },
          { key: 'identificacao', label: 'Identificação' },
          { key: 'dataVencimento', label: 'Vencimento' },
          { key: 'valor', label: 'Valor' }
        ], null)}
      </div>
    </div>
  );
}

export default DatabaseViewer;
