-- Criação do Banco de Dados
CREATE DATABASE IF NOT EXISTS notas_fiscais;
USE notas_fiscais;

-- Tabelas essenciais solicitadas no projeto

CREATE TABLE IF NOT EXISTS mantem_fornecedor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    cnpj VARCHAR(20) UNIQUE NOT NULL,
    status ENUM('ATIVO', 'INATIVO') DEFAULT 'ATIVO',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mantem_cliente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    documento VARCHAR(20) UNIQUE NOT NULL,
    endereco TEXT,
    status ENUM('ATIVO', 'INATIVO') DEFAULT 'ATIVO',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mantem_faturado (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    documento VARCHAR(20) UNIQUE NOT NULL,
    endereco TEXT,
    status ENUM('ATIVO', 'INATIVO') DEFAULT 'ATIVO',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tipo_despesa (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descricao VARCHAR(100) NOT NULL,
    status ENUM('ATIVO', 'INATIVO') DEFAULT 'ATIVO'
);

CREATE TABLE IF NOT EXISTS tipo_receita (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descricao VARCHAR(100) NOT NULL,
    status ENUM('ATIVO', 'INATIVO') DEFAULT 'ATIVO'
);

CREATE TABLE IF NOT EXISTS movimentocontas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fornecedor_id INT,
    faturado_id INT,
    numero_nota_fiscal VARCHAR(50),
    data_emissao DATE,
    data_vencimento DATE,
    valor_total DECIMAL(15, 2),
    tipo_despesa_id INT,
    tipo ENUM('APAGAR', 'ARECEBER') DEFAULT 'APAGAR',
    status_pagamento ENUM('PENDENTE', 'PAGO', 'BANCARIO') DEFAULT 'PENDENTE',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fornecedor_id) REFERENCES mantem_fornecedor(id),
    FOREIGN KEY (faturado_id) REFERENCES mantem_faturado(id),
    FOREIGN KEY (tipo_despesa_id) REFERENCES tipo_despesa(id)
);

CREATE TABLE IF NOT EXISTS movimentocontas_tipos_despesas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    movimento_contas_id INT NOT NULL,
    tipo_despesa_id INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (movimento_contas_id) REFERENCES movimentocontas(id),
    FOREIGN KEY (tipo_despesa_id) REFERENCES tipo_despesa(id)
);

CREATE TABLE IF NOT EXISTS movimentocontas_tipos_receitas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    movimento_contas_id INT NOT NULL,
    tipo_receita_id INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (movimento_contas_id) REFERENCES movimentocontas(id),
    FOREIGN KEY (tipo_receita_id) REFERENCES tipo_receita(id)
);

CREATE TABLE IF NOT EXISTS parcelacontas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    movimento_contas_id INT,
    parcela_numero INT NOT NULL,
    valor DECIMAL(15, 2) NOT NULL,
    data_vencimento DATE,
    identificacao ENUM('UNICA', 'PARCELADA') NOT NULL DEFAULT 'UNICA',
    status_pagamento ENUM('PENDENTE', 'PAGO', 'BANCARIO') DEFAULT 'PENDENTE',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (movimento_contas_id) REFERENCES movimentocontas(id)
);

CREATE TABLE IF NOT EXISTS contas_pagar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fornecedor_id INT,
    numero_nota_fiscal VARCHAR(50),
    data_emissao DATE,
    data_vencimento DATE,
    valor_total DECIMAL(15, 2),
    status_pagamento ENUM('PENDENTE', 'PAGO', 'BANCARIO') DEFAULT 'PENDENTE',
    tipo_despesa_id INT,
    movimento_contas_id INT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fornecedor_id) REFERENCES mantem_fornecedor(id),
    FOREIGN KEY (tipo_despesa_id) REFERENCES tipo_despesa(id),
    FOREIGN KEY (movimento_contas_id) REFERENCES movimentocontas(id)
);

CREATE TABLE IF NOT EXISTS contas_receber (
    id INT AUTO_INCREMENT PRIMARY KEY,
    faturado_id INT,
    numero_nota_fiscal VARCHAR(50),
    data_emissao DATE,
    data_vencimento DATE,
    valor_total DECIMAL(15, 2),
    status_recebimento ENUM('PENDENTE', 'RECEBIDO', 'BANCARIO') DEFAULT 'PENDENTE',
    tipo_receita_id INT,
    movimento_contas_id INT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (faturado_id) REFERENCES mantem_faturado(id),
    FOREIGN KEY (tipo_receita_id) REFERENCES tipo_receita(id),
    FOREIGN KEY (movimento_contas_id) REFERENCES movimentocontas(id)
);

-- Inserts Iniciais para Tipo de Despesa
INSERT IGNORE INTO tipo_despesa (descricao) VALUES 
('INSUMOS AGRÍCOLAS'), 
('MANUTENÇÃO E OPERAÇÃO'), 
('RECURSOS HUMANOS'), 
('SERVIÇOS OPERACIONAIS'),
('INFRAESTRUTURA E UTILIDADES'),
('ADMINISTRATIVAS'),
('SEGUROS E PROTEÇÃO'),
('IMPOSTOS E TAXAS'),
('INVESTIMENTOS');

INSERT IGNORE INTO tipo_receita (descricao) VALUES
('VENDA DE PRODUTOS'),
('SERVIÇOS PRESTADOS'),
('RECEITA FINANCEIRA'),
('RECEITA DIVERSA');
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    status ENUM('ATIVO', 'INATIVO') DEFAULT 'ATIVO',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usuário administrador padrão é criado automaticamente em schemaPatches.js (admin@admin.com / admin123)
