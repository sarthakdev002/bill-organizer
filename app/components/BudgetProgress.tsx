import { Colors } from '@/constants/Theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Budget } from '@/types/budget';
import { BudgetCalculator } from '@/utils/budgetCalculator';

interface BudgetProgressProps {
  category: string;
  spending: number;
  budget: Budget | null;
  showDetails?: boolean;
}

export default function BudgetProgress({
  category,
  spending,
  budget,
  showDetails = true
}: BudgetProgressProps) {
  

  if (!budget || budget.amount === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.categoryText}>{category}</Text>
          <Text style={styles.noBudgetText}>No budget set</Text>
        </View>
      </View>
    );
  }

  const percentage = BudgetCalculator.calculateSpendingPercentage(spending, budget.amount);
  const progressColor = BudgetCalculator.getProgressColor(budget.amount, spending);
  const status = BudgetCalculator.getBudgetStatus(spending, budget.amount);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.categoryText}>{category}</Text>
        {showDetails && (
          <View style={styles.amountsContainer}>
            <Text style={styles.spentText}>
              {BudgetCalculator.formatCurrency(spending)}
            </Text>
            <Text style={styles.separator}>/</Text>
            <Text style={styles.budgetText}>
              {BudgetCalculator.formatCurrency(budget.amount)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: progressColor
              }
            ]}
          />
        </View>

        {showDetails && (
          <View style={styles.detailsContainer}>
            <Text style={[styles.percentageText, { color: progressColor }]}>
              {percentage.toFixed(1)}%
            </Text>
            <Text style={[styles.statusText, { color: progressColor }]}>
              {status}
            </Text>
          </View>
        )}
      </View>

      {percentage >= 100 && (
        <View style={styles.alertContainer}>
          <Text style={styles.alertText}>⚠️ Budget exceeded by {BudgetCalculator.formatCurrency(spending - budget.amount)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  noBudgetText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  amountsContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  spentText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  separator: {
    fontSize: 14,
    color: '#666',
    marginHorizontal: 4,
  },
  budgetText: {
    fontSize: 16,
    color: '#666',
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  detailsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  percentageText: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  alertContainer: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  alertText: {
    fontSize: 14,
    color: Colors.error,
    fontWeight: '500',
  },
});