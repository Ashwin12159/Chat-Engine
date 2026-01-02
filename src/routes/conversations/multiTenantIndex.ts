import { Router } from 'express';
import { 
    getUserConversationsRoute,
    getConversationMessagesRoute,
    sendMessageRoute,
    markMessagesAsReadRoute,
    startConversationRoute,
    searchUsersRoute
} from './multiTenantController';
import { authenticateToken } from '../../middleware/auth.middleware';
import { extractTenant, requireTenant } from '../../middleware/tenant.middleware';

const router = Router();

// Apply tenant extraction middleware to all routes
router.use(extractTenant);

// All conversation routes require tenant and authentication
router.use(requireTenant);
router.use(authenticateToken);

// Conversation routes with tenant barriers
router.get('/', getUserConversationsRoute);
router.post('/start', startConversationRoute);
router.get('/:conversationId/messages', getConversationMessagesRoute);
router.post('/:conversationId/messages', sendMessageRoute);
router.put('/:conversationId/read', markMessagesAsReadRoute);
router.get('/users/search', searchUsersRoute);

export default router;
