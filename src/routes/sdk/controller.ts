import { Response } from "express";
import sendHTTPResponse from "../../common/sendHTTPResponse";
import logger from "../../config/logger";
import { VisitorService } from "../../services/visitor.service";
import { ConversationService } from "../../services/conversation.service";
import { SDKRequest } from "../../middleware/sdk.middleware";
import runQuery from "../../database/runQuery";
import { JWTService } from "../../common/jwt.service";
import { SDKService } from "../../services/sdk.service";
import { ENUM_FEATURES } from "../../common/constants";
import { isFeatureEnabled } from "../../common/functions";
import { BotService } from "../../services/bot.service";

/**
 * POST /api/sdk/validate
 * Validates SDK API key and site domain
 * Public endpoint (no SDK key required)
 */
export const validateSDKRoute = async (req: SDKRequest, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    const site = req.body?.site;

    if (!apiKey) {
      return sendHTTPResponse.error(res, 400, 'API key required');
    }

    if (!site || !site.host) {
      return sendHTTPResponse.error(res, 400, 'Site information (host) is required');
    }

    const query = `
      SELECT cs.*, t.is_active as tenant_active
      FROM chat_sdk_settings cs
      JOIN tenants t ON cs.tenant_id = t.id
      WHERE cs.api_key = ? AND cs.is_active = TRUE
    `;

    const result = await runQuery(query, [apiKey]);
    const sdkSettings = (result.rows as any[])[0];

    if (!sdkSettings) {
      logger.error('Invalid API key (sdk/validate)');
      return sendHTTPResponse.error(res, 401, 'Invalid API key');
    }

    if (!sdkSettings.tenant_active) {
      logger.error('Tenant is not active (sdk/validate)');
      return sendHTTPResponse.error(res, 403, 'Tenant is not active');
    }

    // Domain validation
    const siteHost = String(site.host);
    if (sdkSettings.domain && sdkSettings.domain !== '*') {
      const allowedDomains = (sdkSettings.domain as string).split(',').map((d: string) => d.trim());
      const isAllowed = allowedDomains.some((domain: string) => {
        if (domain.startsWith('*.')) {
          const baseDomain = domain.substring(2);
          return siteHost.endsWith(baseDomain);
        }
        return domain === siteHost || domain === '*';
      });

      if (!isAllowed) {
        logger.error(`Domain not allowed for SDK key. host=${siteHost}, allowed=${sdkSettings.domain}`);
        return sendHTTPResponse.error(res, 403, 'Domain not allowed');
      }
    }

    return sendHTTPResponse.success(res, 200, 'SDK validated', {
      tenant_id: sdkSettings.tenant_id,
      branding: sdkSettings.branding,
      widget_config: sdkSettings.widget_config,
      site: {
        origin: site.origin,
        host: site.host,
        url: site.url
      }
    });
  } catch (error: any) {
    logger.error({ error }, 'SDK validation error');
    return sendHTTPResponse.error(res, 500, 'Internal Server Error');
  }
};

/**
 * POST /api/sdk/visitors
 * Initialize a new visitor session
 */
export const createVisitorRoute = async (req: SDKRequest, res: Response) => {
  try {
    const { name, email, phone, sessionId, userAgent, referrerUrl, inboxId, site } = req.body;
    const tenantId = req.tenantId!;
    const ipAddress = req.ip;

    // Validate required fields
    if (!sessionId) {
      logger.error("Session ID is required");
      return sendHTTPResponse.error(res, 400, "Session ID is required");
    }

    // Get or determine inbox_id
    let targetInboxId = inboxId;
    console.log({targetInboxId})
    if (!targetInboxId) {
      // Get default inbox for tenant
      const defaultInboxQuery = `
        SELECT id FROM inboxes 
        WHERE tenant_id = ? AND name = 'Default Inbox' AND is_active = 1 
        LIMIT 1
      `;
      const inboxResult = await runQuery(defaultInboxQuery, [tenantId]);
      if (!inboxResult.rows || (inboxResult.rows as any[]).length === 0) {
        logger.error("No default inbox found for tenant");
        return sendHTTPResponse.error(res, 500, "No inbox available");
      }
      targetInboxId = (inboxResult.rows as any[])[0].id;
    } else {
      // Verify inbox exists and is active
      const inboxVerifyQuery = `
        SELECT id FROM inboxes 
        WHERE id = ? AND tenant_id = ? AND is_active = 1 
        LIMIT 1
      `;
      const inboxVerifyResult = await runQuery(inboxVerifyQuery, [targetInboxId, tenantId]);
      if (!inboxVerifyResult.rows || (inboxVerifyResult.rows as any[]).length === 0) {
        logger.error("Invalid or inactive inbox");
        return sendHTTPResponse.error(res, 400, "Invalid inbox");
      }
    }

    // Build visitor data object with proper optional property handling
    const visitorData: {
      name?: string;
      email?: string;
      phone?: string;
      sessionId: string;
      ipAddress?: string;
      userAgent?: string;
      referrerUrl?: string;
    } = {
      sessionId: String(sessionId),
    };

    // Only add optional properties if they have values
    if (name) visitorData.name = String(name);
    else visitorData.name = `visitor-${Math.floor(1000 + Math.random() * 9000)}`;
    if (email) visitorData.email = String(email);
    if (phone) visitorData.phone = String(phone);
    if (ipAddress) visitorData.ipAddress = ipAddress;
    if (userAgent) visitorData.userAgent = String(userAgent);
    if (referrerUrl) visitorData.referrerUrl = String(referrerUrl);

    const visitor = await VisitorService.initializeVisitorSession(tenantId, visitorData);

    // Generate visitor JWT with inbox_id (session_id in database scopes conversations per website)
    const visitorToken = JWTService.generateVisitorToken(visitor.id, tenantId, targetInboxId, "180d");

    const responseData = {
      visitor: {
        id: visitor.id,
        name: visitor.name,
        email: visitor.email,
        session_id: visitor.session_id,
        status: visitor.status,
      },
      tenant: {
        id: tenantId,
        branding: req.sdkSettings?.branding,
        widget_config: req.sdkSettings?.widget_config,
      },
      inbox_id: targetInboxId,
      // Return tokens in response for localStorage storage (cookies don't work across domains)
      visitor_token: visitorToken,
    };

    logger.info(`Visitor session initialized: ${visitor.id} for tenant: ${tenantId}, inbox: ${targetInboxId}`);
    // Set cookies as fallback (for same-domain scenarios)
    res.cookie("visitorId", visitor.id, { path: "/", maxAge: 60 * 60 * 24 * 60 * 1000, sameSite: "lax" });
    res.cookie("visitorToken", visitorToken, { path: "/", maxAge: 60 * 60 * 24 * 60 * 1000, sameSite: "lax" });
    return sendHTTPResponse.success(res, 201, "Visitor session initialized", responseData);
  } catch (error: any) {
    logger.error({ error }, "Initialize visitor error");
    return sendHTTPResponse.error(res, 500, "Internal server error");
  }
};

/**
 * POST /api/sdk/conversations
 * Create or retrieve a conversation for a visitor
 */
export const createConversationRoute = async (req: SDKRequest, res: Response) => {
  try {
    const visitorId = req.body.visitorId || req.cookies.visitorId;
    const visitorToken = req.cookies.visitorToken;
    const { message } = req.body;
    const tenantId = req.tenantId!;

    if (!visitorId) {
      logger.error("Visitor ID is required");
      return sendHTTPResponse.error(res, 400, "Visitor ID is required");
    }

    // Extract inbox_id from visitor token (single source of truth)
    let inboxId: string | null = null;
    if (visitorToken) {
      const decoded = JWTService.verifyAccessToken(visitorToken);
      if (decoded && decoded.inboxId && decoded.userId === visitorId) {
        inboxId = decoded.inboxId;
      }
    }

    // If no inbox_id from token, get default inbox
    if (!inboxId) {
      const defaultInboxQuery = `
        SELECT id FROM inboxes 
        WHERE tenant_id = ? AND name = 'Default Inbox' AND is_active = 1 
        LIMIT 1
      `;
      const inboxResult = await runQuery(defaultInboxQuery, [tenantId]);
      if (!inboxResult.rows || (inboxResult.rows as any[]).length === 0) {
        logger.error("No default inbox found for tenant");
        return sendHTTPResponse.error(res, 500, "No inbox available");
      }
      inboxId = (inboxResult.rows as any[])[0].id;
    }

    // Get visitor info to get session_id for website scoping (session_id is unique per website)
    const visitorInfoQuery = `SELECT session_id, referrer_url FROM external_visitors WHERE id = ? AND tenant_id = ? LIMIT 1`;
    const visitorInfoResult = await runQuery(visitorInfoQuery, [visitorId, tenantId]);
    const visitorInfo = (visitorInfoResult.rows as any[])[0];
    const sessionId = visitorInfo?.session_id || null;
    const referrerUrl = visitorInfo?.referrer_url || null;

    // Check if conversation already exists for this visitor in this inbox AND website
    // We scope by session_id (unique per website) OR by matching site origin in referrer_url
    const existingConvQuery = `
      SELECT c.id FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.tenant_id = c.tenant_id
      JOIN external_visitors ev ON ev.id = cp.participant_id AND cp.participant_type = 'visitor'
      WHERE c.tenant_id = ? AND c.inbox_id = ?
        AND cp.participant_type = 'visitor' AND cp.participant_id = ?
        AND c.status = 'open'
        ${sessionId ? 'AND ev.session_id = ?' : ''}
      ORDER BY c.created_at DESC
      LIMIT 1
    `;
    const existingConvParams = sessionId 
      ? [tenantId, inboxId, visitorId, sessionId]
      : [tenantId, inboxId, visitorId];
    
    const existingConvResult = await runQuery(existingConvQuery, existingConvParams);
    let conversationId: string | null = null;
    let shouldCreateNewConversation = true;

    if (existingConvResult.rows && (existingConvResult.rows as any[]).length > 0) {
      conversationId = (existingConvResult.rows as any[])[0].id;
      shouldCreateNewConversation = false;
      logger.info(`Found existing conversation: ${conversationId} for visitor: ${visitorId}`);
    }

    if (shouldCreateNewConversation) {
      const isBotFeatureEnabled = await isFeatureEnabled(tenantId, ENUM_FEATURES.BOTS);
      let botDetails = null;
      if (isBotFeatureEnabled) {
        // Get inbox-level bot (preferred) or fallback to tenant-level
        botDetails = await BotService.getBotByInboxId(inboxId as string, tenantId);
        if (!botDetails) {
          botDetails = await BotService.getBotByTenantId(tenantId);
        }
      }

      const participantList = [{ participant_type: "visitor", participant_id: visitorId }];
      if (isBotFeatureEnabled && botDetails) {
        participantList.push({ participant_type: "bot", participant_id: botDetails.id });
      }
      // Create a conversation with the visitor as a participant in the specified inbox
      const conversation = await ConversationService.createConversation(
        tenantId,
        inboxId as string,
        participantList,
        null // assigned_user_id is NULL initially, bot will respond
      );
      conversationId = conversation.id;
      logger.info(`Created new conversation: ${conversationId} for visitor: ${visitorId} in inbox: ${inboxId}`);
    }

    // Add message if provided and trigger bot response
    let botMessage = null;
    if (message && conversationId) {
      await ConversationService.addMessage(tenantId, conversationId, "visitor", visitorId, message, "text");
      
      // Trigger bot response if bot is enabled (POSC: bot is always enabled)
      const isBotFeatureEnabled = await isFeatureEnabled(tenantId, ENUM_FEATURES.BOTS);
      if (isBotFeatureEnabled) {
        const conversation = await ConversationService.getConversationById(conversationId, visitorId, tenantId, "visitor");
        if (conversation && !conversation.assigned_user_id) {
          let botDetails = await BotService.getBotByInboxId(inboxId as string, tenantId);
          if (!botDetails) {
            botDetails = await BotService.getBotByTenantId(tenantId);
          }
          if (botDetails) {
            // Generate random bot response
            const botResponse = BotService.generateRandomResponse();
            botMessage = await ConversationService.addMessage(tenantId, conversationId, "bot", botDetails.id, botResponse, "text");
          }
        }
      }
    }

    const responseData = {
      conversation: {
        id: conversationId,
      },
      bot_response: botMessage ? {
        id: botMessage.id,
        conversation_id: botMessage.conversation_id,
        sender_type: botMessage.sender_type,
        sender_id: botMessage.sender_id,
        content: botMessage.content,
        message_type: botMessage.message_type,
        created_at: botMessage.created_at
      } : null
    };

    logger.info(`Conversation ready: ${conversationId} for visitor: ${visitorId} in tenant: ${tenantId}, inbox: ${inboxId}`);
    return sendHTTPResponse.success(res, 201, "Conversation ready", responseData);
  } catch (error: any) {
    logger.error(error, "Create conversation error");
    return sendHTTPResponse.error(res, 500, "Internal server error");
  }
};

/**
 * GET /api/sdk/conversations/:id/messages
 * Get messages for a conversation
 */
export const getConversationMessagesRoute = async (req: SDKRequest, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    // Get visitorId from query params (for cross-domain) or cookies (for same-domain)
    const visitorId = req.query.visitorId as string || req.cookies.visitorId;
    const visitorToken = req.cookies.visitorToken;
    const tenantId = req.tenantId!;

    // If conversationId not in params, find it using visitorToken (visitorId + inboxId + session_id for website scoping)
    let finalConversationId: string | undefined = conversationId;
    if (!finalConversationId && visitorToken && visitorId) {
      const decoded = JWTService.verifyAccessToken(visitorToken);
      if (decoded && decoded.inboxId && decoded.userId === visitorId) {
        // Get session_id from visitor to scope conversation lookup per website
        const visitorInfoQuery = `SELECT session_id FROM external_visitors WHERE id = ? AND tenant_id = ? LIMIT 1`;
        const visitorInfoResult = await runQuery(visitorInfoQuery, [visitorId, tenantId]);
        const sessionId = (visitorInfoResult.rows as any[])[0]?.session_id || null;
        
        // Find conversation by visitorId + inboxId + session_id (to ensure we get the right conversation for this website)
        const convQuery = `
          SELECT c.id FROM conversations c
          JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.tenant_id = c.tenant_id
          JOIN external_visitors ev ON ev.id = cp.participant_id AND cp.participant_type = 'visitor'
          WHERE c.tenant_id = ? AND c.inbox_id = ?
            AND cp.participant_type = 'visitor' AND cp.participant_id = ?
            AND c.status = 'open'
            ${sessionId ? 'AND ev.session_id = ?' : ''}
          ORDER BY c.created_at DESC
          LIMIT 1
        `;
        const convParams = sessionId 
          ? [tenantId, decoded.inboxId, visitorId, sessionId]
          : [tenantId, decoded.inboxId, visitorId];
        const convResult = await runQuery(convQuery, convParams);
        if (convResult.rows && (convResult.rows as any[]).length > 0) {
          finalConversationId = (convResult.rows as any[])[0].id;
        }
      }
    }

    if (!finalConversationId || !visitorId) {
      return sendHTTPResponse.error(res, 400, "Conversation ID and visitor ID are required");
    }
    // Check if visitor is a participant in the conversation
    const participants = await ConversationService.getParticipants(tenantId, finalConversationId);
    console.log({participants})
    const isVisitor = participants.some((p) => p.participant_type === "visitor" && p.participant_id === visitorId);
    if (!isVisitor) {
      return sendHTTPResponse.error(res, 404, "Conversation not found or access denied");
    }
    await VisitorService.updateVisitorActivity(tenantId, visitorId as string);
    // Get all messages for the conversation
    const messagesResult = await runQuery(
      `SELECT
  m.id,
  m.conversation_id,
  m.sender_type,
  m.sender_id,
  m.content,
  m.message_type,
  m.created_at
FROM messages m
WHERE m.tenant_id = ?
  AND m.conversation_id = ?
ORDER BY m.created_at ASC;`,
      [tenantId, finalConversationId]
    );
    const messages = messagesResult.rows as any[];
    const responseData = {
      messages,
      conversation_id: finalConversationId,
      has_more: false,
    };
    return sendHTTPResponse.success(res, 200, "Messages retrieved successfully", responseData);
  } catch (error: any) {
    logger.error(error, "Get external messages error");
    return sendHTTPResponse.error(res, 500, "Internal server error");
  }
};

/**
 * POST /api/sdk/conversations/:id/messages
 * Send a message in a conversation
 */
export const sendMessageRoute = async (req: SDKRequest, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    const { content, messageType = 'text' } = req.body;
    const visitorId = req.body.visitorId || req.cookies.visitorId;
    const tenantId = req.tenantId!;

    if (!conversationId) {
      return sendHTTPResponse.error(res, 400, "Conversation ID is required");
    }

    if (!visitorId) {
      return sendHTTPResponse.error(res, 400, "Visitor ID is required");
    }

    if (!content || typeof content !== 'string') {
      return sendHTTPResponse.error(res, 400, "Message content is required");
    }

    // Verify visitor is a participant
    const participants = await ConversationService.getParticipants(tenantId, conversationId);
    const isVisitor = participants.some((p) => p.participant_type === "visitor" && p.participant_id === visitorId);
    if (!isVisitor) {
      return sendHTTPResponse.error(res, 403, "Access denied to this conversation");
    }

    // Add message
    const message = await ConversationService.addMessage(
      tenantId,
      conversationId,
      "visitor",
      visitorId,
      content,
      messageType
    );

    // Check if bot should respond (POSC: bot is always enabled)
    const isBotFeatureEnabled = await isFeatureEnabled(tenantId, ENUM_FEATURES.BOTS);
    let botMessage = null;
    
    if (isBotFeatureEnabled) {
      const conversation = await ConversationService.getConversationById(conversationId, visitorId, tenantId, "visitor");
      if (conversation && !conversation.assigned_user_id) {
        // Get bot for this inbox
        const inboxId = conversation.inbox_id;
        let botDetails = await BotService.getBotByInboxId(inboxId, tenantId);
        if (!botDetails) {
          botDetails = await BotService.getBotByTenantId(tenantId);
        }
        if (botDetails) {
          // Generate random bot response
          const botResponse = BotService.generateRandomResponse();
          botMessage = await ConversationService.addMessage(tenantId, conversationId, "bot", botDetails.id, botResponse, "text");
        }
      }
    }

    return sendHTTPResponse.success(res, 201, "Message sent successfully", {
      message: {
        id: message.id,
        conversation_id: message.conversation_id,
        sender_type: message.sender_type,
        sender_id: message.sender_id,
        content: message.content,
        message_type: message.message_type,
        created_at: message.created_at
      },
      bot_response: botMessage ? {
        id: botMessage.id,
        conversation_id: botMessage.conversation_id,
        sender_type: botMessage.sender_type,
        sender_id: botMessage.sender_id,
        content: botMessage.content,
        message_type: botMessage.message_type,
        created_at: botMessage.created_at
      } : null
    });
  } catch (error: any) {
    logger.error(error, "Send message error");
    return sendHTTPResponse.error(res, 500, "Internal server error");
  }
};

