import { Request, Response, NextFunction } from 'express';
import { JWTService } from '../common/jwt.service';
import { TenantRequest } from './tenant.middleware';
import sendHTTPResponse from '../common/sendHTTPResponse';

export interface AuthenticatedRequest extends TenantRequest {
  user?: {
    userId: string;
    email: string;
    tenantId: string;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return sendHTTPResponse.error(res, 401, 'Access token is required');
  }

  const decoded = JWTService.verifyAccessToken(token);
  
  if (!decoded) {
    return sendHTTPResponse.error(res, 401, 'Invalid or expired access token');
  }

  req.user = {
    userId: decoded.userId,
    email: decoded.email,
    tenantId: req.tenant?.tenantId || ''
  };

  next();
};

// Remove role-based auth as it's no longer needed for chat engine
export const requireRole = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // For chat engine, just check if user is authenticated
    if (!req.user) {
      return sendHTTPResponse.error(res, 401, 'Authentication required');
    }
    next();
  };
};

export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    const decoded = JWTService.verifyAccessToken(token);
    if (decoded) {
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        tenantId: req.tenant?.tenantId || ''
      };
    }
  }

  next();
};
