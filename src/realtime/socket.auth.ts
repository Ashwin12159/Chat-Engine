import { Socket } from 'socket.io';
import { JWTService } from '../common/jwt.service';
import { UserService } from '../services/user.service';
import logger from '../config/logger';
import { SDKService } from '../services/sdk.service';
import _ from 'lodash';

// Rate limiting for socket connections
const connectionAttempts = new Map<string, { count: number; firstAttempt: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_ATTEMPTS = 5; // Max 5 attempts per minute per IP

const isRateLimited = (ip: string): boolean => {
  const now = Date.now();
  const attempts = connectionAttempts.get(ip);
  
  if (!attempts) {
    connectionAttempts.set(ip, { count: 1, firstAttempt: now });
    return false;
  }
  
  // Reset if window has passed
  if (now - attempts.firstAttempt > RATE_LIMIT_WINDOW) {
    connectionAttempts.set(ip, { count: 1, firstAttempt: now });
    return false;
  }
  
  // Increment count
  attempts.count++;
  
  if (attempts.count > MAX_ATTEMPTS) {
    return true;
  }
  
  return false;
};

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, attempts] of connectionAttempts.entries()) {
    if (now - attempts.firstAttempt > RATE_LIMIT_WINDOW) {
      connectionAttempts.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

export const socketAuth = async (socket: Socket, next: any) => {
  try {
    const clientIP = socket.handshake.address;
    
    // Rate limiting check
    if (isRateLimited(clientIP)) {
      logger.warn(`Socket connection rate limited for IP: ${clientIP}`);
      return next(new Error('Too many connection attempts. Please try again later.'));
    }

    const websiteAPIKey = socket.handshake.auth?.websiteAPIKey;
    const sessionId = socket.handshake.auth?.sessionId;
     //JWT token for getting coversation info. This will be taken from the cookies

    const token = socket.handshake.auth?.token;
    const conversationId = socket.handshake.auth?.conversationId;
    const visitorId = socket.handshake.auth?.visitorId;
    console.log({ token, websiteAPIKey, conversationId, visitorId });

    // Handle agent authentication (JWT token)
    if (token) {
      return await authenticateAgent(socket, token, next);
    }
    
    // Handle external widget authentication (website token + visitor info)
    if (websiteAPIKey) {
      return await authenticateWidget(socket, websiteAPIKey, next);
    }

    // No valid authentication provided - log once per minute per IP to prevent spam
    const shouldLog = !connectionAttempts.has(clientIP) || connectionAttempts.get(clientIP)!.count === 1;
    if (shouldLog) {
      logger.warn(`Socket connection rejected: No valid authentication provided from ${clientIP}`);
    }
    
    return next(new Error('Authentication required'));
    
  } catch (error) {
    logger.error({ error }, 'Error during socket authentication');
    next(new Error('Authentication failed'));
  }
};

const authenticateAgent = async (socket: Socket, token: string, next: any) => {
  try {
    // Verify the JWT token
    const decoded = JWTService.verifyAccessToken(token);
    if (!decoded) {
      logger.warn(`Agent socket connection rejected: Invalid token`);
      return next(new Error('Invalid authentication token'));
    }

    // Get user details
    const user = await UserService.findUserById(decoded.userId);
    if (!user) {
      logger.warn(`Agent socket connection rejected: User not found for ID ${decoded.userId}`);
      return next(new Error('User not found'));
    }

    // Attach user data to socket
    socket.data.user = {
      userId: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenant_id,
      type: 'agent'
    };

    logger.info(`Agent socket authenticated: ${user.email} (${user.id})`);
    next();
  } catch (error) {
    logger.error({ error }, 'Error authenticating agent socket');
    next(new Error('Agent authentication failed'));
  }
};

const authenticateWidget = async (socket: Socket, websiteAPIKey: string, next: any) => {
  try {

    if (!websiteAPIKey) {
      logger.warn(`Widget socket connection rejected: Missing website API key`);
      return next(new Error('Website API key required'));
    }
    const tenantDetails = await SDKService.getTenantDetails(websiteAPIKey);

    if(_.isEmpty(tenantDetails)){
      logger.warn(`Widget socket connection rejected: Invalid website API key`);
      return next(new Error('Invalid website API key'));
    }


    // Attach widget data to socket
    socket.data.widget = {
      websiteAPIKey,
      type: 'widget',
      tenantId: tenantDetails.tenantId
    };
    logger.info(`Widget socket tenantId: ${tenantDetails.tenantId} authenticated`);
    next();
  } catch (error) {
    logger.error({ error }, 'Error authenticating widget socket');
    next(new Error('Widget authentication failed'));
  }
};