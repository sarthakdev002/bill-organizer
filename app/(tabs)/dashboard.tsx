import { Budget } from '@/types/budget';
import { BudgetCalculator } from '@/utils/budgetCalculator';
import { BudgetNotificationService } from '@/utils/budgetNotifications';
import { BudgetStorage } from '@/utils/budgetStorage';
import { Config } from '@/constants/Config';
import { Colors, Shadows, Spacing } from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as XLSX from 'xlsx';
import CustomAlert from '../components/CustomAlert';

const { width } = Dimensions.get('window');

interface Bill {
  id: string;
  category: string;
  amount: number;
  merchant_name?: string;
  created_at: string;
  gst?: string | null;
  invoice_date?: string | null;
  invoice_number?: string | null;
  user_id: string;
  uri?: string;
  payment_mode?: string;
  payment_timestamp?: string; // Corrected lint error
  total_tax?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  vendor_address?: string;
  enrichment_data?: any;
}

export default function DashboardScreen() {


  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categorySpending, setCategorySpending] = useState<any[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'info' | 'success' | 'error';
  }>({ visible: false, title: '', message: '' });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: authData, error: authError } = await supabase.auth.getSession();

      if (authError) {
        console.error('Dashboard Auth Error:', authError);
        setAlertConfig({ visible: true, title: 'Auth Error', message: 'Failed to get session. Please log in again.', type: 'error' });
        return;
      }

      const session = authData?.session;
      if (!session?.user) {
        console.warn('Dashboard: No active session found');
        return;
      }

      // Direct Supabase fetch only - no backend proxy
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Dashboard] Supabase fetch error:', error);
        setAlertConfig({
          visible: true,
          title: 'Database Error',
          message: error.message || 'Failed to load bills from database',
          type: 'error'
        });
        return;
      }

      const billsData = (data as unknown as Bill[]) || [];
      console.log(`[Dashboard] Loaded ${billsData.length} bills successfully`);
      setBills(billsData);

      const userBudgets = await BudgetStorage.getBudgets(session.user.id);
      setBudgets(userBudgets);

      const spending = await BudgetCalculator.calculateCategorySpending(session.user.id, userBudgets, billsData);
      setCategorySpending(spending);

      Promise.resolve().then(async () => {
        for (const cs of spending) {
          const budget = userBudgets.find(b => b.category === cs.category);
          if (budget && budget.amount > 0) {
            await BudgetNotificationService.checkBudgetAlerts(session.user.id, cs.category, cs.spent, budget);
          }
        }
      });
    } catch (e: any) {
      console.error('Dashboard Load Exception:', e);
      setAlertConfig({ visible: true, title: 'Error', message: e.message || 'An unexpected error occurred', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Real-time subscription: auto-refresh when bills change (scan, delete, update)
  React.useEffect(() => {
    // Create unique channel name to avoid conflicts
    const channelName = `dashboard-bills-${Date.now()}`;
    const channel = supabase.channel(channelName);

    // Add listener BEFORE subscribing
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bills' },
      () => {
        console.log('Dashboard: bills changed, refreshing via Realtime...');
        loadData();
      }
    );

    // Now subscribe
    channel.subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // ——— Computed Analytics ——————————————————————————
  const now = new Date();
  const analytics = useMemo(() => {
    const dnow = now;

    // Start of month (00:00:00)
    const som = new Date(dnow.getFullYear(), dnow.getMonth(), 1, 0, 0, 0);
    // Start of week (Sunday 00:00:00)
    const sow = new Date(dnow);
    sow.setDate(dnow.getDate() - dnow.getDay());
    sow.setHours(0, 0, 0, 0);
    // Start of day (00:00:00)
    const sod = new Date(dnow.getFullYear(), dnow.getMonth(), dnow.getDate(), 0, 0, 0);

    const getBillDate = (b: Bill) => {
      // Transaction date (for general stats)
      const dateStr = b.payment_timestamp || b.invoice_date || b.created_at;
      if (!dateStr || dateStr === 'N/A') return new Date(b.created_at || 0);
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? new Date(b.created_at || 0) : d;
    };

    const getUploadDate = (b: Bill) => {
      // Strictly use upload date for Activity tracking
      return new Date(b.created_at || 0);
    };

    const overallBills = bills;
    // Aggregations based on Upload Date (User Activity)
    const mBills = bills
      .filter(b => getUploadDate(b) >= som)
      .sort((a, b) => getUploadDate(b).getTime() - getUploadDate(a).getTime());
    const wBills = bills
      .filter(b => getUploadDate(b) >= sow)
      .sort((a, b) => getUploadDate(b).getTime() - getUploadDate(a).getTime());
    const dBills = bills
      .filter(b => getUploadDate(b) >= sod)
      .sort((a, b) => getUploadDate(b).getTime() - getUploadDate(a).getTime());

    const overallTotal = overallBills.reduce((s, b) => s + (parseFloat(b.amount?.toString()) || 0), 0);
    const mTotal = mBills.reduce((s, b) => s + (parseFloat(b.amount?.toString()) || 0), 0);
    const wTotal = wBills.reduce((s, b) => s + (parseFloat(b.amount?.toString()) || 0), 0);
    const dTotal = dBills.reduce((s, b) => s + (parseFloat(b.amount?.toString()) || 0), 0);

    // Comparisons based on Upload Date
    const pmStart = new Date(dnow.getFullYear(), dnow.getMonth() - 1, 1, 0, 0, 0);
    const pmEnd = new Date(dnow.getFullYear(), dnow.getMonth(), 0, 23, 59, 59);
    const pmTotal = overallBills
      .filter(b => {
        const d = getUploadDate(b);
        return d >= pmStart && d <= pmEnd;
      })
      .reduce((s, b) => s + (parseFloat(b.amount?.toString()) || 0), 0);
    const mChange = pmTotal > 0 ? ((mTotal - pmTotal) / pmTotal * 100) : 0;

    const pwStart = new Date(sow);
    pwStart.setDate(pwStart.getDate() - 7);
    const pwEnd = new Date(sow);
    pwEnd.setSeconds(pwEnd.getSeconds() - 1);
    const pwTotal = overallBills
      .filter(b => {
        const d = getUploadDate(b);
        return d >= pwStart && d <= pwEnd;
      })
      .reduce((s, b) => s + (parseFloat(b.amount?.toString()) || 0), 0);
    const wChange = pwTotal > 0 ? ((wTotal - pwTotal) / pwTotal * 100) : 0;

    const pdStart = new Date(sod);
    pdStart.setDate(pdStart.getDate() - 1);
    const pdEnd = new Date(sod);
    pdEnd.setSeconds(pdEnd.getSeconds() - 1);
    const pdTotal = overallBills
      .filter(b => {
        const d = getUploadDate(b);
        return d >= pdStart && d <= pdEnd;
      })
      .reduce((s, b) => s + (parseFloat(b.amount?.toString()) || 0), 0);
    const dChange = pdTotal > 0 ? ((dTotal - pdTotal) / pdTotal * 100) : 0;

    return {
      overallBills, mBills, wBills, dBills,
      overallTotal, mTotal, wTotal, dTotal,
      pmTotal, mChange, wChange, dChange
    };
  }, [bills]);

  const {
    overallBills,
    mBills: thisMonthBills,
    wBills: thisWeekBills,
    dBills: todayBills,
    overallTotal,
    mTotal: monthTotal,
    wTotal: weekTotal,
    dTotal: todayTotal,
    mChange: monthChange,
    wChange: weekChange,
    dChange: todayChange
  } = analytics;

  // Top Vendors
  const topVendors = useMemo(() => {
    const vendorMap: Record<string, { total: number; count: number }> = {};
    bills.forEach(b => {
      const name = b.merchant_name || 'Unknown';
      if (!vendorMap[name]) vendorMap[name] = { total: 0, count: 0 };
      vendorMap[name].total += b.amount;
      vendorMap[name].count += 1;
    });
    return Object.entries(vendorMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);
  }, [bills]);

  // Payment Methods
  const paymentMethods = useMemo(() => {
    const methodMap: Record<string, number> = {};
    bills.forEach(b => {
      const mode = b.payment_mode || 'Unknown';
      methodMap[mode] = (methodMap[mode] || 0) + b.amount;
    });
    const total = Object.values(methodMap).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(methodMap)
      .sort((a, b) => b[1] - a[1])
      .map(([mode, amount]) => ({ mode, amount, percent: (amount / total) * 100 }));
  }, [bills]);

  // GST Summary
  const gstSummary = useMemo(() => {
    let cgst = 0, sgst = 0, igst = 0, totalTax = 0;
    bills.forEach(b => {
      cgst += b.cgst || 0;
      sgst += b.sgst || 0;
      igst += b.igst || 0;
      totalTax += b.total_tax || 0;
    });
    return { cgst, sgst, igst, totalTax };
  }, [bills]);

  // Location Spend
  const locationSpend = useMemo(() => {
    const locMap: Record<string, number> = {};
    bills.forEach(b => {
      if (b.vendor_address && b.vendor_address !== 'N/A') {
        // Extract city — take last meaningful part of address
        const parts = b.vendor_address.split(',').map(p => p.trim());
        const area = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
        if (area) {
          locMap[area] = (locMap[area] || 0) + b.amount;
        }
      }
    });
    return Object.entries(locMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [bills]);

  const totalLocationSpend = useMemo(() => locationSpend.reduce((s, [, v]) => s + v, 0) || 1, [locationSpend]);

  // Category spend
  const categoryBreakdown = useMemo(() => {
    const catMap: Record<string, number> = {};
    overallBills.forEach(b => {
      catMap[b.category] = (catMap[b.category] || 0) + b.amount;
    });
    return Object.entries(catMap)
      .sort((a, b) => b[1] - a[1]);
  }, [overallBills]);

  // ——— Report Generators ——————————————————————————
  const generateMonthlyReport = async () => {
    try {
      setExporting('monthly');
      const totalAmount = overallBills.reduce((s, b) => s + b.amount, 0);
      const totalTax = overallBills.reduce((s, b) => s + (b.total_tax || 0), 0);
      const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

      const wb = XLSX.utils.book_new();
      const data = [
        [`MONTHLY REPORT - ${monthName.toUpperCase()}`],
        [`Generated: ${new Date().toLocaleDateString('en-IN')}`],
        [],
        ['SUMMARY'],
        ['Total Bills:', overallBills.length],
        ['Total Expenditure:', `Rs. ${totalAmount.toLocaleString('en-IN')}`],
        ['Total Tax Paid:', `Rs. ${totalTax.toFixed(2)}`],
        [],
        ['CATEGORY BREAKDOWN'],
        ['Category', 'Amount', 'Bills', '% of Total'],
      ];

      const catMap: Record<string, { amount: number; count: number }> = {};
      overallBills.forEach(b => {
        if (!catMap[b.category]) catMap[b.category] = { amount: 0, count: 0 };
        catMap[b.category].amount += b.amount;
        catMap[b.category].count += 1;
      });
      Object.entries(catMap).sort((a, b) => b[1].amount - a[1].amount).forEach(([cat, val]) => {
        data.push([cat, `Rs. ${val.amount.toLocaleString('en-IN')}`, val.count.toString(), `${((val.amount / (totalAmount || 1)) * 100).toFixed(1)}%`]);
      });

      data.push([], ['TOP VENDORS'], ['Vendor', 'Amount', 'Bills']);
      const vendMap: Record<string, { amount: number; count: number }> = {};
      overallBills.forEach(b => {
        const name = b.merchant_name || 'Unknown';
        if (!vendMap[name]) vendMap[name] = { amount: 0, count: 0 };
        vendMap[name].amount += b.amount;
        vendMap[name].count += 1;
      });
      Object.entries(vendMap).sort((a, b) => b[1].amount - a[1].amount).slice(0, 10).forEach(([name, val]) => {
        data.push([name, `Rs. ${val.amount.toLocaleString('en-IN')}`, val.count.toString()]);
      });

      data.push([], ['ALL TRANSACTIONS'], ['Date', 'Merchant', 'Category', 'Amount', 'Payment', 'Tax']);
      overallBills.forEach(b => {
        data.push([
          new Date(b.created_at).toLocaleDateString('en-IN'),
          b.merchant_name || 'N/A',
          b.category,
          `Rs. ${b.amount}`,
          b.payment_mode || 'N/A',
          `Rs. ${(b.total_tax || 0).toFixed(2)}`
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `Monthly_Report_${now.toISOString().split('T')[0]}.xlsx`;

      if (Platform.OS === 'web') {
        const byteChars = atob(base64);
        const byteNums = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
        return;
      }

      const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!dir) throw new Error('No file directory');
      const fileUri = `${dir}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
    } catch (e: any) {
      setAlertConfig({ visible: true, title: 'Error', message: e.message, type: 'error' });
    } finally {
      setExporting(null);
    }
  };

  const generateCategoryPDF = async () => {
    try {
      setExporting('category');
      const totalAmount = overallBills.reduce((s, b) => s + b.amount, 0);
      const catMap: Record<string, { amount: number; count: number; tax: number }> = {};
      overallBills.forEach(b => {
        if (!catMap[b.category]) catMap[b.category] = { amount: 0, count: 0, tax: 0 };
        catMap[b.category].amount += b.amount;
        catMap[b.category].count += 1;
        catMap[b.category].tax += b.total_tax || 0;
      });
      const sorted = Object.entries(catMap).sort((a, b) => b[1].amount - a[1].amount);

      const html = `<html><head><style>
        body { font-family: Helvetica; padding: 24px; color: #1e293b; }
        h1 { color: #4f46e5; text-align: center; font-size: 22px; }
        h2 { color: #334155; font-size: 16px; margin-top: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th { background: #f1f5f9; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 13px; }
        tr:nth-child(even) { background: #f8fafc; }
        .highlight { color: #4f46e5; font-weight: bold; }
        .amount { font-weight: 600; }
        .bar-container { background: #f1f5f9; border-radius: 4px; height: 16px; margin-top: 4px; }
        .bar { background: linear-gradient(90deg, #6366f1, #818cf8); height: 100%; border-radius: 4px; }
        .summary-box { background: #eef2ff; border-radius: 8px; padding: 16px; margin: 16px 0; display: flex; justify-content: space-between; }
        .stat { text-align: center; }
        .stat-value { font-size: 20px; font-weight: 800; color: #4f46e5; }
        .stat-label { font-size: 11px; color: #64748b; margin-top: 2px; }
      </style></head><body>
        <h1>[Analytics] Category Analytics Report</h1>
        <p style="text-align:center;color:#64748b;font-size:12px;">${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
        <div style="display:flex;gap:16px;margin:20px 0;">
          <div class="summary-box" style="flex:1;"><div class="stat"><div class="stat-value">${sorted.length}</div><div class="stat-label">Categories</div></div></div>
          <div class="summary-box" style="flex:1;"><div class="stat"><div class="stat-value">Rs. ${totalAmount.toLocaleString('en-IN')}</div><div class="stat-label">Total Spend</div></div></div>
          <div class="summary-box" style="flex:1;"><div class="stat"><div class="stat-value">${overallBills.length}</div><div class="stat-label">Bills</div></div></div>
        </div>
        <h2>Category Breakdown</h2>
        <table><thead><tr><th>Category</th><th>Amount</th><th>Bills</th><th>Tax</th><th>Share</th></tr></thead><tbody>
        ${sorted.map(([cat, v]) => `<tr><td>${cat}</td><td class="amount">Rs. ${v.amount.toLocaleString('en-IN')}</td><td>${v.count}</td><td>Rs. ${v.tax.toFixed(0)}</td><td>${((v.amount / (totalAmount || 1)) * 100).toFixed(1)}%</td></tr>`).join('')}
        </tbody></table>
        <h2>Visual Distribution</h2>
        ${sorted.map(([cat, v]) => `<div style="margin:8px 0;"><div style="display:flex;justify-content:space-between;"><span style="font-size:13px;font-weight:600;">${cat}</span><span style="font-size:13px;color:#64748b;">Rs. ${v.amount.toLocaleString('en-IN')} (${((v.amount / (totalAmount || 1)) * 100).toFixed(0)}%)</span></div><div class="bar-container"><div class="bar" style="width:${((v.amount / (totalAmount || 1)) * 100).toFixed(0)}%;"></div></div></div>`).join('')}
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e: any) {
      setAlertConfig({ visible: true, title: 'Error', message: e.message, type: 'error' });
    } finally {
      setExporting(null);
    }
  };

  const generateAllBillsPDF = async () => {
    try {
      setExporting('allbills');
      const totalAmount = bills.reduce((s, b) => s + b.amount, 0);
      const totalTax = bills.reduce((s, b) => s + (b.total_tax || 0), 0);

      const html = `<html><head><style>
        body { font-family: Helvetica; padding: 20px; color: #1e293b; }
        h1 { color: #4f46e5; text-align: center; font-size: 22px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #f1f5f9; color: #475569; font-size: 11px; text-transform: uppercase; }
        th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; font-size: 12px; }
        tr:nth-child(even) { background: #f8fafc; }
        .summary { background: #eef2ff; border-radius: 8px; padding: 14px; margin: 12px 0; text-align: center; }
        .total { font-size: 20px; font-weight: 800; color: #4f46e5; }
      </style></head><body>
        <h1>[Reports] Complete Bills Report</h1>
        <p style="text-align:center;color:#64748b;font-size:12px;">Generated: ${new Date().toLocaleDateString('en-IN')}</p>
        <div class="summary">
          <div class="total">Rs. ${totalAmount.toLocaleString('en-IN')}</div>
          <div style="color:#64748b;font-size:12px;">${bills.length} bills - Tax: Rs. ${totalTax.toFixed(0)}</div>
        </div>
        <table><thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Amount</th><th>Payment</th><th>GSTIN</th><th>Tax</th></tr></thead><tbody>
        ${bills.map(b => `<tr>
          <td>${new Date(b.created_at).toLocaleDateString('en-IN')}</td>
          <td>${b.merchant_name || 'N/A'}</td>
          <td>${b.category}</td>
          <td style="font-weight:600;">Rs. ${b.amount.toLocaleString('en-IN')}</td>
          <td>${b.payment_mode || 'N/A'}</td>
          <td style="font-size:10px;">${b.gst || 'N/A'}</td>
          <td>Rs. ${(b.total_tax || 0).toFixed(0)}</td>
        </tr>`).join('')}
        </tbody></table>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setExporting(null);
    }
  };

  // ——— Payment mode colors/icons ——————————————————
  const getPaymentColor = (mode: string) => {
    const m = mode.toLowerCase();
    if (m.includes('upi') || m.includes('gpay') || m.includes('paytm')) return '#6366F1';
    if (m.includes('cash')) return '#10B981';
    if (m.includes('card') || m.includes('credit') || m.includes('debit')) return '#F59E0B';
    if (m.includes('net') || m.includes('bank')) return '#3B82F6';
    return '#8B5CF6';
  };

  const getHeatColor = (percent: number) => {
    if (percent >= 30) return '#EF4444';
    if (percent >= 20) return '#F59E0B';
    if (percent >= 10) return '#6366F1';
    return '#10B981';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 12, color: '#94A3B8', fontWeight: '500' }}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
      >
        {/* Header */}
        <View style={styles.headerWrapper}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Insights</Text>
              <Text style={styles.headerSub}>All-Time Statistics</Text>
            </View>
            <View style={styles.headerIconWrapper}>
              <Ionicons name="stats-chart-outline" size={22} color={Colors.primary} />
            </View>
          </View>
        </View>

        {/* ——— Spend Overview ——— */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>SPENDING OVERVIEW</Text>
            <View style={styles.sectionLine} />
          </View>

          {/* Total Balance/Overall Banner */}
          <View style={styles.overviewRow}>
            <LinearGradient
              colors={['#0F766E', '#10B981']}
              style={[styles.totalBalanceCard, Shadows.medium]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.balanceHeader}>
                <Text style={styles.balanceLabel}>TOTAL SPEND</Text>
                <Ionicons name="trending-up" size={16} color={'rgba(255, 255, 255, 0.8)'} />
              </View>
              <Text style={styles.balanceAmount}>₹{overallTotal.toLocaleString('en-IN')}</Text>
              <View style={styles.balanceFooter}>
                <View style={styles.pillBadge}>
                  <Text style={styles.pillText}>{overallBills.length} Bills</Text>
                </View>
                <Text style={styles.allTimeText}>All-time Tracking</Text>
              </View>
            </LinearGradient>
          </View>

          {/* Time-based Metrics Grid */}
          <View style={styles.metricsGrid}>
            {/* Main Month Card */}
            <TouchableOpacity activeOpacity={0.9} style={styles.mainMonthCardWrapper}>
              <LinearGradient
                colors={['#0D9488', '#0F766E']}
                style={[styles.mainMonthCard, Shadows.medium]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.cardHeader}>
                  <Ionicons name="calendar-outline" size={18} color={'#FFF'} />
                  <Text style={styles.cardLabel}>MONTHLY</Text>
                  {monthChange !== 0 && (
                    <View style={[styles.trendPill, { backgroundColor: monthChange > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)' }]}>
                      {monthChange > 0 ? <Ionicons name="trending-up" size={10} color={'#FCA5A5'} /> : <Text style={{ fontSize: 10, color: '#6EE7B7' }}>↓</Text>}
                      <Text style={[styles.trendText, { color: monthChange > 0 ? '#FCA5A5' : '#6EE7B7' }]}>
                        {Math.abs(monthChange).toFixed(0)}%
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.amountContainer}>
                  <Text style={styles.currencySymbol}>Rs.</Text>
                  <Text style={styles.mainAmount}>{monthTotal.toLocaleString('en-IN')}</Text>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.billCount}>{thisMonthBills.length} transactions</Text>
                  {thisMonthBills.length > 0 && (
                    <Text style={styles.latestMerchant} numberOfLines={1}>
                      Latest: {thisMonthBills[0].merchant_name}
                    </Text>
                  )}
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Side Stats */}
            <View style={styles.sideStatsCol}>
              <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                style={[styles.subCard, Shadows.soft]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.subCardHeader}>
                  <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>📋</Text>
                  <Text style={styles.subCardLabel}>WEEKLY</Text>
                </View>
                <Text style={styles.subCardAmount}>Rs.{weekTotal.toLocaleString('en-IN')}</Text>
                <View style={styles.subCardFooter}>
                  {weekChange !== 0 && (
                    <Text style={[styles.subTrendText, { color: weekChange > 0 ? '#FCA5A5' : '#6EE7B7' }]}>
                      {weekChange > 0 ? '^' : 'v'}{Math.abs(weekChange).toFixed(0)}%
                    </Text>
                  )}
                  <Text style={styles.subCardCount}>{thisWeekBills.length} bills</Text>
                </View>
              </LinearGradient>

              <LinearGradient
                colors={['#10B981', '#059669']}
                style={[styles.subCard, Shadows.soft]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.subCardHeader}>
                  <Ionicons name="flash-outline" size={14} color={'rgba(255, 255, 255, 0.8)'} />
                  <Text style={styles.subCardLabel}>TODAY</Text>
                </View>
                <Text style={styles.subCardAmount}>Rs.{todayTotal.toLocaleString('en-IN')}</Text>
                <View style={styles.subCardFooter}>
                  {todayChange !== 0 && (
                    <Text style={[styles.subTrendText, { color: todayChange > 0 ? '#FCA5A5' : '#6EE7B7' }]}>
                      {todayChange > 0 ? '^' : 'v'}{Math.abs(todayChange).toFixed(0)}%
                    </Text>
                  )}
                  <Text style={styles.subCardCount}>{todayBills.length} bills</Text>
                </View>
              </LinearGradient>
            </View>
          </View>
        </View>

        {/* ——— Top Vendors ——— */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>TOP VENDORS</Text>
            <View style={styles.sectionLine} />
          </View>
          {topVendors.length === 0 ? (
            <Text style={styles.emptyText}>No vendor data yet</Text>
          ) : (
            topVendors.map(([name, data], idx) => (
              <View key={name} style={[styles.vendorRow, Shadows.soft]}>
                <View style={[styles.vendorRank, { backgroundColor: idx === 0 ? '#FEF3C7' : idx === 1 ? '#F1F5F9' : idx === 2 ? '#FFF7ED' : '#F8F9FA' }]}>
                  <Text style={[styles.vendorRankText, { color: idx === 0 ? '#D97706' : idx === 1 ? '#64748B' : idx === 2 ? '#EA580C' : '#666' }]}>
                    {idx + 1}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vendorName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.vendorCount}>{data.count} bill{data.count > 1 ? 's' : ''}</Text>
                </View>
                <Text style={styles.vendorAmount}>₹{data.total.toLocaleString('en-IN')}</Text>
              </View>
            ))
          )}
        </View>

        {/* ——— Payment Methods ——— */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>PAYMENT METHODS</Text>
            <View style={styles.sectionLine} />
          </View>
          {paymentMethods.map(({ mode, amount, percent }) => (
            <View key={mode} style={styles.paymentRow}>
              <View style={styles.paymentInfo}>
                <View style={[styles.paymentDot, { backgroundColor: getPaymentColor(mode) }]} />
                <Text style={styles.paymentMode}>{mode}</Text>
              </View>
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <View style={styles.paymentBarBg}>
                  <View style={[styles.paymentBarFill, { width: `${percent}%`, backgroundColor: getPaymentColor(mode) }]} />
                </View>
              </View>
              <View style={styles.paymentRight}>
                <Text style={styles.paymentAmount}>₹{amount.toLocaleString('en-IN')}</Text>
                <Text style={styles.paymentPercent}>{percent.toFixed(0)}%</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ——— GST Summary ——— */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>GST SUMMARY</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.gstCard}>
            <View style={styles.gstRow}>
              <View style={styles.gstItem}>
                <Text style={styles.gstLabel}>CGST</Text>
                <Text style={styles.gstValue}>₹{gstSummary.cgst.toFixed(2)}</Text>
              </View>
              <View style={styles.gstDivider} />
              <View style={styles.gstItem}>
                <Text style={styles.gstLabel}>SGST</Text>
                <Text style={styles.gstValue}>₹{gstSummary.sgst.toFixed(2)}</Text>
              </View>
              <View style={styles.gstDivider} />
              <View style={styles.gstItem}>
                <Text style={styles.gstLabel}>IGST</Text>
                <Text style={styles.gstValue}>₹{gstSummary.igst.toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles.gstTotalRow}>
              <Text style={styles.gstTotalLabel}>Total Tax Paid</Text>
              <Text style={styles.gstTotalValue}>₹{gstSummary.totalTax.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* --- Budget Utilization --- */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>BUDGET UTILIZATION</Text>
            <View style={styles.sectionLine} />
          </View>
          {categorySpending.length === 0 ? (
            <Text style={styles.emptyText}>No budgets set. Set up budgets to track utilization.</Text>
          ) : (
            categorySpending.map((cs: any) => (
              <View key={cs.category} style={[styles.budgetRow, Shadows.soft]}>
                <View style={styles.budgetHeader}>
                  <Text style={styles.budgetCat}>{cs.category}</Text>
                  <Text style={[styles.budgetPercent, { color: cs.color }]}>{cs.percentage.toFixed(0)}%</Text>
                </View>
                <View style={styles.budgetBarBg}>
                  <View style={[styles.budgetBarFill, { width: `${Math.min(cs.percentage, 100)}%`, backgroundColor: cs.color }]} />
                </View>
                <View style={styles.budgetAmounts}>
                  <Text style={styles.budgetSpent}>Rs.{cs.spent.toLocaleString('en-IN')} spent</Text>
                  <Text style={styles.budgetLimit}>/ Rs.{cs.budget.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* --- Location Heatmap --- */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>LOCATION SPEND</Text>
            <View style={styles.sectionLine} />
          </View>
          {locationSpend.length === 0 ? (
            <Text style={styles.emptyText}>No location data available yet</Text>
          ) : (
            <View style={styles.heatmapGrid}>
              {locationSpend.map(([area, amount]) => {
                const pct = (amount / totalLocationSpend) * 100;
                return (
                  <View key={area} style={[styles.heatmapCell, { borderLeftColor: getHeatColor(pct) }]}>
                    <Text style={styles.heatmapArea} numberOfLines={1}>{area}</Text>
                    <Text style={[styles.heatmapAmount, { color: getHeatColor(pct) }]}>Rs.{amount.toLocaleString('en-IN')}</Text>
                    <View style={styles.heatmapBarBg}>
                      <View style={[styles.heatmapBarFill, { width: `${pct}%`, backgroundColor: getHeatColor(pct) }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* --- Category Breakdown (This Month) --- */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>CATEGORY BREAKDOWN</Text>
            <View style={styles.sectionLine} />
          </View>
          {categoryBreakdown.map(([cat, amount]) => {
            const pct = (amount / (overallTotal || 1)) * 100;
            return (
              <View key={cat} style={styles.catRow}>
                <View style={styles.catInfo}>
                  <Text style={styles.catName}>{cat}</Text>
                  <Text style={styles.catAmount}>Rs.{amount.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.catBarBg}>
                  <View style={[styles.catBarFill, { width: `${pct}%` }]} />
                </View>
              </View>
            );
          })}
        </View>

        {/* --- Downloadable Reports --- */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>DOWNLOAD REPORTS</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.reportGrid}>
            <TouchableOpacity style={[styles.reportBtn, Shadows.soft]} onPress={generateMonthlyReport} disabled={!!exporting}>
              <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.reportBtnGrad}>
                {exporting === 'monthly' ? (
                  <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                  <Text style={{ fontSize: 24, color: '#4F46E5' }}>📤</Text>
                )}
                <Text style={styles.reportBtnTitle}>Monthly Report</Text>
                <Text style={styles.reportBtnSub}>XLSX * Full breakdown</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.reportBtn, Shadows.soft]} onPress={generateCategoryPDF} disabled={!!exporting}>
              <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={styles.reportBtnGrad}>
                {exporting === 'category' ? (
                  <ActivityIndicator size="small" color="#059669" />
                ) : (
                  <Ionicons name="trending-up" size={24} color={'#059669'} />
                )}
                <Text style={[styles.reportBtnTitle, { color: '#059669' }]}>Category Analytics</Text>
                <Text style={styles.reportBtnSub}>PDF * Visual charts</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* All Bills Button */}
            <TouchableOpacity style={[styles.reportBtn, Shadows.soft]} onPress={generateAllBillsPDF} disabled={!!exporting}>
              <LinearGradient colors={['#F0F9FF', '#E0F2FE']} style={styles.reportBtnGrad}>
                {exporting === 'allbills' ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="receipt-outline" size={24} color={Colors.primary} />
                )}
                <Text style={[styles.reportBtnTitle, { color: Colors.primary }]}>All Bills</Text>
                <Text style={styles.reportBtnSub}>PDF * Complete list</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <CustomAlert
        {...alertConfig}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { paddingBottom: Spacing.lg },

  // Header
  headerWrapper: {
    backgroundColor: '#FFF',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...Shadows.soft,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
  headerIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },

  // Overall Balance Card
  overviewRow: { marginBottom: Spacing.lg, paddingHorizontal: Spacing.lg },
  totalBalanceCard: {
    borderRadius: 20,
    padding: Spacing.xl,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  balanceAmount: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
  },
  balanceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pillBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pillText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  allTimeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
  },

  // Metrics Grid
  metricsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    height: 190,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  mainMonthCardWrapper: { flex: 1.3 },
  mainMonthCard: {
    flex: 1,
    borderRadius: 20,
    padding: Spacing.lg,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  trendPill: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '800',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
  },
  currencySymbol: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 4,
  },
  mainAmount: {
    color: '#FFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  cardFooter: {
    marginTop: 8,
  },
  billCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
  },
  latestMerchant: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
    opacity: 0.8,
  },

  sideStatsCol: {
    flex: 1,
    gap: Spacing.sm,
  },
  subCard: {
    flex: 1,
    borderRadius: 16,
    padding: Spacing.md,
    justifyContent: 'space-between',
  },
  subCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subCardLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subCardAmount: {
    color: '#FFF',
    fontSize: 19,
    fontWeight: '800',
  },
  subCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subCardCount: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '600',
  },
  subTrendText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // Section
  section: { marginBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2 },
  sectionLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  emptyText: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },

  // Vendors
  vendorRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md, borderWidth: 1, borderColor: '#F1F5F9' },
  vendorRank: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  vendorRankText: { fontSize: 14, fontWeight: '800' },
  vendorName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  vendorCount: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  vendorAmount: { fontSize: 16, fontWeight: '700', color: '#0F172A' },

  // Payment
  paymentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, backgroundColor: '#FFF', padding: Spacing.md, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  paymentInfo: { flexDirection: 'row', alignItems: 'center', width: 80, gap: 6 },
  paymentDot: { width: 10, height: 10, borderRadius: 5 },
  paymentMode: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  paymentBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  paymentBarFill: { height: '100%', borderRadius: 3 },
  paymentRight: { alignItems: 'flex-end', width: 90 },
  paymentAmount: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  paymentPercent: { fontSize: 10, color: '#94A3B8' },

  // GST
  gstCard: { backgroundColor: '#FFF', borderRadius: 16, padding: Spacing.lg, borderWidth: 1, borderColor: '#F1F5F9' },
  gstRow: { flexDirection: 'row', marginBottom: Spacing.md },
  gstItem: { flex: 1, alignItems: 'center' },
  gstLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 4 },
  gstValue: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  gstDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 4 },
  gstTotalRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: Spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gstTotalLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  gstTotalValue: { fontSize: 22, fontWeight: '800', color: Colors.primary },

  // Budget
  budgetRow: { backgroundColor: '#FFF', borderRadius: 16, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: '#F1F5F9' },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  budgetCat: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  budgetPercent: { fontSize: 14, fontWeight: '800' },
  budgetBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  budgetBarFill: { height: '100%', borderRadius: 3 },
  budgetAmounts: { flexDirection: 'row', gap: 4 },
  budgetSpent: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  budgetLimit: { fontSize: 12, color: '#94A3B8' },

  // Heatmap
  heatmapGrid: { gap: Spacing.sm },
  heatmapCell: { backgroundColor: '#FFF', borderRadius: 16, padding: Spacing.md, borderLeftWidth: 4, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#F1F5F9', ...Shadows.soft },
  heatmapArea: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  heatmapAmount: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  heatmapBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  heatmapBarFill: { height: '100%', borderRadius: 3 },

  // Category
  catRow: { marginBottom: Spacing.sm, backgroundColor: '#FFF', padding: Spacing.md, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  catInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  catName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  catAmount: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  catBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.primary },

  // Reports
  reportGrid: { gap: Spacing.sm },
  reportBtn: { borderRadius: 16, overflow: 'hidden' },
  reportBtnGrad: { padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  reportBtnTitle: { fontSize: 15, fontWeight: '700', color: '#4F46E5' },
  reportBtnSub: { fontSize: 11, color: '#94A3B8', marginLeft: 'auto' },
});

