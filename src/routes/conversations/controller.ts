// import { Response } from 'express';
// import { ConversationService } from '../../services/conversation.service';
// import { UserService } from '../../services/user.service';
// import { AuthenticatedRequest } from '../../middleware/auth.middleware';
// import sendHTTPResponse from '../../common/sendHTTPResponse';
// import logger from '../../config/logger';
// import { getIO } from '../../realtime/socket.server';
// import runQuery from '../../database/runQuery';

// // GET /conversations - Get all conversations for the authenticated user
// export const getAllConversations = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const userId = req.user?.userId;
//     const tenantId = req.user?.tenantId;
    
//     if (!userId || !tenantId) {
//       return sendHTTPResponse.error(res, 401, 'Authentication required');
//     }

//     const conversations = await ConversationService.getUserConversations(userId, tenantId);
//     sendHTTPResponse.success(res, 200, 'Conversations retrieved successfully', conversations);
//   } catch (error) {
//     logger.error(error, 'Error fetching conversations:');
//     sendHTTPResponse.error(res, 500, 'Internal Server Error');
//   }
// };

// // GET /conversations/:id - Get conversation details and messages
// export const getConversationById = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const { id } = req.params;
//     const userId = req.user?.userId;
//     const tenantId = req.user?.tenantId;
//     const { page = '1', limit = '50' } = req.query;

//     if (!userId || !tenantId) {
//       return sendHTTPResponse.error(res, 401, 'Authentication required');
//     }

//     if (!id) {
//       return sendHTTPResponse.error(res, 400, 'Conversation ID is required');
//     }

//     // Check if user has access to this conversation
//     const conversation = await ConversationService.getConversationById(id, userId, tenantId);
//     if (!conversation) {
//       return sendHTTPResponse.error(res, 404, 'Conversation not found');
//     }

//     // Get messages
//     const messages = await ConversationService.getConversationMessages(
//       id, 
//       userId, 
//       tenantId,
//       parseInt(page as string), 
//       parseInt(limit as string)
//     );

//     // Mark messages as read
//     await ConversationService.markMessagesAsRead(id, userId, tenantId);

//     sendHTTPResponse.success(res, 200, 'Conversation retrieved successfully', {
//       conversation,
//       messages
//     });
//   } catch (error) {
//     logger.error(error, 'Error fetching conversation:');
//     sendHTTPResponse.error(res, 500, 'Internal Server Error');
//   }
// };

// // POST /conversations - Start a new conversation with a user
// export const startConversation = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const { userEmail } = req.body;
//     const userId = req.user?.userId;
//     const tenantId = req.tenant!.tenantId;

//     if (!userId) {
//       return sendHTTPResponse.error(res, 401, 'Authentication required');
//     }

//     if (!userEmail || typeof userEmail !== 'string') {
//       return sendHTTPResponse.error(res, 400, 'User email is required');
//     }

//     const { conversation, targetUser } = await ConversationService.startConversationWithUser(
//       userId, 
//       userEmail,
//       tenantId,
//     );

//     sendHTTPResponse.success(res, 200, 'Conversation started successfully', {
//       conversation,
//       targetUser: {
//         id: targetUser.id,
//         name: targetUser.name,
//         email: targetUser.email
//       }
//     });
//   } catch (error) {
//     if (error instanceof Error && error.message === 'User not found') {
//       return sendHTTPResponse.error(res, 404, 'User not found');
//     }
//     logger.error(error, 'Error starting conversation:');
//     sendHTTPResponse.error(res, 500, 'Internal Server Error');
//   }
// };

// // POST /conversations/:id/messages - Send a message in a conversation
// export const sendMessage = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const { id } = req.params;
//     const { content, messageType = 'text' } = req.body;
//     const userId = req.user?.userId;
//     const tenantId = req.user?.tenantId;

//     if (!userId || !tenantId) {
//       return sendHTTPResponse.error(res, 401, 'Authentication required');
//     }

//     if (!id) {
//       return sendHTTPResponse.error(res, 400, 'Conversation ID is required');
//     }

//     if (!content || typeof content !== 'string') {
//       return sendHTTPResponse.error(res, 400, 'Message content is required');
//     }

//     // Check if user has access to this conversation
//     const conversation = await ConversationService.getConversationById(id, userId, tenantId);
//     if (!conversation) {
//       return sendHTTPResponse.error(res, 404, 'Conversation not found');
//     }

//     const message = await ConversationService.sendMessage(id, userId, content, tenantId, messageType);

//     // Emit real-time event
//     try {
//       const io = getIO();
//       io.to(`conversation:${id}`).emit('new_message', {
//         id: message.id,
//         conversationId: message.conversation_id,
//         senderId: message.sender_id,
//         content: message.content,
//         messageType: message.message_type,
//         status: message.status,
//         createdAt: message.created_at
//       });
//     } catch (error) {
//       logger.error(error, 'Error emitting socket event:');
//     }

//     sendHTTPResponse.success(res, 201, 'Message sent successfully', message);
//   } catch (error) {
//     logger.error(error, 'Error sending message:');
//     sendHTTPResponse.error(res, 500, 'Internal Server Error');
//   }
// };

// // GET /conversations/users/search - Search for users to start conversations with
// export const searchUsers = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const { q } = req.query;
//     const userId = req.user?.userId;

//     if (!userId) {
//       return sendHTTPResponse.error(res, 401, 'Authentication required');
//     }

//     if (!q || typeof q !== 'string' || q.trim().length < 2) {
//       return sendHTTPResponse.error(res, 400, 'Search query must be at least 2 characters');
//     }

//     const users = await UserService.searchUsers(q.trim(), userId);
    
//     const userResults = users.map(user => ({
//       id: user.id,
//       name: user.name,
//       email: user.email,
//       is_online: user.is_online,
//       last_seen: user.last_seen
//     }));

//     sendHTTPResponse.success(res, 200, 'Users found', userResults);
//   } catch (error) {
//     logger.error(error, 'Error searching users:');
//     sendHTTPResponse.error(res, 500, 'Internal Server Error');
//   }
// };

// // PUT /conversations/:id/state - Update conversation state (open/closed)
// export const updateConversationState = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const { id } = req.params;
//     const { state } = req.body;
//     const userId = req.user?.userId;
//     const tenantId = req.user?.tenantId;

//     if (!userId || !tenantId) {
//       return sendHTTPResponse.error(res, 401, 'Authentication required');
//     }

//     if (!id) {
//       return sendHTTPResponse.error(res, 400, 'Conversation ID is required');
//     }

//     if (!['open', 'closed'].includes(state)) {
//       return sendHTTPResponse.error(res, 400, 'State must be either "open" or "closed"');
//     }

//     // Check if user has access to this conversation
//     const conversation = await ConversationService.getConversationById(id, userId, tenantId);
//     if (!conversation) {
//       return sendHTTPResponse.error(res, 404, 'Conversation not found');
//     }

//     await ConversationService.updateConversationState(id, tenantId, state);

//     sendHTTPResponse.success(res, 200, 'Conversation state updated successfully');
//   } catch (error) {
//     logger.error(error, 'Error updating conversation state:');
//     sendHTTPResponse.error(res, 500, 'Internal Server Error');
//   }
// };

// // GET /conversations/unread-count - Get total unread message count
// export const getUnreadCount = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const userId = req.user?.userId;
//     const tenantId = req.user?.tenantId;

//     if (!userId || !tenantId) {
//       return sendHTTPResponse.error(res, 401, 'Authentication required');
//     }

//     const unreadCount = await ConversationService.getUnreadCount(userId, tenantId);

//     sendHTTPResponse.success(res, 200, 'Unread count retrieved', { unreadCount });
//   } catch (error) {
//     logger.error(error, 'Error getting unread count:');
//     sendHTTPResponse.error(res, 500, 'Internal Server Error');
//   }
// };

