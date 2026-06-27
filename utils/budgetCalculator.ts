import { supabase } from '@/lib/supabase';
import { Budget, CategorySpending } from '../types/budget';

export class BudgetCalculator {
  /**
   * Calculate spending for each category based on bills and budget ranges
   * OPTIMIZED: Can accept all bills to avoid multiple DB queries
   */
  static async calculateCategorySpending(
    userId: string,
    budgets: Budget[],
    allBills?: any[]
  ): Promise<CategorySpending[]> {
    try {
      if (!Array.isArray(budgets)) {
        console.error('BudgetCalculator: budgets must be an array');
        return [];
      }

      console.log('[BudgetCalculator] Calculating category spending:', { userId, budgetsCount: budgets.length, allBillsCount: allBills?.length || 0 });
      console.log('[BudgetCalculator] All bills:', allBills);

      const results: CategorySpending[] = [];

      for (const budget of budgets) {
        // Range selection (convert to UTC)
        const getUTCDate = (dateStr: string | undefined): Date => {
          if (!dateStr) return new Date(0);
          const date = new Date(dateStr);
          return new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds(),
            date.getUTCMilliseconds()
          ));
        };
        const start = budget.start_date ? getUTCDate(budget.start_date) : this.getMonthlyDateRange().startDate;
        const end = budget.end_date ? getUTCDate(budget.end_date) : this.getMonthlyDateRange().endDate;

        console.log(`[BudgetCalculator] Budget: ${budget.category}, amount: ${budget.amount}, start: ${start.toISOString()}, end: ${end.toISOString()}`);

        let spent = 0;

        if (allBills) {
          // Helper to get the most relevant date for a bill (converted to UTC)
          const getBillDate = (b: any) => {
            const dateStr = b.payment_timestamp || b.created_at || b.invoice_date;
            if (!dateStr) return new Date(0);
            const date = new Date(dateStr);
            // Convert to UTC by creating a new Date with the UTC components
            return new Date(Date.UTC(
              date.getUTCFullYear(),
              date.getUTCMonth(),
              date.getUTCDate(),
              date.getUTCHours(),
              date.getUTCMinutes(),
              date.getUTCSeconds(),
              date.getUTCMilliseconds()
            ));
          };

          // OPTIMIZATION: Filter local bills instead of querying DB
          const filteredBills = allBills.filter(bill => {
            const bDate = getBillDate(bill);
            const isCategoryMatch = bill.category === budget.category;
            const isDateMatch = bDate >= start && bDate <= end;
            console.log(`[BudgetCalculator] Checking bill: ${bill.id}, category: ${bill.category}, amount: ${bill.amount}, date: ${bDate.toISOString()}, isCategoryMatch: ${isCategoryMatch}, isDateMatch: ${isDateMatch}`);
            return isCategoryMatch && isDateMatch;
          });

          spent = filteredBills.reduce((acc, bill) => acc + parseFloat(bill.amount?.toString() || '0'), 0);
          console.log(`[BudgetCalculator] ${budget.category} - filtered bills count: ${filteredBills.length}, total spent: ${spent}`);
        } else {
          // Fallback to original DB query if no bills provided
          let query = supabase
            .from('bills')
            .select('*')
            .eq('user_id', userId)
            .eq('category', budget.category);

          query = query
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString());

          const { data: bills, error } = await query;

          if (error) {
            console.error(`Error fetching bills for ${budget.category}:`, error);
            continue;
          }

          console.log(`[BudgetCalculator] ${budget.category} - DB bills count: ${bills?.length || 0}`);
          spent = bills?.reduce((acc, bill) => acc + parseFloat(bill.amount?.toString() || '0'), 0) || 0;
        }

        const percentage = this.calculateSpendingPercentage(spent, budget.amount);

        results.push({
          category: budget.category,
          spent,
          budget: budget.amount,
          percentage,
          color: this.getProgressColor(budget.amount, spent)
        });
      }

      console.log('[BudgetCalculator] Final results:', results);
      return results;
    } catch (error) {
      console.error('Error calculating category spending:', error);
      return [];
    }
  }

  /**
   * Get total spending for a specific category within its budget range
   */
  static async getCategorySpending(userId: string, budget: Budget): Promise<number> {
    if (!budget) return 0;

    const getUTCDate = (dateStr: string | undefined): Date => {
      if (!dateStr) return new Date(0);
      const date = new Date(dateStr);
      return new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds()
      ));
    };
    const start = budget.start_date ? getUTCDate(budget.start_date) : this.getMonthlyDateRange().startDate;
    const end = budget.end_date ? getUTCDate(budget.end_date) : this.getMonthlyDateRange().endDate;

    const { data, error } = await supabase
      .from('bills')
      .select('amount')
      .eq('user_id', userId)
      .eq('category', budget.category)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (error) {
      console.error('Error getting category spending:', error);
      return 0;
    }

    return data?.reduce((acc, bill) => acc + parseFloat(bill.amount?.toString() || '0'), 0) || 0;
  }

  /**
   * Calculate spending vs budget percentage
   */
  static calculateSpendingPercentage(spent: number, budget: number): number {
    if (budget === 0) return 0;
    return (spent / budget) * 100; // Don't cap - UI caps at 100% for display, but alerts need the real value
  }

  /**
   * Get progress color based on spending percentage
   */
  static getProgressColor(budget: number, spent: number): string {
    const percentage = this.calculateSpendingPercentage(spent, budget);

    if (percentage >= 100) return '#EF4444'; // Red - Exceeded
    if (percentage >= 90) return '#F97316'; // Orange - Critical
    if (percentage >= 80) return '#F59E0B'; // Yellow - Warning
    return '#10B981'; // Emerald - Safe
  }

  /**
   * Check if budget alert should be triggered
   */
  static shouldTriggerAlert(spent: number, budget: number, threshold: number): boolean {
    if (budget === 0) return false;
    const percentage = (spent / budget) * 100;
    return percentage >= threshold;
  }

  /**
   * Get budget status text
   */
  static getBudgetStatus(spent: number, budget: number): string {
    const percentage = this.calculateSpendingPercentage(spent, budget);

    if (percentage >= 100) return 'Budget Exceeded';
    if (percentage >= 90) return 'Critical - 90%+';
    if (percentage >= 80) return 'Warning - 80%+';
    return 'On Track';
  }

  /**
   * Format currency amount
   */
  static formatCurrency(amount: number): string {
    return `Rs.${amount.toLocaleString('en-IN')}`;
  }

  /**
   * Get monthly date range in UTC
   */
  static getMonthlyDateRange(): { startDate: Date; endDate: Date } {
    const now = new Date();
    const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

    console.log('[BudgetCalculator] Monthly date range (UTC):', { startDate: startDate.toISOString(), endDate: endDate.toISOString() });
    return { startDate, endDate };
  }

  /**
   * Get total monthly budget
   */
  static getTotalMonthlyBudget(budgets: Budget[]): number {
    return budgets.reduce((total, budget) => total + budget.amount, 0);
  }

  /**
   * Get total monthly spending
   */
  static getTotalMonthlySpending(spending: CategorySpending[]): number {
    return spending.reduce((total, category) => total + category.spent, 0);
  }
}
