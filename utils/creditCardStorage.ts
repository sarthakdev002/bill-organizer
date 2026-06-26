import AsyncStorage from '@react-native-async-storage/async-storage';

const CC_STATEMENTS_KEY = '@cc_statements';

export interface CCStatement {
  id: string;
  user_id: string;
  card_name: string;
  card_last_4?: string;
  statement_date: string;
  due_date?: string;
  billing_period?: string;
  total_due: number;
  minimum_due: number;
  previous_balance: number;
  payments_received: number;
  new_charges: number;
  interest_charged: number;
  finance_charges: number;
  late_fee: number;
  credit_limit: number;
  available_credit: number;
  reward_points: number;
  revolving_balance: number;
  emi_details: EMIDetail[];
  transaction_summary: TransactionSummary;
  transactions: CCTransaction[];
  warnings: string[];
  tips: string[];
  image_uri?: string;
  created_at: string;
}

export interface EMIDetail {
  description: string;
  emi_amount: number;
  remaining_emis: number;
  total_amount: number;
  principal: number;
  interest: number;
}

export interface CCTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
}

export interface TransactionSummary {
  total_debits: number;
  total_credits: number;
  transaction_count: number;
  top_categories: { category: string; amount: number; count: number }[];
  top_merchants: { merchant: string; amount: number; count: number }[];
}

export const CCStorage = {
  async getStatements(userId: string): Promise<CCStatement[]> {
    try {
      const stored = await AsyncStorage.getItem(CC_STATEMENTS_KEY);
      if (!stored) return [];
      return (JSON.parse(stored) as CCStatement[])
        .filter(s => s.user_id === userId)
        .sort((a, b) => new Date(b.statement_date).getTime() - new Date(a.statement_date).getTime());
    } catch { return []; }
  },

  async saveStatement(statement: CCStatement): Promise<void> {
    const all = await this.getAllStatements();
    const filtered = all.filter(s => s.id !== statement.id);
    filtered.push(statement);
    await AsyncStorage.setItem(CC_STATEMENTS_KEY, JSON.stringify(filtered));
  },

  async deleteStatement(id: string): Promise<void> {
    const all = await this.getAllStatements();
    await AsyncStorage.setItem(CC_STATEMENTS_KEY, JSON.stringify(all.filter(s => s.id !== id)));
  },

  async getAllStatements(): Promise<CCStatement[]> {
    try {
      const stored = await AsyncStorage.getItem(CC_STATEMENTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  },

  // --- Analytics ------------------
  getMonthlyAnalytics(statements: CCStatement[]) {
    if (statements.length === 0) return [];
    return statements.map(s => ({
      month: new Date(s.statement_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      totalDue: s.total_due,
      interest: s.interest_charged + s.finance_charges,
      newCharges: s.new_charges,
      payments: s.payments_received,
      utilization: s.credit_limit > 0 ? (s.total_due / s.credit_limit) * 100 : 0,
    }));
  },

  // --- Overspending Alerts ------------------
  generateAlerts(statements: CCStatement[]): string[] {
    const alerts: string[] = [];
    if (statements.length === 0) return alerts;

    const latest = statements[0];

    // High utilization
    if (latest.credit_limit > 0) {
      const util = (latest.total_due / latest.credit_limit) * 100;
      if (util >= 90) alerts.push(`[!!] CRITICAL: Credit utilization at ${util.toFixed(0)}%. This severely impacts your credit score. Pay down immediately.`);
      else if (util >= 75) alerts.push(`⚠️ High credit utilization at ${util.toFixed(0)}%. Keep below 30% for a healthy credit score.`);
      else if (util >= 50) alerts.push(`(Analytics) Credit utilization at ${util.toFixed(0)}%. Consider paying more to bring it below 30%.`);
    }

    // Interest charges
    if (latest.interest_charged > 0) {
      alerts.push(`(Payment) Interest charged: Rs.${latest.interest_charged.toLocaleString()}. Pay the full amount to avoid revolving credit charges (usually 36-42% APR).`);
    }

    // Minimum due warning
    if (latest.minimum_due > 0 && latest.total_due > latest.minimum_due * 3) {
      alerts.push(`⚠️ Paying only minimum due (Rs.${latest.minimum_due.toLocaleString()}) will result in heavy interest on Rs.${(latest.total_due - latest.minimum_due).toLocaleString()}.`);
    }

    // Late fee
    if (latest.late_fee > 0) {
      alerts.push(`[X] Late fee of Rs.${latest.late_fee} charged. Set up auto-pay to avoid future penalties.`);
    }

    // Due date proximity
    if (latest.due_date) {
      const dueDate = new Date(latest.due_date);
      const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue > 0 && daysUntilDue <= 5) {
        alerts.push(`(Info) Payment due in ${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}! Pay Rs.${latest.total_due.toLocaleString()} by ${dueDate.toLocaleDateString('en-IN')}.`);
      } else if (daysUntilDue <= 0) {
        alerts.push(`[!!] OVERDUE! Payment was due on ${dueDate.toLocaleDateString('en-IN')}. Pay immediately to avoid additional charges.`);
      }
    }

    // Revolving balance
    if (latest.revolving_balance > 0) {
      alerts.push(`(Revolving) Revolving balance: Rs.${latest.revolving_balance.toLocaleString()}. This attracts high interest (~3.5% monthly). Clear it ASAP.`);
    }

    // Spending increase (compare with prev)
    if (statements.length >= 2) {
      const prev = statements[1];
      const increase = ((latest.new_charges - prev.new_charges) / (prev.new_charges || 1)) * 100;
      if (increase > 30) {
        alerts.push(`(Analytics) Spending increased by ${increase.toFixed(0)}% compared to previous month (Rs.${prev.new_charges.toLocaleString()} -> Rs.${latest.new_charges.toLocaleString()}).`);
      }
    }

    return alerts;
  },
};
