import CrudManager from './CrudManager';

export default function ContasManager({ apiBaseUrl }) {
  const fields = [
    {
      key: 'tipo',
      label: 'Tipo de Conta',
      type: 'select',
      required: true,
      options: [
        { value: 'APAGAR', label: 'A Pagar (Despesa)' },
        { value: 'ARECEBER', label: 'A Receber (Receita)' }
      ],
      defaultValue: 'APAGAR'
    },
    {
      key: 'fornecedor_id',
      label: 'Fornecedor',
      type: 'select',
      relationEntity: 'fornecedor',
      required: false
    },
    {
      key: 'faturado_id',
      label: 'Faturado / Empresa Beneficiária',
      type: 'select',
      relationEntity: 'faturado',
      required: true
    },
    {
      key: 'tipo_despesa_id',
      label: 'Classificação de Despesa',
      type: 'select',
      relationEntity: 'despesa',
      required: false
    },
    {
      key: 'numero_nota_fiscal',
      label: 'Número da Nota Fiscal',
      type: 'text',
      required: false
    },
    {
      key: 'data_emissao',
      label: 'Data de Emissão',
      type: 'date',
      required: true
    },
    {
      key: 'data_vencimento',
      label: 'Data de Vencimento',
      type: 'date',
      required: true
    },
    {
      key: 'valor_total',
      label: 'Valor Total',
      type: 'number',
      required: true,
      isCurrency: true
    },
    {
      key: 'status_pagamento',
      label: 'Status de Pagamento',
      type: 'select',
      required: true,
      options: [
        { value: 'PENDENTE', label: 'Pendente' },
        { value: 'PAGO', label: 'Pago' },
        { value: 'BANCARIO', label: 'Bancário' }
      ],
      defaultValue: 'PENDENTE'
    },
    {
      key: 'descricao_produtos',
      label: 'Descrição dos Produtos / Serviços',
      type: 'textarea',
      required: false
    }
  ];

  return (
    <CrudManager
      entity="conta"
      title="Manter Contas"
      subtitle="Gerencie as movimentações financeiras a pagar e a receber, integrando lançamentos bancários."
      fields={fields}
      apiBaseUrl={apiBaseUrl}
    />
  );
}
