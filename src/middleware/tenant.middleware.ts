import { Request, Response, NextFunction } from 'express';
import { TenantService } from '../services/tenant.service';
import { TenantContext } from '../types/tenant.types';
import sendHTTPResponse from '../common/sendHTTPResponse';
import logger from '../config/logger';

export interface TenantRequest extends Request {
  tenant?: TenantContext;
}

export interface AuthenticatedTenantRequest extends TenantRequest {
  userId?: string;
  tokenId?: string;
}

// Middleware to extract and validate tenant from request
export const extractTenant = async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    let tenantId: string | undefined;

    // Method 1: Extract from subdomain (e.g., tenant1.yourdomain.com)
    const host = req.get('host');
    if (host) {
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        const tenant = await TenantService.getTenantByDomain(subdomain);
        if (tenant) {
          tenantId = tenant.id;
          req.tenant = { tenantId, tenant };
          return next();
        }
      }
    }

    // Method 2: Extract from custom header
    const tenantHeader = req.get('X-Tenant-ID');
    if (tenantHeader) {
      const tenant = await TenantService.getTenantById(tenantHeader);
      if (tenant) {
        tenantId = tenant.id;
        req.tenant = { tenantId, tenant };
        return next();
      }
    }

    // Method 3: Extract from query parameter (for development/testing)
    const tenantQuery = req.query.tenant as string;
    if (tenantQuery) {
      const tenant = await TenantService.getTenantById(tenantQuery);
      if (tenant) {
        tenantId = tenant.id;
        req.tenant = { tenantId, tenant };
        return next();
      }
    }

    // Method 4: Use default tenant for backward compatibility
    const defaultTenantId = TenantService.getDefaultTenantId();
    const defaultTenant = await TenantService.getTenantById(defaultTenantId);
    
    if (defaultTenant) {
      req.tenant = { tenantId: defaultTenantId, tenant: defaultTenant };
      return next();
    }

    // No valid tenant found
    logger.warn({
      msg: 'No valid tenant found in request',
      host,
      tenantHeader,
      tenantQuery,
      userAgent: req.get('User-Agent')
    });

    return sendHTTPResponse.error(res, 400, 'Invalid or missing tenant information');
  } catch (error) {
    logger.error(error, 'Error in tenant extraction:');
    return sendHTTPResponse.error(res, 500, 'Internal Server Error');
  }
};

// Middleware to ensure tenant is present (should be used after extractTenant)
export const requireTenant = (req: TenantRequest, res: Response, next: NextFunction) => {
  if (!req.tenant || !req.tenant.tenantId) {
    return sendHTTPResponse.error(res, 400, 'Tenant context required');
  }
  
  if (!req.tenant.tenant?.is_active) {
    return sendHTTPResponse.error(res, 403, 'Tenant is not active');
  }

  next();
};

// Utility function to get tenant context from request
export const getTenantContext = (req: TenantRequest): TenantContext => {
  if (!req.tenant) {
    throw new Error('Tenant context not found in request');
  }
  return req.tenant;
};
