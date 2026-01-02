// import { Router } from 'express';
// import { 
//   getAllConversations, 
//   getConversationById, 
//   startConversation, 
//   sendMessage,
//   searchUsers,
//   updateConversationState,
//   getUnreadCount
// } from './controller';
// import { authenticateToken } from '../../middleware/auth.middleware';

// const router = Router();

// // Apply authentication to all conversation routes
// router.use(authenticateToken);

// // Core conversation routes
// router.get('/', getAllConversations);
// router.post('/', startConversation);
// router.get('/users/search', searchUsers);
// router.get('/unread-count', getUnreadCount);
// router.get('/:id', getConversationById);
// router.post('/:id/messages', sendMessage);
// router.put('/:id/state', updateConversationState);

// export default router;
