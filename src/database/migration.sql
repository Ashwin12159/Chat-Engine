-- ============================================================
-- Chat Engine V2 - Complete Database Migration
-- ============================================================
-- This file contains all database migrations for the chat engine:
-- - Multi-tenancy support
-- - User authentication
-- - Conversations and messages
-- - External visitors and SDK
-- - Inbox support (conversations scoped by inbox)
-- - Bot support
-- ============================================================

USE chat_engine_v2;
CREATE TABLE tenants (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Tenant settings
  max_users INT DEFAULT 1000,
  max_conversations_per_user INT DEFAULT 100,
  retention_days INT DEFAULT 365
);

-- Core Users Table with Multi-Tenancy
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_online BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  -- Unique email per tenant (not globally unique)
  UNIQUE(tenant_id, email)
);

-- Refresh Tokens for Auth with Tenancy
CREATE TABLE refresh_tokens (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  token_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_revoked BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  -- Unique token_id per tenant
  UNIQUE(tenant_id, token_id)
);

-- Core Conversations with Tenancy (1-to-1 only for scalability)
CREATE TABLE conversations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,

  status ENUM('open', 'pending', 'closed') DEFAULT 'open',

  assigned_user_id CHAR(36) NULL, -- agent (users.id)
  last_message_at TIMESTAMP NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX (tenant_id, status),
  INDEX (tenant_id, assigned_user_id),

  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (assigned_user_id) REFERENCES users(id)
);


-- Core Messages with Status Tracking and Tenancy
CREATE TABLE messages (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,

  sender_type ENUM('user', 'visitor', 'bot') NOT NULL,
  sender_id CHAR(36) NOT NULL,

  content TEXT NOT NULL,
  message_type ENUM('text', 'image', 'file', 'system') DEFAULT 'text',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX (tenant_id, conversation_id, created_at),
  INDEX (sender_type, sender_id),

  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Multi-Tenant Optimized Indexes with tenant_id as leading column for query isolation
CREATE INDEX idx_tenants_domain ON tenants(domain);
CREATE INDEX idx_tenants_active ON tenants(is_active);

-- Users indexes - tenant_id first for isolation
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_users_tenant_online ON users(tenant_id, is_online, last_seen);
CREATE INDEX idx_users_tenant_id ON users(tenant_id, id);

-- Refresh tokens indexes - tenant_id first
CREATE INDEX idx_refresh_tokens_tenant_user ON refresh_tokens(tenant_id, user_id);
CREATE INDEX idx_refresh_tokens_tenant_token ON refresh_tokens(tenant_id, token_id);
CREATE INDEX idx_refresh_tokens_tenant_expires ON refresh_tokens(tenant_id, expires_at, is_revoked);

-- Conversations indexes - tenant_id first
CREATE INDEX idx_conversations_tenant_users ON conversations(tenant_id, user1_id, user2_id);
CREATE INDEX idx_conversations_tenant_last_msg ON conversations(tenant_id, last_message_at DESC);
CREATE INDEX idx_conversations_tenant_user1 ON conversations(tenant_id, user1_id);
CREATE INDEX idx_conversations_tenant_user2 ON conversations(tenant_id, user2_id);

-- Messages indexes - tenant_id first for maximum isolation
CREATE INDEX idx_messages_tenant_conversation ON messages(tenant_id, conversation_id, created_at DESC);
CREATE INDEX idx_messages_tenant_sender ON messages(tenant_id, sender_id, created_at DESC);
CREATE INDEX idx_messages_tenant_status ON messages(tenant_id, status, created_at);
CREATE INDEX idx_messages_tenant_created ON messages(tenant_id, created_at DESC);

-- Insert default tenant for existing data migration
INSERT INTO tenants (id, name, domain, is_active) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'localhost', TRUE);



-- External Communication Tables for Multi-Tenant Chat Engine
-- This migration adds tables for external visitors, chat workflows, and external conversations

-- External Visitors (Website visitors/customers) with Tenancy
CREATE TABLE external_visitors (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(20) NULL,
  session_id VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  referrer_url TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  status ENUM('active', 'waiting', 'assigned', 'ended') DEFAULT 'active',
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(tenant_id, session_id),
  INDEX idx_external_visitors_tenant (tenant_id),
  INDEX idx_external_visitors_session (tenant_id, session_id),
  INDEX idx_external_visitors_status (tenant_id, status),
  INDEX idx_external_visitors_activity (tenant_id, last_activity)
);
-- Chat SDK Settings for each tenant (for website integration)
CREATE TABLE chat_sdk_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  domain VARCHAR(255) NOT NULL, -- Allowed domain for CORS
  api_key CHAR(36) NOT NULL DEFAULT (UUID()),
  widget_config JSON NULL, -- UI configuration for chat widget
  branding JSON NULL, -- Colors, logo, etc.
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(api_key),
  INDEX idx_chat_sdk_tenant (tenant_id),
  INDEX idx_chat_sdk_domain (domain),
  INDEX idx_chat_sdk_api_key (api_key),
  INDEX idx_chat_sdk_active (tenant_id, is_active)
);


-- Insert default SDK settings for each tenant
INSERT INTO chat_sdk_settings (tenant_id, domain, widget_config, branding)
SELECT 
  id as tenant_id,
  'localhost' as domain,
  '{"position": "bottom-right", "theme": "light", "showAvatar": true}' as widget_config,
  '{"primaryColor": "#007bff", "fontFamily": "system-ui"}' as branding
FROM tenants 
WHERE is_active = TRUE;

CREATE TABLE conversation_participants (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,

  participant_type ENUM('user', 'visitor', 'bot') NOT NULL,
  participant_id CHAR(36) NOT NULL,

  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP NULL,

  INDEX (tenant_id, conversation_id),
  INDEX (participant_type, participant_id),

  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE bots (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT INTO bots (tenant_id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Default Bot');


CREATE TABLE tenant_features (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  feature_name ENUM('chat_sdk', 'bots') NOT NULL,
  is_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(tenant_id, feature_name)
);

-- Create inboxes table
CREATE TABLE IF NOT EXISTS inboxes (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  bot_id CHAR(36) NULL, -- Inbox-level bot configuration
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE SET NULL,
  INDEX idx_inboxes_tenant (tenant_id),
  INDEX idx_inboxes_active (tenant_id, is_active),
  INDEX idx_inboxes_bot (bot_id)
);

-- Create user_inboxes junction table (many-to-many: users can access multiple inboxes)
CREATE TABLE IF NOT EXISTS user_inboxes (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  inbox_id CHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE CASCADE,
  UNIQUE(tenant_id, user_id, inbox_id),
  INDEX idx_user_inboxes_user (tenant_id, user_id),
  INDEX idx_user_inboxes_inbox (tenant_id, inbox_id)
);

-- Add inbox_id to conversations (NOT NULL after migration)
-- First, add the column as nullable temporarily
ALTER TABLE conversations 
ADD COLUMN inbox_id CHAR(36) NULL;

-- Create a default inbox for each tenant
INSERT INTO inboxes (id, tenant_id, name, description, is_active)
SELECT 
  UUID() as id,
  id as tenant_id,
  'Default Inbox' as name,
  'Default inbox for all conversations' as description,
  TRUE as is_active
FROM tenants
WHERE is_active = TRUE;

-- Update existing conversations to use the default inbox
UPDATE conversations c
JOIN tenants t ON c.tenant_id = t.id
JOIN inboxes i ON i.tenant_id = t.id AND i.name = 'Default Inbox'
SET c.inbox_id = i.id
WHERE c.inbox_id IS NULL;

-- Now make inbox_id NOT NULL
ALTER TABLE conversations 
MODIFY COLUMN inbox_id CHAR(36) NOT NULL,
ADD FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE RESTRICT,
ADD INDEX idx_conversations_inbox (tenant_id, inbox_id),
ADD INDEX idx_conversations_inbox_status (tenant_id, inbox_id, status),
ADD INDEX idx_conversations_inbox_assigned (tenant_id, inbox_id, assigned_user_id);

-- Update bots table to support inbox-level bots
ALTER TABLE bots 
ADD COLUMN inbox_id CHAR(36) NULL,
ADD FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE CASCADE,
ADD INDEX idx_bots_inbox (inbox_id);

-- Update existing indexes to include inbox_id where appropriate
-- Drop old indexes that don't include inbox_id
DROP INDEX IF EXISTS idx_conversations_tenant_users ON conversations;
DROP INDEX IF EXISTS idx_conversations_tenant_user1 ON conversations;
DROP INDEX IF EXISTS idx_conversations_tenant_user2 ON conversations;

-- Add new indexes with inbox context
CREATE INDEX idx_conversations_tenant_inbox_status ON conversations(tenant_id, inbox_id, status);
CREATE INDEX idx_conversations_tenant_inbox_assigned ON conversations(tenant_id, inbox_id, assigned_user_id);
CREATE INDEX idx_conversations_tenant_inbox_last_msg ON conversations(tenant_id, inbox_id, last_message_at DESC);

