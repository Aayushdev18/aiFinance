export interface ParsedTransaction {
  amount: number;
  type: 'debit' | 'credit';
  merchantOrEntity: string;
  accountTail?: string;
  referenceId?: string;
  balance?: number;
  rawText: string;
  confidence: number;
}

export class SMSParserService {
  /**
   * Deterministic Regex NER parser for bank and UPI transaction SMS alerts.
   */
  public static parseSMS(rawText: string): ParsedTransaction | null {
    const text = rawText.trim();
    if (!text) return null;

    // 1. Amount Extraction (supports INR, Rs, $, USD)
    const amountMatch = text.match(/(?:Rs\.?|INR|\$)\s*([\d,]+\.?\d*)/i) ||
                        text.match(/(?:debited|credited|spent|withdrawn)\s*(?:by|of)?\s*(?:Rs\.?|INR|\$)?\s*([\d,]+\.?\d*)/i);
    if (!amountMatch) return null;

    const amountStr = amountMatch[1].replace(/,/g, '');
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return null;

    // 2. Transaction Type Determination
    const isCredit = /(?:credited|received|deposited|refunded)/i.test(text);
    const type: 'debit' | 'credit' = isCredit ? 'credit' : 'debit';

    // 3. Merchant / VPA / Counterparty Extraction
    let merchant = 'Unknown Merchant';
    const merchantMatch = text.match(/(?:to|at|VPA|info|paid to)\s+([A-Za-z0-9.\-_@]+)/i);
    if (merchantMatch) {
      merchant = merchantMatch[1].replace(/[@\._\-]/g, ' ').trim();
    }

    // 4. Account Number Suffix Extraction
    const accountMatch = text.match(/(?:A\/c|account|card)\s*(?:no\.?)?\s*[*Xx]+(\d{4})/i);
    const accountTail = accountMatch ? accountMatch[1] : undefined;

    // 5. Reference / UTR Number Extraction
    const refMatch = text.match(/(?:UPI Ref|Ref no|UTR|txn ID)\s*([0-9a-zA-Z]+)/i);
    const referenceId = refMatch ? refMatch[1] : undefined;

    // 6. Available Balance Extraction
    const balMatch = text.match(/(?:Avl Bal|Balance|Bal)\s*(?:is)?\s*(?:Rs\.?|INR|\$)?\s*([\d,]+\.?\d*)/i);
    const balance = balMatch ? parseFloat(balMatch[1].replace(/,/g, '')) : undefined;

    // Calculate heuristic confidence score
    let confidence = 0.5;
    if (amount > 0) confidence += 0.2;
    if (merchant !== 'Unknown Merchant') confidence += 0.15;
    if (accountTail) confidence += 0.1;
    if (referenceId) confidence += 0.05;

    return {
      amount,
      type,
      merchantOrEntity: merchant,
      accountTail,
      referenceId,
      balance,
      rawText,
      confidence: Math.min(1.0, confidence)
    };
  }
}
