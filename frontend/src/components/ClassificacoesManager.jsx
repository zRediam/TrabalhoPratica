import { useState } from 'react';
import CrudManager from './CrudManager';

export default function ClassificacoesManager({ apiBaseUrl }) {
  const [activeTab, setActiveTab] = useState('despesa'); // 'despesa' | 'receita'

  const tabs = [
    { id: 'despesa', label: 'Classificações de Despesas' },
    { id: 'receita', label: 'Classificações de Receitas' }
  ];

  const despesaFields = [
    { key: 'descricao', label: 'Descrição da Categoria', type: 'text', required: true }
  ];

  const receitaFields = [
    { key: 'descricao', label: 'Descrição da Categoria', type: 'text', required: true }
  ];

  return (
    <div className="space-y-6">
      {/* Abas Internas */}
      <div className="flex border-b border-gray-200 bg-slate-50 p-2 rounded-2xl gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 text-center py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-violet-700 shadow-sm border border-gray-100'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Renderização do CRUD ativo */}
      {activeTab === 'despesa' && (
        <CrudManager
          entity="despesa"
          title="Classificações de Despesa"
          subtitle="Gerencie as categorias associadas às despesas de manutenção, insumos, impostos, etc."
          fields={despesaFields}
          apiBaseUrl={apiBaseUrl}
        />
      )}

      {activeTab === 'receita' && (
        <CrudManager
          entity="receita"
          title="Classificações de Receita"
          subtitle="Gerencie as categorias associadas às receitas financeiras, vendas e serviços."
          fields={receitaFields}
          apiBaseUrl={apiBaseUrl}
        />
      )}
    </div>
  );
}
