import { Budget, BudgetAlert } from '../types/budget';
import { supabase } from '@/lib/supabase';

export const BudgetStorage = {
  // Budget operations
  async getBudgets(userId: string): Promise<Budget[]> {
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting budgets:', error);
        return [];
      }

      return data.map((budget: any) => ({
        ...budget,
        created_at: new Date(budget.created_at).toISOString(),
        updated_at: new Date(budget.updated_at).toISOString(),
        start_date: budget.start_date ? new Date(budget.start_date).toISOString() : undefined,
        end_date: budget.end_date ? new Date(budget.end_date).toISOString() : undefined,
      }));
    } catch (error) {
      console.error('Error getting budgets:', error);
      return [];
    }
  },

  async saveBudget(budget: Partial<Budget>): Promise<void> {
    try {
      if (budget.id) {
        // Update existing budget
        const { error } = await supabase
          .from('budgets')
          .update({
            category: budget.category,
            amount: budget.amount,
            start_date: budget.start_date ? new Date(budget.start_date) : null,
            end_date: budget.end_date ? new Date(budget.end_date) : null,
          })
          .eq('id', budget.id)
          .eq('user_id', budget.user_id);

        if (error) throw error;
      } else {
        // Create new budget - Supabase will auto-generate id and timestamps
        const { error } = await supabase
          .from('budgets')
          .insert({
            user_id: budget.user_id,
            category: budget.category,
            amount: budget.amount,
            start_date: budget.start_date ? new Date(budget.start_date) : null,
            end_date: budget.end_date ? new Date(budget.end_date) : null,
          });

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error saving budget:', error);
      throw error;
    }
  },

  async getBudgetByCategory(userId: string, category: string): Promise<Budget | null> {
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', userId)
        .eq('category', category)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        ...data,
        created_at: new Date(data.created_at).toISOString(),
        updated_at: new Date(data.updated_at).toISOString(),
        start_date: data.start_date ? new Date(data.start_date).toISOString() : undefined,
        end_date: data.end_date ? new Date(data.end_date).toISOString() : undefined,
      };
    } catch (error) {
      console.error('Error getting budget by category:', error);
      return null;
    }
  },

  async deleteBudget(budgetId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('budgets')
        .delete()
        .eq('id', budgetId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting budget:', error);
      throw error;
    }
  },

  // Alert operations
  async getBudgetAlerts(userId: string): Promise<BudgetAlert[]> {
    try {
      const { data, error } = await supabase
        .from('budget_alerts')
        .select('*')
        .eq('user_id', userId)
        .order('triggered_at', { ascending: false });

      if (error) {
        console.error('Error getting budget alerts:', error);
        return [];
      }

      return data.map((alert: any) => ({
        ...alert,
        triggered_at: new Date(alert.triggered_at).toISOString(),
      }));
    } catch (error) {
      console.error('Error getting budget alerts:', error);
      return [];
    }
  },

  async saveBudgetAlert(alert: BudgetAlert): Promise<void> {
    try {
      const { error } = await supabase.from('budget_alerts').insert({
        id: alert.id,
        user_id: alert.user_id,
        budget_id: alert.budget_id,
        threshold: alert.threshold,
        triggered_at: new Date(alert.triggered_at),
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error saving budget alert:', error);
      throw error;
    }
  },

  async hasAlertBeenTriggered(budgetId: string, threshold: number, userId: string): Promise<boolean> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data, error } = await supabase
        .from('budget_alerts')
        .select('*')
        .eq('user_id', userId)
        .eq('budget_id', budgetId)
        .eq('threshold', threshold)
        .gte('triggered_at', today.toISOString())
        .lt('triggered_at', tomorrow.toISOString());

      if (error) {
        return false;
      }

      return (data?.length || 0) > 0;
    } catch (error) {
      console.error('Error checking alert status:', error);
      return false;
    }
  },

  // Clear all data (for testing/debugging)
  async clearAllBudgetData(): Promise<void> {
    // This function should be used carefully in production
    console.warn('clearAllBudgetData is not implemented for Supabase security reasons');
  },
};
