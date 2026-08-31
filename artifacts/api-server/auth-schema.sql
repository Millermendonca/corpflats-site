-- ══════════════════════════════════════════════════════════════════════════════
-- Guest Flow Manager / CorpFlats - Esquema de Banco de Dados de Produção
-- Módulo de Autenticação, Perfis, Passkeys, Sessões Seguras e RLS
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Extensões Criptográficas e UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabela Principal de Usuários (Users & Autenticação)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'guest' CHECK (role IN ('admin', 'manager', 'reception', 'housekeeper', 'guest')),
    is_email_verified BOOLEAN DEFAULT FALSE,
    google_id VARCHAR(255) UNIQUE,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- 3. Tabela de Perfis de Usuário / Hóspede (Profiles)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    document VARCHAR(50), -- CPF / CNPJ / Passaporte
    birth_date DATE,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    company_cnpj VARCHAR(50),
    company_name VARCHAR(255),
    company_email VARCHAR(255),
    company_phone VARCHAR(50),
    vehicle_plate VARCHAR(20),
    vehicle_brand VARCHAR(50),
    vehicle_model VARCHAR(50),
    vehicle_color VARCHAR(50),
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_document ON profiles(document);

-- 4. Tabela de Credenciais Passkey / WebAuthn (Touch ID, Face ID, Windows Hello)
CREATE TABLE IF NOT EXISTS passkey_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    transports TEXT[],
    device_name VARCHAR(100) DEFAULT 'Dispositivo Biométrico',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkey_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkey_credentials(credential_id);

-- 5. Tabela de Sessões Ativas (Cookie Session Store com Revogação Instantânea)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address VARCHAR(45),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);

-- 6. Tabela de Tokens de Recuperação de Senha & Links Mágicos
CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);

-- 7. Tabela de Logs de Auditoria e Segurança (LGPD)
CREATE TABLE IF NOT EXISTS audit_security_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_logs_user_id ON audit_security_logs(user_id);

-- 8. Habilitando Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- 9. Políticas de Segurança RLS
DROP POLICY IF EXISTS user_profile_isolation ON profiles;
CREATE POLICY user_profile_isolation ON profiles
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS user_passkeys_isolation ON passkey_credentials;
CREATE POLICY user_passkeys_isolation ON passkey_credentials
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
