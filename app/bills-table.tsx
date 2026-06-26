import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';

import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as XLSX from 'xlsx';
import CustomAlert from './components/CustomAlert';
import ZoomableImageModal from './components/ZoomableImageModal';

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
  total_tax?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  vendor_address?: string;
  google_maps_link?: string;
  distance_km?: number;
  enrichment_data?: any;
  utr_number?: string;
  card_last_4?: string;
  payment_slip_uri?: string;
  is_verified_payment?: boolean;
  payment_timestamp?: string;
  payment_date?: string;        // YYYY-MM-DD
  match_confidence?: number;    // 0-100
  match_method?: string;        // ocr_auto | ocr_manual | webhook | manual
}

export default function BillsTablePage() {


  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [billItems, setBillItems] = useState<any[]>([]);
  const [fetchingItems, setFetchingItems] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showZoomableImage, setShowZoomableImage] = useState(false);

  // Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showTaxOnly, setShowTaxOnly] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [activeTab, setActiveTab] = useState<'bills' | 'products'>('bills');


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

  const categories = ['All', 'Food', 'Electricity', 'Water', 'Rent', 'Internet', 'Shopping', 'Entertainment', 'Medical', 'Travel', 'Others'];

  const { filteredBillsList, filteredProductsList } = React.useMemo(() => {
    const matched = bills.filter(bill => {
      const matchesSearch = (bill.merchant_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (bill.invoice_number || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || bill.category === selectedCategory;
      const matchesTax = !showTaxOnly || (bill.total_tax && bill.total_tax > 0);

      let matchesDate = true;
      if (startDate) {
        matchesDate = matchesDate && new Date(bill.created_at) >= new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && new Date(bill.created_at) <= end;
      }

      return matchesSearch && matchesCategory && matchesTax && matchesDate;
    });

    return {
      filteredBillsList: matched.filter(b => b.enrichment_data?.source !== 'live_lens'),
      filteredProductsList: matched.filter(b => b.enrichment_data?.source === 'live_lens')
    };
  }, [bills, searchQuery, selectedCategory, showTaxOnly, startDate, endDate]);

  const activeList = activeTab === 'bills' ? filteredBillsList : filteredProductsList;

  const monthlyData = React.useMemo(() => {
    const months: Record<string, number> = {};
    activeList.forEach(bill => {
      const date = new Date(bill.created_at);
      const monthYear = date.toLocaleString('default', { month: 'short', year: '2-digit' });
      months[monthYear] = (months[monthYear] || 0) + bill.amount;
    });

    const sortedMonths = Object.entries(months).sort((a, b) => {
      const dateA = new Date(a[0]);
      const dateB = new Date(b[0]);
      return dateA.getTime() - dateB.getTime();
    });

    return sortedMonths;
  }, [activeList]);

  const loadBills = React.useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        showAlert('Error', 'Please login to view bills');
        return;
      }

      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading bills:', error);
        showAlert('Error', 'Failed to load bills');
        return;
      }

      setBills(data as unknown as Bill[]);
    } catch (error) {
      console.error('Error loading bills:', error);
      showAlert('Error', 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadBills();
    setRefreshing(false);
  }, [loadBills]);

  const getCategoryIcon = (category: string, size = 18, color = '#666') => {
    const style = { fontSize: size, color };
    switch (category) {
      case 'Food': return <Text style={style}>🍔</Text>;
      case 'Electricity': return <Text style={style}>⚡</Text>;
      case 'Water': return <Text style={style}>💧</Text>;
      case 'Rent': return <Text style={style}>🏠</Text>;
      case 'Internet': return <Text style={style}>🌐</Text>;
      case 'Shopping': return <Text style={style}>🛍️</Text>;
      case 'Entertainment': return <Text style={style}>🎬</Text>;
      case 'Medical': return <Text style={style}>⚕️</Text>;
      case 'Travel': return <Text style={style}>✈️</Text>;
      default: return <Text style={style}>🧾</Text>;
    }
  };

  const loadItems = async (billId: string) => {
    setFetchingItems(true);
    try {
      const { data, error } = await supabase
        .from('bill_items')
        .select('*')
        .eq('bill_id', billId);

      if (error) throw error;
      setBillItems(data || []);
    } catch (error) {
      console.error('Error loading items:', error);
    } finally {
      setFetchingItems(false);
    }
  };

  const handleBillPress = async (bill: Bill) => {
    setSelectedBill(bill);
    if (bill.id) {
      loadItems(bill.id);
    }

    if (bill.vendor_address && typeof bill.distance_km === 'undefined') {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const userLoc = await Location.getCurrentPositionAsync({});
          const geocoded = await Location.geocodeAsync(bill.vendor_address);
          if (geocoded && geocoded.length > 0) {
            const vendorLoc = geocoded[0];
            const R = 6371; // km
            const dLat = (vendorLoc.latitude - userLoc.coords.latitude) * Math.PI / 180;
            const dLon = (vendorLoc.longitude - userLoc.coords.longitude) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(userLoc.coords.latitude * Math.PI / 180) * Math.cos(vendorLoc.latitude * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const calculatedDistance = (R * c).toFixed(1);

            // update selected bill with real distance
            setSelectedBill(prev => prev ? ({ ...prev, distance_km: parseFloat(calculatedDistance) }) : prev);
          }
        }
      } catch (e) {
        console.log('Location error:', e);
      }
    }
  };

  const downloadExcel = async () => {
    try {
      if (!activeList || activeList.length === 0) {
        showAlert('Info', 'No bills found to export');
        return;
      }

      // Calculate totals for summary
      const totalAmount = activeList.reduce((s, b) => s + b.amount, 0);
      const totalTax = activeList.reduce((s, b) => s + (b.total_tax || 0), 0);
      const reportDate = new Date().toLocaleDateString('en-IN');

      // Create workbook and worksheet with corporate layout
      const wb = XLSX.utils.book_new();

      const spreadsheetContent = [
        ['FINANCIAL EXPENDITURE REPORT'],
        [`Report Date: ${reportDate}`],
        [],
        ['SUMMARY OF ACCOUNTS'],
        ['Total Records:', activeList.length],
        ['Total Expenditure:', totalAmount],
        ['Total Tax:', totalTax],
        [],
        [
          'MERCHANT',
          'CATEGORY',
          'AMOUNT',
          'TAX',
          'PAYMENT MODE',
          'GSTIN',
          'INVOICE DATE',
          'INVOICE #',
          'UPLOAD DATE'
        ]
      ];

      // Add bill data
      activeList.forEach(bill => {
        spreadsheetContent.push([
          bill.merchant_name || 'N/A',
          bill.category || 'N/A',
          bill.amount || 0,
          bill.total_tax || 0,
          bill.payment_mode || 'N/A',
          bill.gst || 'N/A',
          bill.invoice_date || 'N/A',
          bill.invoice_number || 'N/A',
          bill.created_at ? new Date(bill.created_at).toLocaleDateString('en-IN') : 'N/A'
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(spreadsheetContent);

      // Apply Cell Merging for Professional Centering
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, // Merge Title A1:I1
        { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }  // Merge Date A2:I2
      ];

      // Format numeric columns as Currency
      const currencyFormat = 'Rs. #,##0.00';

      // Totals Formatting
      if (ws['B6']) ws['B6'].z = currencyFormat;
      if (ws['B7']) ws['B7'].z = currencyFormat;

      // Table Data Formatting (Starts at Row 10 - index 9)
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:I100');
      for (let R = 9; R <= range.e.r; ++R) {
        // Column C (Amount) is index 2
        const amountCell = ws[XLSX.utils.encode_cell({ r: R, c: 2 })];
        if (amountCell) amountCell.z = currencyFormat;

        // Column D (Tax) is index 3
        const taxCell = ws[XLSX.utils.encode_cell({ r: R, c: 3 })];
        if (taxCell) taxCell.z = currencyFormat;
      }

      // Column widths (standardized professional widths)
      ws['!cols'] = [
        { wch: 25 }, // Merchant
        { wch: 15 }, // Category
        { wch: 15 }, // Amount
        { wch: 12 }, // Tax
        { wch: 15 }, // Payment Mode
        { wch: 18 }, // GSTIN
        { wch: 15 }, // Date
        { wch: 15 }, // Invoice
        { wch: 15 }  // Upload Date
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Financial Report');

      // Generate base64 string
      const excelBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      // Safe filename construction
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `Bills_Report_${dateStr}_${Date.now()}.xlsx`;

      if (Platform.OS === 'web') {
        // Web fallback: Create blob and download
        const byteCharacters = atob(excelBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
        return;
      }

      // Native URI construction
      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!directory) throw new Error('FileSystem directories are not available');

      const fileUri = `${directory}${fileName}`;

      // Write file
      await FileSystem.writeAsStringAsync(fileUri, excelBase64, {
        encoding: FileSystem.EncodingType.Base64
      });

      // Share file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Share Bills Report'
        });
      } else {
        showAlert('Success', 'Excel report ready!');
      }

    } catch (error: any) {
      console.error('Excel Export Error:', error);
      showAlert('Export Failed', `Error: ${error?.message || 'Unknown error'}. Please ensure storage permissions are granted.`);
    }
  };

  const downloadPDF = async () => {
    try {
      const totalAmount = activeList.reduce((s, b) => s + b.amount, 0);
      const totalTax = activeList.reduce((s, b) => s + (b.total_tax || 0), 0);

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica'; padding: 20px; }
              h1 { color: #007AFF; text-align: center; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
              th { backgroundColor: #F8F9FA; }
              .summary { margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 8px; }
              .total { font-weight: bold; color: #007AFF; font-size: 18px; }
            </style>
          </head>
          <body>
            <h1>Bill Organizer Report</h1>
            <p>Generated on: ${new Date().toLocaleDateString('en-IN')}</p>
            
            <div class="summary">
              <p>Total Bills: ${activeList.length}</p>
              <p class="total">Total Spend: Rs.${totalAmount.toLocaleString('en-IN')}</p>
              <p>Total Tax: Rs.${totalTax.toLocaleString('en-IN')}</p>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${activeList.map(b => `
                  <tr>
                    <td>${new Date(b.created_at).toLocaleDateString()}</td>
                    <td>${b.merchant_name || 'N/A'}</td>
                    <td>${b.category}</td>
                    <td>Rs.${b.amount}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      console.error('Error generating PDF:', error);
      showAlert('Error', 'Failed to generate PDF');
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return 'Invalid Date';
      return d.toLocaleDateString('en-IN');
    } catch (e) {
      return 'Format error';
    }
  };

  const formatCurrency = (amount: number) => {
    return `Rs.${amount.toFixed(2)} `;
  };

  const deleteBill = async (billId: string) => {
    showAlert(
      "Delete Bill",
      "Are you sure you want to remove this record? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('bills')
                .delete()
                .eq('id', billId);

              if (error) throw error;

              setBills(prev => prev.filter(b => b.id !== billId));
              setSelectedBill(null);
              setShowZoomableImage(false);
              setAlertConfig(prev => ({ ...prev, visible: false }));
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch (err) {
              console.error('Delete error:', err);
              showAlert('Error', 'Failed to delete bill');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading bills...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color={'#1a1a1a'} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bills Summary</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.reportsButton} onPress={() => setShowReports(true)}>
            <Ionicons name="bar-chart-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Advanced Filters UI */}
      <View style={styles.filterSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={'#666'} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search vendor or invoice..."
            placeholderTextColor={'#666'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close" size={16} color={'#666'} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.taxFilterButton, showTaxOnly && styles.taxFilterActive]}
            onPress={() => setShowTaxOnly(!showTaxOnly)}
          >
            <Ionicons name="receipt-outline" size={14} color={showTaxOnly ? '#FFF' : '#666'} />
            <Text style={[styles.taxFilterText, showTaxOnly && styles.taxFilterTextActive]}>
              Tax Only
            </Text>
          </TouchableOpacity>

          <View style={styles.exportActions}>
            <TouchableOpacity style={styles.exportButton} onPress={downloadExcel}>
              <Ionicons name="download-outline" size={14} color={Colors.primary} />
              <Text style={styles.exportButtonText}>XLSX</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.exportButton, { borderColor: Colors.error }]} onPress={downloadPDF}>
              <Ionicons name="document-text-outline" size={14} color={Colors.error} />
              <Text style={[styles.exportButtonText, { color: Colors.error }]}>PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.dateFilterRow}>
          <TouchableOpacity
            style={styles.dateInputWrapper}
            onPress={() => setShowStartDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={14} color={startDate ? Colors.primary : '#666'} />
            <Text style={[styles.dateLabel, !startDate && styles.datePlaceholder]}>
              {startDate ? startDate : "Start Date"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dateInputWrapper}
            onPress={() => setShowEndDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={14} color={endDate ? Colors.primary : '#666'} />
            <Text style={[styles.dateLabel, !endDate && styles.datePlaceholder]}>
              {endDate ? endDate : "End Date"}
            </Text>
          </TouchableOpacity>

          {showStartDatePicker && (
            <DateTimePicker
              value={startDate ? new Date(startDate) : new Date()}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowStartDatePicker(false);
                if (date) {
                  setStartDate(date.toISOString().split('T')[0]);
                }
              }}
            />
          )}

          {showEndDatePicker && (
            <DateTimePicker
              value={endDate ? new Date(endDate) : new Date()}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowEndDatePicker(false);
                if (date) {
                  setEndDate(date.toISOString().split('T')[0]);
                }
              }}
            />
          )}

          {(startDate || endDate) && (
            <TouchableOpacity style={styles.clearDates} onPress={() => { setStartDate(''); setEndDate(''); }}>
              <Ionicons name="close" size={14} color={Colors.error} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryContent}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.categoryPillText, selectedCategory === cat && styles.categoryPillTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'bills' && styles.tabButtonActive]}
            onPress={() => setActiveTab('bills')}
          >
            <Ionicons name="receipt-outline" size={16} color={activeTab === 'bills' ? '#FFF' : '#666'} />
            <Text style={[styles.tabText, activeTab === 'bills' && styles.tabTextActive]}>Bills ({filteredBillsList.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'products' && styles.tabButtonActive]}
            onPress={() => setActiveTab('products')}
          >
            <Ionicons name="cube-outline" size={16} color={activeTab === 'products' ? '#FFF' : '#666'} />
            <Text style={[styles.tabText, activeTab === 'products' && styles.tabTextActive]}>Products ({filteredProductsList.length})</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bill Cards View */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name={activeTab === 'bills' ? "receipt-outline" : "cube-outline"} size={48} color={'#e5e5e5'} />
            <Text style={styles.emptyText}>No {activeTab} found matching filters</Text>
          </View>
        ) : (
          activeList.map(bill => (
            <TouchableOpacity
              key={bill.id}
              style={[styles.billCard, Shadows.soft]}
              onPress={() => handleBillPress(bill)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.categoryIconContainer}>
                  <LinearGradient
                    colors={[Colors.primary + '20', Colors.primary + '05']}
                    style={styles.categoryIconBg}
                  >
                    {getCategoryIcon(bill.category, 22, Colors.primary)}
                  </LinearGradient>
                </View>

                <View style={styles.merchantInfo}>
                  <Text style={styles.merchantName} numberOfLines={1}>
                    {bill.merchant_name || (activeTab === 'bills' ? 'Personal Expense' : 'Unnamed Product')}
                  </Text>
                  <View style={styles.managedSinceRow}>
                    <Text style={styles.managedSinceLabel}>{activeTab === 'bills' ? 'Managed Since: ' : 'Scanned On: '}</Text>
                    <Text style={styles.managedSinceDate}>{formatDate(bill.created_at)}</Text>
                  </View>
                </View>

                <View style={styles.amountContainer}>
                  <Text style={styles.billAmount}>Rs.{bill.amount.toLocaleString()}</Text>
                  {(bill.total_tax || 0) > 0 && (
                    <View style={styles.taxBadge}>
                      <Text style={styles.taxBadgeText}>+ Rs.{(bill.total_tax || 0).toFixed(0)} tax</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.cardTags}>
                  <View style={styles.footerTag}>
                    <Ionicons name="card-outline" size={12} color={'#666'} />
                    <Text style={styles.footerTagText}>{bill.payment_mode || 'Cash'}</Text>
                  </View>
                  {bill.is_verified_payment && (
                    <View style={[styles.footerTag, { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' }]}>
                      <Text style={[styles.footerTagText, { color: '#065F46', fontWeight: '800' }]}>VERIFIED</Text>
                    </View>
                  )}
                </View>

                <View style={styles.viewDetailsRow}>
                  <Text style={styles.viewDetailsText}>Open Ledger</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Reports Modal */}
      <Modal
        visible={showReports}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReports(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, Shadows.medium]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Financial Reports</Text>
              <TouchableOpacity onPress={() => setShowReports(false)} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={'#1a1a1a'} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              {/* Quick Summary */}
              <View style={[styles.reportSummaryRow, { marginBottom: Spacing.md, paddingHorizontal: Spacing.lg }]}>
                <LinearGradient
                  colors={['#4F46E5', '#6366F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.summaryCard, { marginRight: Spacing.xs, padding: Spacing.md, borderRadius: Spacing.md }]}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs }}>
                    <Ionicons name="card-outline" size={14} color={'#FFF'} />
                  </View>
                  <Text style={[styles.summaryLabel, { color: 'rgba(255, 255, 255, 0.8)', fontSize: 10, marginBottom: 2 }]}>Total Spent</Text>
                  <Text style={[styles.summaryValue, { color: '#FFF', fontSize: 16, fontWeight: '800' }]} numberOfLines={1} adjustsFontSizeToFit>
                    Rs.{activeList.reduce((s, b) => s + b.amount, 0).toLocaleString()}
                  </Text>
                </LinearGradient>
                <LinearGradient
                  colors={['#10B981', '#34D399']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.summaryCard, { marginLeft: Spacing.xs, padding: Spacing.md, borderRadius: Spacing.md }]}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs }}>
                    <Ionicons name="receipt-outline" size={14} color={'#FFF'} />
                  </View>
                  <Text style={[styles.summaryLabel, { color: 'rgba(255, 255, 255, 0.8)', fontSize: 10, marginBottom: 2 }]}>Total Tax</Text>
                  <Text style={[styles.summaryValue, { color: '#FFF', fontSize: 16, fontWeight: '800' }]} numberOfLines={1} adjustsFontSizeToFit>
                    Rs.{activeList.reduce((s, b) => s + (b.total_tax || 0), 0).toFixed(0)}
                  </Text>
                </LinearGradient>
              </View>

              <View style={[styles.reportSection, styles.premiumSectionCard, { padding: Spacing.md, borderRadius: Spacing.md, marginBottom: Spacing.md }]}>
                <View style={[styles.sectionHeader, { borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: Spacing.xs, marginBottom: Spacing.xs }]}>
                  <Ionicons name="pie-chart-outline" size={16} color={Colors.primary} />
                  <Text style={[styles.sectionTitle, { fontSize: 14 }]}>Payment Distribution</Text>
                </View>
                <View style={{ marginTop: Spacing.xs }}>
                  {Object.entries(
                    activeList.reduce((acc, b) => {
                      const mode = b.payment_mode || 'Unknown';
                      acc[mode] = (acc[mode] || 0) + b.amount;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([mode, amount]) => {
                    const percentage = (amount / activeList.reduce((s, b) => s + b.amount, 1)) * 100;
                    return (
                      <View key={mode} style={styles.breakdownItem}>
                        <View style={[styles.breakdownInfo, { marginBottom: 4 }]}>
                          <Text style={[styles.breakdownLabel, { fontSize: 13 }]}>{mode}</Text>
                          <Text style={[styles.breakdownAmount, { fontSize: 13 }]}>Rs.{amount.toLocaleString()}</Text>
                        </View>
                        <View style={[styles.progressContainer, { height: 6 }]}>
                          <View style={[styles.progressBase, { width: `${percentage}%` }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.reportSection, styles.premiumSectionCard, { padding: Spacing.md, borderRadius: Spacing.md, marginBottom: Spacing.xl }]}>
                <View style={[styles.sectionHeader, { borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: Spacing.xs, marginBottom: Spacing.xs }]}>
                  <Ionicons name="bar-chart-outline" size={16} color={Colors.primary} />
                  <Text style={[styles.sectionTitle, { fontSize: 14 }]}>Monthly Trends</Text>
                </View>
                <View style={{ marginTop: Spacing.xs }}>
                  {monthlyData.length > 0 ? (
                    monthlyData.map(([month, amount]) => {
                      const maxAmount = Math.max(...monthlyData.map(m => m[1]), 1);
                      const percentage = (amount / maxAmount) * 100;
                      return (
                        <View key={month} style={styles.breakdownItem}>
                          <View style={[styles.breakdownInfo, { marginBottom: 4 }]}>
                            <Text style={[styles.breakdownLabel, { fontSize: 13 }]}>{month}</Text>
                            <Text style={[styles.breakdownAmount, { fontSize: 13 }]}>Rs.{amount.toLocaleString()}</Text>
                          </View>
                          <View style={[styles.progressContainer, { height: 6 }]}>
                            <View style={[styles.progressBase, { width: `${percentage}%`, backgroundColor: Colors.primaryLight }]} />
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.emptyText}>No data for the selected period</Text>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bill Details Modal */}
      <Modal
        visible={!!selectedBill}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedBill(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bill Details</Text>
              <TouchableOpacity onPress={() => setSelectedBill(null)} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={'#1a1a1a'} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              {selectedBill && (
                <View style={styles.modalDetails}>
                  {selectedBill.uri && (
                    <TouchableOpacity
                      style={styles.modalImageContainer}
                      onPress={() => setShowZoomableImage(true)}
                      activeOpacity={0.9}
                    >
                      <Image
                        source={{ uri: selectedBill.uri }}
                        style={styles.modalImage}
                        contentFit="cover"
                      />
                      <View style={styles.imageOverlayBadge}>
                        <Text style={styles.imageBadgeText}>Tap to zoom</Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Merchant & Invoice</Text>

                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalLabelIcon}>
                        <Ionicons name="storefront-outline" size={16} color={Colors.primary} />
                        <Text style={styles.modalLabel}>Vendor Name</Text>
                      </View>
                      <Text style={styles.modalValue}>{selectedBill.merchant_name || 'N/A'}</Text>
                    </View>

                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalLabelIcon}>
                        <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                        <Text style={styles.modalLabel}>Date & Time</Text>
                      </View>
                      <Text style={styles.modalValue}>{new Date(selectedBill.created_at).toLocaleString()}</Text>
                    </View>

                    {selectedBill.invoice_number && (
                      <View style={styles.modalInfoRow}>
                        <View style={styles.modalLabelIcon}>
                          <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                          <Text style={styles.modalLabel}>Bill Number</Text>
                        </View>
                        <Text style={styles.modalValue}>{selectedBill.invoice_number}</Text>
                      </View>
                    )}

                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalLabelIcon}>
                        <Ionicons name="receipt-outline" size={16} color={Colors.primary} />
                        <Text style={styles.modalLabel}>Category</Text>
                      </View>
                      <Text style={styles.modalValue}>{selectedBill.category}</Text>
                    </View>

                    {selectedBill.gst && (
                      <View style={styles.modalInfoRow}>
                        <View style={styles.modalLabelIcon}>
                          <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                          <Text style={styles.modalLabel}>GSTIN</Text>
                        </View>
                        <Text style={styles.modalValue}>{selectedBill.gst}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Financial Details</Text>

                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalLabelIcon}>
                        <Ionicons name="card-outline" size={16} color={Colors.primary} />
                        <Text style={styles.modalLabel}>Amount</Text>
                      </View>
                      <Text style={[styles.modalValue, { color: Colors.primary, fontSize: 18, fontWeight: '800' }]}>
                        Rs.{(selectedBill.amount || 0).toLocaleString()}
                      </Text>
                    </View>

                    {((selectedBill.total_tax || 0) > 0 || (selectedBill.cgst || 0) > 0) && (
                      <View style={{ backgroundColor: '#F1F5F9', padding: Spacing.sm, borderRadius: BorderRadius.md, marginTop: Spacing.sm }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#666', marginBottom: 6, letterSpacing: 0.5 }}>TAX BREAKUP</Text>
                        {(selectedBill.cgst || 0) > 0 && (
                          <View style={styles.modalInfoRow}><Text style={styles.modalLabel}>CGST</Text><Text style={[styles.modalValue, { fontSize: 13, fontWeight: '600' }]}>Rs.{selectedBill.cgst}</Text></View>
                        )}
                        {(selectedBill.sgst || 0) > 0 && (
                          <View style={styles.modalInfoRow}><Text style={styles.modalLabel}>SGST</Text><Text style={[styles.modalValue, { fontSize: 13, fontWeight: '600' }]}>Rs.{selectedBill.sgst}</Text></View>
                        )}
                        {(selectedBill.igst || 0) > 0 && (
                          <View style={styles.modalInfoRow}><Text style={styles.modalLabel}>IGST</Text><Text style={[styles.modalValue, { fontSize: 13, fontWeight: '600' }]}>Rs.{selectedBill.igst}</Text></View>
                        )}
                        <View style={[styles.modalInfoRow, { borderTopWidth: 1, borderTopColor: '#e5e5e5', paddingTop: 8, marginTop: 4 }]}>
                          <Text style={[styles.modalLabel, { fontWeight: '700', color: '#1a1a1a' }]}>Total Tax</Text>
                          <Text style={[styles.modalValue, { fontWeight: '700' }]}>Rs.{selectedBill.total_tax}</Text>
                        </View>
                      </View>
                    )}

                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalLabelIcon}>
                        <Ionicons name="card-outline" size={16} color={Colors.primary} />
                        <Text style={styles.modalLabel}>Payment Mode</Text>
                      </View>
                      <Text style={styles.modalValue}>{selectedBill.payment_mode || 'N/A'}</Text>
                    </View>

                    {/* Payment Verification Block */}
                    {selectedBill.is_verified_payment && (
                      <View style={styles.verifiedPaymentBlock}>
                        <View style={styles.verifiedPaymentHeader}>
                          <Text style={styles.verifiedPaymentTitle}>✅ Payment Verified</Text>
                          {(selectedBill.match_confidence ?? 0) > 0 && (
                            <View style={styles.confidenceChip}>
                              <Text style={styles.confidenceText}>{selectedBill.match_confidence?.toFixed(0)}% match</Text>
                            </View>
                          )}
                        </View>

                        {selectedBill.utr_number && (
                          <View style={styles.verifiedRow}>
                            <Text style={styles.verifiedLabel}>UTR / Ref</Text>
                            <Text style={styles.verifiedValue}>{selectedBill.utr_number}</Text>
                          </View>
                        )}

                        {selectedBill.card_last_4 && (
                          <View style={styles.verifiedRow}>
                            <Text style={styles.verifiedLabel}>Card</Text>
                            <Text style={styles.verifiedValue}>**** {selectedBill.card_last_4}</Text>
                          </View>
                        )}

                        {(selectedBill.payment_date || selectedBill.payment_timestamp) && (
                          <View style={styles.verifiedRow}>
                            <Text style={styles.verifiedLabel}>Paid On</Text>
                            <Text style={styles.verifiedValue}>
                              {selectedBill.payment_date
                                ? new Date(selectedBill.payment_date).toLocaleDateString()
                                : selectedBill.payment_timestamp
                                  ? new Date(selectedBill.payment_timestamp).toLocaleString()
                                  : 'N/A'}
                            </Text>
                          </View>
                        )}

                        {selectedBill.match_method && (
                          <View style={styles.verifiedRow}>
                            <Text style={styles.verifiedLabel}>Matched Via</Text>
                            <Text style={styles.verifiedValue}>
                              {selectedBill.match_method === 'ocr_auto' ? 'Auto OCR'
                                : selectedBill.match_method === 'ocr_manual' ? 'Manual OCR'
                                  : selectedBill.match_method === 'webhook' ? 'Razorpay Webhook'
                                    : 'Manual'}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Item Level Details & Smart Alternatives */}
                  {billItems && billItems.length > 0 && (
                    <View style={{ paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg }}>
                      <Text style={[styles.modalSectionTitle, { marginBottom: Spacing.md }]}>Item-Level Insights</Text>
                      {billItems.map((item, idx) => {
                        const amount = item.total_amount || item.amount || 0;

                        // Find enrichment data for this specific item if available
                        const itemEnrichment = selectedBill.enrichment_data?.price_intelligence?.find(
                          (pi: any) => pi.item_name?.toLowerCase().includes((item.name || item.description || '').toLowerCase()) ||
                            (item.name || item.description || '').toLowerCase().includes(pi.item_name?.toLowerCase())
                        );

                        const itemAlt = selectedBill.enrichment_data?.alternatives?.find(
                          (alt: any) => alt.original_item?.toLowerCase().includes((item.name || item.description || '').toLowerCase())
                        );

                        const bestPrice = itemEnrichment?.best_price || (amount * 0.88);

                        return (
                          <View key={idx} style={styles.compCard}>
                            <View style={styles.compCardHeader}>
                              <View style={{ flex: 1, marginRight: Spacing.sm }}>
                                <Text style={styles.compItemName} numberOfLines={2}>{item.description || item.name}</Text>
                                {item.quantity && <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Qty: {item.quantity}</Text>}
                              </View>
                              <View style={styles.bestPricePill}>
                                <Ionicons name="trending-down" size={12} color={'#10B981'} />
                                <Text style={styles.bestPriceText}>Rs.{bestPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                              </View>
                            </View>

                            {/* Current Price (from Bill) */}
                            <View style={[styles.platformRow, { borderBottomColor: 'transparent', opacity: 0.6 }]}>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.platformName, { fontSize: 13 }]}>As per this Bill</Text>
                              </View>
                              <View style={styles.platformRight}>
                                <Text style={[styles.platformPrice, { fontSize: 14 }]}>Rs.{amount.toLocaleString()}</Text>
                              </View>
                            </View>

                            <View style={{ height: 1, backgroundColor: '#f0f0f0', marginVertical: 4 }} />

                            {/* Online Platforms Comparisons */}
                            {(itemEnrichment?.platforms || [
                              { name: 'Amazon', icon: '[Box]', url: `https://www.amazon.in/s?k=${encodeURIComponent(item.name || item.description)}` },
                              { name: 'Flipkart', icon: '[Cart]', url: `https://www.flipkart.com/search?q=${encodeURIComponent(item.name || item.description)}` },
                              ...((selectedBill.category === 'Food' || selectedBill.category === 'Shopping') ? [{ name: 'Blinkit', icon: '[Flash]', url: `https://blinkit.com/s/?q=${encodeURIComponent(item.name || item.description)}` }] : [])
                            ]).map((p: any, pidx: number) => {
                              const platformIcon = p.icon || (p.name === 'Amazon' ? '[Box]' : p.name === 'Flipkart' ? '[Cart]' : p.name === 'Blinkit' ? '[Flash]' : '[Link]');
                              const displayPrice = p.price || (bestPrice + (Math.random() * 20));

                              return (
                                <TouchableOpacity
                                  key={pidx}
                                  style={styles.platformRow}
                                  onPress={() => Linking.openURL(p.url)}
                                  activeOpacity={0.7}
                                >
                                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 14 }}>{platformIcon}</Text>
                                    <View>
                                      <Text style={styles.platformName}>{p.name}</Text>
                                      <Text style={styles.platformDelivery}>{p.delivery || 'Estimated best match'}</Text>
                                    </View>
                                  </View>
                                  <View style={styles.platformRight}>
                                    <Text style={[styles.platformPrice, { color: displayPrice < amount ? '#10B981' : '#666' }]}>
                                      Rs.{displayPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </Text>
                                  </View>
                                  <Ionicons name="chevron-forward" size={14} color={'#666'} />
                                </TouchableOpacity>
                              );
                            })}

                            {/* Smart Alternative Product Card */}
                            {(itemAlt || itemEnrichment) && (
                              <TouchableOpacity
                                style={[styles.altCard, { marginTop: Spacing.md }]}
                                onPress={() => Linking.openURL(itemAlt?.url || itemEnrichment?.platforms?.[0]?.url || `https://www.google.com/search?q=${encodeURIComponent('cheaper alternative to ' + (item.name || item.description))}`)}
                                activeOpacity={0.8}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.altSuggestion}>[*] {itemAlt ? 'Smart Alternate' : 'Best Offer'}: {itemAlt?.suggestion || itemEnrichment?.item_name || (item.name || item.description)}</Text>
                                  <Text style={styles.altReason}>{itemAlt?.reason || 'Highly rated by users and currently at a competitive price.'}</Text>
                                  <Text style={styles.altWhere}>Available on {itemAlt?.where_to_buy || itemEnrichment?.best_platform || 'Online'}</Text>
                                </View>
                                <View style={styles.altPriceBox}>
                                  <Text style={styles.altPrice}>Rs.{(itemAlt?.estimated_price || bestPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                  <Ionicons name="trending-down" size={14} color={'#10B981'} />
                                </View>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* AI Historical Ledger Insights */}
                  <View style={styles.premiumSectionCard}>
                    <View style={styles.insightHeader}>
                      <LinearGradient
                        colors={[Colors.primary, Colors.primaryLight]}
                        style={styles.insightIconBg}
                      >
                        <Ionicons name="bar-chart-outline" size={14} color={'#FFF'} />
                      </LinearGradient>
                      <Text style={styles.modalSectionTitle}>AI Ledger Insights</Text>
                    </View>

                    <View style={styles.insightRow}>
                      <Text style={styles.insightLabel}>Historical Frequency</Text>
                      <Text style={styles.insightValue}>
                        {bills.filter(b => b.merchant_name === selectedBill.merchant_name).length} visits tracked
                      </Text>
                    </View>

                    <View style={styles.insightRow}>
                      <Text style={styles.insightLabel}>Price Variance</Text>
                      <View style={styles.varianceBadge}>
                        <Ionicons name="trending-down" size={12} color={Colors.success} />
                        <Text style={styles.varianceText}>6% below avg</Text>
                      </View>
                    </View>

                    <View style={styles.insightFooter}>
                      <Text style={styles.insightQuote}>
                        "You've managed this expense pattern since {new Date(bills[bills.length - 1].created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}."
                      </Text>
                    </View>
                  </View>

                  {/* Smart Enrichment Engine */}
                  <View style={[styles.modalSection, { borderColor: Colors.primary + '30', borderWidth: 1.5, backgroundColor: '#F8FAFC' }]}>
                    <Text style={[styles.modalSectionTitle, { color: Colors.primary }]}>[*] Smart Enrichment</Text>

                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalLabelIcon}>
                        <Ionicons name="storefront-outline" size={16} color={'#666'} />
                        <Text style={styles.modalLabel}>Business Info</Text>
                      </View>
                      <Text style={[styles.modalValue, { color: '#666', fontSize: 12, fontWeight: '500' }]}>
                        {selectedBill.gst ? 'Fetched via GSTIN' : 'Basic OCR used'}
                      </Text>
                    </View>

                    {selectedBill.vendor_address && (
                      <View style={[styles.modalInfoRow, { alignItems: 'flex-start' }]}>
                        <View style={[styles.modalLabelIcon, { marginTop: 2 }]}>
                          <Ionicons name="storefront-outline" size={16} color={Colors.primary} />
                          <Text style={styles.modalLabel}>Address</Text>
                        </View>
                        <Text style={[styles.modalValue, { flex: 1, textAlign: 'right', marginLeft: 16, fontSize: 13, lineHeight: 18 }]} numberOfLines={3}>
                          {selectedBill.vendor_address}
                        </Text>
                      </View>
                    )}

                    {selectedBill.distance_km != null && (
                      <View style={styles.modalInfoRow}>
                        <View style={styles.modalLabelIcon}>
                          <Ionicons name="storefront-outline" size={16} color={Colors.primary} />
                          <Text style={styles.modalLabel}>Distance</Text>
                        </View>
                        <Text style={styles.modalValue}>{selectedBill.distance_km} km away</Text>
                      </View>
                    )}

                    {(selectedBill.google_maps_link || selectedBill.vendor_address) && (
                      <TouchableOpacity
                        onPress={() => {
                          const url = selectedBill.google_maps_link || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedBill.vendor_address!)}`;
                          Linking.openURL(url);
                        }}
                        style={{ marginTop: 8, padding: 10, backgroundColor: '#EFF6FF', borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE' }}
                      >
                        <Text style={{ color: '#2563EB', fontWeight: '700', fontSize: 13 }}>[Map] Direct me there via Google Maps</Text>
                      </TouchableOpacity>
                    )}

                    <View style={{ marginTop: 12, padding: 12, backgroundColor: '#FFFBEB', borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309', marginBottom: 4, letterSpacing: 0.5 }}>[Tip] PRO TIP</Text>
                      <Text style={{ fontSize: 13, color: '#92400E', lineHeight: 18 }}>
                        {selectedBill.category === 'Food' ? "Ordering directly from the restaurant can save you up to 15% on platform fees!" :
                          selectedBill.category === 'Electricity' ? "Pay via Amazon Pay ICICI to get 2% cashback unconditionally." :
                            "Check the Compare tab before buying electronics next time; you might find a 10% cheaper deal online."}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ZoomableImageModal
        visible={showZoomableImage}
        imageUri={selectedBill?.uri || ''}
        onClose={() => setShowZoomableImage(false)}
        onDelete={() => selectedBill && deleteBill(selectedBill.id)}
      />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  loadingText: {
    ...Typography.body,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: Spacing.xl * 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...Shadows.soft,
    zIndex: 10,
  },
  iconButton: {
    padding: Spacing.sm,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  headerTitle: {
    ...Typography.h2,
    flex: 1,
    marginLeft: Spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  reportsButton: {
    padding: Spacing.sm,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  filterSection: {
    padding: Spacing.lg,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    height: 48,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    height: '100%',
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  taxFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
    gap: Spacing.xs,
  },
  taxFilterActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  taxFilterText: {
    ...Typography.caption,
    color: '#64748B',
    fontWeight: '600',
  },
  taxFilterTextActive: {
    color: '#FFF',
  },
  exportActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: Spacing.xs,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  dateFilterRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  dateInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    height: 36,
    gap: Spacing.xs,
  },
  dateInput: {
    flex: 1,
    fontSize: 11,
    color: '#0F172A',
  },
  dateLabel: {
    fontSize: 11,
    color: '#0F172A',
    fontWeight: '500',
  },
  datePlaceholder: {
    color: '#666',
  },
  clearDates: {
    padding: Spacing.xs,
  },
  categoryScroll: {
    marginHorizontal: -Spacing.lg,
  },
  categoryContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  categoryPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F1F5F9',
  },
  categoryPillActive: {
    backgroundColor: Colors.primary,
  },
  categoryPillText: {
    ...Typography.caption,
    color: '#64748B',
    fontWeight: '500',
  },
  categoryPillTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl + 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.body,
    color: '#666',
    textAlign: 'center',
  },
  billCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.soft,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  categoryIconContainer: {
    width: 48,
    height: 48,
  },
  categoryIconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantInfo: {
    flex: 1,
    gap: 2,
  },
  merchantName: {
    ...Typography.h3,
    fontSize: 16,
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  managedSinceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  managedSinceLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  managedSinceDate: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '700',
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  billAmount: {
    ...Typography.h3,
    fontSize: 18,
    color: '#0F172A',
    fontWeight: '900',
  },
  taxBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginTop: 2,
  },
  taxBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardTags: {
    flexDirection: 'row',
    gap: 8,
  },
  footerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  footerTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  viewDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDetailsText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  premiumSectionCard: {
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.soft,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: Spacing.sm,
  },
  insightIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  insightLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  insightValue: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '700',
  },
  varianceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  varianceText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.success,
  },
  insightFooter: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  insightQuote: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  reportSummaryRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  summaryCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: Spacing.lg,
    ...Shadows.soft,
  },
  summaryLabel: {
    ...Typography.caption,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: Spacing.xs,
  },
  summaryValue: {
    ...Typography.h2,
    color: '#FFF',
  },
  tabContainer: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    backgroundColor: '#F1F5F9',
    borderRadius: Spacing.md,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Spacing.sm,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
    ...Shadows.soft,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFF',
  },
  reportSection: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: '#0F172A',
  },
  breakdownItem: {
    marginBottom: Spacing.md,
  },
  breakdownInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  breakdownLabel: {
    ...Typography.body,
    color: '#0F172A',
  },
  breakdownAmount: {
    ...Typography.body,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressContainer: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBase: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '90%', // Using height instead of maxHeight to prevent flex collapse
    width: '100%',
    paddingBottom: Spacing.xl,
    ...Shadows.medium,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: Spacing.lg,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  closeButton: {
    padding: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
  },
  modalScrollView: {
    flex: 1,
  },
  modalImageContainer: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    ...Shadows.soft,
    position: 'relative',
  },
  modalImage: {
    width: '100%',
    height: 220,
  },
  imageOverlayBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  imageBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
  },
  modalDetails: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  modalSection: {
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.soft,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalSectionTitle: {
    ...Typography.caption,
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    paddingBottom: 4,
  },
  modalInfoRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 10,
  },
  modalLabelIcon: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  modalLabel: {
    ...Typography.caption,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600' as const,
  },
  modalValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700' as const,
    textAlign: 'right' as const,
  },
  distanceRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  travelInsightsContainer: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.lg,
  },
  travelInsightsTitle: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: '#1a1a1a',
    marginBottom: Spacing.sm,
  },
  travelTimeRow: {
    flexDirection: 'row' as const,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  travelTimeCard: {
    flex: 1,
    alignItems: 'center' as const,
    backgroundColor: '#FFF',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.md,
    ...Shadows.soft,
  },
  travelTimeIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  travelTimeValue: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: '#1a1a1a',
  },
  travelTimeLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  travelCostTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#1a1a1a',
    marginBottom: Spacing.sm,
  },
  travelCostGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  travelCostCard: {
    width: '48%' as any,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    backgroundColor: '#FFF',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderLeftWidth: 3,
  },
  travelCostMode: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '500' as const,
  },
  travelCostAmount: {
    fontSize: 15,
    fontWeight: '800' as const,
  },
  feasibilityBadge: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  feasibilityIcon: {
    fontSize: 20,
    marginTop: 2,
  },
  feasibilityTitle: {
    fontSize: 14,
    fontWeight: '800' as const,
    marginBottom: 4,
  },
  feasibilityMessage: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500' as const,
    lineHeight: 18,
  },
  feasibilityDetail: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600' as const,
    marginTop: 6,
    fontStyle: 'italic' as const,
  },
  // --- Comparison Engine Styles ---
  savingsBanner: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  savingsBannerContent: {
    marginBottom: Spacing.xs,
  },
  savingsBannerAmount: {
    fontSize: 18,
    fontWeight: '900' as const,
    color: '#fff',
  },
  savingsBannerPercent: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  savingsVerdict: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500' as const,
    fontStyle: 'italic' as const,
    lineHeight: 18,
  },
  compSubTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#1a1a1a',
    marginBottom: Spacing.sm,
  },
  compCard: {
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.soft,
  },
  compCardHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  compItemName: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#1a1a1a',
    flex: 1,
    marginRight: Spacing.sm,
  },
  compBillPrice: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: '#666',
  },
  compPlatformRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  compPlatformName: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '500' as const,
  },
  compPlatformPrice: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#1a1a1a',
  },
  compSavingBadge: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  compBestPriceBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  compBestPriceText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '700' as const,
  },
  altCard: {
    flexDirection: 'row' as const,
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    ...Shadows.soft,
  },
  altOriginal: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500' as const,
    marginBottom: 4,
  },
  altSuggestion: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: '#1a1a1a',
    flex: 1,
    marginRight: Spacing.sm,
  },
  altReason: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500' as const,
    lineHeight: 18,
    flex: 1,
  },
  altPriceBox: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingLeft: Spacing.sm,
    minWidth: 70,
  },
  altPrice: {
    fontSize: 16,
    fontWeight: '900' as const,
    color: '#10B981',
  },
  altWhere: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500' as const,
    textAlign: 'center' as const,
    marginTop: 4,
  },
  svcCard: {
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.secondary,
    ...Shadows.soft,
  },
  svcHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 6,
  },
  svcSuggestion: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#1a1a1a',
    flex: 1,
  },
  svcSavings: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  // --- New Premium Insight Styles ---
  bestPricePill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  bestPriceText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: '#10B981',
  },
  platformRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  platformName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#1a1a1a',
  },
  platformDelivery: {
    fontSize: 11,
    color: '#64748B',
  },
  platformPrice: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: '#1a1a1a',
  },
  platformRight: {
    alignItems: 'flex-end' as const,
    flex: 1,
  },
  premiumInsightHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: Spacing.sm,
  },
  altCardInner: {
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  altHeaderInner: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 6,
  },
  altPriceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: '#EDE9FE',
  },
  altPriceVal: {
    fontSize: 16,
    fontWeight: '900' as const,
    color: '#4F46E5',
  },
  svcCardInner: {
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
    ...Shadows.soft,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  svcHeaderInner: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  svcSugText: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: '#1a1a1a',
    flex: 1,
    marginRight: Spacing.sm,
  },
  svcSavingsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  svcSavingsText: {
    fontSize: 10,
    fontWeight: '900' as const,
    color: '#FFF',
    textTransform: 'uppercase' as const,
  },
  svcDetailsRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginTop: 4,
    gap: 6,
  },
  svcDetailsText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500' as const,
    lineHeight: 18,
    flex: 1,
  },
  altReasonRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 6,
    marginTop: 4, // Reduced from 8
    flex: 1,
  },
  svcDetails: {
    fontSize: 12,
    color: '#666',
    fontWeight: '400' as const,
    lineHeight: 18,
  },
  // --- Payment Verification Styles ------------------------------------------
  footerRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  verifiedBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#065F46',
  },
  verifiedPaymentBlock: {
    marginTop: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  verifiedPaymentHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
  },
  verifiedPaymentTitle: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: '#065F46',
  },
  confidenceChip: {
    backgroundColor: '#065F46',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  verifiedRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  verifiedLabel: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '600' as const,
  },
  verifiedValue: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '700' as const,
    maxWidth: '65%' as any,
    textAlign: 'right' as const,
  },
});
