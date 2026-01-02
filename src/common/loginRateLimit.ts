// Simple in-memory rate limiter for login attempts
// In production, use Redis or a proper rate limiting solution

interface LoginAttempt {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
}

export class LoginRateLimit {
  private static attempts = new Map<string, LoginAttempt>();
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly BLOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

  static isBlocked(identifier: string): boolean {
    const attempt = this.attempts.get(identifier);
    console.log(attempt)
    if (!attempt) return false;

    const now = Date.now();
    
    // Check if the block period has expired
    if (now - attempt.lastAttempt > this.BLOCK_DURATION_MS) {
      this.attempts.delete(identifier);
      return false;
    }

    return attempt.count >= this.MAX_ATTEMPTS;
  }

  static recordAttempt(identifier: string): { blocked: boolean; remainingAttempts: number; blockExpiresIn?: number } {
    const now = Date.now();
    const attempt = this.attempts.get(identifier);

    if (!attempt) {
      // First attempt
      this.attempts.set(identifier, {
        count: 1,
        firstAttempt: now,
        lastAttempt: now
      });
      return { blocked: false, remainingAttempts: this.MAX_ATTEMPTS - 1 };
    }

    // Check if we should reset the window
    if (now - attempt.firstAttempt > this.WINDOW_MS) {
      this.attempts.set(identifier, {
        count: 1,
        firstAttempt: now,
        lastAttempt: now
      });
      return { blocked: false, remainingAttempts: this.MAX_ATTEMPTS - 1 };
    }

    // Increment attempt count
    attempt.count++;
    attempt.lastAttempt = now;
    this.attempts.set(identifier, attempt);

    const remainingAttempts = Math.max(0, this.MAX_ATTEMPTS - attempt.count);
    
    if (attempt.count >= this.MAX_ATTEMPTS) {
      const blockExpiresIn = this.BLOCK_DURATION_MS;
      return { blocked: true, remainingAttempts: 0, blockExpiresIn };
    }

    return { blocked: false, remainingAttempts };
  }

  static resetAttempts(identifier: string): void {
    this.attempts.delete(identifier);
  }

  static getAttemptInfo(identifier: string): { count: number; remainingAttempts: number; blocked: boolean } {
    const attempt = this.attempts.get(identifier);
    if (!attempt) {
      return { count: 0, remainingAttempts: this.MAX_ATTEMPTS, blocked: false };
    }

    const blocked = this.isBlocked(identifier);
    const remainingAttempts = Math.max(0, this.MAX_ATTEMPTS - attempt.count);

    return { count: attempt.count, remainingAttempts, blocked };
  }

  // Cleanup old entries periodically
  static cleanup(): void {
    const now = Date.now();
    for (const [identifier, attempt] of this.attempts.entries()) {
      if (now - attempt.lastAttempt > this.BLOCK_DURATION_MS) {
        this.attempts.delete(identifier);
      }
    }
  }
}
