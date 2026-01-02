import { Router } from 'express';
import { 
    registerUserRoute, 
    loginRoute, 
    refreshTokenRoute, 
    logoutRoute, 
    logoutAllRoute, 
    getMeRoute,
    changePasswordRoute
} from './multiTenantController';
import { authenticateToken } from '../../middleware/auth.middleware';
import { extractTenant, requireTenant } from '../../middleware/tenant.middleware';

const router = Router();

// Apply tenant extraction middleware to all routes


// Public routes (tenant optional for some, required for others)
router.post('/register', requireTenant, registerUserRoute);
router.post('/login', requireTenant, loginRoute);
router.post('/refresh', requireTenant, refreshTokenRoute);

// Protected routes
router.post('/logout', requireTenant, authenticateToken, logoutRoute);
router.post('/logout-all', requireTenant, authenticateToken, logoutAllRoute);
router.get('/me', requireTenant, authenticateToken, getMeRoute);
router.put('/change-password', requireTenant, authenticateToken, changePasswordRoute);

export default router;
