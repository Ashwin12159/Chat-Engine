import { Request, Response } from 'express';
import sendHTTPResponse from '../../common/sendHTTPResponse';
import logger from '../../config/logger';
import { MultiTenantUserService } from '../../services/multiTenantUser.service';
import { MultiTenantRefreshTokenService } from '../../services/multiTenantRefreshToken.service';
import { JWTService } from '../../common/jwt.service';
import { TenantRequest, AuthenticatedTenantRequest } from '../../middleware/tenant.middleware';

export const registerUserRoute = async (req: TenantRequest, res: Response) => {
    try {
        const { name, email, password } = req.body;
        const tenantId = req.tenant!.tenantId;

        // Validate input
        if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
            return sendHTTPResponse.error(res, 400, 'Invalid request body. Name, email, and password are required.');
        }

        // Check if user already exists in this tenant
        const existingUser = await MultiTenantUserService.findUserByEmail(tenantId, email);
        if (existingUser) {
            return sendHTTPResponse.error(res, 409, 'User with this email already exists in this tenant');
        }

        // Create user
        const user = await MultiTenantUserService.createUser({ tenantId, name, email, password });

        // Generate tokens with tenant context
        const accessToken = JWTService.generateAccessToken({ userId: user.id, tenantId });
        const refreshTokenResult = await MultiTenantRefreshTokenService.createRefreshToken(tenantId, user.id);

        const responseData = {
            user: {
                id: user.id,
                tenant_id: user.tenant_id,
                name: user.name,
                email: user.email,
                is_online: user.is_online
            },
            tokens: {
                accessToken,
                refreshToken: refreshTokenResult.token,
                expiresIn: 3600
            }
        };

        logger.info(`User registered successfully: ${user.email} in tenant: ${tenantId}`);
        return sendHTTPResponse.success(res, 201, 'User registered successfully', responseData);

    } catch (error: any) {
        logger.error(error,'User registration error');
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const loginRoute = async (req: TenantRequest, res: Response) => {
    try {
        const { email, password } = req.body;
        const tenantId = req.tenant!.tenantId;

        // Validate input
        if (typeof email !== 'string' || typeof password !== 'string') {
            return sendHTTPResponse.error(res, 400, 'Email and password are required');
        }

        // Find user by email in this tenant
        const user = await MultiTenantUserService.findUserByEmail(tenantId, email);
        if (!user) {
            return sendHTTPResponse.error(res, 401, 'Invalid email or password');
        }

        // Verify password
        const isValidPassword = await MultiTenantUserService.verifyPassword(password, user.password_hash);
        if (!isValidPassword) {
            return sendHTTPResponse.error(res, 401, 'Invalid email or password');
        }

        // Update user online status
        await MultiTenantUserService.updateOnlineStatus(tenantId, user.id, true);

        // Generate tokens with tenant context
        const accessToken = JWTService.generateAccessToken({ userId: user.id, tenantId });
        const refreshTokenResult = await MultiTenantRefreshTokenService.createRefreshToken(tenantId, user.id);

        const responseData = {
            user: {
                id: user.id,
                tenant_id: user.tenant_id,
                name: user.name,
                email: user.email,
                is_online: true
            },
            tokens: {
                accessToken,
                refreshToken: refreshTokenResult.token,
                expiresIn: 3600
            }
        };

        logger.info(`User logged in successfully: ${user.email} in tenant: ${tenantId}`);
        return sendHTTPResponse.success(res, 200, 'Login successful', responseData);

    } catch (error: any) {
        logger.error('Login error:', error);
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const refreshTokenRoute = async (req: TenantRequest, res: Response) => {
    try {
        const { refreshToken } = req.body;
        const tenantId = req.tenant!.tenantId;

        if (typeof refreshToken !== 'string') {
            return sendHTTPResponse.error(res, 400, 'Refresh token is required');
        }

        // Validate and get user from refresh token
        const tokenData = await MultiTenantRefreshTokenService.validateTokenAndGetUser(tenantId, refreshToken);
        if (!tokenData) {
            return sendHTTPResponse.error(res, 401, 'Invalid or expired refresh token');
        }

        const { user } = tokenData;

        // Rotate the refresh token for security
        const newRefreshTokenResult = await MultiTenantRefreshTokenService.rotateRefreshToken(
            tenantId,
            refreshToken,
            user.id
        );

        // Generate new access token
        const accessToken = JWTService.generateAccessToken({ userId: user.id, tenantId });

        const responseData = {
            tokens: {
                accessToken,
                refreshToken: newRefreshTokenResult.token,
                expiresIn: 3600
            }
        };

        return sendHTTPResponse.success(res, 200, 'Token refreshed successfully', responseData);

    } catch (error: any) {
        logger.error('Token refresh error:', error);
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const logoutRoute = async (req: AuthenticatedTenantRequest, res: Response) => {
    try {
        const { refreshToken } = req.body;
        const tenantId = req.tenant!.tenantId;
        const userId = req.userId!;

        if (refreshToken) {
            // Invalidate specific refresh token
            await MultiTenantRefreshTokenService.invalidateRefreshToken(tenantId, refreshToken);
        }

        // Update user online status
        await MultiTenantUserService.updateOnlineStatus(tenantId, userId, false);

        logger.info(`User logged out: ${userId} in tenant: ${tenantId}`);
        return sendHTTPResponse.success(res, 200, 'Logout successful');

    } catch (error: any) {
        logger.error('Logout error:', error);
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const logoutAllRoute = async (req: AuthenticatedTenantRequest, res: Response) => {
    try {
        const tenantId = req.tenant!.tenantId;
        const userId = req.userId!;

        // Invalidate all refresh tokens for the user
        await MultiTenantRefreshTokenService.invalidateUserTokens(tenantId, userId);

        // Update user online status
        await MultiTenantUserService.updateOnlineStatus(tenantId, userId, false);

        logger.info(`User logged out from all devices: ${userId} in tenant: ${tenantId}`);
        return sendHTTPResponse.success(res, 200, 'Logged out from all devices successfully');

    } catch (error: any) {
        logger.error('Logout all error:', error);
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const getMeRoute = async (req: AuthenticatedTenantRequest, res: Response) => {
    try {
        const tenantId = req.tenant!.tenantId;
        const userId = req.userId!;

        // Get user details
        console.log({tenantId,userId})
        const user = await MultiTenantUserService.findUserById(tenantId, userId);
        if (!user) {
            return sendHTTPResponse.error(res, 404, 'User not found');
        }

        const responseData = {
            user: {
                id: user.id,
                tenant_id: user.tenant_id,
                name: user.name,
                email: user.email,
                is_online: user.is_online,
                last_seen: user.last_seen,
                created_at: user.created_at
            }
        };

        return sendHTTPResponse.success(res, 200, 'User details retrieved successfully', responseData);

    } catch (error: any) {
        logger.error(error,'Get me error:');
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};

export const changePasswordRoute = async (req: AuthenticatedTenantRequest, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const tenantId = req.tenant!.tenantId;
        const userId = req.userId!;

        // Validate input
        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
            return sendHTTPResponse.error(res, 400, 'Current password and new password are required');
        }

        if (newPassword.length < 6) {
            return sendHTTPResponse.error(res, 400, 'New password must be at least 6 characters long');
        }

        // Get user
        const user = await MultiTenantUserService.findUserById(tenantId, userId);
        if (!user) {
            return sendHTTPResponse.error(res, 404, 'User not found');
        }

        // Verify current password
        const isValidPassword = await MultiTenantUserService.verifyPassword(currentPassword, user.password_hash);
        if (!isValidPassword) {
            return sendHTTPResponse.error(res, 401, 'Current password is incorrect');
        }

        // Update password
        await MultiTenantUserService.updateUserPassword(tenantId, userId, newPassword);

        // Invalidate all refresh tokens to force re-login
        await MultiTenantRefreshTokenService.invalidateUserTokens(tenantId, userId);

        logger.info(`Password changed for user: ${userId} in tenant: ${tenantId}`);
        return sendHTTPResponse.success(res, 200, 'Password changed successfully. Please log in again.');

    } catch (error: any) {
        logger.error('Change password error:', error);
        return sendHTTPResponse.error(res, 500, 'Internal server error');
    }
};
