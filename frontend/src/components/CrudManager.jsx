import { useState, useEffect } from 'react';

export default function CrudManager({
  entity,
  title,
  subtitle,
  fields,
  apiBaseUrl = 'http://localhost:3000/api'
}) {
  const [data, setData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasQueried, setHasQueried] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Estado de ordenação
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'

  // Estado do modal de formulário
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('create'); // 'create' | 'edit'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [formData, setFormData] = useState({});
  const [formError, setFormError] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  // Opções de dropdown para relacionamentos
  const [dropdownOptions, setDropdownOptions] = useState({});

  // Reinicia a tela quando a entidade muda
  useEffect(() => {
    setData([]);
    setSearchQuery('');
    setHasQueried(false);
    setError(null);
    setSortField(null);
  }, [entity]);

  const [filterMode, setFilterMode] = useState('active'); // 'active' | 'inactive' | 'all'

  const handleReactivateRecord = async (id) => {
    if (!window.confirm('Deseja realmente reativar este registro?')) return;
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/crud/${entity}/${id}/reactivate`, {
        method: 'PATCH'
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao reativar registro.');
      }
      // Atualiza a lista após reativar
      await handleFetchData(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Carrega opções de selects quando o modal abre
  const loadRelationOptions = async () => {
    const selects = fields.filter(f => f.type === 'select' && f.relationEntity);
    if (!selects.length) return;

    try {
      const options = { ...dropdownOptions };
      for (const field of selects) {
        // Busca apenas itens ativos para seleção
        const res = await fetch(`${apiBaseUrl}/crud/${field.relationEntity}`);
        if (res.ok) {
          const list = await res.json();
          const getLabel = (item) => (
            item.razaoSocial ||
            item.razao_social ||
            item.nome ||
            item.nome_fantasia ||
            item.descricao ||
            item.descricao_curta ||
            item.id
          );
          options[field.key] = list.map(item => ({
            value: item.id,
            label: getLabel(item)
          }));
        }
      }
      setDropdownOptions(options);
    } catch (err) {
      console.error('Erro ao carregar dados relacionais:', err);
    }
  };

  const handleFetchData = async (loadAll = false, mode = filterMode) => {
    setLoading(true);
    setError(null);
    setHasQueried(true);

    let url = `${apiBaseUrl}/crud/${entity}`;
    const params = [];
    if (loadAll) {
      params.push('all=true');
    } else if (searchQuery.trim()) {
      params.push(`q=${encodeURIComponent(searchQuery.trim())}`);
    }

    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao buscar registros.');
      }
      const result = await response.json();
      if (mode === 'inactive') {
        setData(result.filter(r => r.status === 'INATIVO'));
      } else if (mode === 'active') {
        setData(result.filter(r => r.status === 'ATIVO'));
      } else {
        setData(result);
      }
    } catch (err) {
      setError(err.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (fieldKey) => {
    if (sortField === fieldKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(fieldKey);
      setSortDirection('asc');
    }
  };

  const getSortedData = () => {
    if (!sortField) return data;
    
    return [...data].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      
      // Trata valores nulos
      if (valA == null) return sortDirection === 'asc' ? 1 : -1;
      if (valB == null) return sortDirection === 'asc' ? -1 : 1;

      // Trata strings
      if (typeof valA === 'string') {
        return sortDirection === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      
      // Trata números e datas
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  };

  const openCreateModal = async () => {
    setModalType('create');
    setSelectedRecord(null);
    setFormError(null);
    
    // Dados iniciais do formulário
    const initial = {};
    fields.forEach(f => {
      initial[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
    });
    setFormData(initial);
    
    await loadRelationOptions();
    setShowModal(true);
  };

  const openEditModal = async (record) => {
    setModalType('edit');
    setSelectedRecord(record);
    setFormError(null);
    
    // Preenche valores, incluindo conversão de datas
    const initial = {};
    fields.forEach(f => {
      let val = record[f.key];
      if (f.type === 'date' && val) {
        // Converte data para yyyy-MM-dd
        val = val.substring(0, 10);
      }
      initial[f.key] = val ?? '';
    });
    setFormData(initial);
    
    await loadRelationOptions();
    setShowModal(true);
  };

  const handleInputChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    // Validações no front-end
    for (const f of fields) {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        setFormError(`O campo "${f.label}" é obrigatório.`);
        setFormLoading(false);
        return;
      }
    }

    const isEdit = modalType === 'edit';
    const url = isEdit 
      ? `${apiBaseUrl}/crud/${entity}/${selectedRecord.id}`
      : `${apiBaseUrl}/crud/${entity}`;
    
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || 'Falha ao salvar dados.');
      }

      // Atualiza a lista após salvar
      setShowModal(false);
      await handleFetchData(searchQuery === '' && !searchQuery.trim());
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteRecord = async (id) => {
    if (!window.confirm('Deseja realmente inativar este registro?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/crud/${entity}/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao deletar registro.');
      }

      // Atualiza a lista após desativar
      await handleFetchData(searchQuery === '' && !searchQuery.trim());
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sortedData = getSortedData();

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 sm:p-8 space-y-6">
      {/* Título e botão de adicionar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-5">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">{title}</h2>
          <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-200 hover:bg-violet-700 hover:shadow-xl transition-all cursor-pointer"
        >
          <span className="text-lg font-bold">+</span> Novo Registro
        </button>
      </div>

      {/* Barra de busca e ações */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            🔍
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFetchData(false)}
            placeholder="Digite os termos para pesquisar..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-500 focus:bg-white transition-all text-gray-800"
          />
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleFetchData(false)}
            className="px-5 py-3 bg-slate-800 hover:bg-black text-white text-sm font-semibold rounded-xl transition cursor-pointer"
          >
            Buscar
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setFilterMode('active');
              handleFetchData(false, 'active');
            }}
            className="px-5 py-3 bg-violet-100 text-violet-700 hover:bg-violet-200 text-sm font-semibold rounded-xl transition cursor-pointer"
          >
            Mostrar Todos (Ativos)
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setFilterMode('inactive');
              handleFetchData(true, 'inactive');
            }}
            className="px-5 py-3 bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-semibold rounded-xl transition cursor-pointer ml-2"
          >
            Mostrar Inativos
          </button>
        </div>
      </div>

      {/* Área principal da tabela */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {!hasQueried ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500 space-y-3">
          <div className="text-4xl">🗂️</div>
          <p className="font-semibold text-gray-700 text-lg">Tabela de registros vazia</p>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Por recomendação do sistema, a tabela é carregada apenas após uma busca ou ao clicar em "Mostrar Todos".
          </p>
        </div>
      ) : loading ? (
        <div className="py-20 flex justify-center items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
        </div>
      ) : sortedData.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          <p className="font-medium text-gray-700">Nenhum registro encontrado.</p>
          <p className="text-sm text-gray-400 mt-1">Refine seus termos de busca ou tente reativar itens.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
          <table className="min-w-full divide-y divide-gray-100 text-sm text-left">
            <thead className="bg-slate-50 text-gray-600 font-semibold uppercase text-xs tracking-wider">
              <tr>
                {/* Indexação de coluna */}
                <th className="px-6 py-4">#</th>
                
                {fields.map(field => (
                  <th
                    key={field.key}
                    onClick={() => handleSort(field.key)}
                    className="px-6 py-4 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap transition"
                  >
                    <div className="flex items-center gap-1.5">
                      {field.label}
                      {sortField === field.key ? (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      ) : (
                        <span className="opacity-20">⇅</span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {sortedData.map((record, index) => (
                <tr
                  key={record.id}
                  className="hover:bg-slate-50/80 transition-colors duration-150"
                >
                  {/* Número sequencial de linha (indexação) */}
                  <td className="px-6 py-4 font-mono text-xs text-gray-400">
                    {index + 1}
                  </td>
                  
                  {fields.map(field => {
                    let val = record[field.key];
                    
                    // Formatações customizadas
                    if (field.type === 'select' && field.relationEntity) {
                      // Se for relacionamento, mostra o id ou nome se tivermos
                      const optName = field.key.replace('_id', '_nome');
                      val = record[optName] || `ID: ${val}`;
                    } else if (field.type === 'date' && val) {
                      val = new Date(val).toLocaleDateString('pt-BR');
                    } else if (field.type === 'number' && typeof val === 'number') {
                      if (field.isCurrency) {
                        val = val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                      }
                    }

                    return (
                      <td key={field.key} className="px-6 py-4 max-w-xs truncate">
                        {val ?? '—'}
                      </td>
                    );
                  })}

                  {/* Status Badge */}
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        record.status === 'ATIVO'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {record.status || 'ATIVO'}
                    </span>
                  </td>

                  {/* Ações */}
                  <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEditModal(record)}
                      className="inline-flex items-center rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition cursor-pointer"
                    >
                      Editar
                    </button>
                    {record.status !== 'INATIVO' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRecord(record.id)}
                        className="inline-flex items-center rounded-lg bg-rose-50 hover:bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-600 transition cursor-pointer"
                      >
                        Desativar
                      </button>
                    )}
                    {record.status === 'INATIVO' && (
                      <button
                        type="button"
                        onClick={() => handleReactivateRecord(record.id)}
                        className="inline-flex items-center rounded-lg bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition cursor-pointer"
                      >
                        Reativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de criar/editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative animate-slide-up overflow-y-auto max-h-[90vh]">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold cursor-pointer"
            >
              ×
            </button>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {modalType === 'create' ? 'Novo Registro' : 'Editar Registro'}
            </h3>
            <p className="text-sm text-gray-500 mb-6 border-b border-gray-100 pb-4">
              Preencha os campos obrigatórios para salvar.
            </p>

            {formError && (
              <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {fields.map(field => {
                // Requisito 3.g & 3.h: Campo STATUS oculto no Create e no Update
                if (field.key === 'status') return null;

                const inputId = `form-field-${field.key}`;

                return (
                  <div key={field.key} className="flex flex-col gap-1.5 text-left">
                    <label htmlFor={inputId} className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-rose-500">*</span>}
                    </label>
                    
                    {field.type === 'select' ? (
                      <select
                        id={inputId}
                        value={formData[field.key] || ''}
                        onChange={(e) => handleInputChange(field.key, e.target.value)}
                        required={field.required}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-500 focus:bg-white text-gray-800"
                      >
                        <option value="">Selecione...</option>
                        {field.options ? (
                          field.options.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))
                        ) : (
                          dropdownOptions[field.key]?.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))
                        )}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        id={inputId}
                        value={formData[field.key] || ''}
                        onChange={(e) => handleInputChange(field.key, e.target.value)}
                        required={field.required}
                        rows={3}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-500 focus:bg-white text-gray-800"
                      />
                    ) : (
                      <input
                        id={inputId}
                        type={field.type}
                        value={formData[field.key] || ''}
                        onChange={(e) => handleInputChange(field.key, e.target.value)}
                        required={field.required}
                        step={field.type === 'number' ? 'any' : undefined}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-500 focus:bg-white text-gray-800"
                      />
                    )}
                  </div>
                );
              })}

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition cursor-pointer"
                  disabled={formLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-violet-200 hover:shadow-xl transition cursor-pointer"
                  disabled={formLoading}
                >
                  {formLoading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
