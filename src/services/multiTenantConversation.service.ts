import runQuery from '../database/runQuery';

export class MultiTenantConversationService {
  // Find or create a conversation between participants (user, visitor, bot) within a tenant
  static async findOrCreateConversation(tenantId: string, participantType: string, participantId: string): Promise<any> {
    // Try to find existing conversation for this participant
    let query = `
      SELECT c.* FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.tenant_id = ? AND cp.participant_type = ? AND cp.participant_id = ?
      ORDER BY c.created_at DESC LIMIT 1
    `;
    let result = await runQuery(query, [tenantId, participantType, participantId]);
    if ((result.rows as any[]).length > 0) {
      return result.rows as any[0];
    }
    // Create new conversation
    query = `
      INSERT INTO conversations (id, tenant_id, status, created_at)
      VALUES (UUID(), ?, 'open', NOW())
    `;
    await runQuery(query, [tenantId]);
    // Get the created conversation
    const selectQuery = `
      SELECT * FROM conversations WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1
    `;
    result = await runQuery(selectQuery, [tenantId]);
    const conversation = result.rows as any[0];
    // Add participant
    const participantQuery = `
      INSERT INTO conversation_participants (id, tenant_id, conversation_id, participant_type, participant_id, joined_at)
      VALUES (UUID(), ?, ?, ?, ?, NOW())
    `;
    await runQuery(participantQuery, [tenantId, conversation.id, participantType, participantId]);
    return conversation;
  }

  // Create a new conversation and add participants (inbox_id is now required)
  static async createConversation(
    tenantId: string,
    inboxId: string,
    participants: Array<{ participant_type: string; participant_id: string }>,
    assignedUserId: string | null = null
  ): Promise<any> {
    const query = `
      INSERT INTO conversations (id, tenant_id, inbox_id, status, assigned_user_id, created_at, updated_at)
      VALUES (UUID(), ?, ?, 'open', ?, NOW(), NOW())
    `;
    await runQuery(query, [tenantId, inboxId, assignedUserId]);
    const selectQuery = `SELECT * FROM conversations WHERE tenant_id = ? AND inbox_id = ? ORDER BY created_at DESC LIMIT 1`;
    const result = await runQuery(selectQuery, [tenantId, inboxId]);
    const conversation = (result.rows as any[])[0];
    // Add participants
    for (const p of participants) {
      await runQuery(
        `INSERT INTO conversation_participants (id, tenant_id, conversation_id, participant_type, participant_id, joined_at) VALUES (UUID(), ?, ?, ?, ?, NOW())`,
        [tenantId, conversation.id, p.participant_type, p.participant_id]
      );
    }
    return conversation;
  }

  // Get all conversations for an agent/user (filtered by inboxes they have access to)
  static async getUserConversations(tenantId: string, userId: string, inboxId?: string): Promise<any[]> {
    let inboxFilter = '';
    const queryParams: any[] = [tenantId, userId];
    
    if (inboxId) {
      // Verify user has access to this inbox
      const accessQuery = `
        SELECT 1 FROM user_inboxes 
        WHERE tenant_id = ? AND user_id = ? AND inbox_id = ?
        LIMIT 1
      `;
      const accessResult = await runQuery(accessQuery, [tenantId, userId, inboxId]);
      if (!accessResult.rows || (accessResult.rows as any[]).length === 0) {
        return []; // User doesn't have access to this inbox
      }
      inboxFilter = ' AND c.inbox_id = ?';
      queryParams.push(inboxId);
    } else {
      // Filter by inboxes user has access to
      inboxFilter = ` AND c.inbox_id IN (
        SELECT inbox_id FROM user_inboxes 
        WHERE tenant_id = ? AND user_id = ?
      )`;
      queryParams.push(tenantId, userId);
    }

    const query = `
      SELECT c.* FROM conversations c
      WHERE c.tenant_id = ? AND c.assigned_user_id = ?${inboxFilter}
      ORDER BY c.last_message_at DESC
    `;
    const result = await runQuery(query, queryParams);
    return result.rows;
  }

  // Add message to conversation
  static async addMessage(tenantId: string, conversationId: string, senderType: string, senderId: string, content: string, messageType: string = 'text'): Promise<any> {
    const query = `
      INSERT INTO messages (id, tenant_id, conversation_id, sender_type, sender_id, content, message_type, created_at)
      VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())
    `;
    await runQuery(query, [tenantId, conversationId, senderType, senderId, content, messageType]);
    // Update last_message_at
    await runQuery('UPDATE conversations SET last_message_at = NOW() WHERE id = ? AND tenant_id = ?', [conversationId, tenantId]);
    // Return the created message
    const selectQuery = `
      SELECT * FROM messages WHERE conversation_id = ? AND sender_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1
    `;
    const result = await runQuery(selectQuery, [conversationId, senderId, tenantId]);
    return result.rows[0];
  }

  // [TODO] - Implement agent assignment to visitor conversations
  // Currently disabled - focusing on bot and visitor conversations only
  // static async assignAgent(tenantId: string, conversationId: string, agentId: string): Promise<void> {
  //   // Verify agent has access to the conversation's inbox
  //   const accessQuery = `
  //     SELECT 1 FROM conversations c
  //     JOIN user_inboxes ui ON c.inbox_id = ui.inbox_id
  //     WHERE c.id = ? AND c.tenant_id = ? AND ui.user_id = ? AND ui.tenant_id = ?
  //     LIMIT 1
  //   `;
  //   const accessResult = await runQuery(accessQuery, [conversationId, tenantId, agentId, tenantId]);
  //   if (!accessResult.rows || (accessResult.rows as any[]).length === 0) {
  //     throw new Error('Agent does not have access to this inbox');
  //   }
  //   const query = `
  //     UPDATE conversations SET assigned_user_id = ? WHERE id = ? AND tenant_id = ?
  //   `;
  //   await runQuery(query, [agentId, conversationId, tenantId]);
  // }

  // Get participants for a conversation
  static async getParticipants(tenantId: string, conversationId: string): Promise<any[]> {
    const query = `
      SELECT * FROM conversation_participants WHERE tenant_id = ? AND conversation_id = ?
    `;
    const result = await runQuery(query, [tenantId, conversationId]);
    return result.rows;
  }

  // Inbox filters (filtered by inboxes user has access to)
  static async getInboxConversations(tenantId: string, userId: string, filter: 'mine' | 'others' | 'unattended', inboxId?: string): Promise<any[]> {
    // Base query with inbox access filter
    let inboxFilter = ` AND c.inbox_id IN (
      SELECT inbox_id FROM user_inboxes 
      WHERE tenant_id = ? AND user_id = ?
    )`;
    const baseParams: any[] = [tenantId, tenantId, userId];
    
    // If specific inbox provided, verify access and filter
    if (inboxId) {
      const accessQuery = `
        SELECT 1 FROM user_inboxes 
        WHERE tenant_id = ? AND user_id = ? AND inbox_id = ?
        LIMIT 1
      `;
      const accessResult = await runQuery(accessQuery, [tenantId, userId, inboxId]);
      if (!accessResult.rows || (accessResult.rows as any[]).length === 0) {
        return []; // User doesn't have access
      }
      inboxFilter = ' AND c.inbox_id = ?';
      baseParams.push(inboxId);
    }

    let query = `SELECT c.* FROM conversations c WHERE c.tenant_id = ?${inboxFilter}`;
    if (filter === 'mine') {
      query += ' AND c.assigned_user_id = ?';
      baseParams.push(userId);
      return (await runQuery(query, baseParams)).rows;
    } else if (filter === 'others') {
      query += ' AND c.assigned_user_id IS NOT NULL AND c.assigned_user_id != ?';
      baseParams.push(userId);
      return (await runQuery(query, baseParams)).rows;
    } else if (filter === 'unattended') {
      query += ' AND c.assigned_user_id IS NULL';
      return (await runQuery(query, baseParams)).rows;
    }
    return [];
  }

  // Mark messages as read for a user in a conversation
  static async markMessagesAsRead(tenantId: string, conversationId: string, userId: string): Promise<void> {
    const query = `
      UPDATE messages 
      SET status = 'read' 
      WHERE tenant_id = ? AND conversation_id = ? AND sender_type = 'user' AND sender_id != ? AND status != 'read'
    `;
    await runQuery(query, [tenantId, conversationId, userId]);
  }

  // Get paginated messages for a conversation
  static async getConversationMessages(tenantId: string, conversationId: string, userId: string, page: number = 1, limit: number = 50): Promise<any[]> {
    const offset = (page - 1) * limit;
    const query = `
      SELECT * FROM messages
      WHERE tenant_id = ? AND conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `;
    const result = await runQuery(query, [tenantId, conversationId, limit, offset]);
    return result.rows as any[];
  }
}
