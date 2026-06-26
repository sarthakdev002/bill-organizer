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
import { StockStatement, StockStorage } from '@/utils/stockStorage';

const { width } = Dimensions.get('window');
const BACKEND_URL = Config.BACKEND_URL;

export default function StocksScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState('');
  const [statements, setStatements] = useState<StockStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<StockStatement | null>(null);
  const [detailTab, setDetailTab] = useState<'holdings' | 'transactions' | 'tax'>('holdings');
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
      const data = await StockStorage.getStatements(session.user.id);
      setStatements(data);
    } catch (e) { console.error('Stock load error:', e); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [loadData]);

  const latest = statements.length > 0 ? statements[0] : null;
  const pnl = useMemo(() => latest ? StockStorage.getAggregatedPnL(statements) : null, [statements]);
  const portfolio = useMemo(() => latest ? StockStorage.getPortfolioInsights(latest) : null, [latest]);

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
      const response = await fetch(`${BACKEND_URL}/api/analyze-brokerage-statement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: result.assets[0].base64 }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const statement: StockStatement = {
        id: Date.now().toString(),
        user_id: userId,
        broker_name: data.broker_name || 'Unknown Broker',
        account_id: data.account_id,
        statement_period: data.statement_period,
        statement_date: data.statement_date || new Date().toISOString().split('T')[0],
        transactions: data.transactions || [],
        holdings: data.holdings || [],
        charges_summary: data.charges_summary || { total_brokerage: 0, stt: 0, transaction_charges: 0, gst: 0, sebi_charges: 0, stamp_duty: 0, total_charges: 0 },
        pnl_summary: data.pnl_summary || { realized_pnl: 0, unrealized_pnl: 0, total_invested: 0, current_value: 0, total_returns: 0, total_returns_percent: 0 },
        tax_summary: data.tax_summary || { stcg_profit: 0, stcg_tax_estimate: 0, ltcg_profit: 0, ltcg_tax_estimate: 0, stcg_holdings: [], ltcg_holdings: [] },
        portfolio_allocation: data.portfolio_allocation || [],
        insights: data.insights || [],
        risks: data.risks || [],
        image_uri: result.assets[0].uri,
        created_at: new Date().toISOString(),
      };

      await StockStorage.saveStatement(statement);
      await loadData();
      setSelectedStatement(statement);
    } catch (e: any) {
      setAlertConfig({ visible: true, title: 'Error', message: e.message || 'Failed to analyze statement', type: 'error' });
    } finally { setAnalyzing(false); }
  };

  const handleDelete = (s: StockStatement) => {
    setAlertConfig({
      visible: true,
      title: 'Delete Statement',
      message: `Remove ${s.broker_name} statement?`,
      type: 'error',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await StockStorage.deleteStatement(s.id);
            await loadData();
            setSelectedStatement(null);
          }
        }
      ]
    });
  };

  const fmt = (n: number) => `Rs.${(n || 0).toLocaleString('en-IN')}`;
  const pnlColor = (n: number) => n >= 0 ? '#10B981' : '#EF4444';

  if (loading) {
    return <SafeAreaView style={styles.container}><View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={Colors.primary} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {/* Header */}
        <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/more')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={'#0F172A'} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Stock Portfolio</Text>
            <Text style={styles.headerSub}>Holdings & tax analysis</Text>
          </View>
        </View>
        <View style={styles.uploadRow}>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickAndAnalyze(true)} disabled={analyzing}>
            <Ionicons name="camera-outline" size={20} color={'#FFF'} /><Text style={styles.uploadText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickAndAnalyze(false)} disabled={analyzing}>
            <Text style={{ fontSize: 20, color: '#FFF' }}>🖼️</Text><Text style={styles.uploadText}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {analyzing && (
          <View style={styles.analyzingCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.analyzingTitle}>Analyzing Statement...</Text>
            <Text style={styles.analyzingSub}>Extracting transactions, P&L, and tax data</Text>
          </View>
        )}

        {/* P&L Overview */}
        {pnl && latest && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="trending-up" size={16} color="#666" />
              <Text style={styles.sectionTitle}>P&L OVERVIEW</Text>
            </View>
            <View style={[styles.pnlCard, Shadows.soft]}>
              <View style={styles.pnlMainRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pnlLabel}>Total Returns</Text>
                  <Text style={[styles.pnlBig, { color: pnlColor(pnl.total_returns) }]}>{fmt(pnl.total_returns)}</Text>
                  <Text style={[styles.pnlPercent, { color: pnlColor(pnl.total_returns_percent) }]}>
                    {pnl.total_returns_percent >= 0 ? '^' : 'v'} {Math.abs(pnl.total_returns_percent).toFixed(2)}%
                  </Text>
                </View>
                <View style={styles.pnlDivider} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.pnlLabel}>Invested</Text>
                  <Text style={styles.pnlValue}>{fmt(pnl.total_invested)}</Text>
                  <Text style={styles.pnlLabel}>Current</Text>
                  <Text style={styles.pnlValue}>{fmt(pnl.current_value)}</Text>
                </View>
              </View>
              <View style={styles.pnlRow2}>
                <View style={styles.pnlMiniCard}>
                  <Text style={styles.pnlMiniLabel}>Realized P&L</Text>
                  <Text style={[styles.pnlMiniValue, { color: pnlColor(pnl.realized_pnl) }]}>{fmt(pnl.realized_pnl)}</Text>
                </View>
                <View style={styles.pnlMiniCard}>
                  <Text style={styles.pnlMiniLabel}>Unrealized P&L</Text>
                  <Text style={[styles.pnlMiniValue, { color: pnlColor(pnl.unrealized_pnl) }]}>{fmt(pnl.unrealized_pnl)}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Tax Summary */}
        {latest?.tax_summary && (latest.tax_summary.stcg_profit > 0 || latest.tax_summary.ltcg_profit > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="stats-chart" size={16} color={'#666'} />
              <Text style={styles.sectionTitle}>TAX REPORT</Text>
            </View>
            <View style={styles.taxGrid}>
              <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={styles.taxCard}>
                <Text style={styles.taxCardTitle}>STCG (Short Term)</Text>
                <Text style={styles.taxCardProfit}>{fmt(latest.tax_summary.stcg_profit)}</Text>
                <Text style={styles.taxCardTax}>Est. Tax: {fmt(latest.tax_summary.stcg_tax_estimate)}</Text>
                <Text style={styles.taxCardRate}>@ 20%</Text>
              </LinearGradient>
              <LinearGradient colors={['#DBEAFE', '#BFDBFE']} style={styles.taxCard}>
                <Text style={styles.taxCardTitle}>LTCG (Long Term)</Text>
                <Text style={styles.taxCardProfit}>{fmt(latest.tax_summary.ltcg_profit)}</Text>
                <Text style={styles.taxCardTax}>Est. Tax: {fmt(latest.tax_summary.ltcg_tax_estimate)}</Text>
                <Text style={styles.taxCardRate}>@ 12.5% above Rs.1.25L</Text>
              </LinearGradient>
            </View>
          </View>
        )}

        {/* Portfolio Allocation */}
        {latest?.portfolio_allocation && latest.portfolio_allocation.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="pie-chart-outline" size={16} color="#666" />
              <Text style={styles.sectionTitle}>PORTFOLIO ALLOCATION</Text>
            </View>
            {latest.portfolio_allocation.map((sec, idx) => {
              const barColors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6'];
              return (
                <View key={idx} style={styles.allocRow}>
                  <View style={[styles.allocDot, { backgroundColor: barColors[idx % barColors.length] }]} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.allocHeader}>
                      <Text style={styles.allocSector}>{sec.sector}</Text>
                      <Text style={styles.allocPercent}>{sec.percent.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.allocBarBg}>
                      <View style={[styles.allocBarFill, { width: `${sec.percent}%`, backgroundColor: barColors[idx % barColors.length] }]} />
                    </View>
                  </View>
                  <Text style={styles.allocValue}>{fmt(sec.value)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Top Gainers & Losers */}
        {portfolio && (portfolio.topGainers.length > 0 || portfolio.topLosers.length > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="sparkles" size={16} color={'#666'} />
              <Text style={styles.sectionTitle}>TOP MOVERS</Text>
            </View>
            {portfolio.topGainers.length > 0 && (
              <>
                <Text style={styles.moverLabel}>[+] Top Gainers</Text>
                {portfolio.topGainers.map((h, i) => (
                  <View key={i} style={[styles.moverRow, Shadows.soft]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.moverSymbol}>{h.symbol}</Text>
                      <Text style={styles.moverName} numberOfLines={1}>{h.name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.moverPnl, { color: '#10B981' }]}>+{fmt(h.pnl)}</Text>
                      <Text style={styles.moverPercent}>^ {h.pnl_percent.toFixed(1)}%</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
            {portfolio.topLosers.length > 0 && (
              <>
                <Text style={[styles.moverLabel, { marginTop: Spacing.md }]}>[-] Top Losers</Text>
                {portfolio.topLosers.map((h, i) => (
                  <View key={i} style={[styles.moverRow, Shadows.soft]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.moverSymbol}>{h.symbol}</Text>
                      <Text style={styles.moverName} numberOfLines={1}>{h.name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.moverPnl, { color: '#EF4444' }]}>{fmt(h.pnl)}</Text>
                      <Text style={[styles.moverPercent, { color: '#EF4444' }]}>v {Math.abs(h.pnl_percent).toFixed(1)}%</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* Charges Summary */}
        {latest?.charges_summary && latest.charges_summary.total_charges > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning-outline" size={16} color="#666" />
              <Text style={styles.sectionTitle}>CHARGES & BROKERAGE</Text>
            </View>
            <View style={[styles.chargesCard, Shadows.soft]}>
              {[
                { l: 'Brokerage', v: latest.charges_summary.total_brokerage },
                { l: 'STT', v: latest.charges_summary.stt },
                { l: 'Transaction Charges', v: latest.charges_summary.transaction_charges },
                { l: 'GST', v: latest.charges_summary.gst },
                { l: 'SEBI Charges', v: latest.charges_summary.sebi_charges },
                { l: 'Stamp Duty', v: latest.charges_summary.stamp_duty },
              ].filter(x => x.v > 0).map((item, idx) => (
                <View key={idx} style={styles.chargeRow}>
                  <Text style={styles.chargeLabel}>{item.l}</Text>
                  <Text style={styles.chargeValue}>{fmt(item.v)}</Text>
                </View>
              ))}
              <View style={[styles.chargeRow, { borderTopWidth: 1.5, borderTopColor: '#E2E8F0', paddingTop: 8, marginTop: 4 }]}>
                <Text style={[styles.chargeLabel, { fontWeight: '800' }]}>Total Charges</Text>
                <Text style={[styles.chargeValue, { fontWeight: '800', color: '#EF4444' }]}>{fmt(latest.charges_summary.total_charges)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Insights & Risks */}
        {latest?.insights && latest.insights.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="sparkles" size={16} color={'#666'} />
              <Text style={styles.sectionTitle}>AI INSIGHTS</Text>
            </View>
            {latest.insights.map((tip, i) => (
              <View key={i} style={styles.insightCard}><Text style={styles.insightText}>[Tip] {tip}</Text></View>
            ))}
            {latest.risks?.map((risk, i) => (
              <View key={i} style={styles.riskCard}><Text style={styles.riskText}>⚠️ {risk}</Text></View>
            ))}
          </View>
        )}

        {/* Statement History */}
        {statements.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="stats-chart" size={16} color={'#666'} />
              <Text style={styles.sectionTitle}>STATEMENT HISTORY</Text>
            </View>
            {statements.map(s => (
              <TouchableOpacity key={s.id} style={[styles.historyRow, Shadows.soft]} onPress={() => { setSelectedStatement(s); setDetailTab('holdings'); }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyBroker}>{s.broker_name}</Text>
                  <Text style={styles.historyPeriod}>{s.statement_period || new Date(s.statement_date).toLocaleDateString('en-IN')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: Spacing.sm }}>
                  <Text style={[styles.historyPnl, { color: pnlColor(s.pnl_summary.total_returns) }]}>{fmt(s.pnl_summary.total_returns)}</Text>
                  <Text style={styles.historyHoldings}>{s.holdings.length} holdings</Text>
                </View>
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
            <Text style={styles.emptyIcon}>(Analytics)</Text>
            <Text style={styles.emptyTitle}>No Statements Yet</Text>
            <Text style={styles.emptySub}>Upload a brokerage statement to get P&L analysis, tax reports, and portfolio insights</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={!!selectedStatement} animationType="slide" transparent onRequestClose={() => setSelectedStatement(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, Shadows.medium]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>(Analytics) {selectedStatement?.broker_name}</Text>
              <TouchableOpacity onPress={() => setSelectedStatement(null)}><Ionicons name="close" size={24} color={'#0F172A'} /></TouchableOpacity>
            </View>

            {/* Tab Switcher */}
            <View style={styles.tabRow}>
              {(['holdings', 'transactions', 'tax'] as const).map(t => (
                <TouchableOpacity key={t} style={[styles.tab, detailTab === t && styles.tabActive]} onPress={() => setDetailTab(t)}>
                  <Text style={[styles.tabText, detailTab === t && styles.tabTextActive]}>
                    {t === 'holdings' ? 'Holdings' : t === 'transactions' ? 'Transactions' : 'Tax Report'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedStatement && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Holdings Tab */}
                {detailTab === 'holdings' && (
                  <>
                    {selectedStatement.holdings.length === 0 ? (
                      <Text style={styles.noDataText}>No holdings data extracted</Text>
                    ) : (
                      selectedStatement.holdings.map((h, idx) => (
                        <View key={idx} style={styles.holdingCard}>
                          <View style={styles.holdingHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.holdingSymbol}>{h.symbol}</Text>
                              <Text style={styles.holdingName} numberOfLines={1}>{h.name}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={[styles.holdingPnl, { color: pnlColor(h.pnl) }]}>
                                {h.pnl >= 0 ? '+' : ''}{fmt(h.pnl)}
                              </Text>
                              <Text style={[styles.holdingPnlPct, { color: pnlColor(h.pnl_percent) }]}>
                                {h.pnl_percent >= 0 ? '^' : 'v'} {Math.abs(h.pnl_percent).toFixed(1)}%
                              </Text>
                            </View>
                          </View>
                          <View style={styles.holdingStatsRow}>
                            <Text style={styles.holdingStat}>Qty: {h.quantity}</Text>
                            <Text style={styles.holdingStat}>Avg: {fmt(h.avg_buy_price)}</Text>
                            <Text style={styles.holdingStat}>CMP: {fmt(h.current_price)}</Text>
                            <Text style={styles.holdingStat}>Val: {fmt(h.current_value)}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </>
                )}

                {/* Transactions Tab */}
                {detailTab === 'transactions' && (
                  <>
                    {selectedStatement.transactions.length === 0 ? (
                      <Text style={styles.noDataText}>No transactions extracted</Text>
                    ) : (
                      selectedStatement.transactions.map((txn, idx) => (
                        <View key={idx} style={styles.txnCard}>
                          <View style={styles.txnHeader}>
                            <View style={[styles.txnTypeBadge, { backgroundColor: '#FFF', borderWidth: 1, borderColor: txn.type === 'buy' ? Colors.success : Colors.error }]}>
                              <Text style={[styles.txnTypeText, { color: txn.type === 'buy' ? Colors.success : Colors.error }]}>
                                {txn.type === 'buy' ? '^ BUY' : 'v SELL'}
                              </Text>
                            </View>
                            <Text style={styles.txnDate}>{txn.date}</Text>
                          </View>
                          <Text style={styles.txnSymbol}>{txn.symbol} - {txn.name}</Text>
                          <View style={styles.txnDetailsRow}>
                            <Text style={styles.txnDetail}>{txn.quantity} x {fmt(txn.price)}</Text>
                            <Text style={styles.txnAmount}>{fmt(txn.net_amount)}</Text>
                          </View>
                          {txn.brokerage > 0 && (
                            <Text style={styles.txnCharges}>Brokerage: {fmt(txn.brokerage)} - Charges: {fmt(txn.charges)}</Text>
                          )}
                        </View>
                      ))
                    )}
                  </>
                )}

                {/* Tax Tab */}
                {detailTab === 'tax' && (
                  <>
                    <View style={styles.taxDetailGrid}>
                      <View style={[styles.taxDetailCard, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={styles.taxDetailTitle}>STCG Profit</Text>
                        <Text style={styles.taxDetailAmount}>{fmt(selectedStatement.tax_summary.stcg_profit)}</Text>
                        <Text style={styles.taxDetailTax}>Tax @ 20%: {fmt(selectedStatement.tax_summary.stcg_tax_estimate)}</Text>
                      </View>
                      <View style={[styles.taxDetailCard, { backgroundColor: '#DBEAFE' }]}>
                        <Text style={styles.taxDetailTitle}>LTCG Profit</Text>
                        <Text style={styles.taxDetailAmount}>{fmt(selectedStatement.tax_summary.ltcg_profit)}</Text>
                        <Text style={styles.taxDetailTax}>Tax @ 12.5%: {fmt(selectedStatement.tax_summary.ltcg_tax_estimate)}</Text>
                      </View>
                    </View>

                    {selectedStatement.tax_summary.stcg_holdings?.length > 0 && (
                      <>
                        <Text style={styles.taxHoldingTitle}>STCG Holdings (&lt;12 months)</Text>
                        {selectedStatement.tax_summary.stcg_holdings.map((h, i) => (
                          <View key={i} style={styles.taxHoldingRow}>
                            <Text style={styles.taxHoldingSymbol}>{h.symbol}</Text>
                            <Text style={styles.taxHoldingDays}>{h.holding_days}d</Text>
                            <Text style={[styles.taxHoldingProfit, { color: pnlColor(h.profit) }]}>{fmt(h.profit)}</Text>
                          </View>
                        ))}
                      </>
                    )}
                    {selectedStatement.tax_summary.ltcg_holdings?.length > 0 && (
                      <>
                        <Text style={styles.taxHoldingTitle}>LTCG Holdings ({'>='}12 months)</Text>
                        {selectedStatement.tax_summary.ltcg_holdings.map((h, i) => (
                          <View key={i} style={styles.taxHoldingRow}>
                            <Text style={styles.taxHoldingSymbol}>{h.symbol}</Text>
                            <Text style={styles.taxHoldingDays}>{h.holding_days}d</Text>
                            <Text style={[styles.taxHoldingProfit, { color: pnlColor(h.profit) }]}>{fmt(h.profit)}</Text>
                          </View>
                        ))}
                      </>
                    )}
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
  uploadText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },

  analyzingCard: { alignItems: 'center', padding: Spacing.xl, margin: Spacing.lg, backgroundColor: '#FFF', borderRadius: BorderRadius.lg, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.primary },
  analyzingTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  analyzingSub: { fontSize: 13, color: '#666' },

  section: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
  sectionTitle: { ...Typography.sectionTitle, marginBottom: 0 },

  // P&L Card
  pnlCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: '#E2E8F0' },
  pnlMainRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  pnlLabel: { fontSize: 11, color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  pnlBig: { fontSize: 28, fontWeight: '800' },
  pnlPercent: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  pnlDivider: { width: 1, height: 60, backgroundColor: '#E2E8F0', marginHorizontal: Spacing.md },
  pnlValue: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  pnlRow2: { flexDirection: 'row', gap: Spacing.sm },
  pnlMiniCard: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: BorderRadius.md, padding: Spacing.sm + 2, alignItems: 'center' },
  pnlMiniLabel: { fontSize: 10, color: '#666', fontWeight: '600', textTransform: 'uppercase' },
  pnlMiniValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },

  // Tax
  taxGrid: { flexDirection: 'row', gap: Spacing.sm },
  taxCard: { flex: 1, borderRadius: BorderRadius.lg, padding: Spacing.md },
  taxCardTitle: { fontSize: 11, fontWeight: '700', color: '#0F172A', letterSpacing: 0.5, marginBottom: 4 },
  taxCardProfit: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  taxCardTax: { fontSize: 12, fontWeight: '600', color: '#666', marginTop: 4 },
  taxCardRate: { fontSize: 10, color: '#666', marginTop: 2 },

  // Allocation
  allocRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  allocDot: { width: 10, height: 10, borderRadius: 5 },
  allocHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  allocSector: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  allocPercent: { fontSize: 12, fontWeight: '700', color: '#666' },
  allocBarBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  allocBarFill: { height: '100%', borderRadius: 3 },
  allocValue: { fontSize: 13, fontWeight: '700', color: '#0F172A', width: 80, textAlign: 'right' },

  // Movers
  moverLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  moverRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: '#E2E8F0' },
  moverSymbol: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  moverName: { fontSize: 11, color: '#666', marginTop: 2 },
  moverPnl: { fontSize: 15, fontWeight: '700' },
  moverPercent: { fontSize: 11, color: '#10B981', fontWeight: '600', marginTop: 2 },

  // Charges
  chargesCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#E2E8F0' },
  chargeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  chargeLabel: { fontSize: 13, color: '#0F172A' },
  chargeValue: { fontSize: 13, fontWeight: '600', color: '#0F172A' },

  // Insights
  insightCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.sm + 2, marginBottom: 6, borderWidth: 1, borderColor: Colors.primary },
  insightText: { fontSize: 13, color: Colors.primary, lineHeight: 18 },
  riskCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.sm + 2, marginBottom: 6, borderWidth: 1, borderColor: Colors.error },
  riskText: { fontSize: 13, color: Colors.error, lineHeight: 18 },

  // History
  historyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: '#E2E8F0' },
  historyBroker: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  historyPeriod: { fontSize: 12, color: '#666', marginTop: 2 },
  historyPnl: { fontSize: 15, fontWeight: '700' },
  historyHoldings: { fontSize: 11, color: '#666', marginTop: 2 },

  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xxl * 2, paddingHorizontal: Spacing.lg },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: Spacing.md },
  emptySub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },

  tabRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  tab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: '#F1F5F9', alignItems: 'center' },
  tabActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: '#666' },
  tabTextActive: { color: '#4F46E5', fontWeight: '700' },

  noDataText: { fontSize: 14, color: '#666', fontStyle: 'italic', textAlign: 'center', paddingVertical: Spacing.xl },

  // Holdings detail
  holdingCard: { backgroundColor: '#F1F5F9', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  holdingHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  holdingSymbol: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  holdingName: { fontSize: 11, color: '#666', marginTop: 2 },
  holdingPnl: { fontSize: 15, fontWeight: '700' },
  holdingPnlPct: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  holdingStatsRow: { flexDirection: 'row', gap: Spacing.md },
  holdingStat: { fontSize: 11, color: '#666', fontWeight: '500' },

  // Transaction detail
  txnCard: { backgroundColor: '#F1F5F9', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  txnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  txnTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  txnTypeText: { fontSize: 11, fontWeight: '700' },
  txnDate: { fontSize: 11, color: '#666' },
  txnSymbol: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  txnDetailsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  txnDetail: { fontSize: 12, color: '#666' },
  txnAmount: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  txnCharges: { fontSize: 10, color: '#666', marginTop: 4 },

  // Tax Detail
  taxDetailGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  taxDetailCard: { flex: 1, borderRadius: BorderRadius.md, padding: Spacing.md },
  taxDetailTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: '#0F172A' },
  taxDetailAmount: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 4 },
  taxDetailTax: { fontSize: 12, fontWeight: '600', color: '#666', marginTop: 4 },
  taxHoldingTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: Spacing.md, marginBottom: 8 },
  taxHoldingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  taxHoldingSymbol: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0F172A' },
  taxHoldingDays: { fontSize: 12, color: '#666', width: 50, textAlign: 'center' },
  taxHoldingProfit: { fontSize: 14, fontWeight: '700', width: 80, textAlign: 'right' },
});

