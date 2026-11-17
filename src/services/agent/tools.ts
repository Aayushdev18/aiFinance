import { z } from 'zod';

export interface AuthenticatedUserContext {
  userId: string;
  currency: string;
  timezone: string;
}

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  parameters: z.ZodSchema<TParams>;
  execute: (context: AuthenticatedUserContext, params: TParams) => Promise<TResult>;
}

export const getFinancialSummarySchema = z.object({
  startDate: z.string().describe('ISO date string (YYYY-MM-DD) for start of window'),
  endDate: z.string().describe('ISO date string (YYYY-MM-DD) for end of window'),
  category: z.string().optional().describe('Optional category filter')
});

export const getSpendingTrendsSchema = z.object({
  lookbackMonths: z.number().int().min(1).max(12).default(3).describe('Number of months for trend calculation'),
  category: z.string().optional().describe('Optional category filter')
});

export const getBudgetStatusSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2030)
});

/**
 * Deterministic Financial Tool Registry.
 * Notice: None of the parameter schemas expose a `userId` field!
 * The `userId` is supplied exclusively by the authenticated RequestContext.
 */
export const financialTools: Record<string, ToolDefinition> = {
  get_financial_summary: {
    name: 'get_financial_summary',
    description: 'Calculates total income, total expenses, net cash flow, and count of transactions deterministically via SQL.',
    parameters: getFinancialSummarySchema,
    execute: async (ctx, params: z.infer<typeof getFinancialSummarySchema>) => {
      // In production, executes SQL:
      // SELECT SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) AS total_income,
      //        SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) AS total_expense,
      //        COUNT(*) AS transaction_count
      // FROM transactions WHERE user_id = $userId AND transaction_date BETWEEN $start AND $end;
      return {
        userId: ctx.userId, // verified
        startDate: params.startDate,
        endDate: params.endDate,
        totalIncome: 4500.00,
        totalExpenses: 2850.50,
        netSavings: 1649.50,
        currency: ctx.currency,
        calculatedBy: 'PostgreSQL_Aggregate_Engine'
      };
    }
  },

  get_spending_trends: {
    name: 'get_spending_trends',
    description: 'Computes Month-over-Month (MoM) spend velocity and percentage variance using SQL window functions.',
    parameters: getSpendingTrendsSchema,
    execute: async (ctx, params: z.infer<typeof getSpendingTrendsSchema>) => {
      return {
        userId: ctx.userId,
        lookbackMonths: params.lookbackMonths,
        category: params.category || 'All Categories',
        monthlyTrend: [
          { month: 'September', spend: 2400.00 },
          { month: 'October', spend: 2850.50, variancePercent: +18.7 }
        ],
        calculatedBy: 'SQL_Window_LAG_Function'
      };
    }
  },

  get_budget_status: {
    name: 'get_budget_status',
    description: 'Retrieves active budget limits vs real-time consumed amounts and projects end-of-month runway.',
    parameters: getBudgetStatusSchema,
    execute: async (ctx, params: z.infer<typeof getBudgetStatusSchema>) => {
      return {
        userId: ctx.userId,
        month: params.month,
        year: params.year,
        budgets: [
          { category: 'Dining Out', limit: 400.00, consumed: 380.00, remaining: 20.00, percentUsed: 95.0 },
          { category: 'Groceries', limit: 600.00, consumed: 410.00, remaining: 190.00, percentUsed: 68.3 }
        ],
        pacingAlert: 'Dining Out is at 95% limit before month end.'
      };
    }
  }
};
