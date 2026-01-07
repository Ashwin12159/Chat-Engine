import { Request, Response } from 'express';
import sendHTTPResponse from '../../common/sendHTTPResponse';
import logger from '../../config/logger';
import { MultiTenantConversationService } from '../../services/multiTenantConversation.service';
import { MultiTenantUserService } from '../../services/multiTenantUser.service';
import { AuthenticatedTenantRequest } from '../../middleware/tenant.middleware';
import runQuery from '../../database/runQuery';

// [TODO] - Implement agent viewing visitor conversations
// Currently disabled - focusing on bot and visitor conversations only
// This route should filter out conversations with visitor participants when enabled
export const getUserConversationsRoute = async (req: AuthenticatedTenantRequest, res: Response) => {
    try {
        const tenantId = req.tenant!.tenantId;
        const userId = req.userId!;

        // [TODO] - Filter out visitor conversations
        // const conversations = await MultiTenantConversationService.getUserConversations(tenantId, userId);
        // Filter conversations to exclude those with visitor participants
        const conversations: any[] = []; // Temporarily return empty array

        const responseData = {
            conversations: conversations,
            count: conversations.length
        };

        return sendHTTPResponse.success(res, 200, 'Conversations retrieved successfully', responseData);

    } catch (error: any) {
        logger.error('Get conversations error:', error);
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const getConversationMessagesRoute = async (req: AuthenticatedTenantRequest, res: Response) => {
    try {
        const { conversationId } = req.params;
        const { page = '1', limit = '50' } = req.query;
        const tenantId = req.tenant!.tenantId;
        const userId = req.userId!;

        if (!conversationId) {
            return sendHTTPResponse.error(res, 400, 'Conversation ID is required');
        }

        // Validate participant access
        const participants = await MultiTenantConversationService.getParticipants(tenantId, conversationId);
        const isUser = participants.some(p => p.participant_type === 'user' && p.participant_id === userId);
        if (!isUser) {
            return sendHTTPResponse.error(res, 404, 'Conversation not found or access denied');
        }

        // [TODO] - Block agents from viewing visitor conversation messages
        // Currently disabled - focusing on bot and visitor conversations only
        const hasVisitor = participants.some(p => p.participant_type === 'visitor');
        if (hasVisitor) {
            return sendHTTPResponse.error(res, 403, 'Agents cannot view visitor conversation messages yet');
        }

        const messages = await MultiTenantConversationService.getConversationMessages(
            tenantId,
            conversationId,
            userId,
            parseInt(page as string),
            parseInt(limit as string)
        );

        const responseData = {
            messages: messages,
            conversation_id: conversationId,
            page: parseInt(page as string),
            limit: parseInt(limit as string)
        };

        return sendHTTPResponse.success(res, 200, 'Messages retrieved successfully', responseData);

    } catch (error: any) {
        logger.error('Get messages error:', error);
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const sendMessageRoute = async (req: AuthenticatedTenantRequest, res: Response) => {
    try {
        const { conversationId } = req.params;
        const { content, messageType = 'text' } = req.body;
        const tenantId = req.tenant!.tenantId;
        const userId = req.userId!;

        if (!conversationId) {
            return sendHTTPResponse.error(res, 400, 'Conversation ID is required');
        }

        // Validate input
        if (!content || typeof content !== 'string') {
            return sendHTTPResponse.error(res, 400, 'Message content is required');
        }

        // Validate participant access
        const participants = await MultiTenantConversationService.getParticipants(tenantId, conversationId);
        const isUser = participants.some(p => p.participant_type === 'user' && p.participant_id === userId);
        if (!isUser) {
            return sendHTTPResponse.error(res, 404, 'Conversation not found or access denied');
        }

        // [TODO] - Block agents from sending messages to visitor conversations
        // Currently disabled - focusing on bot and visitor conversations only
        const hasVisitor = participants.some(p => p.participant_type === 'visitor');
        if (hasVisitor) {
            return sendHTTPResponse.error(res, 403, 'Agents cannot send messages to visitor conversations yet');
        }

        // Send message
        const message = await MultiTenantConversationService.addMessage(
            tenantId,
            conversationId,
            'user',
            userId,
            content,
            messageType
        );

        const responseData = {
            message: {
                id: message.id,
                conversation_id: message.conversation_id,
                sender_type: message.sender_type,
                sender_id: message.sender_id,
                content: message.content,
                message_type: message.message_type,
                created_at: message.created_at
            }
        };

        logger.info(`Message sent: ${message.id} in conversation: ${conversationId} by user: ${userId} in tenant: ${tenantId}`);
        return sendHTTPResponse.success(res, 201, 'Message sent successfully', responseData);

    } catch (error: any) {
        logger.error('Send message error:', error);
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const markMessagesAsReadRoute = async (req: AuthenticatedTenantRequest, res: Response) => {
    try {
        const { conversationId } = req.params;
        const tenantId = req.tenant!.tenantId;
        const userId = req.userId!;

        if (!conversationId) {
            return sendHTTPResponse.error(res, 400, 'Conversation ID is required');
        }

        // Validate participant access
        const participants = await MultiTenantConversationService.getParticipants(tenantId, conversationId);
        const isUser = participants.some(p => p.participant_type === 'user' && p.participant_id === userId);
        if (!isUser) {
            return sendHTTPResponse.error(res, 404, 'Conversation not found or access denied');
        }

        // Mark messages as read (implement as needed)
        await MultiTenantConversationService.markMessagesAsRead(tenantId, conversationId, userId);

        return sendHTTPResponse.success(res, 200, 'Messages marked as read');

    } catch (error: any) {
        logger.error('Mark messages as read error:', error);
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const startConversationRoute = async (req: AuthenticatedTenantRequest, res: Response) => {
    try {
        const { userEmail, initialMessage, inboxId } = req.body;
        const tenantId = req.tenant!.tenantId;
        const userId = req.userId!;

        // Validate input
        if (!userEmail || typeof userEmail !== 'string') {
            return sendHTTPResponse.error(res, 400, 'User email is required');
        }

        // Validate inbox_id - get default if not provided
        let targetInboxId = inboxId;
        if (!targetInboxId) {
            // Get first inbox user has access to
            const inboxQuery = `
                SELECT inbox_id FROM user_inboxes 
                WHERE tenant_id = ? AND user_id = ? 
                LIMIT 1
            `;
            const inboxResult = await runQuery(inboxQuery, [tenantId, userId]);
            if (!inboxResult.rows || (inboxResult.rows as any[]).length === 0) {
                return sendHTTPResponse.error(res, 400, 'No inbox access available');
            }
            targetInboxId = (inboxResult.rows as any[])[0].inbox_id;
        } else {
            // Verify user has access to this inbox
            const accessQuery = `
                SELECT 1 FROM user_inboxes 
                WHERE tenant_id = ? AND user_id = ? AND inbox_id = ?
                LIMIT 1
            `;
            const accessResult = await runQuery(accessQuery, [tenantId, userId, targetInboxId]);
            if (!accessResult.rows || (accessResult.rows as any[]).length === 0) {
                return sendHTTPResponse.error(res, 403, 'Access denied to this inbox');
            }
        }

        // Find user by email
        const users = await MultiTenantUserService.searchUsers(tenantId, userEmail, userId);
        const targetUser = users.find(u => u.email === userEmail);
        if (!targetUser) {
            return sendHTTPResponse.error(res, 404, 'User not found in this tenant');
        }

        // Create conversation with both users as participants in the specified inbox
        const conversation = await MultiTenantConversationService.createConversation(
            tenantId,
            targetInboxId,
            [
                { participant_type: 'user', participant_id: userId },
                { participant_type: 'user', participant_id: targetUser.id }
            ],
            null // No agent assigned initially
        );

        let message = null;
        if (initialMessage && typeof initialMessage === 'string') {
            message = await MultiTenantConversationService.addMessage(
                tenantId,
                conversation.id,
                'user',
                userId,
                initialMessage
            );
        }

        const responseData = {
            conversation: {
                id: conversation.id,
                status: conversation.status,
                inbox_id: conversation.inbox_id,
                created_at: conversation.created_at
            },
            target_user: {
                id: targetUser.id,
                name: targetUser.name,
                email: targetUser.email
            },
            initial_message: message ? {
                id: message.id,
                content: message.content,
                created_at: message.created_at
            } : null
        };

        return sendHTTPResponse.success(res, 201, 'Conversation started successfully', responseData);

    } catch (error: any) {
        logger.error('Start conversation error:', error);
        if (error.message === 'User not found in this tenant') {
            return sendHTTPResponse.error(res, 404, error.message);
        }
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const searchUsersRoute = async (req: AuthenticatedTenantRequest, res: Response) => {
    try {
        const { q: searchTerm } = req.query;
        const tenantId = req.tenant!.tenantId;
        const userId = req.userId!;

        // Validate input
        if (!searchTerm || typeof searchTerm !== 'string') {
            return sendHTTPResponse.error(res, 400, 'Search term is required');
        }

        if (searchTerm.length < 2) {
            return sendHTTPResponse.error(res, 400, 'Search term must be at least 2 characters');
        }

        const users = await MultiTenantUserService.searchUsers(tenantId, searchTerm, userId);

        const responseData = {
            users: users.map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                is_online: user.is_online,
                last_seen: user.last_seen
            })),
            search_term: searchTerm,
            count: users.length
        };

        return sendHTTPResponse.success(res, 200, 'Users found', responseData);

    } catch (error: any) {
        logger.error('Search users error:', error);
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};
