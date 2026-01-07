import { Request, Response, NextFunction } from 'express';
import runQuery from '../database/runQuery';
import sendHTTPResponse from '../common/sendHTTPResponse';
import logger from '../config/logger';

export interface SDKRequest extends Request {
  tenantId?: string;
  sdkSettings?: {
    id: string;
    tenant_id: string;
    domain: string;
    api_key: string;
    widget_config: any;
    branding: any;
    is_active: boolean;
  };
}

// Middleware to validate SDK API key and extract tenant context
export const validateSDKKey = async (req: SDKRequest, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    const origin = req.headers['origin'] as string;
    console.log({aaaaa:req.headers})
    if (!apiKey) {
      logger.error('API key is required');
      return sendHTTPResponse.error(res, 401, 'API key required');
    }

    // Validate API key and get tenant context
    const query = `
      SELECT cs.*, t.is_active as tenant_active
      FROM chat_sdk_settings cs
      JOIN tenants t ON cs.tenant_id = t.id
      WHERE cs.api_key = ? AND cs.is_active = TRUE
    `;
    
    const result = await runQuery(query, [apiKey]);
    const sdkSettings = (result.rows as any[])[0];

    if (!sdkSettings) {
      logger.error('Invalid API key');
      return sendHTTPResponse.error(res, 401, 'Invalid API key');
    }

    if (!sdkSettings.tenant_active) {
      logger.error('Tenant is not active');
      return sendHTTPResponse.error(res, 403, 'Tenant is not active');
    }
    console.log({Aa:sdkSettings.domain,origin})

    // Validate domain (CORS check)
    if (origin && sdkSettings.domain !== '*') {
      const allowedDomains = sdkSettings.domain.split(',').map((d: string) => d.trim());
      const originDomain = new URL(origin).hostname;
      
      const isAllowed = allowedDomains.some((domain: string) => {
        if (domain.startsWith('*.')) {
          // Wildcard subdomain matching
          const baseDomain = domain.substring(2);
          return originDomain.endsWith(baseDomain);
        }
        return domain === originDomain || domain === '*';
      });

      if (!isAllowed) {
        return sendHTTPResponse.error(res, 403, 'Domain not allowed');
      }
    }

    // Attach SDK settings and tenant context to request
    req.sdkSettings = sdkSettings;
    req.tenantId = sdkSettings.tenant_id;

    next();
  } catch (error) {
    logger.error({ error }, 'SDK validation error');
    return sendHTTPResponse.error(res, 500, 'Internal Server Error');
  }
};

// Middleware for rate limiting external requests (per tenant)
export const rateLimitSDK = async (req: SDKRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!tenantId) {
      return sendHTTPResponse.error(res, 400, 'Tenant context required');
    }

    // Simple rate limiting: 100 requests per minute per IP per tenant
    const rateKey = `sdk_rate_${tenantId}_${clientIP}`;
    // This would typically use Redis for distributed rate limiting
    // For now, we'll skip implementation and just continue
    
    next();
  } catch (error) {
    logger.error({ error }, 'SDK rate limit error');
    return sendHTTPResponse.error(res, 500, 'Internal Server Error');
  }
};
