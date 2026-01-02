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

      // if participant already exists then skip otherwise add
      const checkQuery = `
        SELECT 1 FROM conversation_participants
        WHERE tenant_id = ? AND conversation_id = ? AND participant_type = ? AND participant_id = ?
        LIMIT 1
      `;
      const checkResult = await runQuery(checkQuery, [tenantId, conversation.id, p.participant_type, p.participant_id]);
      if (checkResult.rows && (checkResult.rows as any[]).length > 0) {
        continue; // Participant already exists, skip adding
      }
      await runQuery(
        `INSERT INTO conversation_participants (id, tenant_id, conversation_id, participant_type, participant_id, joined_at) VALUES (UUID(), ?, ?, ?, ?, NOW())`,
        [tenantId, conversation.id, p.participant_type, p.participant_id]
      );
    }
    return conversation;
  }

  // [TODO] - Implement agent viewing visitor conversations
  // Currently disabled - focusing on bot and visitor conversations only
  // This should filter out conversations with visitor participants when enabled
  // static async getUserConversations(tenantId: string, userId: string, inboxId?: string): Promise<ConversationWithParticipant[]> {
  //   // If inboxId is provided, filter by that inbox (and verify user has access)
  //   // Otherwise, get conversations from all inboxes the user has access to
  //   let inboxFilter = '';
  //   const queryParams: any[] = [tenantId, tenantId, userId];
  //   
  //   if (inboxId) {
  //     // Verify user has access to this inbox
  //     const accessQuery = `
  //       SELECT 1 FROM user_inboxes 
  //       WHERE tenant_id = ? AND user_id = ? AND inbox_id = ?
  //       LIMIT 1
  //     `;
  //     const accessResult = await runQuery(accessQuery, [tenantId, userId, inboxId]);
  //     if (!accessResult.rows || (accessResult.rows as any[]).length === 0) {
  //       return []; // User doesn't have access to this inbox
  //     }
  //     inboxFilter = ' AND c.inbox_id = ?';
  //     queryParams.push(inboxId);
  //   } else {
  //     // Filter by inboxes user has access to
  //     inboxFilter = ` AND c.inbox_id IN (
  //       SELECT inbox_id FROM user_inboxes 
  //       WHERE tenant_id = ? AND user_id = ?
  //     )`;
  //     queryParams.push(tenantId, userId);
  //   }

  //   const query = `
  //     SELECT c.*, (
  //       SELECT content FROM messages WHERE conversation_id = c.id AND tenant_id = ? ORDER BY created_at DESC LIMIT 1
  //     ) as last_message,
  //     COALESCE((SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND tenant_id = ? AND sender_id != ?), 0) as unread_count
  //     FROM conversations c
  //     WHERE c.tenant_id = ? AND c.assigned_user_id = ?${inboxFilter}
  //     ORDER BY c.last_message_at DESC
  //   `;
  //   const result = await runQuery(query, queryParams);
  //   const conversations = result.rows as any[];
  //   // Attach participants
  //   for (const conv of conversations) {
  //     const partRes = await runQuery('SELECT participant_type, participant_id FROM conversation_participants WHERE tenant_id = ? AND conversation_id = ?', [tenantId, conv.id]);
  //     conv.participants = partRes.rows as any[];
  //   }
  //   return conversations;
  // }

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
  // [TODO] - Currently returns empty array - focusing on bot and visitor conversations only
  // When enabled, should filter out conversations with visitor participants
  static async getInboxConversations(tenantId: string, userId: string, filter: 'mine' | 'others' | 'unattended', inboxId?: string): Promise<ConversationWithParticipant[]> {
    // [TODO] - Filter out visitor conversations from agent inbox view
    // Currently disabled - focusing on bot and visitor conversations only
    // Return empty array for now since agents shouldn't see visitor conversations
    return [];
    
    // Base query with inbox access filter
    // let inboxFilter = ` AND c.inbox_id IN (
    //   SELECT inbox_id FROM user_inboxes 
    //   WHERE tenant_id = ? AND user_id = ?
    // )`;
    // const baseParams: any[] = [tenantId, tenantId, userId];
    // 
    // // If specific inbox provided, verify access and filter
    // if (inboxId) {
    //   const accessQuery = `
    //     SELECT 1 FROM user_inboxes 
    //     WHERE tenant_id = ? AND user_id = ? AND inbox_id = ?
    //     LIMIT 1
    //   `;
    //   const accessResult = await runQuery(accessQuery, [tenantId, userId, inboxId]);
    //   if (!accessResult.rows || (accessResult.rows as any[]).length === 0) {
    //     return []; // User doesn't have access
    //   }
    //   inboxFilter = ' AND c.inbox_id = ?';
    //   baseParams.push(inboxId);
    // }

    // // [TODO] - Add filter to exclude conversations with visitor participants
    // // AND c.id NOT IN (SELECT conversation_id FROM conversation_participants WHERE participant_type = 'visitor')

    // let query = `SELECT c.* FROM conversations c WHERE c.tenant_id = ?${inboxFilter}`;
    // if (filter === 'mine') {
    //   query += ' AND c.assigned_user_id = ?';
    //   baseParams.push(userId);
    //   return (await runQuery(query, baseParams)).rows as any[];
    // } else if (filter === 'others') {
    //   query += ' AND c.assigned_user_id IS NOT NULL AND c.assigned_user_id != ?';
    //   baseParams.push(userId);
    //   return (await runQuery(query, baseParams)).rows as any[];
    // } else if (filter === 'unattended') {
    //   query += ' AND c.assigned_user_id IS NULL';
    //   return (await runQuery(query, baseParams)).rows as any[];
    // }
    // return [];
  }

  // Update conversation status (state)
  static async updateConversationState(conversationId: string, tenantId: string, status: 'open' | 'pending' | 'closed'): Promise<void> {
    const query = `
      UPDATE conversations SET status = ? WHERE id = ? AND tenant_id = ?
    `;
    await runQuery(query, [status, conversationId, tenantId]);
  }

  // Get unread message count for a user
  static async getUnreadCount(userId: string, tenantId: string): Promise<number> {
    // Count messages in conversations where user is a participant, not sent by user, and not read
    const query = `
      SELECT COUNT(*) as count
      FROM messages m
      JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id AND m.tenant_id = cp.tenant_id
      WHERE cp.participant_type = 'user' AND cp.participant_id = ?
        AND m.tenant_id = ?
        AND NOT (m.sender_type = 'user' AND m.sender_id = ?)
        AND m.status != 'read'
    `;
    const result = await runQuery(query, [userId, tenantId, userId]);
    return parseInt((result.rows as any[])[0]?.count || '0');
  }

  // Get conversation by ID and verify user is a participant
  // [TODO] - Add check to prevent agents from accessing visitor conversations
  // Currently disabled for agents - focusing on bot and visitor conversations only
  static async getConversationById(conversationId: string, userId: string, tenantId: string, participant_type: 'user' | 'visitor'='user'): Promise<Conversation | null> {
    // Check if user is a participant in the conversation
    const participantQuery = `
      SELECT 1 FROM conversation_participants
      WHERE tenant_id = ? AND conversation_id = ? AND participant_type = ? AND participant_id = ?
      LIMIT 1
    `;
    const participantResult = await runQuery(participantQuery, [tenantId, conversationId, participant_type, userId]);
    if (!participantResult.rows || (participantResult.rows as any[]).length === 0) {
      return null;
    }
    
    // [TODO] - Block agents from accessing visitor conversations
    // If participant_type is 'user', check if conversation has visitor participants
    // If it does, return null to prevent agent access
    if (participant_type === 'user') {
      const visitorCheckQuery = `
        SELECT 1 FROM conversation_participants
        WHERE tenant_id = ? AND conversation_id = ? AND participant_type = 'visitor'
        LIMIT 1
      `;
      const visitorCheckResult = await runQuery(visitorCheckQuery, [tenantId, conversationId]);
      if (visitorCheckResult.rows && (visitorCheckResult.rows as any[]).length > 0) {
        // Conversation has visitor participants - block agent access for now
        return null;
      }
    }
    
    // Return conversation details
    const convQuery = `SELECT * FROM conversations WHERE id = ? AND tenant_id = ?`;
    const convResult = await runQuery(convQuery, [conversationId, tenantId]);
    const conversation = (convResult.rows as any[])[0] || null;
    
    // For users, verify they have access to the conversation's inbox
    if (conversation && participant_type === 'user') {
      const inboxAccessQuery = `
        SELECT 1 FROM user_inboxes 
        WHERE tenant_id = ? AND user_id = ? AND inbox_id = ?
        LIMIT 1
      `;
      const inboxAccessResult = await runQuery(inboxAccessQuery, [tenantId, userId, conversation.inbox_id]);
      if (!inboxAccessResult.rows || (inboxAccessResult.rows as any[]).length === 0) {
        return null; // User doesn't have access to this inbox
      }
    }
    
    return conversation;
  }

  // Get paginated messages for a conversation
  static async getConversationMessages(conversationId: string, userId: string, tenantId: string, page: number = 1, limit: number = 50): Promise<any[]> {
    // Check if user is a participant
    const participantQuery = `
      SELECT 1 FROM conversation_participants
      WHERE tenant_id = ? AND conversation_id = ? AND participant_type = 'user' AND participant_id = ?
      LIMIT 1
    `;
    const participantResult = await runQuery(participantQuery, [tenantId, conversationId, userId]);
    if (!participantResult.rows || (participantResult.rows as any[]).length === 0) {
      return [];
    }
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

  // Mark messages as read for a user in a conversation
  static async markMessagesAsRead(conversationId: string, userId: string, tenantId: string): Promise<void> {
    const query = `
      UPDATE messages
      SET status = 'read'
      WHERE conversation_id = ? AND tenant_id = ? AND sender_type = 'user' AND sender_id != ? AND status != 'read'
    `;
    await runQuery(query, [conversationId, tenantId, userId]);
  }

  // Start conversation with a user by email (requires inbox_id)
  static async startConversationWithUser(userId: string, userEmail: string, tenantId: string, inboxId: string): Promise<{ conversation: Conversation; targetUser: any }> {
    // Verify user has access to the inbox
    const inboxAccessQuery = `
      SELECT 1 FROM user_inboxes 
      WHERE tenant_id = ? AND user_id = ? AND inbox_id = ?
      LIMIT 1
    `;
    const inboxAccessResult = await runQuery(inboxAccessQuery, [tenantId, userId, inboxId]);
    if (!inboxAccessResult.rows || (inboxAccessResult.rows as any[]).length === 0) {
      throw new Error('User does not have access to this inbox');
    }

    // Find the target user within the same tenant
    const userQuery = 'SELECT id, name, email FROM users WHERE email = ? AND tenant_id = ?';
    const userResult = await runQuery(userQuery, [userEmail, tenantId]);
    if (!userResult.rows || (userResult.rows as any[]).length === 0) {
      throw new Error('User not found');
    }
    const targetUser = (userResult.rows as any[])[0];
    // Try to find existing conversation with both users as participants in the same inbox
    const convQuery = `
      SELECT c.* FROM conversations c
      JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.tenant_id = c.tenant_id AND cp1.participant_type = 'user' AND cp1.participant_id = ?
      JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.tenant_id = c.tenant_id AND cp2.participant_type = 'user' AND cp2.participant_id = ?
      WHERE c.tenant_id = ? AND c.inbox_id = ?
      LIMIT 1
    `;
    const convResult = await runQuery(convQuery, [userId, targetUser.id, tenantId, inboxId]);
    let conversation = (convResult.rows as any[])[0];
    if (!conversation) {
      // Create new conversation
      conversation = await this.createConversation(
        tenantId,
        inboxId,
        [
          { participant_type: 'user', participant_id: userId },
          { participant_type: 'user', participant_id: targetUser.id }
        ],
        null
      );
    }
    return { conversation, targetUser };
  }

  // Send a message in a conversation as a user
  // [TODO] - Add check to prevent agents from sending messages to visitor conversations
  // Currently disabled for visitor conversations - focusing on bot and visitor conversations only
  static async sendMessage(conversationId: string, userId: string, content: string, tenantId: string, messageType: string = 'text'): Promise<any> {
    // Check if user is a participant
    const participantQuery = `
      SELECT 1 FROM conversation_participants
      WHERE tenant_id = ? AND conversation_id = ? AND participant_type = 'user' AND participant_id = ?
      LIMIT 1
    `;
    const participantResult = await runQuery(participantQuery, [tenantId, conversationId, userId]);
    if (!participantResult.rows || (participantResult.rows as any[]).length === 0) {
      throw new Error('Access denied to this conversation');
    }
    
    // [TODO] - Block agents from sending messages to visitor conversations
    // Check if conversation has visitor participants
    const visitorCheckQuery = `
      SELECT 1 FROM conversation_participants
      WHERE tenant_id = ? AND conversation_id = ? AND participant_type = 'visitor'
      LIMIT 1
    `;
    const visitorCheckResult = await runQuery(visitorCheckQuery, [tenantId, conversationId]);
    if (visitorCheckResult.rows && (visitorCheckResult.rows as any[]).length > 0) {
      // Conversation has visitor participants - block agent messages for now
      throw new Error('Agents cannot send messages to visitor conversations yet');
    }
    
    // Add message
    const query = `
      INSERT INTO messages (id, tenant_id, conversation_id, sender_type, sender_id, content, message_type, created_at)
      VALUES (UUID(), ?, ?, 'user', ?, ?, ?, NOW())
    `;
    await runQuery(query, [tenantId, conversationId, userId, content, messageType]);
    // Update last_message_at
    await runQuery('UPDATE conversations SET last_message_at = NOW() WHERE id = ? AND tenant_id = ?', [conversationId, tenantId]);
    // Return the created message
    const selectQuery = `SELECT * FROM messages WHERE conversation_id = ? AND sender_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1`;
    const result = await runQuery(selectQuery, [conversationId, userId, tenantId]);
    return (result.rows as any[])[0];
  }
}
