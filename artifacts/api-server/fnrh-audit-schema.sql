-- ══════════════════════════════════════════════════════════════════════════════
-- CorpFlats / Guest Flow Manager
-- Esquema de Auditoria Forense e Assinaturas Eletrônicas (FNRH)
-- Em conformidade com MP nº 2.200-2/2001 e Lei Federal nº 14.063/2020
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabela de Documentos Assinados Eletronicamente e Trilha Forense
CREATE TABLE IF NOT EXISTS fnrh_audit_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_uuid VARCHAR(100) UNIQUE NOT NULL,
    reservation_id VARCHAR(100) NOT NULL,
    reservation_code VARCHAR(100),
    guest_index INTEGER DEFAULT 1,
    guest_name VARCHAR(255) NOT NULL,
    guest_cpf VARCHAR(50) NOT NULL,
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    guest_address TEXT,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    canonical_hash VARCHAR(64),
    signer_ip VARCHAR(60),
    signer_user_agent TEXT,
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    signed_at_brasilia VARCHAR(100),
    verify_url TEXT,
    legal_terms_accepted BOOLEAN DEFAULT TRUE,
    is_valid BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fnrh_document_uuid ON fnrh_audit_documents(document_uuid);
CREATE INDEX IF NOT EXISTS idx_fnrh_reservation_id ON fnrh_audit_documents(reservation_id);
CREATE INDEX IF NOT EXISTS idx_fnrh_reservation_code ON fnrh_audit_documents(reservation_code);
CREATE INDEX IF NOT EXISTS idx_fnrh_guest_cpf ON fnrh_audit_documents(guest_cpf);
CREATE INDEX IF NOT EXISTS idx_fnrh_sha256 ON fnrh_audit_documents(sha256_hash);

-- Tabela de Tokens Temporários de Assinatura (Válidos por 2 horas)
CREATE TABLE IF NOT EXISTS fnrh_signature_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token VARCHAR(100) UNIQUE NOT NULL,
    reservation_code VARCHAR(100) NOT NULL,
    guest_index INTEGER DEFAULT 1,
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fnrh_tokens_token ON fnrh_signature_tokens(token);
CREATE INDEX IF NOT EXISTS idx_fnrh_tokens_res_code ON fnrh_signature_tokens(reservation_code);
