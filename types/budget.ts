export interface Budget {
  id: string;
  category: string;
  amount: number; // Monthly budget amount in rupees
  user_id: string;
  start_date?: string; // ISO string for custom range
  end_date?: string;   // ISO string for custom range
  created_at: string;
  updated_at: string;
}

export interface BudgetAlert {
  id: string;
  budget_id: string;
  threshold: number; // 80, 90, 100
  triggered_at: string;
  user_id: string;
}

export interface CategorySpending {
  category: string;
  spent: number;
  budget: number;
  percentage: number;
  color: string;
}

export const BUDGET_THRESHOLDS = {
  WARNING: 80,   // Yellow
  CRITICAL: 90,  // Orange  
  EXCEEDED: 100 // Red
} as const;

export const BUDGET_COLORS = {
  SAFE: '#10B981',      // Emerald (Emerald 500)
  WARNING: '#F59E0B',   // Amber (Amber 500)
  CRITICAL: '#F97316',  // Orange (Orange 500)
  EXCEEDED: '#EF4444'   // Red (Red 500)
} as const;
