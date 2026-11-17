export interface ExpenseItem {
  category: string;
  amount: number;
  isEssential: boolean;
  benchmarkPercent: number; // Recommended max % of income
}

export interface PersonalizedBudgetPlan {
  income: number;
  totalExpenses: number;
  netSavings: number;
  savingsRatePercent: number;
  unnecessarySpending: {
    totalLeak: number;
    items: Array<{
      category: string;
      actualAmount: number;
      recommendedMax: number;
      potentialMonthlySavings: number;
      reason: string;
    }>;
  };
  allocationRule50_30_20: {
    needs: { target: number; actual: number; status: 'healthy' | 'over_budget' };
    wants: { target: number; actual: number; status: 'healthy' | 'over_budget' };
    savings: { target: number; actual: number; status: 'healthy' | 'under_target' };
  };
  actionablePlan: string[];
}

export class BudgetPlannerService {
  /**
   * Deterministic expense analysis and personalized budget plan generator.
   * Calculations run in strict math logic — zero LLM arithmetic hallucination.
   */
  public static generatePlan(
    income: number,
    customExpenses?: Array<{ category: string; amount: number; isEssential?: boolean }>
  ): PersonalizedBudgetPlan {
    const validIncome = Math.max(1, income);

    // Default baseline expenses if none provided (drawn from typical monthly ledger)
    const expenses: ExpenseItem[] = customExpenses && customExpenses.length > 0
      ? customExpenses.map(e => ({
          category: e.category,
          amount: Math.max(0, e.amount),
          isEssential: e.isEssential ?? (['Housing', 'Rent', 'Groceries', 'Utilities', 'Healthcare'].includes(e.category)),
          benchmarkPercent: e.category === 'Dining Out' ? 0.08 : (e.category === 'Subscriptions' ? 0.03 : 0.15)
        }))
      : [
          { category: 'Housing & Rent', amount: 1200.00, isEssential: true, benchmarkPercent: 0.30 },
          { category: 'Groceries & Food', amount: 410.00, isEssential: true, benchmarkPercent: 0.12 },
          { category: 'Utilities & Bills', amount: 180.00, isEssential: true, benchmarkPercent: 0.08 },
          { category: 'Dining Out & Delivery', amount: 480.00, isEssential: false, benchmarkPercent: 0.07 },
          { category: 'Subscriptions & Entertainment', amount: 145.00, isEssential: false, benchmarkPercent: 0.03 },
          { category: 'Shopping & Discretionary', amount: 260.00, isEssential: false, benchmarkPercent: 0.05 },
          { category: 'Transportation & Fuel', amount: 175.50, isEssential: true, benchmarkPercent: 0.08 }
        ];

    const totalExpenses = Number(expenses.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2));
    const netSavings = Number((validIncome - totalExpenses).toFixed(2));
    const savingsRatePercent = Number(((netSavings / validIncome) * 100).toFixed(1));

    // Identify Unnecessary / Leak Spending
    const leakItems: Array<{
      category: string;
      actualAmount: number;
      recommendedMax: number;
      potentialMonthlySavings: number;
      reason: string;
    }> = [];

    let totalLeak = 0;

    for (const exp of expenses) {
      const recommendedMax = Number((validIncome * exp.benchmarkPercent).toFixed(2));
      if (!exp.isEssential && exp.amount > recommendedMax) {
        const potentialMonthlySavings = Number((exp.amount - recommendedMax).toFixed(2));
        totalLeak += potentialMonthlySavings;
        leakItems.push({
          category: exp.category,
          actualAmount: exp.amount,
          recommendedMax,
          potentialMonthlySavings,
          reason: `Spend ($${exp.amount.toFixed(2)}) exceeds recommended ${Math.round(exp.benchmarkPercent * 100)}% benchmark ($${recommendedMax.toFixed(2)}).`
        });
      }
    }

    // 50/30/20 Rule Calculations
    const needsTarget = Number((validIncome * 0.50).toFixed(2));
    const wantsTarget = Number((validIncome * 0.30).toFixed(2));
    const savingsTarget = Number((validIncome * 0.20).toFixed(2));

    const actualNeeds = Number(expenses.filter(e => e.isEssential).reduce((sum, e) => sum + e.amount, 0).toFixed(2));
    const actualWants = Number(expenses.filter(e => !e.isEssential).reduce((sum, e) => sum + e.amount, 0).toFixed(2));

    const actionablePlan: string[] = [];

    if (actualWants > wantsTarget) {
      actionablePlan.push(`Reduce discretionary 'Wants' by $${(actualWants - wantsTarget).toFixed(2)} to meet your 30% benchmark.`);
    }

    if (leakItems.length > 0) {
      actionablePlan.push(`Eliminate identified spending leaks in ${leakItems.map(l => l.category).join(' & ')} to recover $${totalLeak.toFixed(2)}/month.`);
    }

    if (netSavings >= savingsTarget) {
      actionablePlan.push(`Your current savings rate (${savingsRatePercent}%) meets the 20% financial independence benchmark ($${savingsTarget.toFixed(2)}/month).`);
    } else {
      const shortfall = Number((savingsTarget - netSavings).toFixed(2));
      actionablePlan.push(`Increase monthly savings by $${shortfall} to hit your 20% goal ($${savingsTarget.toFixed(2)}/month).`);
    }

    return {
      income: validIncome,
      totalExpenses,
      netSavings,
      savingsRatePercent,
      unnecessarySpending: {
        totalLeak: Number(totalLeak.toFixed(2)),
        items: leakItems
      },
      allocationRule50_30_20: {
        needs: {
          target: needsTarget,
          actual: actualNeeds,
          status: actualNeeds <= needsTarget ? 'healthy' : 'over_budget'
        },
        wants: {
          target: wantsTarget,
          actual: actualWants,
          status: actualWants <= wantsTarget ? 'healthy' : 'over_budget'
        },
        savings: {
          target: savingsTarget,
          actual: Math.max(0, netSavings),
          status: netSavings >= savingsTarget ? 'healthy' : 'under_target'
        }
      },
      actionablePlan
    };
  }
}
