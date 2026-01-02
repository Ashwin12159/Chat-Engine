import { RefreshTokenService } from '../common/refreshToken.service';
import { LoginRateLimit } from '../common/loginRateLimit';
import logger from '../config/logger';

export class TokenCleanupService {
  private static interval: NodeJS.Timeout | null = null;

  static startCleanup(intervalMinutes: number = 60) {
    if (this.interval) {
      clearInterval(this.interval);
    }

    this.interval = setInterval(async () => {
      try {
        logger.info('Starting cleanup process...');
        
        // Clean up expired refresh tokens
        await RefreshTokenService.cleanupExpiredTokens();
        
        // Clean up expired rate limit entries
        LoginRateLimit.cleanup();
        
        logger.info('Cleanup process completed');
      } catch (error) {
        logger.error(error, 'Error during cleanup:');
      }
    }, intervalMinutes * 60 * 1000);

    logger.info(`Cleanup service started with ${intervalMinutes} minute intervals`);
  }

  static stopCleanup() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Cleanup service stopped');
    }
  }
}
