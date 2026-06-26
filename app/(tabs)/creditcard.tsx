import { Config } from '@/constants/Config';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomAlert from '../components/CustomAlert';
import { CCStatement, CCStorage } from '@/utils/creditCardStorage';

const { width } = Dimensions.get('window');
const BACKEND_URL = Config.BACKEND_URL;

export default function CreditCardScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState('');
  const [statements, setStatements] = useState<CCStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<CCStatement | null>(null);
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'info' | 'success' | 'error';
    buttons?: any[];
  }>({ visible: false, title: '', message: '' });

  const loadData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      setUserId(session.user.id);
      const data = await CCStorage.getStatements(session.user.id);
      setStatements(data);
    } catch (e) {
      console.error('CC load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await loadData(); setRefreshing(false);
  }, [loadData]);

  const alerts = useMemo(() => CCStorage.generateAlerts(statements), [statements]);
  const analytics = useMemo(() => CCStorage.getMonthlyAnalytics(statements), [statements]);

  // ——— Upload & Analyze ——————————————————
  const pickAndAnalyze = async (useCamera: boolean) => {
    try {
      let result;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { setAlertConfig({ visible: true, title: 'Permission needed', message: 'Camera access required', type: 'error' }); return; }
        result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { setAlertConfig({ visible: true, title: 'Permission needed', message: 'Gallery access required', type: 'error' }); return; }
        result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8 });
      }

      if (result.canceled || !result.assets?.[0]?.base64) return;

      setAnalyzing(true);
      const response = await fetch(`${BACKEND_URL}/api/analyze-cc-statement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: result.assets[0].base64 }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const statement: CCStatement = {
        id: Date.now().toString(),
        user_id: userId,
        card_name: data.card_name || 'Unknown Card',
        card_last_4: data.card_last_4 || '',
        statement_date: data.statement_date || new Date().toISOString().split('T')[0],
        due_date: data.due_date || '',
        billing_period: data.billing_period || '',
        total_due: data.total_due || 0,
        minimum_due: data.minimum_due || 0,
        previous_balance: data.previous_balance || 0,
        payments_received: data.payments_received || 0,
        new_charges: data.new_charges || 0,
        interest_charged: data.interest_charged || 0,
        finance_charges: data.finance_charges || 0,
        late_fee: data.late_fee || 0,
        credit_limit: data.credit_limit || 0,
        available_credit: data.available_credit || 0,
        reward_points: data.reward_points || 0,
        revolving_balance: data.revolving_balance || 0,
        emi_details: data.emi_details || [],
        transaction_summary: data.transaction_summary || { total_debits: 0, total_credits: 0, transaction_count: 0, top_categories: [], top_merchants: [] },
        transactions: data.transactions || [],
        warnings: data.warnings || [],
        tips: data.tips || [],
        image_uri: result.assets[0].uri,
        created_at: new Date().toISOString(),
      };

      await CCStorage.saveStatement(statement);
      await loadData();
      setSelectedStatement(statement);
    } catch (e: any) {
      setAlertConfig({ visible: true, title: 'Error', message: e.message || 'Failed to analyze statement', type: 'error' });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDelete = (s: CCStatement) => {
    setAlertConfig({
      visible: true,
      title: 'Delete Statement',
      message: `Remove ${s.card_name} statement?`,
      type: 'error',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await CCStorage.deleteStatement(s.id);
            await loadData();
            setSelectedStatement(null);
          }
        }
      ]
    });
  };

  const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/more')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={'#0F172A'} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Card Analyzer</Text>
            <Text style={styles.headerSub}>Statement trends & alerts</Text>
          </View>
        </View>
        {/* Upload Buttons */}
        <View style={styles.uploadRow}>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickAndAnalyze(true)} disabled={analyzing}>
            <Ionicons name="camera-outline" size={20} color={Colors.primary} />
            <Text style={styles.uploadBtnText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickAndAnalyze(false)} disabled={analyzing}>
            <Text style={{ fontSize: 20, color: Colors.primary }}>🖼️</Text>
            <Text style={styles.uploadBtnText}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {/* Analyzing State */}
        {analyzing && (
          <View style={styles.analyzingCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.analyzingTitle}>Analyzing Statement...</Text>
            <Text style={styles.analyzingSub}>AI is extracting financial details</Text>
          </View>
        )}

        {/* Overspending Alerts */}
        {alerts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning-outline" size={16} color="#666" />
              <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>ALERTS</Text>
            </View>
            {alerts.map((a, i) => (
              <View key={i} style={styles.alertCard}>
                <Text style={styles.alertText}>{a}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Latest Statement Summary */}
        {statements.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="card-outline" size={16} color="#666" />
              <Text style={styles.sectionTitle}>LATEST STATEMENT</Text>
            </View>
            {(() => {
              const s = statements[0];
              const util = s.credit_limit > 0 ? (s.total_due / s.credit_limit) * 100 : 0;
              return (
                <View style={[styles.summaryCard, Shadows.soft]}>
                  <View style={styles.summaryHeader}>
                    <View>
                      <Text style={styles.summaryCardName}>{s.card_name}</Text>
                      {s.card_last_4 ? <Text style={styles.summaryCardNum}>•••• {s.card_last_4}</Text> : null}
                    </View>
                    {s.billing_period ? <Text style={styles.summaryPeriod}>{s.billing_period}</Text> : null}
                  </View>

                  <View style={styles.dueRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dueLabel}>Total Due</Text>
                      <Text style={styles.dueAmount}>{fmt(s.total_due)}</Text>
                    </View>
                    <View style={styles.dueDivider} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={styles.dueLabel}>Min Due</Text>
                      <Text style={[styles.dueAmount, { fontSize: 20 }]}>{fmt(s.minimum_due)}</Text>
                    </View>
                    <View style={styles.dueDivider} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.dueLabel}>Due Date</Text>
                      <Text style={[styles.dueAmount, { fontSize: 14 }]}>{s.due_date ? new Date(s.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'N/A'}</Text>
                    </View>
                  </View>

                  {/* Utilization Bar */}
                  <View style={styles.utilSection}>
                    <View style={styles.utilHeader}>
                      <Text style={styles.utilLabel}>Credit Utilization</Text>
                      <Text style={[styles.utilPercent, { color: util >= 75 ? '#EF4444' : util >= 50 ? '#F59E0B' : '#10B981' }]}>{util.toFixed(0)}%</Text>
                    </View>
                    <View style={styles.utilBarBg}>
                      <View style={[styles.utilBarFill, { width: `${Math.min(util, 100)}%`, backgroundColor: util >= 75 ? '#EF4444' : util >= 50 ? '#F59E0B' : '#10B981' }]} />
                    </View>
                    <View style={styles.utilAmounts}>
                      <Text style={styles.utilAmountText}>{fmt(s.total_due)} / {fmt(s.credit_limit)}</Text>
                    </View>
                  </View>

                  {/* Quick Stats Grid */}
                  <View style={styles.quickGrid}>
                    <View style={styles.quickItem}>
                      <Text style={styles.quickLabel}>Interest</Text>
                      <Text style={[styles.quickValue, { color: s.interest_charged > 0 ? '#EF4444' : '#10B981' }]}>{fmt(s.interest_charged)}</Text>
                    </View>
                    <View style={styles.quickItem}>
                      <Text style={styles.quickLabel}>New Charges</Text>
                      <Text style={styles.quickValue}>{fmt(s.new_charges)}</Text>
                    </View>
                    <View style={styles.quickItem}>
                      <Text style={styles.quickLabel}>Payments</Text>
                      <Text style={[styles.quickValue, { color: '#10B981' }]}>{fmt(s.payments_received)}</Text>
                    </View>
                    <View style={styles.quickItem}>
                      <Text style={styles.quickLabel}>Rewards</Text>
                      <Text style={[styles.quickValue, { color: '#6366F1' }]}>{s.reward_points?.toLocaleString() || '0'}</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.detailsBtn} onPress={() => setSelectedStatement(s)}>
                    <Text style={styles.detailsBtnText}>View Full Details</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              );
            })()}
          </View>
        )}

        {/* EMI Tracker */}
        {statements.length > 0 && statements[0].emi_details?.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="pie-chart-outline" size={16} color="#666" />
              <Text style={styles.sectionTitle}>EMI TRACKER</Text>
            </View>
            {statements[0].emi_details.map((emi, idx) => (
              <View key={idx} style={[styles.emiCard, Shadows.soft]}>
                <Text style={styles.emiDesc} numberOfLines={2}>{emi.description}</Text>
                <View style={styles.emiStatsRow}>
                  <View style={styles.emiStat}>
                    <Text style={styles.emiStatLabel}>Monthly EMI</Text>
                    <Text style={styles.emiStatValue}>{fmt(emi.emi_amount)}</Text>
                  </View>
                  <View style={styles.emiStat}>
                    <Text style={styles.emiStatLabel}>Remaining</Text>
                    <Text style={styles.emiStatValue}>{emi.remaining_emis} months</Text>
                  </View>
                  <View style={styles.emiStat}>
                    <Text style={styles.emiStatLabel}>Interest</Text>
                    <Text style={[styles.emiStatValue, { color: '#EF4444' }]}>{fmt(emi.interest)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Monthly Analytics */}
        {analytics.length >= 2 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="trending-up" size={16} color="#666" />
              <Text style={styles.sectionTitle}>MONTHLY TRENDS</Text>
            </View>
            {analytics.slice(0, 6).map((m, idx) => (
              <View key={idx} style={[styles.trendRow, Shadows.soft]}>
                <Text style={styles.trendMonth}>{m.month}</Text>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <View style={styles.trendBarBg}>
                    <View style={[styles.trendBarFill, { width: `${Math.min((m.totalDue / (analytics[0]?.totalDue || 1)) * 100, 100)}%` }]} />
                  </View>
                </View>
                <View style={styles.trendAmounts}>
                  <Text style={styles.trendDue}>{fmt(m.totalDue)}</Text>
                  {m.interest > 0 && <Text style={styles.trendInterest}>Int: {fmt(m.interest)}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Statement History */}
        {statements.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="sparkles-outline" size={16} color="#666" />
              <Text style={styles.sectionTitle}>STATEMENT HISTORY</Text>
            </View>
            {statements.map(s => (
              <TouchableOpacity key={s.id} style={[styles.historyRow, Shadows.soft]} onPress={() => setSelectedStatement(s)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyCardName}>{s.card_name}</Text>
                  <Text style={styles.historyDate}>{new Date(s.statement_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                </View>
                <Text style={styles.historyAmount}>{fmt(s.total_due)}</Text>
                <TouchableOpacity onPress={() => handleDelete(s)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="trash-outline" size={16} color={Colors.error} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Empty State */}
        {statements.length === 0 && !analyzing && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>(CC)</Text>
            <Text style={styles.emptyTitle}>No Statements Yet</Text>
            <Text style={styles.emptySub}>Upload a credit card statement to get instant analysis</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={!!selectedStatement} animationType="slide" transparent onRequestClose={() => setSelectedStatement(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, Shadows.medium]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📊 Statement Details</Text>
              <TouchableOpacity onPress={() => setSelectedStatement(null)}><Ionicons name="close" size={24} color={'#0F172A'} /></TouchableOpacity>
            </View>
            {selectedStatement && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Card Info */}
                <LinearGradient colors={['#1E293B', '#334155']} style={styles.detailCardBanner}>
                  <Text style={styles.detailCardName}>{selectedStatement.card_name}</Text>
                  {selectedStatement.card_last_4 ? <Text style={styles.detailCardNum}>**** **** **** {selectedStatement.card_last_4}</Text> : null}
                  <Text style={styles.detailPeriod}>{selectedStatement.billing_period}</Text>
                </LinearGradient>

                {/* Key Figures */}
                <View style={styles.detailGrid}>
                  {[
                    { l: 'Total Due', v: fmt(selectedStatement.total_due), c: '#0F172A' },
                    { l: 'Minimum Due', v: fmt(selectedStatement.minimum_due), c: '#F59E0B' },
                    { l: 'Previous Balance', v: fmt(selectedStatement.previous_balance), c: '#0F172A' },
                    { l: 'Payments', v: fmt(selectedStatement.payments_received), c: '#10B981' },
                    { l: 'New Charges', v: fmt(selectedStatement.new_charges), c: '#0F172A' },
                    { l: 'Interest', v: fmt(selectedStatement.interest_charged), c: '#EF4444' },
                    { l: 'Finance Charges', v: fmt(selectedStatement.finance_charges), c: '#EF4444' },
                    { l: 'Late Fee', v: fmt(selectedStatement.late_fee), c: '#EF4444' },
                    { l: 'Credit Limit', v: fmt(selectedStatement.credit_limit), c: '#0F172A' },
                    { l: 'Available Credit', v: fmt(selectedStatement.available_credit), c: '#10B981' },
                    { l: 'Revolving Balance', v: fmt(selectedStatement.revolving_balance), c: '#F59E0B' },
                    { l: 'Reward Points', v: (selectedStatement.reward_points || 0).toLocaleString(), c: '#6366F1' },
                  ].map((item, idx) => (
                    <View key={idx} style={styles.detailItem}>
                      <Text style={styles.detailItemLabel}>{item.l}</Text>
                      <Text style={[styles.detailItemValue, { color: item.c }]}>{item.v}</Text>
                    </View>
                  ))}
                </View>

                {/* Top Categories */}
                {selectedStatement.transaction_summary?.top_categories?.length > 0 && (
                  <>
                    <Text style={styles.detailSectionTitle}>Top Spending Categories</Text>
                    {selectedStatement.transaction_summary.top_categories.map((cat, idx) => (
                      <View key={idx} style={styles.detailCatRow}>
                        <Text style={styles.detailCatName}>{cat.category}</Text>
                        <Text style={styles.detailCatAmount}>{fmt(cat.amount)}</Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Transactions */}
                {selectedStatement.transactions?.length > 0 && (
                  <>
                    <Text style={styles.detailSectionTitle}>Transactions ({selectedStatement.transactions.length})</Text>
                    {selectedStatement.transactions.slice(0, 20).map((txn, idx) => (
                      <View key={idx} style={styles.txnRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.txnDesc} numberOfLines={1}>{txn.description}</Text>
                          <Text style={styles.txnMeta}>{txn.date} * {txn.category}</Text>
                        </View>
                        <Text style={[styles.txnAmount, { color: txn.type === 'credit' ? '#10B981' : '#0F172A' }]}>
                          {txn.type === 'credit' ? '+' : '-'}{fmt(txn.amount)}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Warnings & Tips */}
                {selectedStatement.warnings?.length > 0 && (
                  <>
                    <Text style={styles.detailSectionTitle}>⚠️ Warnings</Text>
                    {selectedStatement.warnings.map((w, i) => (
                      <View key={i} style={styles.warningCard}><Text style={styles.warningText}>{w}</Text></View>
                    ))}
                  </>
                )}
                {selectedStatement.tips?.length > 0 && (
                  <>
                    <Text style={styles.detailSectionTitle}>💡 Tips</Text>
                    {selectedStatement.tips.map((t, i) => (
                      <View key={i} style={styles.tipCard}><Text style={styles.tipText}>{t}</Text></View>
                    ))}
                  </>
                )}

                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      <CustomAlert
        {...alertConfig}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { paddingBottom: 20 },

  header: {
    backgroundColor: '#FFF',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...Shadows.soft,
    marginBottom: Spacing.lg,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginRight: 14 },

  uploadRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  uploadBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: '#E2E8F0' },
  uploadBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },

  analyzingCard: { alignItems: 'center', padding: Spacing.xl, margin: Spacing.lg, backgroundColor: '#FFF', borderRadius: BorderRadius.lg, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.primary },
  analyzingTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  analyzingSub: { fontSize: 13, color: '#666' },

  section: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
  sectionTitle: { ...Typography.sectionTitle, marginBottom: 0 },

  alertCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderLeftWidth: 3, borderLeftColor: Colors.error, borderTopWidth: 1, borderTopColor: '#E2E8F0', borderRightWidth: 1, borderRightColor: '#E2E8F0', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  alertText: { fontSize: 13, color: '#7F1D1D', lineHeight: 19 },

  // Summary Card
  summaryCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: '#E2E8F0' },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  summaryCardName: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  summaryCardNum: { fontSize: 13, color: '#666', marginTop: 2 },
  summaryPeriod: { fontSize: 11, color: '#666', backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

  dueRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  dueLabel: { fontSize: 11, color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  dueAmount: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginTop: 4 },
  dueDivider: { width: 1, height: 40, backgroundColor: '#E2E8F0', marginHorizontal: 8 },

  utilSection: { marginBottom: Spacing.md },
  utilHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  utilLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  utilPercent: { fontSize: 14, fontWeight: '800' },
  utilBarBg: { height: 10, backgroundColor: '#E2E8F0', borderRadius: 5, overflow: 'hidden' },
  utilBarFill: { height: '100%', borderRadius: 5 },
  utilAmounts: { marginTop: 4 },
  utilAmountText: { fontSize: 11, color: '#666' },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  quickItem: { flex: 1, minWidth: (width - 80) / 2, backgroundColor: '#F1F5F9', borderRadius: BorderRadius.md, padding: Spacing.sm + 2, alignItems: 'center' },
  quickLabel: { fontSize: 10, color: '#666', fontWeight: '600', textTransform: 'uppercase' },
  quickValue: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 2 },

  detailsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  detailsBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  // EMI
  emiCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: '#E2E8F0' },
  emiDesc: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  emiStatsRow: { flexDirection: 'row', gap: Spacing.md },
  emiStat: {},
  emiStatLabel: { fontSize: 10, color: '#666', fontWeight: '600', textTransform: 'uppercase' },
  emiStatValue: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 2 },

  // Trends
  trendRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: '#E2E8F0' },
  trendMonth: { fontSize: 12, fontWeight: '700', color: '#0F172A', width: 50 },
  trendBarBg: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  trendBarFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.primary },
  trendAmounts: { alignItems: 'flex-end', width: 80 },
  trendDue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  trendInterest: { fontSize: 10, color: '#EF4444' },

  // History
  historyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md, borderWidth: 1, borderColor: '#E2E8F0' },
  historyCardName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  historyDate: { fontSize: 12, color: '#666', marginTop: 2 },
  historyAmount: { fontSize: 16, fontWeight: '800', color: '#0F172A' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xxl * 2, paddingHorizontal: Spacing.lg },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: Spacing.md },
  emptySub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },

  detailCardBanner: { borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.lg },
  detailCardName: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  detailCardNum: { fontSize: 16, color: 'rgba(255,255,255,0.6)', marginTop: 4, letterSpacing: 2 },
  detailPeriod: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8 },

  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  detailItem: { width: (width - 80) / 2, backgroundColor: '#F1F5F9', borderRadius: BorderRadius.md, padding: Spacing.sm + 2 },
  detailItemLabel: { fontSize: 10, color: '#666', fontWeight: '600', textTransform: 'uppercase' },
  detailItemValue: { fontSize: 15, fontWeight: '800', marginTop: 2 },

  detailSectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginTop: Spacing.lg, marginBottom: Spacing.sm },

  detailCatRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  detailCatName: { fontSize: 14, color: '#0F172A' },
  detailCatAmount: { fontSize: 14, fontWeight: '700', color: '#0F172A' },

  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  txnDesc: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  txnMeta: { fontSize: 11, color: '#666', marginTop: 2 },
  txnAmount: { fontSize: 14, fontWeight: '700', marginLeft: 8 },

  warningCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.sm + 2, marginBottom: 6, borderWidth: 1, borderColor: Colors.error },
  warningText: { fontSize: 13, color: Colors.error, lineHeight: 18 },
  tipCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.sm + 2, marginBottom: 6, borderWidth: 1, borderColor: Colors.success },
  tipText: { fontSize: 13, color: '#065F46', lineHeight: 18 },
});

