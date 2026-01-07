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

// Initialize visitor session
export const initializeVisitorRoute = async (req: SDKRequest, res: Response) => {
  try {
    const { name, email, phone, sessionId, userAgent, referrerUrl, inboxId } = req.body;
    const tenantId = req.tenantId!;
    const ipAddress = req.ip;

    // Validate required fields
    if (!sessionId) {
      logger.error("Session ID is required");
      return sendHTTPResponse.error(res, 400, "Session ID is required");
    }

    // Get or determine inbox_id
    let targetInboxId = inboxId;
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

    // Generate visitor JWT with inbox_id
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
    };

    logger.info(`Visitor session initialized: ${visitor.id} for tenant: ${tenantId}, inbox: ${targetInboxId}`);
    res.cookie("visitorId", visitor.id, { path: "/", maxAge: 60 * 60 * 24 * 60 * 1000, sameSite: "lax" });
    res.cookie("visitorToken", visitorToken, { path: "/", maxAge: 60 * 60 * 24 * 60 * 1000, sameSite: "lax" });
    return sendHTTPResponse.success(res, 201, "Visitor session initialized", responseData);
  } catch (error: any) {
    logger.error({ error }, "Initialize visitor error");
    return sendHTTPResponse.error(res, 500, "Internal server error");
  }
};

// Start external chat conversation
export const startExternalChatRoute = async (req: SDKRequest, res: Response) => {
  try {
    const visitorId = req.body.visitorId || req.cookies.visitorId;
    const chatEngineConversationToken = req.cookies.chatEngineConversation;
    const visitorToken = req.cookies.visitorToken;
    const { message } = req.body;
    const tenantId = req.tenantId!;

    if (!visitorId) {
      logger.error("Visitor ID is required");
      return sendHTTPResponse.error(res, 400, "Visitor ID is required");
    }

    // Extract inbox_id from visitor token
    let inboxId: string | null = null;
    if (visitorToken) {
      const decoded = JWTService.verifyAccessToken(visitorToken);
      if (decoded && decoded.inboxId) {
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

    const isBotFeatureEnabled = await isFeatureEnabled(tenantId, ENUM_FEATURES.BOTS);
    let botDetails = null;
    if (isBotFeatureEnabled) {
      // Get inbox-level bot (preferred) or fallback to tenant-level
      botDetails = await BotService.getBotByInboxId(inboxId as string, tenantId);
      if (!botDetails) {
        botDetails = await BotService.getBotByTenantId(tenantId);
      }
    }
    let conversationId: string | null = null;
    let shouldCreateNewConversation = true;

    if (chatEngineConversationToken) {
      const result = await SDKService.getConversationDetailsFromKey(chatEngineConversationToken, visitorId, tenantId);
      if (result.isValid) {
        conversationId = result.data?.conversationId || null;
        shouldCreateNewConversation = false;
      }
    }
    logger.info(
      `Should create new conversation: ${shouldCreateNewConversation} for visitor: ${visitorId} in tenant: ${tenantId}, inbox: ${inboxId}`
    );
    if (shouldCreateNewConversation) {
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
    }
    if (message) {
      await ConversationService.addMessage(tenantId, conversationId as string, "visitor", visitorId, message, "text");
      
      // Trigger bot response if bot is enabled and no agent is assigned
      if (isBotFeatureEnabled && botDetails) {
        const conversation = await ConversationService.getConversationById(conversationId as string, visitorId, tenantId, "visitor");
        if (conversation && !conversation.assigned_user_id) {
          // Bot should respond - this will be handled by message processing
          // For now, we'll add a simple bot response
          const botResponse = "Thank you for your message. An agent will be with you shortly.";
          await ConversationService.addMessage(tenantId, conversationId as string, "bot", botDetails.id, botResponse, "text");
        }
      }
    }
    const responseData = {
      conversation: {
        id: conversationId,
      },
    };
    if (shouldCreateNewConversation) {
      logger.info(`Generating new conversation token for conversation: ${conversationId}`);
      // Generate conversation token with conversationId as a custom claim
      const conversationToken = JWTService.generateAccessToken({ 
        userId: visitorId, 
        email: '', 
        tenantId, 
        inboxId 
      } as any, "180d");
      // Store conversationId in a custom way - we'll use the token payload
      res.cookie("chatEngineConversation", conversationToken, {
        path: "/",
        maxAge: 60 * 60 * 24 * 60 * 1000,
        sameSite: "lax",
      });
    }
    logger.info(`External chat started: ${conversationId} for visitor: ${visitorId} in tenant: ${tenantId}, inbox: ${inboxId}`);
    return sendHTTPResponse.success(res, 201, "Chat started successfully", responseData);
  } catch (error: any) {
    logger.error(error, "Start external chat error");
    return sendHTTPResponse.error(res, 500, "Internal server error");
  }
};

// Get messages for external conversation
export const getExternalMessagesRoute = async (req: SDKRequest, res: Response) => {
  try {
    const chatEngineConversationToken = req.cookies.chatEngineConversation;
    const visitorId = req.cookies.visitorId;
    const tenantId = req.tenantId!;

    let conversationId = null;

    if (chatEngineConversationToken) {
      const result = await SDKService.getConversationDetailsFromKey(chatEngineConversationToken, visitorId, tenantId);
      if (result.isValid) {
        conversationId = result.data?.conversationId || null;
      }
    }

    // const { conversationId } = req.params;
    if (!conversationId || !visitorId) {
      return sendHTTPResponse.error(res, 400, "Conversation ID and visitor ID are required");
    }
    // Check if visitor is a participant in the conversation
    const participants = await ConversationService.getParticipants(tenantId, conversationId);
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
      [tenantId, conversationId]
    );
    const messages = messagesResult.rows as any[];
    const responseData = {
      messages,
      conversation_id: conversationId,
      has_more: false,
    };
    console.log({responseData})
    return sendHTTPResponse.success(res, 200, "Messages retrieved successfully", responseData);
  } catch (error: any) {
    logger.error(error, "Get external messages error");
    return sendHTTPResponse.error(res, 500, "Internal server error");
  }
};
