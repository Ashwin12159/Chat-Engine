import crypto from 'crypto';
import runQuery from '../database/runQuery';

export interface RefreshTokenRecord {
  id: string;
  token_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  is_revoked: boolean;
}

export class RefreshTokenService {
  private static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static async saveRefreshToken(
    tokenId: string,
    userId: string,
    refreshToken: string,
    expiresInDays: number = 7
  ): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const query = `
      INSERT INTO refresh_tokens (id, token_id, user_id, token_hash, expires_at)
      VALUES (UUID(), ?, ?, ?, ?)
    `;

    await runQuery(query, [tokenId, userId, tokenHash, expiresAt]);
  }

  static async findRefreshToken(tokenId: string, refreshToken: string): Promise<RefreshTokenRecord | null> {
    const tokenHash = this.hashToken(refreshToken);
    
    const query = `
      SELECT * FROM refresh_tokens
      WHERE token_id = ? AND token_hash = ? AND is_revoked = FALSE AND expires_at > NOW()
    `;

    const result = await runQuery(query, [tokenId, tokenHash]);
    return (result.rows as RefreshTokenRecord[])[0] || null;
  }

  static async revokeRefreshToken(tokenId: string): Promise<void> {
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE
      WHERE token_id = ?
    `;

    await runQuery(query, [tokenId]);
  }

  static async revokeAllUserTokens(userId: string): Promise<void> {
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE
      WHERE user_id = ? AND is_revoked = FALSE
    `;

    await runQuery(query, [userId]);
  }

  static async cleanupExpiredTokens(): Promise<void> {
    const query = `
      DELETE FROM refresh_tokens
      WHERE expires_at < NOW() OR is_revoked = TRUE
    `;

    await runQuery(query);
  }

  static async getUserActiveTokensCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count FROM refresh_tokens
      WHERE user_id = ? AND is_revoked = FALSE AND expires_at > NOW()
    `;

    const result = await runQuery(query, [userId]);
    return parseInt((result.rows as any[])[0]?.count || '0');
  }

  // Revoke oldest tokens if user has too many active sessions
  static async limitUserSessions(userId: string, maxSessions: number = 5): Promise<void> {
    // First get the count of active sessions
    const countQuery = `
      SELECT COUNT(*) as count FROM refresh_tokens
      WHERE user_id = ? AND is_revoked = FALSE AND expires_at > NOW()
    `;
    
    const countResult = await runQuery(countQuery, [userId]);
    const activeCount = parseInt((countResult.rows as any[])[0]?.count || '0');
    
    // Only proceed if we have more sessions than the limit
    if (activeCount <= maxSessions) {
      return;
    }
    
    const tokensToRevoke = activeCount - maxSessions;
    
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE
      WHERE id IN (
        SELECT id FROM (
          SELECT id FROM refresh_tokens
          WHERE user_id = ? AND is_revoked = FALSE AND expires_at > NOW()
          ORDER BY created_at ASC
          LIMIT ?
        ) t
      )
    `;

    await runQuery(query, [userId, tokensToRevoke]);
  }
}
