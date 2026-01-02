// import { Server, Socket } from 'socket.io';
// import logger from '../config/logger';
// import { ConversationService } from '../services/conversation.service';
// import { UserService } from '../services/user.service';
// import runQuery from '../database/runQuery';

// export const registerSocketEvents = (io: Server) => {
//   io.on('connection', (socket: Socket) => {
//     const user = socket.data.user;
//     const widget = socket.data.widget;

//     // Handle agent connection
//     if (user) {
//       handleAgentConnection(io, socket, user);
//     } 
//     // Handle widget connection
//     else if (widget) {
//       handleWidgetConnection(io, socket, widget);
//     }
//     else {
//       logger.warn(`Socket connected without proper authentication data: ${socket.id}`);
//       socket.disconnect();
//     }
//   });
// };

// const handleAgentConnection = (io: Server, socket: Socket, user: any) => {
//   logger.info(`Agent socket connected: ${socket.id} for user ${user.name} (${user.userId})`);

//   // Update user online status
//   UserService.updateOnlineStatus(user.userId, user.tenantId, true);

//   // Join user to their personal room for notifications
//   socket.join(`user:${user.userId}`);

//   // [TODO] - Implement agent joining visitor conversation rooms
//   // Currently disabled - focusing on bot and visitor conversations only
//   // Agents should not be able to join conversations with visitor participants
//   socket.on('join_conversation', async (conversationId: string) => {
//     try {
//       // Verify user has access to this conversation
//       const conversation = await ConversationService.getConversationById(conversationId, user.userId, user.tenantId);
//       if (conversation) {
//         // [TODO] - Check if conversation has visitor participants and block agent access
//         // const visitorCheck = await ConversationService.getParticipants(user.tenantId, conversationId);
//         // const hasVisitor = visitorCheck.some(p => p.participant_type === 'visitor');
//         // if (hasVisitor) {
//         //   socket.emit('error', { message: 'Agents cannot join visitor conversations yet' });
//         //   return;
//         // }
        
//         socket.join(`conversation:${conversationId}`);
        
//         // Get detailed room information for debugging
//         const roomInfo = await getRoomDebugInfo(io, `conversation:${conversationId}`);
//         logger.info(`Agent ${user.userId} joined conversation ${conversationId}`);
//         logger.info(`Room debug info: ${JSON.stringify(roomInfo, null, 2)}`);
        
//         // Emit to the current socket the list of participants
//         socket.emit('room_participants', {
//           conversationId,
//           participants: roomInfo.sockets,
//           totalCount: roomInfo.totalSockets,
//           uniqueUsers: roomInfo.uniqueUsers
//         });
        
//         // Notify others in conversation that user is online
//         socket.to(`conversation:${conversationId}`).emit('user_online', {
//           userId: user.userId,
//           name: user.name,
//           socketId: socket.id
//         });
//       }
//     } catch (error) {
//       logger.error(error, 'Error joining conversation:');
//     }
//   });

//   // Handle leaving conversation rooms
//   socket.on('leave_conversation', async (conversationId: string) => {
//     socket.leave(`conversation:${conversationId}`);
    
//     // Get remaining participants after leaving
//     const clients = await io.in(`conversation:${conversationId}`).fetchSockets();
//     logger.info(`Agent ${user.userId} left conversation ${conversationId}`);
//     logger.info(`Remaining participants in room: ${clients.length}`);
    
//     // Notify others that user left
//     socket.to(`conversation:${conversationId}`).emit('user_offline', {
//       userId: user.userId,
//       name: user.name,
//       socketId: socket.id
//     });
//   });

//   // Handle typing indicators
//   socket.on('typing_start', ({ conversationId }: { conversationId: string }) => {
//     socket.to(`conversation:${conversationId}`).emit('user_typing', {
//       userId: user.userId,
//       name: user.name,
//       isTyping: true
//     });
//   });

//   socket.on('typing_stop', ({ conversationId }: { conversationId: string }) => {
//     socket.to(`conversation:${conversationId}`).emit('user_typing', {
//       userId: user.userId,
//       name: user.name,
//       isTyping: false
//     });
//   });

//   // [TODO] - Implement agent sending messages to visitor conversations
//   // Currently disabled - focusing on bot and visitor conversations only
//   // Agents should not be able to send messages to conversations with visitor participants
//   socket.on('send_message', async (data: {
//     conversationId: string;
//     content: string;
//     messageType?: 'text' | 'image' | 'file';
//   }) => {
//     try {
//       const { conversationId, content, messageType = 'text' } = data;

//       // Verify user has access to conversation
//       const conversation = await ConversationService.getConversationById(conversationId, user.userId, user.tenantId);
//       if (!conversation) {
//         socket.emit('error', { message: 'Conversation not found' });
//         return;
//       }

//       // [TODO] - Check if conversation has visitor participants and block agent messages
//       // const participants = await ConversationService.getParticipants(user.tenantId, conversationId);
//       // const hasVisitor = participants.some(p => p.participant_type === 'visitor');
//       // if (hasVisitor) {
//       //   socket.emit('error', { message: 'Agents cannot send messages to visitor conversations yet' });
//       //   return;
//       // }

//       // Save message to database
//       const message = {
//         conversationId,
//         senderId: user.userId,
//         content,
//         messageType,
//         timestamp: new Date(),
//         tenantId: user.tenantId
//       };

//       // Broadcast to all participants in conversation
//       io.to(`conversation:${conversationId}`).emit('new_message', message);
      
//       logger.info(`Agent ${user.userId} sent message in conversation ${conversationId}`);
//     } catch (error) {
//       logger.error(error, 'Error sending message:');
//       socket.emit('error', { message: 'Failed to send message' });
//     }
//   });

//   // Handle conversation creation (deprecated - use startConversationWithUser instead)
//   socket.on('create_conversation', async (data: { otherUserId: string; inboxId?: string }) => {
//     try {
//       // Get inbox_id from data or use default
//       let inboxId = data.inboxId;
//       if (!inboxId) {
//         // Get first inbox user has access to
//         const inboxQuery = `
//           SELECT inbox_id FROM user_inboxes 
//           WHERE tenant_id = ? AND user_id = ? 
//           LIMIT 1
//         `;
//         const inboxResult = await runQuery(inboxQuery, [user.tenantId, user.userId]);
//         if (!inboxResult.rows || (inboxResult.rows as any[]).length === 0) {
//           socket.emit('error', { message: 'No inbox access available' });
//           return;
//         }
//         inboxId = (inboxResult.rows as any[])[0].inbox_id;
//       }

//       // This is a simplified conversation creation - for full functionality use startConversationWithUser
//       const conversation = await ConversationService.createConversation(
//         user.tenantId,
//         inboxId as string,
//         [
//           { participant_type: 'user', participant_id: user.userId },
//           { participant_type: 'user', participant_id: data.otherUserId }
//         ],
//         null
//       );
      
//       socket.emit('conversation_created', conversation);
//       logger.info(`Agent ${user.userId} created conversation ${conversation.id}`);
//     } catch (error) {
//       logger.error(error, 'Error creating conversation:');
//       socket.emit('error', { message: 'Failed to create conversation' });
//     }
//   });

//   // Handle getting conversation list
//   socket.on('get_conversations', async () => {
//     try {
//       const conversations = await ConversationService.getUserConversations(user.userId, user.tenantId);
//       socket.emit('conversations_list', conversations);
//     } catch (error) {
//       logger.error(error, 'Error getting conversations:');
//       socket.emit('error', { message: 'Failed to get conversations' });
//     }
//   });

//   // Handle room info requests
//   socket.on('get_room_participants', async (conversationId: string) => {
//     try {
//       const clients = await io.in(`conversation:${conversationId}`).fetchSockets();
      
//       const participants = clients.map(client => ({
//         socketId: client.id,
//         userId: client.data?.user?.userId || client.data?.widget?.visitorId,
//         name: client.data?.user?.name || 'Visitor',
//         type: client.data?.user ? 'agent' : 'widget',
//         userAgent: client.handshake?.headers['user-agent']?.substring(0, 50) + '...'
//       }));
      
//       socket.emit('room_participants', {
//         conversationId,
//         participants,
//         totalCount: participants.length,
//         uniqueUsers: [...new Set(participants.map(p => p.userId))].filter(Boolean)
//       });
        
//       logger.info(`Requested participants for conversation ${conversationId}: ${clients.length} users`);
//     } catch (error) {
//       logger.error(error, 'Error getting room participants:');
//     }
//   });

//   // Handle disconnect
//   socket.on('disconnect', async () => {
//     logger.info(`Agent socket disconnected: ${socket.id} for user ${user.name}`);
    
//     // Update user offline status
//     await UserService.updateOnlineStatus(user.userId, user.tenantId, false);

//     // Notify all conversation participants that user is offline
//     const userRooms = Array.from(socket.rooms).filter(room => room.startsWith('conversation:'));
//     userRooms.forEach(room => {
//       socket.to(room).emit('user_offline', {
//         userId: user.userId,
//         name: user.name
//       });
//     });
//   });
// };

// const handleWidgetConnection = (io: Server, socket: Socket, widget: any) => {
//   logger.info(`Widget socket connected: ${socket.id} for conversation ${widget.conversationId}, visitor ${widget.visitorId}`);

//   // Join the conversation room
//   socket.join(`conversation:${widget.conversationId}`);

//   // Handle widget joining conversation
//   socket.on('join_conversation', async (data: { conversationId: string; visitorId: string }) => {
//     try {
//       const { conversationId, visitorId } = data;
      
//       // Verify this matches the authenticated widget data
//       if (conversationId !== widget.conversationId || visitorId !== widget.visitorId) {
//         socket.emit('error', { message: 'Invalid conversation or visitor ID' });
//         return;
//       }

//       socket.join(`conversation:${conversationId}`);
      
//       // Notify agents that widget joined
//       socket.to(`conversation:${conversationId}`).emit('visitor_joined', {
//         visitorId,
//         socketId: socket.id
//       });
      
//       logger.info(`Widget joined conversation ${conversationId} for visitor ${visitorId}`);
//     } catch (error) {
//       logger.error(error, 'Error widget joining conversation:');
//     }
//   });

//   // Handle widget typing
//   socket.on('typing_start', () => {
//     socket.to(`conversation:${widget.conversationId}`).emit('visitor_typing', {
//       visitorId: widget.visitorId,
//       isTyping: true
//     });
//   });

//   socket.on('typing_stop', () => {
//     socket.to(`conversation:${widget.conversationId}`).emit('visitor_typing', {
//       visitorId: widget.visitorId,
//       isTyping: false
//     });
//   });

//   // Handle disconnect
//   socket.on('disconnect', () => {
//     logger.info(`Widget socket disconnected: ${socket.id} for visitor ${widget.visitorId}`);
    
//     // Notify agents that visitor left
//     socket.to(`conversation:${widget.conversationId}`).emit('visitor_left', {
//       visitorId: widget.visitorId,
//       socketId: socket.id
//     });
//   });
// };

// // Utility function to get detailed room information
// const getRoomDebugInfo = async (io: Server, roomName: string) => {
//   const clients = await io.in(roomName).fetchSockets();
//   return {
//     roomName,
//     totalSockets: clients.length,
//     sockets: clients.map(client => ({
//       socketId: client.id,
//       userId: client.data?.user?.userId || client.data?.widget?.visitorId,
//       userName: client.data?.user?.name || 'Visitor',
//       type: client.data?.user ? 'agent' : 'widget',
//       userAgent: client.handshake?.headers['user-agent']?.substring(0, 50) + '...'
//     })),
//     uniqueUsers: [...new Set(clients.map(client => 
//       client.data?.user?.userId || client.data?.widget?.visitorId
//     ))].filter(Boolean)
//   };
// };
