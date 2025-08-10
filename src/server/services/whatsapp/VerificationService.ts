import { db } from '~/server/db';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';

export interface VerificationCode {
  code: string;
  phoneNumber: string;
  userId: string;
  integrationId: string;
  expiresAt: Date;
  attempts: number;
}

export class WhatsAppVerificationService {
  private static readonly CODE_LENGTH = 6;
  private static readonly CODE_EXPIRY_MINUTES = 10;
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly RATE_LIMIT_MINUTES = 60;
  private static readonly MAX_CODES_PER_HOUR = 5;
  
  // In-memory storage for verification codes
  // In production, use Redis or database
  private static verificationCodes = new Map<string, VerificationCode>();
  private static rateLimitMap = new Map<string, number[]>();

  /**
   * Generate a secure verification code
   */
  static generateCode(): string {
    // Generate cryptographically secure random digits
    const buffer = crypto.randomBytes(3);
    const code = parseInt(buffer.toString('hex'), 16).toString().padStart(this.CODE_LENGTH, '0').slice(0, this.CODE_LENGTH);
    return code;
  }

  /**
   * Create and store a verification code
   */
  static async createVerificationCode(
    phoneNumber: string,
    userId: string,
    integrationId: string
  ): Promise<string> {
    // Check rate limiting
    const rateLimitKey = `${userId}:${phoneNumber}`;
    if (!this.checkRateLimit(rateLimitKey)) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many verification attempts. Please try again later.',
      });
    }

    // Generate code
    const code = this.generateCode();
    const key = `${integrationId}:${phoneNumber}`;
    
    // Store verification code
    const verificationCode: VerificationCode = {
      code,
      phoneNumber,
      userId,
      integrationId,
      expiresAt: new Date(Date.now() + this.CODE_EXPIRY_MINUTES * 60 * 1000),
      attempts: 0,
    };
    
    this.verificationCodes.set(key, verificationCode);
    
    // Clean up expired codes periodically
    this.cleanupExpiredCodes();
    
    return code;
  }

  /**
   * Verify a code
   */
  static async verifyCode(
    phoneNumber: string,
    integrationId: string,
    code: string
  ): Promise<{ valid: boolean; userId?: string; error?: string }> {
    const key = `${integrationId}:${phoneNumber}`;
    const verificationCode = this.verificationCodes.get(key);
    
    if (!verificationCode) {
      return { valid: false, error: 'No verification code found. Please request a new one.' };
    }
    
    // Check if expired
    if (new Date() > verificationCode.expiresAt) {
      this.verificationCodes.delete(key);
      return { valid: false, error: 'Verification code has expired. Please request a new one.' };
    }
    
    // Check attempts
    verificationCode.attempts++;
    if (verificationCode.attempts > this.MAX_ATTEMPTS) {
      this.verificationCodes.delete(key);
      return { valid: false, error: 'Too many failed attempts. Please request a new code.' };
    }
    
    // Verify code
    if (verificationCode.code !== code) {
      return { 
        valid: false, 
        error: `Invalid code. ${this.MAX_ATTEMPTS - verificationCode.attempts} attempts remaining.` 
      };
    }
    
    // Success - delete the code so it can't be reused
    this.verificationCodes.delete(key);
    
    return { valid: true, userId: verificationCode.userId };
  }

  /**
   * Check rate limiting
   */
  private static checkRateLimit(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.RATE_LIMIT_MINUTES * 60 * 1000;
    
    // Get or create rate limit array
    let attempts = this.rateLimitMap.get(key) || [];
    
    // Filter out old attempts
    attempts = attempts.filter(timestamp => timestamp > cutoff);
    
    // Check if under limit
    if (attempts.length >= this.MAX_CODES_PER_HOUR) {
      return false;
    }
    
    // Add new attempt
    attempts.push(now);
    this.rateLimitMap.set(key, attempts);
    
    return true;
  }

  /**
   * Clean up expired codes
   */
  private static cleanupExpiredCodes(): void {
    const now = new Date();
    for (const [key, code] of this.verificationCodes.entries()) {
      if (now > code.expiresAt) {
        this.verificationCodes.delete(key);
      }
    }
  }

  /**
   * Format verification message
   */
  static formatVerificationMessage(code: string, appName: string = 'Task Manager'): string {
    return `Your ${appName} verification code is: ${code}\n\nThis code will expire in ${this.CODE_EXPIRY_MINUTES} minutes. Do not share this code with anyone.`;
  }

  /**
   * Create a secure phone verification link
   */
  static async createVerificationLink(
    userId: string,
    integrationId: string
  ): Promise<{ token: string; expiresAt: Date }> {
    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // In production, store this in database
    // For now, we'll return the token to be stored by the caller
    
    return { token, expiresAt };
  }

  /**
   * Get verification status
   */
  static getVerificationStatus(phoneNumber: string, integrationId: string): {
    hasPendingCode: boolean;
    expiresAt?: Date;
    attemptsRemaining?: number;
  } {
    const key = `${integrationId}:${phoneNumber}`;
    const verificationCode = this.verificationCodes.get(key);
    
    if (!verificationCode) {
      return { hasPendingCode: false };
    }
    
    return {
      hasPendingCode: true,
      expiresAt: verificationCode.expiresAt,
      attemptsRemaining: this.MAX_ATTEMPTS - verificationCode.attempts,
    };
  }
}