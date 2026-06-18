import { useState } from 'react';
import CrudManager from './CrudManager';

export default function PessoasManager({ apiBaseUrl }) {
  const [activeTab, setActiveTab] = useState('fornecedor'); // 'fornecedor' | 'cliente' | 'faturado'

  const tabs = [
    { id: 'fornecedor', label: 'Fornecedores' },
    { id: 'cliente', label: 'Clientes' },
    { id: 'faturado', label: 'Faturados' }
  ];

  const fornecedorFields = [
    { key: 'razao_social', label: 'Razão Social', type: 'text', required: true },
    { key: 'nome_fantasia', label: 'Nome Fantasia', type: 'text', required: false },
    { key: 'cnpj', label: 'CNPJ', type: 'text', required: true }
  ];

  const clienteFields = [
    { key: 'nome', label: 'Nome Completo / Razão Social', type: 'text', required: true },
    { key: 'documento', label: 'Documento (CPF/CNPJ)', type: 'text', required: true },
    { key: 'endereco', label: 'Endereço Completo', type: 'text', required: true }
  ];

  const faturadoFields = [
    { key: 'nome', label: 'Nome Completo / Razão Social', type: 'text', required: true },
    { key: 'documento', label: 'Documento (CPF/CNPJ)', type: 'text', required: true },
    { key: 'endereco', label: 'Endereço Completo', type: 'text', required: true }
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
      {activeTab === 'fornecedor' && (
        <CrudManager
          entity="fornecedor"
          title="Manter Fornecedores"
          subtitle="Gerencie as empresas emissoras e prestadores de serviços parceiros."
          fields={fornecedorFields}
          apiBaseUrl={apiBaseUrl}
        />
      )}

      {activeTab === 'cliente' && (
        <CrudManager
          entity="cliente"
          title="Manter Clientes"
          subtitle="Gerencie a base de clientes tomadores de serviço e compradores."
          fields={clienteFields}
          apiBaseUrl={apiBaseUrl}
        />
      )}

      {activeTab === 'faturado' && (
        <CrudManager
          entity="faturado"
          title="Manter Faturados"
          subtitle="Gerencie as entidades internas/faturadas e filiais vinculadas aos lançamentos."
          fields={faturadoFields}
          apiBaseUrl={apiBaseUrl}
        />
      )}
    </div>
  );
}
