
CREATE TABLE "da"."users" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret CHAR(32) NOT NULL,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(320),
    phone VARCHAR(13) NOT NULL,
    image VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    blocked BOOLEAN NOT NULL DEFAULT FALSE,
    comment VARCHAR(500),
    roles JSONB NOT NULL DEFAULT '["user"]'::jsonb,
    city VARCHAR(100),
    state VARCHAR(100),
    location JSONB,  -- Store lat/lng as JSON
    age SMALLINT,
    gender VARCHAR(10),            -- 'male', 'female', 'other'
    intent VARCHAR(20),            -- 'casual', 'serious', 'marriage'
    photos JSONB DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    mother_tongue VARCHAR(50),
    religion VARCHAR(50),
    community VARCHAR(100),
    education VARCHAR(100),
    profession VARCHAR(100),
    voice_intro_url VARCHAR(500),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_type VARCHAR(20),     -- 'selfie', 'aadhaar'
    is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    spark_pass_expiry BIGINT,
    is_onboarded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT,
    modified_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT
);

-- Migration: add dating profile columns to existing da.users table
-- ALTER TABLE da.users ADD COLUMN age SMALLINT;
-- ALTER TABLE da.users ADD COLUMN gender VARCHAR(10);
-- ALTER TABLE da.users ADD COLUMN intent VARCHAR(20);
-- ALTER TABLE da.users ADD COLUMN photos JSONB DEFAULT '[]'::jsonb;
-- ALTER TABLE da.users ADD COLUMN tags JSONB DEFAULT '[]'::jsonb;
-- ALTER TABLE da.users ADD COLUMN mother_tongue VARCHAR(50);
-- ALTER TABLE da.users ADD COLUMN religion VARCHAR(50);
-- ALTER TABLE da.users ADD COLUMN community VARCHAR(100);
-- ALTER TABLE da.users ADD COLUMN education VARCHAR(100);
-- ALTER TABLE da.users ADD COLUMN profession VARCHAR(100);
-- ALTER TABLE da.users ADD COLUMN voice_intro_url VARCHAR(500);
-- ALTER TABLE da.users ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE;
-- ALTER TABLE da.users ADD COLUMN verified_type VARCHAR(20);
-- ALTER TABLE da.users ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT FALSE;
-- ALTER TABLE da.users ADD COLUMN spark_pass_expiry BIGINT;
-- ALTER TABLE da.users ADD COLUMN is_onboarded BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "da"."tokens" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid UUID NOT NULL REFERENCES da.users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    location JSONB,  
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT,
    modified_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT
);

CREATE TABLE "da"."pushsubs" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid UUID NOT NULL UNIQUE,
    timestamp INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE "da"."web_pushsubs" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pushsub_id UUID NOT NULL REFERENCES da.pushsubs(id) ON DELETE CASCADE,
    endpoint VARCHAR(500) NOT NULL UNIQUE,
    keys JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expiration_time INTEGER,
    timestamp INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE "da"."android_pushsubs" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pushsub_id UUID NOT NULL REFERENCES da.pushsubs(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL UNIQUE,
    manufacturer VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    os VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    timestamp INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);
-- ===========================================================
-- SWIPES TABLE — tracks like/pass/super_like actions
-- ===========================================================
CREATE TABLE "da"."swipes" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES da.users(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES da.users(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL,  -- 'like', 'pass', 'super_like'
    created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT,
    UNIQUE(user_id, target_id)
);

CREATE INDEX idx_swipes_user_id ON da.swipes(user_id);
CREATE INDEX idx_swipes_target_id ON da.swipes(target_id);

-- ===========================================================
-- MATCHES TABLE — created when both users like each other
-- ===========================================================
CREATE TABLE "da"."matches" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL REFERENCES da.users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES da.users(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT,
    UNIQUE(user1_id, user2_id)
);

CREATE INDEX idx_matches_user1 ON da.matches(user1_id);
CREATE INDEX idx_matches_user2 ON da.matches(user2_id);

-- ===========================================================
-- BLOCKS TABLE — tracks user blocks
-- ===========================================================
CREATE TABLE "da"."blocks" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES da.users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES da.users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT,
    UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX idx_blocks_blocker ON da.blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON da.blocks(blocked_id);

-- ===========================================================
-- REPORTS TABLE — tracks user reports
-- ===========================================================
CREATE TABLE "da"."reports" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES da.users(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES da.users(id) ON DELETE CASCADE,
    reason VARCHAR(50) NOT NULL,  -- 'spam', 'harassment', 'fake_profile', 'inappropriate_content', 'other'
    comment VARCHAR(500),
    evidence_url VARCHAR(500),  -- URL to file containing last conversation data
    created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT
);

CREATE INDEX idx_reports_reporter ON da.reports(reporter_id);
CREATE INDEX idx_reports_reported ON da.reports(reported_id);

-- ===========================================================

-- ===========================================================
-- OPTIONAL: ALERTS TABLE
-- ===========================================================
CREATE TABLE public.alerts (
    id SERIAL PRIMARY KEY,
    land_id INT NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
    message TEXT,
    change_pct DOUBLE PRECISION,
    created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
);

CREATE INDEX idx_alerts_land_id ON public.alerts(land_id);
