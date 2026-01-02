import runQuery from '../database/runQuery';
import { MultiTenantRefreshToken } from '../types/tenant.types';
import { randomBytes, createHash } from 'crypto';

export class MultiTenantRefreshTokenService {
  // Create a new refresh token - TENANT BARRIER
  static async createRefreshToken(
    tenantId: string,
    userId: string,
    expiresIn: number = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
  ): Promise<{ token: string; tokenData: MultiTenantRefreshToken }> {
    const token = randomBytes(32).toString('hex');
    const tokenId = randomBytes(16).toString('hex'); // Business identifier
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + expiresIn);

    const query = `
      INSERT INTO refresh_tokens (id, tenant_id, token_id, user_id, token_hash, expires_at)
      VALUES (UUID(), ?, ?, ?, ?, ?)
    `;

    await runQuery(query, [tenantId, tokenId, userId, tokenHash, expiresAt]);

    // Get the created token - TENANT BARRIER
    const selectQuery = `
      SELECT * FROM refresh_tokens 
      WHERE tenant_id = ? AND token_id = ?
    `;
    const result = await runQuery(selectQuery, [tenantId, tokenId]);
    const refreshTokenData = (result.rows as MultiTenantRefreshToken[])[0];
    if (!refreshTokenData) {
      throw new Error('Failed to create refresh token');
    }

    return {
      token, // Return plain token to client
      tokenData: refreshTokenData // Return DB record
    };
  }

  // Get refresh token by token value with tenant barrier
  static async getRefreshToken(tenantId: string, token: string): Promise<MultiTenantRefreshToken | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const query = `
      SELECT * FROM refresh_tokens 
      WHERE tenant_id = ? AND token_hash = ? AND expires_at > NOW() AND is_revoked = FALSE
    `;
    const result = await runQuery(query, [tenantId, tokenHash]);
    return (result.rows as MultiTenantRefreshToken[])[0] || null;
  }

  // Invalidate a specific refresh token - TENANT BARRIER
  static async invalidateRefreshToken(tenantId: string, token: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const query = 'UPDATE refresh_tokens SET is_revoked = TRUE WHERE tenant_id = ? AND token_hash = ?';
    await runQuery(query, [tenantId, tokenHash]);
  }

  // Invalidate all refresh tokens for a user - TENANT BARRIER
  static async invalidateUserTokens(tenantId: string, userId: string): Promise<void> {
    const query = 'UPDATE refresh_tokens SET is_revoked = TRUE WHERE tenant_id = ? AND user_id = ?';
    await runQuery(query, [tenantId, userId]);
  }

  // Clean up expired tokens for a tenant
  static async cleanupExpiredTokens(tenantId: string): Promise<number> {
    const query = 'DELETE FROM refresh_tokens WHERE tenant_id = ? AND (expires_at <= NOW() OR is_revoked = TRUE)';
    const result = await runQuery(query, [tenantId]);
    return (result as any).affectedRows || 0;
  }

  // Get all active tokens for a user - TENANT BARRIER
  static async getUserActiveTokens(tenantId: string, userId: string): Promise<MultiTenantRefreshToken[]> {
    const query = `
      SELECT * FROM refresh_tokens 
      WHERE tenant_id = ? AND user_id = ? AND expires_at > NOW() AND is_revoked = FALSE
      ORDER BY created_at DESC
    `;
    const result = await runQuery(query, [tenantId, userId]);
    return result.rows as MultiTenantRefreshToken[];
  }

  // Rotate refresh token - TENANT BARRIER
  static async rotateRefreshToken(
    tenantId: string,
    oldToken: string,
    userId: string
  ): Promise<{ token: string; tokenData: MultiTenantRefreshToken }> {
    const oldTokenHash = createHash('sha256').update(oldToken).digest('hex');
    
    // First verify the old token exists and belongs to the user - TENANT BARRIER
    const verifyQuery = `
      SELECT id FROM refresh_tokens 
      WHERE tenant_id = ? AND token_hash = ? AND user_id = ? AND expires_at > NOW() AND is_revoked = FALSE
    `;
    const verifyResult = await runQuery(verifyQuery, [tenantId, oldTokenHash, userId]);
    
    if ((verifyResult.rows as any[]).length === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    // Invalidate the old token - TENANT BARRIER
    await this.invalidateRefreshToken(tenantId, oldToken);

    // Create new token - TENANT BARRIER
    return await this.createRefreshToken(tenantId, userId);
  }

  // Get tenant refresh token statistics
  static async getTenantTokenStats(tenantId: string): Promise<{
    totalActiveTokens: number;
    totalExpiredTokens: number;
    uniqueActiveUsers: number;
  }> {
    const activeQuery = `
      SELECT COUNT(*) as count FROM refresh_tokens 
      WHERE tenant_id = ? AND expires_at > NOW()
    `;
    
    const expiredQuery = `
      SELECT COUNT(*) as count FROM refresh_tokens 
      WHERE tenant_id = ? AND expires_at <= NOW()
    `;
    
    const uniqueUsersQuery = `
      SELECT COUNT(DISTINCT user_id) as count FROM refresh_tokens 
      WHERE tenant_id = ? AND expires_at > NOW()
    `;

    const [activeResult, expiredResult, usersResult] = await Promise.all([
      runQuery(activeQuery, [tenantId]),
      runQuery(expiredQuery, [tenantId]),
      runQuery(uniqueUsersQuery, [tenantId])
    ]);

    return {
      totalActiveTokens: parseInt((activeResult.rows as any[])[0]?.count || '0'),
      totalExpiredTokens: parseInt((expiredResult.rows as any[])[0]?.count || '0'),
      uniqueActiveUsers: parseInt((usersResult.rows as any[])[0]?.count || '0')
    };
  }

  // Get tokens expiring soon for a tenant (within next 24 hours)
  static async getExpiringTokens(tenantId: string): Promise<MultiTenantRefreshToken[]> {
    const query = `
      SELECT * FROM refresh_tokens 
      WHERE tenant_id = ? 
        AND expires_at > NOW() 
        AND expires_at <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
      ORDER BY expires_at ASC
    `;
    const result = await runQuery(query, [tenantId]);
    return result.rows as MultiTenantRefreshToken[];
  }

  // Validate and get user from refresh token - TENANT BARRIER
  static async validateTokenAndGetUser(tenantId: string, token: string): Promise<{
    refreshToken: MultiTenantRefreshToken;
    user: any;
  } | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const query = `
      SELECT rt.*, u.id as user_id, u.name, u.email, u.is_online
      FROM refresh_tokens rt
      JOIN users u ON rt.tenant_id = u.tenant_id AND rt.user_id = u.id
      WHERE rt.tenant_id = ? AND rt.token_hash = ? AND rt.expires_at > NOW() AND rt.is_revoked = FALSE
    `;
    
    const result = await runQuery(query, [tenantId, tokenHash]);
    const row = (result.rows as any[])[0];
    
    if (!row) {
      return null;
    }

    return {
      refreshToken: {
        id: row.id,
        tenant_id: row.tenant_id,
        token_id: row.token_id,
        user_id: row.user_id,
        token_hash: row.token_hash,
        expires_at: row.expires_at,
        created_at: row.created_at,
        is_revoked: row.is_revoked
      },
      user: {
        id: row.user_id,
        name: row.name,
        email: row.email,
        is_online: row.is_online
      }
    };
  }

  // Cleanup all expired tokens for all tenants (admin operation)
  static async globalCleanupExpiredTokens(): Promise<{
    totalDeleted: number;
    tenantsProcessed: number;
  }> {
    // Get all tenants with expired tokens
    const tenantsQuery = `
      SELECT DISTINCT tenant_id FROM refresh_tokens 
      WHERE expires_at <= NOW()
    `;
    const tenantsResult = await runQuery(tenantsQuery, []);
    const tenants = (tenantsResult.rows as any[]);

    let totalDeleted = 0;
    for (const tenant of tenants) {
      const deleted = await this.cleanupExpiredTokens(tenant.tenant_id);
      totalDeleted += deleted;
    }

    return {
      totalDeleted,
      tenantsProcessed: tenants.length
    };
  }

  // Force expire all tokens for a user (useful for security scenarios) - TENANT BARRIER
  static async forceExpireUserTokens(tenantId: string, userId: string): Promise<number> {
    const query = `
      UPDATE refresh_tokens 
      SET expires_at = NOW() 
      WHERE tenant_id = ? AND user_id = ? AND expires_at > NOW()
    `;
    const result = await runQuery(query, [tenantId, userId]);
    return (result as any).affectedRows || 0;
  }
}
