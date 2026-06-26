import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Budget, CategorySpending } from '@/types/budget';
import { BudgetCalculator } from '@/utils/budgetCalculator';

interface BudgetSummaryProps {
  budgets: Budget[];
  spending: CategorySpending[];
  onSetupPress?: () => void;
}

export default function BudgetSummary({ budgets, spending, onSetupPress }: BudgetSummaryProps) {
  const router = useRouter();
  
  const totalBudget = BudgetCalculator.getTotalMonthlyBudget(budgets);
  const totalSpent = BudgetCalculator.getTotalMonthlySpending(spending);
  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  
  const exceededCategories = spending.filter(s => s.percentage >= 100);
  const warningCategories = spending.filter(s => s.percentage >= 80 && s.percentage < 100);
  const safeCategories = spending.filter(s => s.percentage < 80);

  const handleSetupPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onSetupPress) {
      onSetupPress();
    } else {
      router.push('/budget-setup');
    }
  };

  if (budgets.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Budgets Set</Text>
        <Text style={styles.emptyText}>Set up monthly budgets to track your spending</Text>
        <TouchableOpacity style={styles.setupButton} onPress={handleSetupPress}>
          <Text style={styles.setupButtonText}>Set Up Budgets</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getOverallStatus = () => {
    if (overallPercentage >= 100) return { text: 'Budget Exceeded', color: '#F44336' };
    if (overallPercentage >= 95) return { text: 'Critical', color: '#FF9800' };
    if (overallPercentage >= 80) return { text: 'Warning', color: '#FFC107' };
    return { text: 'On Track', color: '#4CAF50' };
  };

  const overallStatus = getOverallStatus();

  return (
    <ScrollView style={styles.container}>
      {/* Overall Budget Overview */}
      <View style={styles.overviewCard}>
        <View style={styles.overviewHeader}>
          <Text style={styles.overviewTitle}>Monthly Budget Overview</Text>
          <TouchableOpacity style={styles.editButton} onPress={handleSetupPress}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.overviewStats}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total Budget</Text>
            <Text style={styles.statValue}>
              {BudgetCalculator.formatCurrency(totalBudget)}
            </Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total Spent</Text>
            <Text style={styles.statValue}>
              {BudgetCalculator.formatCurrency(totalSpent)}
            </Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Remaining</Text>
            <Text style={[styles.statValue, { color: totalBudget - totalSpent >= 0 ? '#4CAF50' : '#F44336' }]}>
              {BudgetCalculator.formatCurrency(Math.max(0, totalBudget - totalSpent))}
            </Text>
          </View>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <View 
              style={[
                styles.progressBarFill,
                { 
                  width: `${Math.min(overallPercentage, 100)}%`,
                  backgroundColor: overallStatus.color
                }
              ]} 
            />
          </View>
          <View style={styles.progressTextContainer}>
            <Text style={[styles.progressPercentage, { color: overallStatus.color }]}>
              {overallPercentage.toFixed(1)}%
            </Text>
            <Text style={[styles.progressStatus, { color: overallStatus.color }]}>
              {overallStatus.text}
            </Text>
          </View>
        </View>
      </View>

      {/* Category Breakdown */}
      {spending.length > 0 && (
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Category Breakdown</Text>
          
          {/* Exceeded Categories */}
          {exceededCategories.length > 0 && (
            <View style={styles.categorySection}>
              <Text style={styles.sectionTitle}>[!!] Exceeded ({exceededCategories.length})</Text>
              {exceededCategories.map(item => (
                <View key={item.category} style={styles.categoryItem}>
                  <Text style={styles.categoryName}>{item.category}</Text>
                  <Text style={styles.categoryAmount}>
                    {BudgetCalculator.formatCurrency(item.spent)} / {BudgetCalculator.formatCurrency(item.budget)}
                  </Text>
                  <Text style={[styles.categoryPercentage, { color: '#F44336' }]}>
                    {item.percentage.toFixed(1)}%
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Warning Categories */}
          {warningCategories.length > 0 && (
            <View style={styles.categorySection}>
              <Text style={styles.sectionTitle}>⚠️ Warning ({warningCategories.length})</Text>
              {warningCategories.map(item => (
                <View key={item.category} style={styles.categoryItem}>
                  <Text style={styles.categoryName}>{item.category}</Text>
                  <Text style={styles.categoryAmount}>
                    {BudgetCalculator.formatCurrency(item.spent)} / {BudgetCalculator.formatCurrency(item.budget)}
                  </Text>
                  <Text style={[styles.categoryPercentage, { color: '#FFC107' }]}>
                    {item.percentage.toFixed(1)}%
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Safe Categories */}
          {safeCategories.length > 0 && (
            <View style={styles.categorySection}>
              <Text style={styles.sectionTitle}>✅ On Track ({safeCategories.length})</Text>
              {safeCategories.map(item => (
                <View key={item.category} style={styles.categoryItem}>
                  <Text style={styles.categoryName}>{item.category}</Text>
                  <Text style={styles.categoryAmount}>
                    {BudgetCalculator.formatCurrency(item.spent)} / {BudgetCalculator.formatCurrency(item.budget)}
                  </Text>
                  <Text style={[styles.categoryPercentage, { color: '#4CAF50' }]}>
                    {item.percentage.toFixed(1)}%
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f8f9fa',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  setupButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  setupButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  overviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  overviewTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  editButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
    left: 8
  },
  editButtonText: {
    fontSize: 14,
    color: '#007AFF',
  },
  overviewStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressTextContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPercentage: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressStatus: {
    fontSize: 14,
    fontWeight: '500',
  },
  breakdownCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  breakdownTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 16,
  },
  categorySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryName: {
    fontSize: 14,
    color: '#0F172A',
    flex: 1,
  },
  categoryAmount: {
    fontSize: 12,
    color: '#666',
    marginHorizontal: 8,
  },
  categoryPercentage: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'right',
  },
});