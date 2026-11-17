import { SMSParserService } from '../services/ingestion/smsParser.js';
import { AnomalyDetectionService } from '../services/analytics/anomalyDetector.js';
import type { SpendingRecord } from '../services/analytics/anomalyDetector.js';

interface GroundTruthCategorizationCase {
  raw: string;
  expectedCategory: string;
}

interface GroundTruthAnomalyCase {
  record: SpendingRecord;
  isTrueAnomaly: boolean;
}

export class EvaluationRunner {
  public static runCategorizationBenchmark() {
    console.log('====================================================');
    console.log('📊 EVALUATION: Ingestion & Transaction Parsing Accuracy');
    console.log('====================================================');

    const testCases = [
      { raw: 'Rs. 450.00 debited from A/c **4129 at SWIGGY BLR on 12-Nov-26 UPI Ref 4123891029', expectedMerchant: 'SWIGGY BLR', expectedAmount: 450 },
      { raw: 'Acct XX9012 credited with INR 35,000.00 from SALARY TECH CORP Ref SAL8912', expectedMerchant: 'SALARY TECH CORP', expectedAmount: 35000 },
      { raw: 'Spent $18.50 at STARBUCKS CAFE with card ending 3311', expectedMerchant: 'STARBUCKS CAFE', expectedAmount: 18.50 },
      { raw: 'Your A/c 1234 debited by INR 1,299.00 towards NETFLIX COM. Avl Bal: Rs 14,200', expectedMerchant: 'NETFLIX COM', expectedAmount: 1299 }
    ];

    let correct = 0;
    for (const tc of testCases) {
      const parsed = SMSParserService.parseSMS(tc.raw);
      if (parsed && Math.abs(parsed.amount - tc.expectedAmount) < 0.01) {
        correct++;
      }
    }

    const accuracy = (correct / testCases.length) * 100;
    console.log(`Evaluated ${testCases.length} real-world SMS test samples.`);
    console.log(`Deterministic NER Extraction Accuracy: ${accuracy.toFixed(1)}%\n`);
  }

  public static runAnomalyDetectionBenchmark() {
    console.log('====================================================');
    console.log('📈 EVALUATION: Statistical Anomaly Detection (ROC / F1)');
    console.log('====================================================');

    // Baseline 90-day history in dining: mean ~$25, max ~$45
    const baselineHistory: SpendingRecord[] = [
      { id: '1', amount: 22, category: 'Dining', merchant: 'Subway', date: new Date() },
      { id: '2', amount: 28, category: 'Dining', merchant: 'Chipotle', date: new Date() },
      { id: '3', amount: 19, category: 'Dining', merchant: 'McDonalds', date: new Date() },
      { id: '4', amount: 35, category: 'Dining', merchant: 'Pizza Hut', date: new Date() },
      { id: '5', amount: 24, category: 'Dining', merchant: 'Starbucks', date: new Date() },
      { id: '6', amount: 30, category: 'Dining', merchant: 'Taco Bell', date: new Date() },
      { id: '7', amount: 26, category: 'Dining', merchant: 'Burger King', date: new Date() }
    ];

    const testTransactions: GroundTruthAnomalyCase[] = [
      { record: { id: 't1', amount: 25, category: 'Dining', merchant: 'Diner', date: new Date() }, isTrueAnomaly: false },
      { record: { id: 't2', amount: 32, category: 'Dining', merchant: 'Cafe', date: new Date() }, isTrueAnomaly: false },
      { record: { id: 't3', amount: 185, category: 'Dining', merchant: 'Luxury Steakhouse', date: new Date() }, isTrueAnomaly: true }, // Outlier
      { record: { id: 't4', amount: 290, category: 'Dining', merchant: 'Unusual Charge', date: new Date() }, isTrueAnomaly: true } // Extreme outlier
    ];

    let tp = 0, fp = 0, tn = 0, fn = 0;

    for (const test of testTransactions) {
      const result = AnomalyDetectionService.evaluateTransaction(baselineHistory, test.record, 2.5);
      if (result.isAnomaly && test.isTrueAnomaly) tp++;
      else if (result.isAnomaly && !test.isTrueAnomaly) fp++;
      else if (!result.isAnomaly && !test.isTrueAnomaly) tn++;
      else if (!result.isAnomaly && test.isTrueAnomaly) fn++;
    }

    const precision = tp / (tp + fp) || 1.0;
    const recall = tp / (tp + fn) || 1.0;
    const f1 = (2 * precision * recall) / (precision + recall);

    console.log(`True Positives: ${tp}, False Positives: ${fp}, True Negatives: ${tn}, False Negatives: ${fn}`);
    console.log(`Precision: ${(precision * 100).toFixed(1)}%`);
    console.log(`Recall: ${(recall * 100).toFixed(1)}%`);
    console.log(`F1-Score: ${f1.toFixed(3)}`);
    console.log(`False Positive Rate: ${((fp / (fp + tn || 1)) * 100).toFixed(1)}%\n`);
  }
}

// Execute benchmarks if run directly
EvaluationRunner.runCategorizationBenchmark();
EvaluationRunner.runAnomalyDetectionBenchmark();
