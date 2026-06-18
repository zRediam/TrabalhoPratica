const db = require('../config/db');

async function seed() {
  console.log('--- Iniciando Seeding do Banco de Dados ---');

  try {
    // 1. Limpar registros antigos para evitar conflitos de Unique Key ou duplicidade
    console.log('Limpando tabelas antigas...');
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    await db.query('TRUNCATE TABLE parcelacontas');
    await db.query('TRUNCATE TABLE contas_pagar');
    await db.query('TRUNCATE TABLE contas_receber');
    await db.query('TRUNCATE TABLE movimentocontas_tipos_despesas');
    await db.query('TRUNCATE TABLE movimentocontas_tipos_receitas');
    await db.query('TRUNCATE TABLE movimentocontas');
    await db.query('TRUNCATE TABLE mantem_fornecedor');
    await db.query('TRUNCATE TABLE mantem_cliente');
    await db.query('TRUNCATE TABLE mantem_faturado');
    await db.query('TRUNCATE TABLE tipo_despesa');
    await db.query('TRUNCATE TABLE tipo_receita');
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✓ Tabelas limpas');

    // Garantir usuário administrador padrão
    const [userRows] = await db.query("SELECT id FROM usuarios WHERE email = 'admin@admin.com'");
    if (userRows.length === 0) {
      const crypto = require('crypto');
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
      const senhaHash = `${salt}:${hash}`;
      await db.query(
        "INSERT INTO usuarios (email, senha_hash, nome, status) VALUES (?, ?, ?, ?)",
        ['admin@admin.com', senhaHash, 'Administrador', 'ATIVO']
      );
      console.log('✓ Usuário administrador padrão criado/restaurado.');
    }

    // 2. Inserir Classificações de Despesa
    const despesas = [
      'INSUMOS AGRÍCOLAS', 'MANUTENÇÃO E OPERAÇÃO', 'RECURSOS HUMANOS',
      'SERVIÇOS OPERACIONAIS', 'INFRAESTRUTURA E UTILIDADES', 'ADMINISTRATIVAS',
      'SEGUROS E PROTEÇÃO', 'IMPOSTOS E TAXAS', 'INVESTIMENTOS'
    ];
    const despesaIds = [];
    for (const d of despesas) {
      const [res] = await db.query('INSERT INTO tipo_despesa (descricao, status) VALUES (?, ?)', [d, 'ATIVO']);
      despesaIds.push(res.insertId);
    }
    console.log(`✓ ${despesaIds.length} classificações de despesa inseridas.`);

    // 3. Inserir Classificações de Receita
    const receitas = ['VENDA DE PRODUTOS', 'SERVIÇOS PRESTADOS', 'RECEITA FINANCEIRA', 'RECEITA DIVERSA'];
    const receitaIds = [];
    for (const r of receitas) {
      const [res] = await db.query('INSERT INTO tipo_receita (descricao, status) VALUES (?, ?)', [r, 'ATIVO']);
      receitaIds.push(res.insertId);
    }
    console.log(`✓ ${receitaIds.length} classificações de receita inseridas.`);

    // 4. Inserir Fornecedores
    const fornecedoresData = [
      { razao: 'Agropecuária Vale Verde Ltda', fantasia: 'Agro Vale', cnpj: '11222333000100' },
      { razao: 'Tratores e Implementos Oeste S/A', fantasia: 'Oeste Implementos', cnpj: '22333444000199' },
      { razao: 'Fertilizantes NPK Brasil', fantasia: 'NPK Brasil', cnpj: '33444555000188' },
      { razao: 'Distribuidora de Combustíveis Sul', fantasia: 'Sul Combustíveis', cnpj: '44555666000177' },
      { razao: 'Soluções de Tecnologia AgroTech', fantasia: 'AgroTech', cnpj: '55666777000166' },
      { razao: 'Manutenção de Máquinas São João', fantasia: 'Mecânica São João', cnpj: '66777888000155' },
      { razao: 'Seguradora AgroSegur S/A', fantasia: 'AgroSegur', cnpj: '77888999000144' },
      { razao: 'Cooperativa Agrícola Regional', fantasia: 'CoopAgri', cnpj: '88999000000133' },
      { razao: 'Embalagens e Sacarias Progresso', fantasia: 'Progresso Embalagens', cnpj: '99000111000122' },
      { razao: 'Transportadora Carga Rápida', fantasia: 'Carga Rápida', cnpj: '10111222000111' },
    ];
    const fornecedorIds = [];
    for (const f of fornecedoresData) {
      const status = Math.random() > 0.15 ? 'ATIVO' : 'INATIVO'; // 15% inativos para testar filtros
      const [res] = await db.query(
        'INSERT INTO mantem_fornecedor (razao_social, nome_fantasia, cnpj, status) VALUES (?, ?, ?, ?)',
        [f.razao, f.fantasia, f.cnpj, status]
      );
      fornecedorIds.push({ id: res.insertId, status });
    }
    console.log(`✓ ${fornecedorIds.length} fornecedores inseridos.`);

    // 5. Inserir Clientes
    const clientesData = [
      { nome: 'José da Silva Sauro', doc: '12345678909', end: 'Rua das Flores, 123, Curitiba - PR' },
      { nome: 'Maria de Souza Santos', doc: '98765432101', end: 'Av. Paulista, 1500, São Paulo - SP' },
      { nome: 'Supermercados Pão e Leite Ltda', doc: '12345678000190', end: 'Av. Caxias, 450, Porto Alegre - RS' },
      { nome: 'Cerealista Grão de Ouro S/A', doc: '23456789000180', end: 'Rodovia BR-116, Km 45, Londrina - PR' },
      { nome: 'Indústria de Alimentos Saboroso', doc: '34567890000170', end: 'Rua Industrial, 89, Joinville - SC' },
      { nome: 'Antônio Carlos Pereira', doc: '45678901234', end: 'Rua Central, 12, Cascavel - PR' },
      { nome: 'Comércio de Cereais Oeste', doc: '56789012000160', end: 'Av. Brasil, 1010, Maringá - PR' },
      { nome: 'Fernanda Lima Alencar', doc: '67890123456', end: 'Rua XV de Novembro, 77, Ponta Grossa - PR' },
      { nome: 'Agroindústria Tropical S/A', doc: '78901234000150', end: 'Fazenda Tropical, Zona Rural, Petrolina - PE' },
      { nome: 'Exportadora Rioplatense Ltda', doc: '89012345000140', end: 'Rua do Porto, 88, Santos - SP' },
    ];
    const clienteIds = [];
    for (const c of clientesData) {
      const status = Math.random() > 0.15 ? 'ATIVO' : 'INATIVO';
      const [res] = await db.query(
        'INSERT INTO mantem_cliente (nome, documento, endereco, status) VALUES (?, ?, ?, ?)',
        [c.nome, c.doc, c.end, status]
      );
      clienteIds.push({ id: res.insertId, status });
    }
    console.log(`✓ ${clienteIds.length} clientes inseridos.`);

    // 6. Inserir Faturados
    const faturadosData = [
      { nome: 'Fazenda Recanto Feliz', doc: '90123456000130', end: 'Estrada da Limeira, Km 12, Guaratuba - PR' },
      { nome: 'Sítio Três Corações', doc: '01234567000120', end: 'Linha Bonita, S/N, Toledo - PR' },
      { nome: 'Agropecuária Nova Vida S/A', doc: '12345678000110', end: 'Rodovia PR-444, Km 5, Arapongas - PR' },
      { nome: 'Fazenda Sol Nascente', doc: '23456789000109', end: 'Estrada Geral, Km 20, Castro - PR' },
      { nome: 'Sítio São Francisco', doc: '34567890000198', end: 'Linha Rio Grande, S/N, Medianeira - PR' },
      { nome: 'Chácara Santa Rita', doc: '45678901000187', end: 'Rua do Bosque, Chácara 4, Pinhais - PR' },
      { nome: 'Fazenda Rio Bonito', doc: '56789012000176', end: 'Zona Rural, Guarapuava - PR' },
      { nome: 'Sítio Bela Vista', doc: '67890123000165', end: 'Linha Norte, Km 3, Francisco Beltrão - PR' },
      { nome: 'Fazenda Estrela do Sul', doc: '78901234000154', end: 'Rodovia BR-277, Km 150, Palmeira - PR' },
      { nome: 'Sítio Boa Esperança', doc: '89012345000143', end: 'Estrada Municipal, Km 8, Paranavaí - PR' }
    ];
    const faturadoIds = [];
    for (const f of faturadosData) {
      const status = Math.random() > 0.15 ? 'ATIVO' : 'INATIVO';
      const [res] = await db.query(
        'INSERT INTO mantem_faturado (nome, documento, endereco, status) VALUES (?, ?, ?, ?)',
        [f.nome, f.doc, f.end, status]
      );
      faturadoIds.push({ id: res.insertId, status });
    }
    console.log(`✓ ${faturadoIds.length} faturados inseridos.`);

    // 7. Inserir Movimentações de Contas (cerca de 170 registros)
    // Para completar o total de 200 registros no banco
    console.log('Inserindo movimentos de contas, parcelas e lançamentos secundários...');
    let totalMovimentos = 0;
    
    // Lista de produtos fictícios para preencher a descrição
    const produtos = [
      'Adubo formulado NPK 04-14-08 (10 toneladas)',
      'Sementes de milho híbrido Agro-100 (50 sacos)',
      'Óleo diesel S10 para tratores (5000 litros)',
      'Defensivo agrícola inseticida Lannate (20 litros)',
      'Manutenção preventiva do trator John Deere 6100J',
      'Serviço de colheita mecanizada de soja (15 hectares)',
      'Pagamento de folha salarial - Mês de referência',
      'Seguro contra granizo da lavoura de trigo',
      'Tarifa de energia elétrica da bomba de irrigação',
      'Peças de reposição para colheitadeira Case IH',
      'Venda de lote de soja a granel (500 sacas)',
      'Venda de milho em grãos (1200 sacas)',
      'Recebimento de arrendamento de pastagem',
      'Serviço de frete interestadual de grãos',
    ];

    for (let i = 1; i <= 170; i++) {
      const tipo = Math.random() > 0.4 ? 'APAGAR' : 'ARECEBER';
      const activeFornecedores = fornecedorIds.filter(f => f.status === 'ATIVO');
      const activeFaturados = faturadoIds.filter(f => f.status === 'ATIVO');
      
      const forn = activeFornecedores[Math.floor(Math.random() * activeFornecedores.length)];
      const fat = activeFaturados[Math.floor(Math.random() * activeFaturados.length)];
      
      const numNota = `NF-${String(1000 + i).padStart(4, '0')}`;
      
      // Datas realistas espalhadas em 2026
      const month = Math.floor(Math.random() * 6); // Jan a Jun
      const day = Math.floor(Math.random() * 28) + 1;
      const dataEmissao = `2026-0${month + 1}-${String(day).padStart(2, '0')}`;
      
      const dueDays = [15, 30, 45, 60][Math.floor(Math.random() * 4)];
      const dateObj = new Date(dataEmissao);
      dateObj.setDate(dateObj.getDate() + dueDays);
      const dataVencimento = dateObj.toISOString().split('T')[0];

      const valorTotal = Number((Math.random() * 8000 + 100).toFixed(2));
      const descProd = produtos[Math.floor(Math.random() * produtos.length)];
      
      const statusMov = Math.random() > 0.1 ? 'ATIVO' : 'INATIVO'; // Logical status
      const statusPag = ['PENDENTE', 'PAGO', 'BANCARIO'][Math.floor(Math.random() * 3)];
      
      let tipoDespesaId = null;
      let tipoReceitaId = null;

      if (tipo === 'APAGAR') {
        tipoDespesaId = despesaIds[Math.floor(Math.random() * despesaIds.length)];
      } else {
        tipoReceitaId = receitaIds[Math.floor(Math.random() * receitaIds.length)];
      }

      // Inserir Movimento
      const [movRes] = await db.query(
        `INSERT INTO movimentocontas 
          (fornecedor_id, faturado_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, tipo_despesa_id, tipo, status_pagamento, status, descricao_produtos)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tipo === 'APAGAR' ? forn.id : null,
          fat.id,
          numNota,
          dataEmissao,
          dataVencimento,
          valorTotal,
          tipo === 'APAGAR' ? tipoDespesaId : null,
          tipo,
          statusPag,
          statusMov,
          descProd
        ]
      );
      
      const movimentoId = movRes.insertId;
      totalMovimentos++;

      // Associar tipo de despesa / receita na tabela pivot
      if (tipo === 'APAGAR') {
        await db.query(
          'INSERT INTO movimentocontas_tipos_despesas (movimento_contas_id, tipo_despesa_id) VALUES (?, ?)',
          [movimentoId, tipoDespesaId]
        );
        
        // contas_pagar
        await db.query(
          `INSERT INTO contas_pagar (fornecedor_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, status_pagamento, tipo_despesa_id, movimento_contas_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [forn.id, numNota, dataEmissao, dataVencimento, valorTotal, statusPag, tipoDespesaId, movimentoId]
        );
      } else {
        await db.query(
          'INSERT INTO movimentocontas_tipos_receitas (movimento_contas_id, tipo_receita_id) VALUES (?, ?)',
          [movimentoId, tipoReceitaId]
        );

        // contas_receber
        await db.query(
          `INSERT INTO contas_receber (faturado_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, status_recebimento, tipo_receita_id, movimento_contas_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [fat.id, numNota, dataEmissao, dataVencimento, valorTotal, statusPag === 'PENDENTE' ? 'PENDENTE' : 'RECEBIDO', tipoReceitaId, movimentoId]
        );
      }

      // Criar parcelas
      const numParcelas = Math.random() > 0.7 ? 3 : 1; // 30% parcelado em 3x, 70% parcela única
      const identificacao = numParcelas === 1 ? 'UNICA' : 'PARCELADA';
      const valorParcela = Number((valorTotal / numParcelas).toFixed(2));
      
      for (let pNum = 1; pNum <= numParcelas; pNum++) {
        const pDate = new Date(dataEmissao);
        pDate.setMonth(pDate.getMonth() + pNum);
        const pDateSql = pDate.toISOString().split('T')[0];
        
        const valorReal = pNum === numParcelas 
          ? Number((valorTotal - valorParcela * (numParcelas - 1)).toFixed(2))
          : valorParcela;

        await db.query(
          `INSERT INTO parcelacontas (movimento_contas_id, parcela_numero, valor, data_vencimento, identificacao, status_pagamento)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [movimentoId, pNum, valorReal, pDateSql, identificacao, statusPag]
        );
      }
    }

    console.log(`✓ ${totalMovimentos} movimentações de contas criadas (com parcelas e espelhos correspondentes).`);
    console.log('\n--- Seeding Concluído com Sucesso ---');
    console.log(`Total geral de registros inseridos:`);
    console.log(`- Fornecedores: ${fornecedorIds.length}`);
    console.log(`- Clientes: ${clienteIds.length}`);
    console.log(`- Faturados: ${faturadoIds.length}`);
    console.log(`- Classificações Despesa: ${despesaIds.length}`);
    console.log(`- Classificações Receita: ${receitaIds.length}`);
    console.log(`- Movimentações de Conta: ${totalMovimentos}`);

  } catch (err) {
    console.error('❌ Erro durante o seeding:', err.message);
    throw err;
  }
}

// Rodar se executado diretamente
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seed;
