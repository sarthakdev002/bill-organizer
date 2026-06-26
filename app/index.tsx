import { Ionicons } from '@expo/vector-icons';
import BudgetSummary from '@/app/components/BudgetSummary';
import { Budget } from '@/types/budget';
import { BudgetCalculator } from '@/utils/budgetCalculator';
import { BudgetStorage } from '@/utils/budgetStorage';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';

import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Bill {
  id: number;
  amount: number;
  category: string;
  uri: string;
  merchant_name?: string;
  created_at?: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categorySpending, setCategorySpending] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/(auth)/login');
      }
    })();
  }, [router]);

  const loadBudgets = useCallback(async (userId: string) => {
    try {
      const budgets = await BudgetStorage.getBudgets(userId);
      setBudgets(budgets);

      const spendingData = await BudgetCalculator.calculateCategorySpending(
        userId,
        budgets
      );

      setCategorySpending(spendingData);
    } catch (error) {
      console.error('Error loading budgets:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.error('User not authenticated');
        return;
      }

      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', session.user.id);

      if (error) {
        console.error("Failed to load bills:", error);
        return;
      }

      const parsedBills = (data as unknown as Bill[]) || [];

      parsedBills.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB.getTime() - dateA.getTime();
      });

      setBills(parsedBills);

      const total = parsedBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
      setTotalExpenses(total);

      await loadBudgets(session.user.id);
    } catch (e) {
      console.error("Failed to load bills", e);
    }
  }, [loadBudgets]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );


  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, [router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Today';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const RecentBillItem = ({ bill, index }: { bill: Bill, index: number }) => (
    <Animated.View
      entering={FadeInRight.delay(100 * index).duration(500)}
      style={styles.activityItemWrapper}
    >
      <TouchableOpacity
        onPress={() => {
          router.push({
            pathname: '/categories/[id]',
            params: { id: bill.category }
          });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        activeOpacity={0.7}
        style={[styles.rowCard, Shadows.soft]}
      >
        <View style={styles.billClickArea}>
          <View style={styles.iconContainer}>
            <Ionicons name="receipt-outline" size={20} color="#666" />
          </View>
          <View style={styles.billInfo}>
            <Text style={styles.billMerchant} numberOfLines={1}>
              {bill.merchant_name || 'General Bill'}
            </Text>
            <View style={styles.billMetaRow}>
              <Text style={styles.billDate}>
                {formatDateTime(bill.created_at)}
              </Text>
              <View style={styles.dotSeparator} />
              <View style={styles.itemCategoryBadge}>
                <Text style={styles.itemCategoryText}>{bill.category}</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.amountContainer}>
          <Text style={styles.amountText}>
            Rs.{(bill.amount || 0).toFixed(0)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#666" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Welcome back,</Text>
              <Text style={styles.title}>Dashboard</Text>
            </View>
            <TouchableOpacity
              onPress={handleLogout}
              style={styles.logoutButton}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        <Animated.View
          entering={FadeInDown.duration(800).springify()}
        >
          <LinearGradient
            colors={[Colors.primary, '#6366F1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.mainHeroCard, Shadows.medium]}
          >
            <View style={styles.heroMainInfo}>
              <Text style={styles.heroLabel}>Total Spending</Text>
              <Text style={styles.heroValue}>Rs.{totalExpenses.toLocaleString()}</Text>
            </View>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>BILLS</Text>
                <Text style={styles.heroStatValue}>{bills.length}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>AVG</Text>
                <Text style={styles.heroStatValue}>
                  Rs.{bills.length > 0 ? (totalExpenses / bills.length).toFixed(0) : '0'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={styles.budgetSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="wallet-outline" size={18} color="#666" />
            <Text style={styles.sectionTitle}>Budget Progress</Text>
          </View>
          <BudgetSummary
            budgets={budgets}
            spending={categorySpending}
            onSetupPress={() => router.push('/budget-setup')}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Ionicons name="trending-up" size={18} color="#666" />
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>
        <View style={styles.actionRow}>
          <Animated.View entering={FadeInRight.delay(200).duration(600).springify()} style={{ flex: 1 }}>
            <TouchableOpacity
              style={[styles.actionButton, Shadows.soft]}
              onPress={() => router.push('/(tabs)/camera')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconBg, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="camera-outline" size={24} color="#666" />
              </View>
              <Text style={styles.actionText}>Scan Bill</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInRight.delay(300).duration(600).springify()} style={{ flex: 1 }}>
            <TouchableOpacity
              style={[styles.actionButton, Shadows.soft]}
              onPress={() => router.push('/categories')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconBg, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="folder-outline" size={24} color="#666" />
              </View>
              <Text style={styles.actionText}>Categories</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInRight.delay(400).duration(600).springify()} style={{ flex: 1 }}>
            <TouchableOpacity
              style={[styles.actionButton, Shadows.soft]}
              onPress={() => router.push('/bills-table')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconBg, { backgroundColor: '#FFFBEB' }]}>
                <Ionicons name="bar-chart-outline" size={24} color="#666" />
              </View>
              <Text style={styles.actionText}>Analytics</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <View style={styles.sectionHeader}>
              <Ionicons name="receipt-outline" size={18} color="#666" />
              <Text style={styles.sectionTitle}>Recent Activity</Text>
            </View>
          </View>
          {bills.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No bills found. Start scanning!</Text>
            </View>
          ) : (
            bills.slice(0, 5).map((bill, index) => (
              <RecentBillItem key={bill.id} bill={bill} index={index} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
    paddingTop: Spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    ...Typography.caption,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    ...Typography.h1,
  },
  mainHeroCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  heroMainInfo: {
    marginBottom: Spacing.lg,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  heroValue: {
    color: Colors.white,
    fontSize: 36,
    fontWeight: '800',
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  heroStatValue: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  heroStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: 8,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    marginBottom: 0, // Reset for header layout
  },
  budgetSection: {
    marginBottom: Spacing.xl,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.02)',
  },
  actionIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  actionText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  recentSection: {
    marginBottom: Spacing.xl,
  },
  recentHeader: {
    marginBottom: Spacing.xs,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.02)',
  },
  billClickArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  billInfo: {
    justifyContent: 'center',
    flex: 1,
  },
  billMerchant: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  billDate: {
    ...Typography.caption,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  activityItemWrapper: {
    marginBottom: Spacing.md,
  },
  billMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.border,
  },
  itemCategoryBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  itemCategoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
});
