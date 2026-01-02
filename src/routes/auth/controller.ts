import { Request, Response } from 'express';
import sendHTTPResponse from '../../common/sendHTTPResponse';
import logger from '../../config/logger';
import { UserService } from '../../services/user.service';
import { JWTService } from '../../common/jwt.service';
import { RefreshTokenService } from '../../common/refreshToken.service';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { LoginRateLimit } from '../../common/loginRateLimit';

export const registerUserRoute = async (req: Request, res: Response) => {
    try {
        const { name, email, password } = req.body;

        // Validate input
        if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
            return sendHTTPResponse.error(res, 400, 'Invalid request body. Name, email, and password are required.');
        }

        // Check if user already exists
        const existingUser = await UserService.findUserByEmail(email);
        if (existingUser) {
            return sendHTTPResponse.error(res, 409, 'User with this email already exists');
        }

        // Create user
        const user = await UserService.createUser({ name, email, password });

        // Generate tokens
        const tokenPair = JWTService.generateTokenPair(user);

        // Save refresh token
        await RefreshTokenService.saveRefreshToken(
            tokenPair.tokenId,
            user.id,
            tokenPair.refreshToken
        );

        // Limit user sessions
        await RefreshTokenService.limitUserSessions(user.id);

        const responseData = {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                is_online: user.is_online
            },
            tokens: {
                accessToken: tokenPair.accessToken,
                refreshToken: tokenPair.refreshToken,
                expiresIn: tokenPair.expiresIn
            }
        };

        sendHTTPResponse.success(res, 201, 'User registered successfully', responseData);
    } catch (error) {
        logger.error(error, 'Error in registerUserRoute:');
        sendHTTPResponse.error(res, 500, 'Internal Server Error');
    }
};

export const loginRoute = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (typeof email !== 'string' || typeof password !== 'string') {
            return sendHTTPResponse.error(res, 400, 'Email and password are required');
        }

        // Check rate limiting
        const clientIdentifier = req.ip || 'unknown';
        if (LoginRateLimit.isBlocked(clientIdentifier)) {
            return sendHTTPResponse.error(res, 429, 'Too many login attempts. Please try again later.');
        }

        // Find user
        const user = await UserService.findUserByEmail(email);
        if (!user) {
            // Record failed attempt
            const rateInfo = LoginRateLimit.recordAttempt(clientIdentifier);
            logger.warn(`Failed login attempt for ${email} from ${clientIdentifier}`);
            return sendHTTPResponse.error(res, 401, 'Invalid email or password');
        }

        // Verify password
        const isPasswordValid = await UserService.verifyPassword(password, user.password_hash);
        if (!isPasswordValid) {
            // Record failed attempt
            const rateInfo = LoginRateLimit.recordAttempt(clientIdentifier);
            logger.warn(`Failed login attempt for ${email} from ${clientIdentifier}`);
            return sendHTTPResponse.error(res, 401, 'Invalid email or password');
        }

        // Reset rate limiting on successful login
        LoginRateLimit.resetAttempts(clientIdentifier);

        // Generate tokens
        const tokenPair = JWTService.generateTokenPair(user);

        // Save refresh token
        await RefreshTokenService.saveRefreshToken(
            tokenPair.tokenId,
            user.id,
            tokenPair.refreshToken
        );

        // Limit user sessions
        await RefreshTokenService.limitUserSessions(user.id);

        const responseData = {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                is_online: user.is_online
            },
            tokens: {
                accessToken: tokenPair.accessToken,
                refreshToken: tokenPair.refreshToken,
                expiresIn: tokenPair.expiresIn
            }
        };

        logger.info(`Successful login for user ${user.email} (${user.id})`);
        sendHTTPResponse.success(res, 200, 'Login successful', responseData);
    } catch (error) {
        logger.error(error, 'Error in loginRoute:');
        sendHTTPResponse.error(res, 500, 'Internal Server Error');
    }
};

export const refreshTokenRoute = async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return sendHTTPResponse.error(res, 400, 'Refresh token is required');
        }

        // Verify refresh token
        const decoded = JWTService.verifyRefreshToken(refreshToken);
        if (!decoded) {
            return sendHTTPResponse.error(res, 401, 'Invalid refresh token');
        }

        // Check if refresh token exists in database
        const tokenRecord = await RefreshTokenService.findRefreshToken(decoded.tokenId, refreshToken);
        if (!tokenRecord) {
            return sendHTTPResponse.error(res, 401, 'Invalid or expired refresh token');
        }

        // Get user details
        const user = await UserService.findUserById(decoded.userId);
        if (!user) {
            return sendHTTPResponse.error(res, 401, 'User not found');
        }

        // Revoke old refresh token
        await RefreshTokenService.revokeRefreshToken(decoded.tokenId);

        // Generate new token pair
        const tokenPair = JWTService.generateTokenPair(user);

        // Save new refresh token
        await RefreshTokenService.saveRefreshToken(
            tokenPair.tokenId,
            user.id,
            tokenPair.refreshToken
        );

        const responseData = {
            tokens: {
                accessToken: tokenPair.accessToken,
                refreshToken: tokenPair.refreshToken,
                expiresIn: tokenPair.expiresIn
            }
        };

        sendHTTPResponse.success(res, 200, 'Token refreshed successfully', responseData);
    } catch (error) {
        logger.error(error, 'Error in refreshTokenRoute:');
        sendHTTPResponse.error(res, 500, 'Internal Server Error');
    }
};

export const logoutRoute = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { refreshToken } = req.body;
        const userId = req.user?.userId;

        if (refreshToken) {
            // Verify and revoke specific refresh token
            const decoded = JWTService.verifyRefreshToken(refreshToken);
            if (decoded && decoded.userId === userId) {
                await RefreshTokenService.revokeRefreshToken(decoded.tokenId);
            }
        }

        sendHTTPResponse.success(res, 200, 'Logged out successfully');
    } catch (error) {
        logger.error(error, 'Error in logoutRoute:');
        sendHTTPResponse.error(res, 500, 'Internal Server Error');
    }
};

export const logoutAllRoute = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return sendHTTPResponse.error(res, 401, 'Authentication required');
        }

        // Revoke all refresh tokens for the user
        await RefreshTokenService.revokeAllUserTokens(userId);

        sendHTTPResponse.success(res, 200, 'Logged out from all devices successfully');
    } catch (error) {
        logger.error(error, 'Error in logoutAllRoute:');
        sendHTTPResponse.error(res, 500, 'Internal Server Error');
    }
};

export const getMeRoute = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return sendHTTPResponse.error(res, 401, 'Authentication required');
        }

        const user = await UserService.findUserById(userId);
        if (!user) {
            return sendHTTPResponse.error(res, 404, 'User not found');
        }

        const responseData = {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                is_online: user.is_online,
                createdAt: user.created_at
            }
        };

        sendHTTPResponse.success(res, 200, 'User profile retrieved successfully', responseData);
    } catch (error) {
        logger.error(error, 'Error in getMeRoute:');
        sendHTTPResponse.error(res, 500, 'Internal Server Error');
    }
};

export const changePasswordRoute = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            return sendHTTPResponse.error(res, 401, 'Authentication required');
        }

        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
            return sendHTTPResponse.error(res, 400, 'Current password and new password are required');
        }

        if (newPassword.length < 6) {
            return sendHTTPResponse.error(res, 400, 'New password must be at least 6 characters long');
        }

        // Get user
        const user = await UserService.findUserById(userId);
        if (!user) {
            return sendHTTPResponse.error(res, 404, 'User not found');
        }

        // Verify current password
        const isCurrentPasswordValid = await UserService.verifyPassword(currentPassword, user.password_hash);
        if (!isCurrentPasswordValid) {
            return sendHTTPResponse.error(res, 400, 'Current password is incorrect');
        }

        // Update password
        await UserService.updateUserPassword(userId, newPassword);

        // Revoke all refresh tokens to force re-login on all devices
        await RefreshTokenService.revokeAllUserTokens(userId);

        sendHTTPResponse.success(res, 200, 'Password changed successfully. Please log in again.');
    } catch (error) {
        logger.error(error, 'Error in changePasswordRoute:');
        sendHTTPResponse.error(res, 500, 'Internal Server Error');
    }
};
