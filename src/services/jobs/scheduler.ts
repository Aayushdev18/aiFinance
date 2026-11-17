export interface ProactiveJobConfig {
  jobId: string;
  name: string;
  cronExpression: string;
  description: string;
  run: () => Promise<void>;
}

export class ProactiveJobScheduler {
  private jobs: ProactiveJobConfig[] = [];

  constructor() {
    this.registerDefaultJobs();
  }

  private registerDefaultJobs() {
    // 1. Daily Midnight Anomaly Sweeper
    this.jobs.push({
      jobId: 'daily_anomaly_sweeper',
      name: 'Daily Spending Anomaly & Duplicate Sweeper',
      cronExpression: '30 23 * * *', // Daily 23:30
      description: 'Scans past 24 hours of transactions for outliers (>2.5 sigma) and rapid duplicate charges.',
      run: async () => {
        console.log('[PROACTIVE JOB] Running Daily Anomaly Sweeper...');
        // Executes category baseline distribution checks and dispatches alerts
      }
    });

    // 2. Budget Pacing and Run-Rate Monitor
    this.jobs.push({
      jobId: 'budget_pacing_monitor',
      name: 'Mid-Month Budget Pacing & Forecast Monitor',
      cronExpression: '0 8 */3 * *', // Every 3 days at 08:00
      description: 'Projects month-end spend using burn-rate formula: Projected = (Spend / Days) * TotalDays.',
      run: async () => {
        console.log('[PROACTIVE JOB] Running Budget Pacing Monitor...');
        // Flags categories where projected spend > 105% of budget limit before day 20
      }
    });

    // 3. Weekly Subscription Price-Creep Auditor
    this.jobs.push({
      jobId: 'subscription_auditor',
      name: 'Recurring Subscription & Ghost Charge Auditor',
      cronExpression: '0 3 * * 0', // Every Sunday at 03:00
      description: 'Identifies 30-day periodicity in charges and flags unexpected subscription price increases.',
      run: async () => {
        console.log('[PROACTIVE JOB] Running Subscription Auditor...');
        // Compares monthly subscription amounts to previous cycle
      }
    });
  }

  public getRegisteredJobs(): ProactiveJobConfig[] {
    return this.jobs;
  }
}
