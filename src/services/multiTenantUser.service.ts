import runQuery from '../database/runQuery';
import bcrypt from 'bcrypt';
import { MultiTenantUser } from '../types/tenant.types';

export interface CreateUserData {
  tenantId: string;
  name: string;
  email: string;
  password: string;
}

export class MultiTenantUserService {
  static async createUser(userData: CreateUserData): Promise<MultiTenantUser> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const query = `
      INSERT INTO users (id, tenant_id, name, email, password_hash)
      VALUES (UUID(), ?, ?, ?, ?)
    `;

    await runQuery(query, [
      userData.tenantId,
      userData.name,
      userData.email,
      hashedPassword
    ]);

    // Get the created user
    const selectQuery = 'SELECT * FROM users WHERE tenant_id = ? AND email = ? ORDER BY created_at DESC LIMIT 1';
    const result = await runQuery(selectQuery, [userData.tenantId, userData.email]);
    const user = (result.rows as MultiTenantUser[])[0];
    if (!user) {
      throw new Error('Failed to create user');
    }
    return user;
  }

  static async findUserByEmail(tenantId: string, email: string): Promise<MultiTenantUser | null> {
    const query = 'SELECT * FROM users WHERE tenant_id = ? AND email = ?';
    const result = await runQuery(query, [tenantId, email]);
    return (result.rows as MultiTenantUser[])[0] || null;
  }

  static async findUserById(tenantId: string, id: string): Promise<MultiTenantUser | null> {
    const query = 'SELECT * FROM users WHERE tenant_id = ? AND id = ?';
    const result = await runQuery(query, [tenantId, id]);
    return (result.rows as MultiTenantUser[])[0] || null;
  }

  static async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async updateUserPassword(tenantId: string, userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const query = `
      UPDATE users 
      SET password_hash = ?
      WHERE tenant_id = ? AND id = ?
    `;
    await runQuery(query, [hashedPassword, tenantId, userId]);
  }

  static async updateOnlineStatus(tenantId: string, userId: string, isOnline: boolean): Promise<void> {
    const query = `
      UPDATE users 
      SET is_online = ?, last_seen = NOW()
      WHERE tenant_id = ? AND id = ?
    `;
    await runQuery(query, [isOnline, tenantId, userId]);
  }

  static async getOnlineUsers(tenantId: string): Promise<MultiTenantUser[]> {
    const query = 'SELECT * FROM users WHERE tenant_id = ? AND is_online = TRUE';
    const result = await runQuery(query, [tenantId]);
    return result.rows as MultiTenantUser[];
  }

  static async searchUsers(tenantId: string, searchTerm: string, currentUserId: string): Promise<MultiTenantUser[]> {
    const query = `
      SELECT id, tenant_id, name, email, is_online, last_seen
      FROM users 
      WHERE tenant_id = ? AND (name LIKE ? OR email LIKE ?) 
        AND id != ?
      LIMIT 20
    `;
    const result = await runQuery(query, [tenantId, `%${searchTerm}%`, `%${searchTerm}%`, currentUserId]);
    return result.rows as MultiTenantUser[];
  }

  static async getTenantUserCount(tenantId: string): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM users WHERE tenant_id = ?';
    const result = await runQuery(query, [tenantId]);
    return parseInt((result.rows as any[])[0]?.count || '0');
  }

  static async validateTenantUserLimit(tenantId: string, maxUsers: number): Promise<boolean> {
    const currentCount = await this.getTenantUserCount(tenantId);
    return currentCount < maxUsers;
  }
}
