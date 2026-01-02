import { JWTService } from "../common/jwt.service";
import logger from "../config/logger";
import runQuery from "../database/runQuery";
import { ConversationService } from "./conversation.service";
// import _ from 'lodash';

export interface TenantDetails {
  tenantId: string;
}
export interface ConversationValidationResult {
  isValid: boolean;
  data?: {
    conversationId: string;
  };
}
export class SDKService {
  // SDK service methods go here
  static async getTenantDetails(websiteAPIKey: string): Promise<TenantDetails | null> {
    const query = `
      SELECT tenant_id FROM chat_sdk_settings 
      WHERE api_key = ? AND is_active = 1`;
    const result = await runQuery(query, [websiteAPIKey]);
    if (!result || (result.rows as any).length === 0) {
      return null;
    }
    const row = (result.rows as any)[0];
    return {
      tenantId: row.tenant_id,
    };
  }

  static async validateWebsiteToken(websiteToken: string): Promise<boolean> {
    // JWT validation logic for website token
    const decoded = JWTService.verifyAccessToken(websiteToken);
    if (!decoded) {
      return false;
    }
    return true;
  }

  static async getConversationDetailsFromKey(
    conversationToken: string,
    visitorId: string,
    tenantId: string
  ): Promise<ConversationValidationResult> {
    // JWT validation logic for conversation token (now contains inboxId)
    const decoded = JWTService.verifyAccessToken(conversationToken);
    if (!decoded || decoded.userId !== visitorId || decoded.tenantId !== tenantId) {
      logger.info(`Invalid conversation token for visitor: ${visitorId} in tenant: ${tenantId}`);
      return { isValid: false };
    }

    // Find the most recent open conversation for this visitor in the inbox
    const inboxId = decoded.inboxId;
    if (!inboxId) {
      logger.info(`No inbox_id in token for visitor: ${visitorId} in tenant: ${tenantId}`);
      return { isValid: false };
    }

    // Find existing conversation for this visitor in this inbox
    const conversationQuery = `
      SELECT c.id FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.tenant_id = c.tenant_id
      WHERE c.tenant_id = ? AND c.inbox_id = ?
        AND cp.participant_type = 'visitor' AND cp.participant_id = ?
        AND c.status = 'open'
      ORDER BY c.created_at DESC
      LIMIT 1
    `;
    const convResult = await runQuery(conversationQuery, [tenantId, inboxId, visitorId]);
    if (convResult && (convResult.rows as any[]).length > 0) {
      const conversationId = (convResult.rows as any[])[0].id;
      logger.info(
        `Found existing conversation: ${conversationId} for visitor: ${visitorId} in tenant: ${tenantId}, inbox: ${inboxId}`
      );
      return { isValid: true, data: { conversationId } };
    } else {
      logger.info(
        `No existing conversation found for visitor: ${visitorId} in tenant: ${tenantId}, inbox: ${inboxId}`
      );
      return { isValid: false };
    }
  }
}
