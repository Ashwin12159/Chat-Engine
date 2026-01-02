import * as jwt from 'jsonwebtoken';
import crypto from 'crypto';

interface TokenPayload extends jwt.JwtPayload {
  userId: string;
  email: string;
  tenantId: string;
  inboxId?: string; // Optional for visitor tokens
}

interface RefreshTokenPayload extends jwt.JwtPayload {
  userId: string;
  tokenId: string;
  tenantId: string;
}

export class JWTService {
  private static readonly ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';
  private static readonly REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
  private static readonly ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
  private static readonly REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

  static generateAccessToken(payload: Omit<TokenPayload, keyof jwt.JwtPayload>, expiresIn?: string): string {
    if (!this.ACCESS_TOKEN_SECRET || this.ACCESS_TOKEN_SECRET === '') {
      throw new Error('JWT_ACCESS_SECRET is not defined');
    }
    return (jwt as any).sign(
      payload, 
      this.ACCESS_TOKEN_SECRET, 
      {
        expiresIn: expiresIn || this.ACCESS_TOKEN_EXPIRY,
        issuer: 'chat-engine',
        audience: 'chat-app'
      }
    );
  }

  static generateRefreshToken(userId: string, tenantId: string): { token: string; tokenId: string } {
    const tokenId = crypto.randomUUID();

    const token = (jwt as any).sign(
      { userId, tokenId, tenantId },
      this.REFRESH_TOKEN_SECRET,
      {
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
        issuer: 'chat-engine',
        audience: 'chat-app'
      }
    );
    return { token, tokenId };
  }

  static verifyAccessToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.ACCESS_TOKEN_SECRET, {
        issuer: 'chat-engine',
        audience: 'chat-app'
      }) as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  static verifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.REFRESH_TOKEN_SECRET, {
        issuer: 'chat-engine',
        audience: 'chat-app'
      }) as RefreshTokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  static generateTokenPair(user: { id: string; email: string; tenant_id: string }) {
    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email,
      tenantId: user.tenant_id
    });

    const { token: refreshToken, tokenId } = this.generateRefreshToken(user.id, user.tenant_id);

    return {
      accessToken,
      refreshToken,
      tokenId,
      expiresIn: this.ACCESS_TOKEN_EXPIRY
    };
  }

  // Generate visitor token with inbox_id
  static generateVisitorToken(visitorId: string, tenantId: string, inboxId: string, expiresIn: string = '180d'): string {
    return this.generateAccessToken({
      userId: visitorId,
      email: '', // Not used for visitors
      tenantId,
      inboxId
    }, expiresIn);
  }
}
