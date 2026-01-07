import { Router } from 'express';
import { 
    getExternalMessagesRoute,
    initializeVisitorRoute,
    startExternalChatRoute
} from './controller';
import { validateSDKKey } from '../../middleware/sdk.middleware';

const router = Router();

// Apply SDK key validation to all external routes
router.post('/sdk/validate');
router.use(validateSDKKey);

// External communication routes (used by chat SDK)
router.post('/visitor/init', initializeVisitorRoute);              // Initialize website visitor session
router.post('/chat/start', startExternalChatRoute);                // Start customer chat with agent assignment/queue
router.get('/chat/messages', getExternalMessagesRoute);            // Get messages for external conversation

export default router;
