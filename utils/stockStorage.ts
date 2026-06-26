import AsyncStorage from '@react-native-async-storage/async-storage';

const STOCK_STATEMENTS_KEY = '@stock_statements';

export interface StockTransaction {
  date: string;
  type: 'buy' | 'sell';
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  amount: number;
  brokerage: number;
  stt: number;
  charges: number;
  net_amount: number;
  exchange?: string;
  segment?: string;
}

export interface Holding {
  symbol: string;
  name: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number;
  invested_value: number;
  current_value: number;
  pnl: number;
  pnl_percent: number;
  sector?: string;
}

export interface ChargesSummary {
  total_brokerage: number;
  stt: number;
  transaction_charges: number;
  gst: number;
  sebi_charges: number;
  stamp_duty: number;
  total_charges: number;
}

export interface PnLSummary {
  realized_pnl: number;
  unrealized_pnl: number;
  total_invested: number;
  current_value: number;
  total_returns: number;
  total_returns_percent: number;
}

export interface TaxSummary {
  stcg_profit: number;
  stcg_tax_estimate: number;
  ltcg_profit: number;
  ltcg_tax_estimate: number;
  stcg_holdings: { symbol: string; profit: number; holding_days: number }[];
  ltcg_holdings: { symbol: string; profit: number; holding_days: number }[];
}

export interface SectorAllocation {
  sector: string;
  value: number;
  percent: number;
  stocks_count: number;
}

export interface StockStatement {
  id: string;
  user_id: string;
  broker_name: string;
  account_id?: string;
  statement_period?: string;
  statement_date: string;
  transactions: StockTransaction[];
  holdings: Holding[];
  charges_summary: ChargesSummary;
  pnl_summary: PnLSummary;
  tax_summary: TaxSummary;
  portfolio_allocation: SectorAllocation[];
  insights: string[];
  risks: string[];
  image_uri?: string;
  created_at: string;
}

export const StockStorage = {
  async getStatements(userId: string): Promise<StockStatement[]> {
    try {
      const stored = await AsyncStorage.getItem(STOCK_STATEMENTS_KEY);
      if (!stored) return [];
      return (JSON.parse(stored) as StockStatement[])
        .filter(s => s.user_id === userId)
        .sort((a, b) => new Date(b.statement_date).getTime() - new Date(a.statement_date).getTime());
    } catch { return []; }
  },

  async saveStatement(statement: StockStatement): Promise<void> {
    const all = await this.getAllStatements();
    const filtered = all.filter(s => s.id !== statement.id);
    filtered.push(statement);
    await AsyncStorage.setItem(STOCK_STATEMENTS_KEY, JSON.stringify(filtered));
  },

  async deleteStatement(id: string): Promise<void> {
    const all = await this.getAllStatements();
    await AsyncStorage.setItem(STOCK_STATEMENTS_KEY, JSON.stringify(all.filter(s => s.id !== id)));
  },

  async getAllStatements(): Promise<StockStatement[]> {
    try {
      const stored = await AsyncStorage.getItem(STOCK_STATEMENTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  },

  // Aggregate P&L across all statements
  getAggregatedPnL(statements: StockStatement[]): PnLSummary {
    if (statements.length === 0) return { realized_pnl: 0, unrealized_pnl: 0, total_invested: 0, current_value: 0, total_returns: 0, total_returns_percent: 0 };
    const latest = statements[0];
    return latest.pnl_summary;
  },

  // Aggregate portfolio from latest statement
  getPortfolioInsights(statement: StockStatement) {
    const topGainers = [...statement.holdings].filter(h => h.pnl > 0).sort((a, b) => b.pnl - a.pnl).slice(0, 5);
    const topLosers = [...statement.holdings].filter(h => h.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, 5);
    const totalValue = statement.holdings.reduce((s, h) => s + h.current_value, 0);
    const concentrationRisk = statement.holdings.filter(h => (h.current_value / (totalValue || 1)) > 0.2);

    return { topGainers, topLosers, concentrationRisk, totalValue };
  },
};
