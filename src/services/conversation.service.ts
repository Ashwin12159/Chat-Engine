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
 static async createConversation(tenantId: string, inboxId: string, participants: Array<{ participant_type: string; participant_id: string }>, assignedUserId: string | null = null): Promise<Conversation> {
    const query = `
      INSERT INTO conversations (id, tenant_id, inbox_id, status, assigned_user_id, created_at, updated_at)
      VALUES (UUID(), ?, ?, 'open', ?, NOW(), NOW())
    `;
    await runQuery(query, [tenantId, inboxId, assignedUserId]);
    const selectQuery = `SELECT * FROM conversations WHERE tenant_id = ? AND inbox_id = ? ORDER BY created_at DESC LIMIT 1`;
    const result = await runQuery(selectQuery, [tenantId, inboxId]);
    const conversation = (result.rows as any[])[0];
   for (const p of participants) {

     const checkQuery = `
        SELECT 1 FROM conversation_participants
        WHERE tenant_id = ? AND conversation_id = ? AND participant_type = ? AND participant_id = ?
        LIMIT 1
      `;
      const checkResult = await runQuery(checkQuery, [tenantId, conversation.id, p.participant_type, p.participant_id]);
      if (checkResult.rows && (checkResult.rows as any[]).length > 0) {
     }
      await runQuery(
        `INSERT INTO conversation_participants (id, tenant_id, conversation_id, participant_type, participant_id, joined_at) VALUES (UUID(), ?, ?, ?, ?, NOW())`,
        [tenantId, conversation.id, p.participant_type, p.participant_id]
      );
    }
    return conversation;
  }
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

 static async getParticipants(tenantId: string, conversationId: string): Promise<any[]> {
    const result = await runQuery('SELECT participant_type, participant_id FROM conversation_participants WHERE tenant_id = ? AND conversation_id = ?', [tenantId, conversationId]);
    return result.rows as any[];
  }

 static async getInboxConversations(tenantId: string, userId: string, filter: 'mine' | 'others' | 'unattended', inboxId?: string): Promise<ConversationWithParticipant[]> {
   return [];
    
 }

 static async updateConversationState(conversationId: string, tenantId: string, status: 'open' | 'pending' | 'closed'): Promise<void> {
    const query = `
      UPDATE conversations SET status = ? WHERE id = ? AND tenant_id = ?
    `;
    await runQuery(query, [status, conversationId, tenantId]);
  }

 static async getUnreadCount(userId: string, tenantId: string): Promise<number> {
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

 static async getConversationById(conversationId: string, userId: string, tenantId: string, participant_type: 'user' | 'visitor'='user'): Promise<Conversation | null> {
   const participantQuery = `
      SELECT 1 FROM conversation_participants
      WHERE tenant_id = ? AND conversation_id = ? AND participant_type = ? AND participant_id = ?
      LIMIT 1
    `;
    const participantResult = await runQuery(participantQuery, [tenantId, conversationId, participant_type, userId]);
    if (!participantResult.rows || (participantResult.rows as any[]).length === 0) {
      return null;
    }
    
   if (participant_type === 'user') {
      const visitorCheckQuery = `
        SELECT 1 FROM conversation_participants
        WHERE tenant_id = ? AND conversation_id = ? AND participant_type = 'visitor'
        LIMIT 1
      `;
      const visitorCheckResult = await runQuery(visitorCheckQuery, [tenantId, conversationId]);
      if (visitorCheckResult.rows && (visitorCheckResult.rows as any[]).length > 0) {
       return null;
      }
    }
    
   const convQuery = `SELECT * FROM conversations WHERE id = ? AND tenant_id = ?`;
    const convResult = await runQuery(convQuery, [conversationId, tenantId]);
    const conversation = (convResult.rows as any[])[0] || null;
    
   if (conversation && participant_type === 'user') {
      const inboxAccessQuery = `
        SELECT 1 FROM user_inboxes 
        WHERE tenant_id = ? AND user_id = ? AND inbox_id = ?
        LIMIT 1
      `;
      const inboxAccessResult = await runQuery(inboxAccessQuery, [tenantId, userId, conversation.inbox_id]);
      if (!inboxAccessResult.rows || (inboxAccessResult.rows as any[]).length === 0) {
     }
    }
    
    return conversation;
  }

 static async getConversationMessages(conversationId: string, userId: string, tenantId: string, page: number = 1, limit: number = 50): Promise<any[]> {
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

 static async markMessagesAsRead(conversationId: string, userId: string, tenantId: string): Promise<void> {
    const query = `
      UPDATE messages
      SET status = 'read'
      WHERE conversation_id = ? AND tenant_id = ? AND sender_type = 'user' AND sender_id != ? AND status != 'read'
    `;
    await runQuery(query, [conversationId, tenantId, userId]);
  }

 static async startConversationWithUser(userId: string, userEmail: string, tenantId: string, inboxId: string): Promise<{ conversation: Conversation; targetUser: any }> {
   const inboxAccessQuery = `
      SELECT 1 FROM user_inboxes 
      WHERE tenant_id = ? AND user_id = ? AND inbox_id = ?
      LIMIT 1
    `;
    const inboxAccessResult = await runQuery(inboxAccessQuery, [tenantId, userId, inboxId]);
    if (!inboxAccessResult.rows || (inboxAccessResult.rows as any[]).length === 0) {
      throw new Error('User does not have access to this inbox');
    }

   const userQuery = 'SELECT id, name, email FROM users WHERE email = ? AND tenant_id = ?';
    const userResult = await runQuery(userQuery, [userEmail, tenantId]);
    if (!userResult.rows || (userResult.rows as any[]).length === 0) {
      throw new Error('User not found');
    }
    const targetUser = (userResult.rows as any[])[0];
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

 static async sendMessage(conversationId: string, userId: string, content: string, tenantId: string, messageType: string = 'text'): Promise<any> {
   const participantQuery = `
      SELECT 1 FROM conversation_participants
      WHERE tenant_id = ? AND conversation_id = ? AND participant_type = 'user' AND participant_id = ?
      LIMIT 1
    `;
    const participantResult = await runQuery(participantQuery, [tenantId, conversationId, userId]);
    if (!participantResult.rows || (participantResult.rows as any[]).length === 0) {
      throw new Error('Access denied to this conversation');
    }
    
   const visitorCheckQuery = `
      SELECT 1 FROM conversation_participants
      WHERE tenant_id = ? AND conversation_id = ? AND participant_type = 'visitor'
      LIMIT 1
    `;
    const visitorCheckResult = await runQuery(visitorCheckQuery, [tenantId, conversationId]);
    if (visitorCheckResult.rows && (visitorCheckResult.rows as any[]).length > 0) {
     throw new Error('Agents cannot send messages to visitor conversations yet');
    }
    
   const query = `
      INSERT INTO messages (id, tenant_id, conversation_id, sender_type, sender_id, content, message_type, created_at)
      VALUES (UUID(), ?, ?, 'user', ?, ?, ?, NOW())
    `;
    await runQuery(query, [tenantId, conversationId, userId, content, messageType]);
   await runQuery('UPDATE conversations SET last_message_at = NOW() WHERE id = ? AND tenant_id = ?', [conversationId, tenantId]);
   const selectQuery = `SELECT * FROM messages WHERE conversation_id = ? AND sender_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1`;
    const result = await runQuery(selectQuery, [conversationId, userId, tenantId]);
    return (result.rows as any[])[0];
  }
}
