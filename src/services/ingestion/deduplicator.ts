import crypto from 'crypto';

export interface FingerprintInput {
  userId: string;
  date: Date;
  amount: number;
  type: 'debit' | 'credit';
  normalizedMerchant: string;
}

export class DeduplicationService {
  /**
   * Generates a deterministic SHA-256 fingerprint for a transaction.
   * Day-bounded to bridge discrepancies between SMS timestamps and statement clearing dates.
   */
  public static generateFingerprint(input: FingerprintInput): string {
    const dayStr = input.date.toISOString().split('T')[0];
    const roundedAmount = input.amount.toFixed(2);
    const merchant = input.normalizedMerchant.toLowerCase().trim();

    const payload = `${input.userId}|${dayStr}|${roundedAmount}|${input.type}|${merchant}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}
