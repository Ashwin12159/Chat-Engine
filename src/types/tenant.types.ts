export interface Tenant {
  id: string;
  name: string;
  domain: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  max_users: number;
  max_conversations_per_user: number;
  retention_days: number;
}

export interface TenantContext {
  tenantId: string;
  tenant?: Tenant;
}

export interface MultiTenantUser {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  password_hash: string;
  is_online: boolean;
  last_seen: Date;
  created_at: Date;
}

export interface MultiTenantConversation {
  id: string;
  tenant_id: string;
  user1_id: string;
  user2_id: string;
  type: 'internal' | 'external';
  state: 'open' | 'closed';
  last_message_at: Date;
  created_at: Date;
}

export interface MultiTenantMessage {
  id: string;
  tenant_id: string;
  conversation_id: string;
  sender_id: string;
  type: 'internal' | 'external';
  content: string;
  message_type: 'text' | 'image' | 'file';
  status: 'sent' | 'delivered' | 'read';
  created_at: Date;
  delivered_at?: Date;
  read_at?: Date;
}

export interface MultiTenantRefreshToken {
  id: string;
  tenant_id: string;
  token_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  is_revoked: boolean;
}
