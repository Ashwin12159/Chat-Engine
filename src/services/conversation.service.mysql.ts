import runQuery from '../database/runQuery';

export interface Conversation {
  id: string;
  tenant_id: string;
  inbox_id: string;
  status: 'open' | 'pending' | 'closed';
  assigned_user_id: string | null;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationWithParticipant {
  id: string;
  status: 'open' | 'pending' | 'closed';
  last_message_at: Date | null;
  assigned_user_id: string | null;
  last_message: string | null;
  unread_count: number;
  participants: Array<{ participant_type: 'user' | 'visitor' | 'bot'; participant_id: string }>;
}

export interface Message {
  id: string;
  tenant_id: string;
  conversation_id: string;
  sender_type: 'user' | 'visitor' | 'bot';
  sender_id: string;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system';
  created_at: Date;
}

export class ConversationService {
  // Create a new conversation and add participants (inbox_id is now required)
  static async createConversation(tenantId: string, inboxId: string, participants: Array<{ participant_type: string; participant_id: string }>, assignedUserId: string | null = null): Promise<Conversation> {
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

  // Get all conversations for an agent/user
  static async getUserConversations(tenantId: string, userId: string): Promise<ConversationWithParticipant[]> {
    const query = `
      SELECT c.*, (
        SELECT content FROM messages WHERE conversation_id = c.id AND tenant_id = ? ORDER BY created_at DESC LIMIT 1
      ) as last_message,
      COALESCE((SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND tenant_id = ? AND sender_id != ?), 0) as unread_count
      FROM conversations c
      WHERE c.tenant_id = ? AND c.assigned_user_id = ?
      ORDER BY c.last_message_at DESC
    `;
    const result = await runQuery(query, [tenantId, tenantId, userId, tenantId, userId]);
    const conversations = result.rows as any[];
    // Attach participants
    for (const conv of conversations) {
      const partRes = await runQuery('SELECT participant_type, participant_id FROM conversation_participants WHERE tenant_id = ? AND conversation_id = ?', [tenantId, conv.id]);
      conv.participants = partRes.rows as any[];
    }
    return conversations;
  }

  // Add message to conversation
  static async addMessage(tenantId: string, conversationId: string, senderType: string, senderId: string, content: string, messageType: string = 'text'): Promise<Message> {
    const query = `
      INSERT INTO messages (id, tenant_id, conversation_id, sender_type, sender_id, content, message_type, created_at)
      VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())
    `;
    await runQuery(query, [tenantId, conversationId, senderType, senderId, content, messageType]);
    await runQuery('UPDATE conversations SET last_message_at = NOW() WHERE id = ? AND tenant_id = ?', [conversationId, tenantId]);
    const selectQuery = `SELECT * FROM messages WHERE conversation_id = ? AND sender_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1`;
    const result = await runQuery(selectQuery, [conversationId, senderId, tenantId]);
    return (result.rows as any[])[0];
  }

  // [TODO] - Implement agent assignment to visitor conversations
  // Currently disabled - focusing on bot and visitor conversations only
  // static async assignAgent(tenantId: string, conversationId: string, agentId: string | null): Promise<void> {
  //   if (agentId) {
  //     // Verify agent has access to the conversation's inbox
  //     const accessQuery = `
  //       SELECT 1 FROM conversations c
  //       JOIN user_inboxes ui ON c.inbox_id = ui.inbox_id
  //       WHERE c.id = ? AND c.tenant_id = ? AND ui.user_id = ? AND ui.tenant_id = ?
  //       LIMIT 1
  //     `;
  //     const accessResult = await runQuery(accessQuery, [conversationId, tenantId, agentId, tenantId]);
  //     if (!accessResult.rows || (accessResult.rows as any[]).length === 0) {
  //       throw new Error('Agent does not have access to this inbox');
  //     }
  //   }
  //   await runQuery('UPDATE conversations SET assigned_user_id = ? WHERE id = ? AND tenant_id = ?', [agentId, conversationId, tenantId]);
  // }

  // Get participants for a conversation
  static async getParticipants(tenantId: string, conversationId: string): Promise<any[]> {
    const result = await runQuery('SELECT participant_type, participant_id FROM conversation_participants WHERE tenant_id = ? AND conversation_id = ?', [tenantId, conversationId]);
    return result.rows as any[];
  }

  // Inbox filters (filtered by inboxes user has access to)
  static async getInboxConversations(tenantId: string, userId: string, filter: 'mine' | 'others' | 'unattended', inboxId?: string): Promise<ConversationWithParticipant[]> {
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
      return (await runQuery(query, baseParams)).rows as any[];
    } else if (filter === 'others') {
      query += ' AND c.assigned_user_id IS NOT NULL AND c.assigned_user_id != ?';
      baseParams.push(userId);
      return (await runQuery(query, baseParams)).rows as any[];
    } else if (filter === 'unattended') {
      query += ' AND c.assigned_user_id IS NULL';
      return (await runQuery(query, baseParams)).rows as any[];
    }
    return [];
  }
}
