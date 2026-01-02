import runQuery from '../database/runQuery';
import { Tenant } from '../types/tenant.types';

export class TenantService {
  static async getTenantById(tenantId: string): Promise<Tenant | null> {
    const query = 'SELECT * FROM tenants WHERE id = ? AND is_active = TRUE';
    const result = await runQuery(query, [tenantId]);
    return (result.rows as Tenant[])[0] || null;
  }

  static async getTenantByDomain(domain: string): Promise<Tenant | null> {
    const query = 'SELECT * FROM tenants WHERE domain = ? AND is_active = TRUE';
    const result = await runQuery(query, [domain]);
    return (result.rows as Tenant[])[0] || null;
  }

  static async createTenant(data: {
    name: string;
    domain?: string;
    maxUsers?: number;
    maxConversationsPerUser?: number;
    retentionDays?: number;
  }): Promise<Tenant> {
    const query = `
      INSERT INTO tenants (id, name, domain, max_users, max_conversations_per_user, retention_days)
      VALUES (UUID(), ?, ?, ?, ?, ?)
    `;

    await runQuery(query, [
      data.name,
      data.domain || null,
      data.maxUsers || 1000,
      data.maxConversationsPerUser || 100,
      data.retentionDays || 365
    ]);

    // Get the created tenant
    const selectQuery = data.domain 
      ? 'SELECT * FROM tenants WHERE domain = ? ORDER BY created_at DESC LIMIT 1'
      : 'SELECT * FROM tenants WHERE name = ? AND domain IS NULL ORDER BY created_at DESC LIMIT 1';
    
    const result = await runQuery(selectQuery, [data.domain || data.name]);
    const tenant = (result.rows as Tenant[])[0];
    
    if (!tenant) {
      throw new Error('Failed to create tenant');
    }
    
    return tenant;
  }

  static async updateTenant(tenantId: string, data: Partial<Tenant>): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.domain !== undefined) {
      updates.push('domain = ?');
      values.push(data.domain);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(data.is_active);
    }
    if (data.max_users) {
      updates.push('max_users = ?');
      values.push(data.max_users);
    }
    if (data.max_conversations_per_user) {
      updates.push('max_conversations_per_user = ?');
      values.push(data.max_conversations_per_user);
    }
    if (data.retention_days) {
      updates.push('retention_days = ?');
      values.push(data.retention_days);
    }

    if (updates.length === 0) {
      return;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(tenantId);

    const query = `UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`;
    await runQuery(query, values);
  }

  static async deactivateTenant(tenantId: string): Promise<void> {
    const query = 'UPDATE tenants SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    await runQuery(query, [tenantId]);
  }

  static async getAllTenants(): Promise<Tenant[]> {
    const query = 'SELECT * FROM tenants ORDER BY created_at DESC';
    const result = await runQuery(query);
    return result.rows as Tenant[];
  }

  static async getTenantStats(tenantId: string): Promise<{
    userCount: number;
    conversationCount: number;
    messageCount: number;
    activeUsers: number;
  }> {
    const userCountQuery = 'SELECT COUNT(*) as count FROM users WHERE tenant_id = ?';
    const conversationCountQuery = 'SELECT COUNT(*) as count FROM conversations WHERE tenant_id = ?';
    const messageCountQuery = 'SELECT COUNT(*) as count FROM messages WHERE tenant_id = ?';
    const activeUsersQuery = 'SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND is_online = TRUE';

    const [userResult, conversationResult, messageResult, activeResult] = await Promise.all([
      runQuery(userCountQuery, [tenantId]),
      runQuery(conversationCountQuery, [tenantId]),
      runQuery(messageCountQuery, [tenantId]),
      runQuery(activeUsersQuery, [tenantId])
    ]);

    return {
      userCount: parseInt((userResult.rows as any[])[0]?.count || '0'),
      conversationCount: parseInt((conversationResult.rows as any[])[0]?.count || '0'),
      messageCount: parseInt((messageResult.rows as any[])[0]?.count || '0'),
      activeUsers: parseInt((activeResult.rows as any[])[0]?.count || '0')
    };
  }

  // Get default tenant ID for existing installations
  static getDefaultTenantId(): string {
    return '00000000-0000-0000-0000-000000000001';
  }
}
