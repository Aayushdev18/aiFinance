export interface SpendingRecord {
  id: string;
  amount: number;
  category: string;
  merchant: string;
  date: Date;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  reason?: string;
  expectedRange?: { min: number; max: number };
}

export class AnomalyDetectionService {
  /**
   * Deterministic anomaly detection using Modified Z-score (median and MAD).
   * Robust against extreme outliers compared to standard mean/variance.
   */
  public static calculateModifiedZScore(amounts: number[], targetAmount: number): number {
    if (amounts.length < 5) return 0; // Insufficient baseline

    const sorted = [...amounts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    const absoluteDeviations = sorted.map(val => Math.abs(val - median));
    absoluteDeviations.sort((a, b) => a - b);
    const mad = absoluteDeviations.length % 2 !== 0 
      ? absoluteDeviations[mid] 
      : (absoluteDeviations[mid - 1] + absoluteDeviations[mid]) / 2;

    if (mad === 0) return 0;

    // Modified Z-score formula: 0.6745 * (x - median) / MAD
    return (0.6745 * Math.abs(targetAmount - median)) / mad;
  }

  /**
   * Evaluates if a transaction is anomalous relative to the user's historical category spend.
   */
  public static evaluateTransaction(
    history: SpendingRecord[],
    current: SpendingRecord,
    thresholdSigma: number = 2.5
  ): AnomalyResult {
    const categoryAmounts = history
      .filter(tx => tx.category === current.category)
      .map(tx => tx.amount);

    if (categoryAmounts.length < 5) {
      return { isAnomaly: false, score: 0, reason: 'Insufficient category history' };
    }

    const zScore = this.calculateModifiedZScore(categoryAmounts, current.amount);
    const isAnomaly = zScore >= thresholdSigma && current.amount > Math.min(...categoryAmounts);

    const sorted = [...categoryAmounts].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];

    return {
      isAnomaly,
      score: Number(zScore.toFixed(2)),
      reason: isAnomaly 
        ? `Spending of ${current.amount} in ${current.category} significantly exceeds typical spend (Z-score: ${zScore.toFixed(1)}).`
        : undefined,
      expectedRange: {
        min: sorted[0],
        max: p75 * 1.5
      }
    };
  }
}
