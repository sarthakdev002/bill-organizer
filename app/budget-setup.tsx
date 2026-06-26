import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../constants/Theme';
import CustomAlert from './components/CustomAlert';
import { Budget } from '@/types/budget';
import { BudgetStorage } from '@/utils/budgetStorage';

const CATEGORIES = [
  'Food', 'Electricity', 'Water', 'Rent', 'Internet', 'Shopping', 'Entertainment', 'Medical', 'Travel', 'Others'
];

export default function BudgetSetupScreen() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBudget, setEditingBudget] = useState<Partial<Budget> | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  const [session, setSession] = useState<any>(null);

  // Custom Alert state
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons?: any[];
  }>({ visible: false, title: '', message: '' });

  const showAlert = (title: string, message: string, buttons?: any[]) => {
    setAlertConfig({ visible: true, title, message, buttons });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadBudgets(session.user.id);
      }
    });
  }, []);

  const loadBudgets = async (userId: string) => {
    try {
      const data = await BudgetStorage.getBudgets(userId);
      setBudgets(data);
    } catch (error) {
      console.error('Error loading budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!editingBudget?.category || !editingBudget?.amount || !session) {
      showAlert('Error', 'Please fill in category and amount');
      return;
    }

    try {
      const budget: Partial<Budget> = {
        ...(editingBudget.id && { id: editingBudget.id }),
        category: editingBudget.category,
        amount: Number(editingBudget.amount),
        user_id: session.user.id,
        start_date: editingBudget.start_date,
        end_date: editingBudget.end_date,
        ...(editingBudget.created_at && { created_at: editingBudget.created_at }),
      };

      await BudgetStorage.saveBudget(budget);
      await loadBudgets(session.user.id);
      setEditingBudget(null);
      showAlert('Success', 'Budget saved successfully');
    } catch (error) {
      showAlert('Error', 'Failed to save budget');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    showAlert(
      'Delete Budget',
      'Are you sure you want to delete this budget?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await BudgetStorage.deleteBudget(id, session.user.id);
            loadBudgets(session.user.id);
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(tabs)/more')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={'#0F172A'} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Budget Monitoring</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Manage Budgets</Text>
        <Text style={styles.subtitle}>Set custom limits for each category</Text>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setEditingBudget({ category: 'Food', amount: 0 })}
        >
          <Ionicons name="add-circle" size={24} color={'#FFF'} />
          <Text style={styles.addButtonText}>Add New Budget</Text>
        </TouchableOpacity>

        {editingBudget && (
          <View style={styles.editCard}>
            <Text style={styles.cardTitle}>Set Category Limit</Text>

            <Text style={styles.inputLabel}>Select Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    editingBudget.category === cat && styles.categoryChipActive
                  ]}
                  onPress={() => setEditingBudget({ ...editingBudget, category: cat })}
                >
                  <Text style={[
                    styles.categoryChipText,
                    editingBudget.category === cat && styles.categoryChipTextActive
                  ]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Monthly Limit (Rs.)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="e.g. 5000"
              value={editingBudget.amount?.toString()}
              onChangeText={(text) => setEditingBudget({ ...editingBudget, amount: Number(text) })}
            />

            <View style={styles.dateRow}>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker('start')}
              >
                <Text style={styles.dateLabel}>Start Date</Text>
                <Text style={styles.dateValue}>
                  {editingBudget.start_date ? new Date(editingBudget.start_date).toLocaleDateString() : 'Current Month'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker('end')}
              >
                <Text style={styles.dateLabel}>End Date</Text>
                <Text style={styles.dateValue}>
                  {editingBudget.end_date ? new Date(editingBudget.end_date).toLocaleDateString() : 'Current Month'}
                </Text>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={showDatePicker === 'start'
                  ? (editingBudget.start_date ? new Date(editingBudget.start_date) : new Date())
                  : (editingBudget.end_date ? new Date(editingBudget.end_date) : new Date())
                }
                mode="date"
                onChange={(event, date) => {
                  setShowDatePicker(null);
                  if (date) {
                    if (showDatePicker === 'start') {
                      setEditingBudget({ ...editingBudget, start_date: date.toISOString() });
                    } else {
                      setEditingBudget({ ...editingBudget, end_date: date.toISOString() });
                    }
                  }
                }}
              />
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditingBudget(null)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudget}>
                <Text style={styles.saveButtonText}>Save Budget</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.budgetList}>
          {budgets.map(budget => (
            <View key={budget.id} style={styles.budgetItem}>
              <View style={styles.budgetInfo}>
                <Text style={styles.budgetName}>{budget.category}</Text>
                <Text style={styles.budgetAmount}>Rs.{budget.amount.toLocaleString()}</Text>
                <Text style={styles.budgetDate}>
                  {budget.start_date ? `${new Date(budget.start_date).toLocaleDateString()} - ${new Date(budget.end_date!).toLocaleDateString()}` : 'Monthly'}
                </Text>
              </View>
              <View style={styles.budgetActions}>
                <TouchableOpacity onPress={() => setEditingBudget(budget)}>
                  <Ionicons name="create-outline" size={24} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteBudget(budget.id)}>
                  <Ionicons name="trash-outline" size={24} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    marginRight: Spacing.md,
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h3,
    color: '#0F172A',
  },
  scrollContent: { padding: Spacing.lg },
  title: { ...Typography.h2, color: '#0F172A', marginBottom: 4 },
  subtitle: { ...Typography.body, color: '#666', marginBottom: Spacing.xl },
  addButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
    ...Shadows.medium,
  },
  addButtonText: { color: '#FFF', fontWeight: '700', marginLeft: 8 },
  editCard: {
    backgroundColor: '#FFF',
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    ...Shadows.soft,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: { ...Typography.h3, marginBottom: Spacing.md },
  inputLabel: { ...Typography.sectionTitle, marginBottom: Spacing.sm },
  input: {
    backgroundColor: '#F1F5F9',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 16,
    color: '#0F172A',
    marginBottom: Spacing.lg,
  },
  categoryScroll: { marginBottom: Spacing.lg },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F1F5F9',
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryChipText: { color: '#666', fontWeight: '600' },
  categoryChipTextActive: { color: '#FFF' },
  dateRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  dateButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  dateLabel: { ...Typography.caption, color: '#666', marginBottom: 4 },
  dateValue: { color: '#0F172A', fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: Spacing.md },
  cancelButton: { flex: 1, padding: Spacing.md, alignItems: 'center' },
  cancelButtonText: { color: '#666', fontWeight: '600' },
  saveButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  saveButtonText: { color: '#FFF', fontWeight: '700' },
  budgetList: { gap: Spacing.md },
  budgetItem: {
    backgroundColor: '#FFF',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadows.soft,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  budgetInfo: { flex: 1 },
  budgetName: { ...Typography.h3, color: '#0F172A' },
  budgetAmount: { color: Colors.primary, fontWeight: '700', fontSize: 16, marginVertical: 2 },
  budgetDate: { ...Typography.caption, color: '#666' },
  budgetActions: { flexDirection: 'row', gap: Spacing.md },
});

