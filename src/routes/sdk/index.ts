import { Router } from 'express';
import { 
  validateSDKRoute,
  createVisitorRoute,
  createConversationRoute,
  getConversationMessagesRoute,
  sendMessageRoute
} from './controller';
import { validateSDKKey } from '../../middleware/sdk.middleware';

const router = Router();

/**
 * RESTful SDK Routes
 * 
 * POST   /api/sdk/validate              - Validate SDK API key and site (public, no auth)
 * POST   /api/sdk/visitors               - Create/initialize visitor session
 * POST   /api/sdk/conversations          - Create or retrieve conversation
 * GET    /api/sdk/conversations/:id/messages - Get messages for a conversation
 * POST   /api/sdk/conversations/:id/messages - Send a message in a conversation
 */

// Public endpoint - no SDK key validation required
router.post('/validate', validateSDKRoute);

// All other routes require SDK key validation
router.use(validateSDKKey);

// Visitor management
router.post('/visitors', createVisitorRoute);

// Conversation management
router.post('/conversations', createConversationRoute);
router.get('/conversations/messages', getConversationMessagesRoute); // Get messages using token (no ID)
router.get('/conversations/:id/messages', getConversationMessagesRoute); // Get messages by ID
router.post('/conversations/:id/messages', sendMessageRoute);

export default router;

