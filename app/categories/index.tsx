import BudgetProgress from '@/app/components/BudgetProgress';
import CustomAlert from '@/app/components/CustomAlert';
import ZoomableImageModal from '@/app/components/ZoomableImageModal';
import { Budget } from '@/types/budget';
import { BudgetCalculator } from '@/utils/budgetCalculator';
import { BudgetNotificationService } from '@/utils/budgetNotifications';
import { BudgetStorage } from '@/utils/budgetStorage';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Shadows, Spacing } from '../../constants/Theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Bill {
  id: string;
  category: string;
  amount: number;
  uri: string;
  merchant_name?: string;
  created_at?: string;
  invoice_date?: string;
  invoice_number?: string;
  gst?: string;
  user_id?: string;
}

// Category icons & accent colors for a richer UI
const CATEGORY_META: Record<string, { icon: string; color: string; bg: string }> = {
  'Food': { icon: 'fast-food-outline', color: '#F97316', bg: '#FFF7ED' },
  'Electricity': { icon: 'flash-outline', color: '#EAB308', bg: '#FEFCE8' },
  'Water': { icon: 'water-outline', color: '#06B6D4', bg: '#ECFEFF' },
  'Rent': { icon: 'home-outline', color: '#8B5CF6', bg: '#F5F3FF' },
  'Internet': { icon: 'wifi-outline', color: '#3B82F6', bg: '#EFF6FF' },
  'Shopping': { icon: 'bag-handle-outline', color: '#EC4899', bg: '#FDF2F8' },
  'Entertainment': { icon: 'film-outline', color: '#A855F7', bg: '#FAF5FF' },
  'Medical': { icon: 'medkit-outline', color: '#EF4444', bg: '#FEF2F2' },
  'Travel': { icon: 'car-outline', color: '#14B8A6', bg: '#F0FDFA' },
  'Others': { icon: 'ellipsis-horizontal-outline', color: '#64748B', bg: '#F8FAFC' },
};

const getCategoryMeta = (category: string) =>
  CATEGORY_META[category] || CATEGORY_META['Others'];

export default function CategoriesList() {

  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [filteredBills, setFilteredBills] = useState<Bill[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortOption, setSortOption] =
    useState<'newest' | 'oldest' | 'custom'>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [showZoomableImage, setShowZoomableImage] = useState(false);


  // User account creation date
  const [userCreatedAt, setUserCreatedAt] = useState<Date>(new Date());

  // Dropdown state for date range selection
  const [selectedDateRange, setSelectedDateRange] = useState<string>('all');
  const [dateRangeOptions, setDateRangeOptions] = useState<{ label: string, value: string, startDate?: Date, endDate?: Date }[]>([]);

  // Budget tracking state
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, Budget>>({});
  const [categorySpending, setCategorySpending] = useState<Record<string, number>>({});

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
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Error fetching user:", error);
        // Set a default fallback, e.g., one year ago
        setUserCreatedAt(new Date(new Date().setFullYear(new Date().getFullYear() - 1)));
      } else if (data.user) {
        setUserCreatedAt(new Date(data.user.created_at));
      }
    };
    fetchUser();
  }, []);

  const generateDateRangeOptions = useCallback(() => {
    const now = new Date();
    const userCreated = userCreatedAt;
    const options = [
      { label: 'All Time', value: 'all', startDate: userCreated, endDate: now },
      { label: 'Today', value: 'today', startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()), endDate: now },
      { label: 'This Week', value: 'week', startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), endDate: now },
      { label: 'This Month', value: 'month', startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: now },
      { label: 'Last 3 Months', value: '3months', startDate: new Date(now.getFullYear(), now.getMonth() - 3, 1), endDate: now },
      { label: 'This Year', value: 'year', startDate: new Date(now.getFullYear(), 0, 1), endDate: now },
    ];

    // Filter options to only include those after user account creation
    return options.filter(option =>
      option.startDate >= userCreated || option.value === 'all'
    );
  }, [userCreatedAt]);

  useEffect(() => {
    const options = generateDateRangeOptions();
    setDateRangeOptions(options);
  }, [userCreatedAt, generateDateRangeOptions]);

  useFocusEffect(
    React.useCallback(() => {
      loadBills();
      loadBudgets();
      initializeNotifications();
    }, [])
  );

  const initializeNotifications = async () => {
    try {
      await BudgetNotificationService.requestPermissions();
    } catch (error) {
      console.error('Error initializing notifications:', error);
    }
  };

  const loadBills = async () => {
    setLoading(true);
    try {
      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.error('User not authenticated');
        return;
      }

      // Get user account creation date
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.created_at) {
        setUserCreatedAt(new Date(userData.user.created_at));
      }

      // Only fetch bills for the current user
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', session.user.id); // Filter by current user

      if (error) {
        console.error('Supabase error:', error);
        showAlert('Error', 'Failed to load bills. Pull down to retry.');
        return;
      }
      setBills((data as Bill[]) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadBudgets = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Load budgets for current user
      const budgets = await BudgetStorage.getBudgets(session.user.id);
      const budgetMap: Record<string, Budget> = {};
      budgets.forEach(budget => {
        budgetMap[budget.category] = budget;
      });
      setCategoryBudgets(budgetMap);

      // Calculate spending for each category
      const spendingData = await BudgetCalculator.calculateCategorySpending(
        session.user.id,
        budgets
      );

      const spendingMap: Record<string, number> = {};
      spendingData.forEach(item => {
        spendingMap[item.category] = item.spent;
      });
      setCategorySpending(spendingMap);

      // Check budget alerts for each category
      for (const category of Object.keys(budgetMap)) {
        const budget = budgetMap[category];
        const spent = spendingMap[category] || 0;

        if (budget && budget.amount > 0) {
          await BudgetNotificationService.checkBudgetAlerts(
            session.user.id,
            category,
            spent,
            budget
          );
        }
      }
    } catch (error) {
      console.error('Error loading budgets:', error);
    }
  };

  const categories = Array.from(
    new Set(
      bills.map(b =>
        b.category && b.category.trim().length ? b.category : 'Others'
      )
    )
  ).sort();
  const pillTabs = ['All', ...categories];

  const formatDateTime = (value?: string | Date) => {
    const date =
      !value ? new Date() : typeof value === 'string' ? new Date(value) : value;
    return date.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleBillPress = (bill: Bill) => {
    setSelectedBill(bill);
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleImagePress = () => {
    setShowZoomableImage(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedBill(null);
    setShowZoomableImage(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const deleteBill = async (billId: string) => {
    setPendingDeleteId(billId);
    showAlert('Delete Bill', 'Are you sure you want to delete this bill?', [
      { text: 'Cancel', onPress: () => setPendingDeleteId(null) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(billId) },
    ]);
  };

  const confirmDelete = async (billId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('User not authenticated');
      const { error } = await supabase
        .from('bills')
        .delete()
        .eq('id', billId)
        .eq('user_id', session.user.id);
      if (error) throw error;
      const updated = bills.filter(b => b.id !== billId);
      setBills(updated);
      setSelectedBill(null);
      setModalVisible(false);
    } catch (e: any) {
      showAlert('Error', e?.message ? String(e.message) : 'Failed to delete bill');
    } finally {
      setPendingDeleteId(null);
    }
  };


  const onRefresh = async () => {
    setRefreshing(true);
    await loadBills();
    setRefreshing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSortSelect = (sort: 'newest' | 'oldest' | 'custom') => {
    setSortOption(sort);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // recompute filtered bills + selectedStart/End
  useEffect(() => {
    let filtered = bills;

    // category
    filtered = filtered.filter(b =>
      selectedCategory === 'All'
        ? true
        : (b.category && b.category.trim().length ? b.category : 'Others') ===
        selectedCategory
    );

    // search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(b =>
        (b.merchant_name || '').toLowerCase().includes(q) ||
        (b.category || '').toLowerCase().includes(q) ||
        (b.amount || 0).toString().includes(q)
      );
    }

    // date range logic using dropdown
    if (sortOption === 'custom' && selectedDateRange !== 'all') {
      const selectedOption = dateRangeOptions.find(opt => opt.value === selectedDateRange);
      if (selectedOption) {
        filtered = filtered.filter(b => {
          const billDate = new Date(b.created_at || 0);
          return billDate >= (selectedOption.startDate || new Date()) &&
            billDate <= (selectedOption.endDate || new Date());
        });
      }
    }

    // sort
    filtered.sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      if (sortOption === 'oldest') return ta - tb;
      return tb - ta;
    });

    setFilteredBills(filtered);
  }, [bills, selectedCategory, searchQuery, sortOption, selectedDateRange, dateRangeOptions]);

  const totalSpent = filteredBills.reduce(
    (sum, b) => sum + (b.amount || 0),
    0
  );

  const handleBudgetSetup = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to budget setup screen
    router.push('/budget-setup');
  };

  // Compute quick category stats for overview cards
  const categoryStats = categories.map(cat => {
    const catBills = bills.filter(b => (b.category && b.category.trim().length ? b.category : 'Others') === cat);
    const total = catBills.reduce((s, b) => s + (b.amount || 0), 0);
    return { category: cat, count: catBills.length, total };
  }).sort((a, b) => b.total - a.total);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={filteredBills}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListHeaderComponent={
          <>
            {/* ─── Premium Header ─── */}
            <View style={styles.headerWrapper}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.headerTitle}>My Bills</Text>
                  <Text style={styles.headerSubtitle}>{filteredBills.length} transactions</Text>
                </View>
                <TouchableOpacity
                  style={styles.budgetButton}
                  onPress={handleBudgetSetup}
                  activeOpacity={0.8}
                >
                  <Ionicons name="wallet-outline" size={16} color={Colors.primary} />
                  <Text style={styles.budgetButtonText}>Budgets</Text>
                </TouchableOpacity>
              </View>

              {/* Total Spend Card */}
              <LinearGradient
                colors={['#0F766E', '#10B981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.totalCard}
              >
                <View style={styles.totalCardInner}>
                  <View>
                    <Text style={styles.totalLabel}>
                      {selectedCategory === 'All' ? 'Total Spend' : selectedCategory}
                    </Text>
                    <Text style={styles.totalValue}>
                      ₹{totalSpent.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.totalCardRight}>
                    <View style={styles.totalBillsBadge}>
                      <Text style={styles.totalBillsBadgeText}>
                        {filteredBills.length}
                      </Text>
                    </View>
                    <Text style={styles.totalBillsLabel}>bills</Text>
                  </View>
                </View>

                {/* Mini category breakdown bar */}
                {categoryStats.length > 0 && selectedCategory === 'All' && (
                  <View style={styles.miniBreakdown}>
                    <View style={styles.miniBreakdownBar}>
                      {categoryStats.slice(0, 5).map((cs, idx) => {
                        const pct = totalSpent > 0 ? (cs.total / totalSpent) * 100 : 0;
                        if (pct < 2) return null;
                        return (
                          <View
                            key={cs.category}
                            style={[
                              styles.miniBreakdownSegment,
                              {
                                width: `${pct}%` as any,
                                backgroundColor: getCategoryMeta(cs.category).color,
                                borderTopLeftRadius: idx === 0 ? 4 : 0,
                                borderBottomLeftRadius: idx === 0 ? 4 : 0,
                              }
                            ]}
                          />
                        );
                      })}
                    </View>
                  </View>
                )}
              </LinearGradient>
            </View>

            {/* ─── Controls ─── */}
            <View style={styles.controlsWrapper}>
              {/* Search */}
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search bills, merchants..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={18} color="#CBD5E1" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Category Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillsContainer}
              >
                {pillTabs.map(tab => {
                  const isActive = selectedCategory === tab;
                  const meta = tab === 'All' ? { icon: 'grid-outline', color: Colors.primary, bg: '#F0FDF4' } : getCategoryMeta(tab);
                  return (
                    <TouchableOpacity
                      key={tab}
                      style={[
                        styles.pill,
                        isActive && { backgroundColor: meta.color, borderColor: meta.color },
                      ]}
                      onPress={() => handleCategorySelect(tab)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={meta.icon as any}
                        size={14}
                        color={isActive ? '#FFF' : meta.color}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.pillText,
                          isActive && styles.pillTextActive,
                        ]}
                      >
                        {tab}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Sort Controls */}
              <View style={styles.sortRow}>
                <View style={styles.sortSegment}>
                  {(['newest', 'oldest', 'custom'] as const).map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.sortButton,
                        sortOption === opt && styles.sortButtonActive,
                      ]}
                      onPress={() => handleSortSelect(opt)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.sortText,
                          sortOption === opt && styles.sortTextActive,
                        ]}
                      >
                        {opt === 'custom' ? 'Range' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Date Range Options */}
              {sortOption === 'custom' && (
                <View style={styles.dateRangeSection}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRangePills}>
                    {dateRangeOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.dateRangePill,
                          selectedDateRange === option.value && styles.dateRangePillActive,
                        ]}
                        onPress={() => {
                          setSelectedDateRange(option.value);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.dateRangePillText,
                            selectedDateRange === option.value && styles.dateRangePillTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Budget Progress Section */}
              {selectedCategory !== 'All' && categoryBudgets[selectedCategory] && (
                <View style={styles.budgetSection}>
                  <BudgetProgress
                    category={selectedCategory}
                    spending={categorySpending[selectedCategory] || 0}
                    budget={categoryBudgets[selectedCategory]}
                    showDetails={true}
                  />
                </View>
              )}
            </View>

            {/* Section label */}
            <View style={styles.sectionLabel}>
              <View style={styles.sectionLabelDot} />
              <Text style={styles.sectionLabelText}>
                {selectedCategory === 'All' ? 'ALL TRANSACTIONS' : selectedCategory.toUpperCase()}
              </Text>
              <View style={styles.sectionLabelLine} />
            </View>
          </>
        }
        renderItem={({ item, index }) => {
          const meta = getCategoryMeta(item.category);
          return (
            <TouchableOpacity
              style={styles.rowCard}
              onPress={() => handleBillPress(item)}
              activeOpacity={0.7}
            >
              {/* Category Color Accent */}
              <View style={[styles.rowAccent, { backgroundColor: meta.color }]} />

              <View style={styles.rowContent}>
                {/* Left: Thumbnail + Info */}
                <View style={styles.billClickArea}>
                  <View style={styles.thumbnailWrapper}>
                    <Image source={{ uri: item.uri }} style={styles.thumbnail} contentFit="cover" />
                    <View style={[styles.thumbnailBadge, { backgroundColor: meta.color }]}>
                      <Ionicons name={meta.icon as any} size={10} color="#FFF" />
                    </View>
                  </View>

                  <View style={styles.billInfo}>
                    <Text style={styles.billMerchant} numberOfLines={1}>
                      {item.merchant_name || 'Unknown Merchant'}
                    </Text>
                    <View style={styles.billMetaRow}>
                      <View style={[styles.categoryChip, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.categoryChipText, { color: meta.color }]}>
                          {item.category || 'Others'}
                        </Text>
                      </View>
                      <Text style={styles.billDate}>
                        {formatDateTime(item.created_at)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Right: Amount */}
                <View style={styles.amountWrapper}>
                  <Text style={styles.amountText}>
                    ₹{item.amount.toLocaleString('en-IN')}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonContainer}>
              {[1, 2, 3, 4, 5].map(i => (
                <View key={i} style={styles.skeletonRow}>
                  <View style={styles.skeletonAccent} />
                  <View style={styles.skeletonBody}>
                    <View style={styles.skeletonThumbnail} />
                    <View style={styles.skeletonText}>
                      <View style={styles.skeletonLine} />
                      <View style={styles.skeletonLineShort} />
                    </View>
                    <View style={styles.skeletonAmount} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrapper}>
                <Ionicons name="receipt-outline" size={48} color="#CBD5E1" />
              </View>
              <Text style={styles.emptyText}>No bills found</Text>
              <Text style={styles.emptySubText}>
                {searchQuery
                  ? "We couldn't find any bills matching your search"
                  : 'Start scanning bills to see them organized here'}
              </Text>
            </View>
          )
        }
      />

      {/* ─── Bill Details Modal ─── */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Handle bar */}
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={styles.modalHeaderIcon}>
                  <Ionicons name="receipt-outline" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.modalTitle}>Bill Details</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedBill && (
              <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
                <View style={styles.modalImageContainer}>
                  <TouchableOpacity onPress={handleImagePress} activeOpacity={0.9}>
                    <Image
                      source={{ uri: selectedBill.uri }}
                      style={styles.modalImage}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.5)']}
                    style={styles.imageGradientOverlay}
                  >
                    <View style={styles.imageOverlayBadge}>
                      <Ionicons name="expand-outline" size={12} color="#FFF" />
                      <Text style={styles.imageBadgeText}>Tap to zoom</Text>
                    </View>
                  </LinearGradient>
                </View>

                <View style={styles.modalDetails}>
                  {/* Amount Hero */}
                  <View style={styles.modalAmountHero}>
                    <Text style={styles.modalAmountLabel}>Amount</Text>
                    <Text style={styles.modalAmountValue}>
                      ₹{(selectedBill.amount || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Overview</Text>
                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalLabelIcon}>
                        <Ionicons name="storefront-outline" size={16} color="#94A3B8" />
                        <Text style={styles.modalLabel}>Merchant</Text>
                      </View>
                      <Text style={styles.modalValue}>{selectedBill.merchant_name || 'N/A'}</Text>
                    </View>
                    <View style={styles.modalDivider} />
                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalLabelIcon}>
                        <Ionicons name="pricetag-outline" size={16} color="#94A3B8" />
                        <Text style={styles.modalLabel}>Category</Text>
                      </View>
                      <View style={[styles.categoryChip, { backgroundColor: getCategoryMeta(selectedBill.category).bg }]}>
                        <Text style={[styles.categoryChipText, { color: getCategoryMeta(selectedBill.category).color }]}>
                          {selectedBill.category || 'Others'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.modalDivider} />
                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalLabelIcon}>
                        <Ionicons name="calendar-outline" size={16} color="#94A3B8" />
                        <Text style={styles.modalLabel}>Date</Text>
                      </View>
                      <Text style={styles.modalValue}>{formatDateTime(selectedBill.created_at)}</Text>
                    </View>
                  </View>

                  {(selectedBill.invoice_number || (selectedBill.gst && selectedBill.gst !== 'N/A')) && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Metadata</Text>
                      {selectedBill.invoice_number && (
                        <>
                          <View style={styles.modalInfoRow}>
                            <View style={styles.modalLabelIcon}>
                              <Ionicons name="document-text-outline" size={16} color="#94A3B8" />
                              <Text style={styles.modalLabel}>Invoice No.</Text>
                            </View>
                            <Text style={styles.modalValue}>{selectedBill.invoice_number}</Text>
                          </View>
                          {selectedBill.gst && selectedBill.gst !== 'N/A' && <View style={styles.modalDivider} />}
                        </>
                      )}
                      {selectedBill.gst && selectedBill.gst !== 'N/A' && (
                        <View style={styles.modalInfoRow}>
                          <View style={styles.modalLabelIcon}>
                            <Ionicons name="shield-checkmark-outline" size={16} color="#94A3B8" />
                            <Text style={styles.modalLabel}>GSTIN</Text>
                          </View>
                          <Text style={[styles.modalValue, { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{selectedBill.gst}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </ScrollView>
            )}

            {selectedBill && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.deleteButtonModal}
                  onPress={() => deleteBill(selectedBill.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={styles.deleteButtonText}>Delete Bill</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        </View>
      </Modal>

      {/* Zoomable Image Modal */}
      <ZoomableImageModal
        visible={showZoomableImage}
        imageUri={selectedBill?.uri || ''}
        onClose={() => setShowZoomableImage(false)}
        onDelete={() => {
          if (selectedBill) deleteBill(selectedBill.id);
        }}
      />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },

  // ─── Header ───
  headerWrapper: {
    backgroundColor: '#FFF',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...Shadows.soft,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 2,
  },
  budgetButton: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  budgetButtonText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },

  // Total Card
  totalCard: {
    borderRadius: 20,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  totalCardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -1,
  },
  totalCardRight: {
    alignItems: 'center',
  },
  totalBillsBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  totalBillsBadgeText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
  },
  totalBillsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  miniBreakdown: {
    marginTop: 16,
  },
  miniBreakdownBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  miniBreakdownSegment: {
    height: '100%',
  },

  // ─── Controls ───
  controlsWrapper: {
    paddingBottom: Spacing.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  pillsContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
  },
  pillText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  sortRow: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  sortSegment: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sortButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  sortButtonActive: {
    backgroundColor: '#0F766E',
  },
  sortText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sortTextActive: {
    color: '#FFF',
  },

  // Date Range
  dateRangeSection: {
    marginBottom: Spacing.xs,
  },
  dateRangePills: {
    paddingHorizontal: Spacing.lg,
    gap: 8,
    paddingVertical: 4,
  },
  dateRangePill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
  },
  dateRangePillActive: {
    borderColor: Colors.primary,
    backgroundColor: '#F0FDF4',
  },
  dateRangePillText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  dateRangePillTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  budgetSection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // ─── Section Label ───
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
    gap: 8,
  },
  sectionLabelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionLabelLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },

  // ─── Bill Row Cards ───
  listContent: {
    paddingBottom: Spacing.xl * 2,
  },
  rowCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 10,
    marginHorizontal: Spacing.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Shadows.soft,
  },
  rowAccent: {
    width: 4,
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 12,
    paddingRight: 16,
  },
  billClickArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  thumbnailWrapper: {
    position: 'relative',
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  thumbnailBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  billInfo: {
    flex: 1,
    gap: 4,
  },
  billMerchant: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  billMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryChipText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  billDate: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  amountWrapper: {
    alignItems: 'flex-end',
    gap: 2,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },

  // ─── Empty / Skeleton ───
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  emptySubText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  skeletonContainer: {
    paddingTop: 20,
    paddingHorizontal: Spacing.lg,
  },
  skeletonRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  skeletonAccent: {
    width: 4,
    backgroundColor: '#E2E8F0',
  },
  skeletonBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  skeletonThumbnail: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  skeletonText: {
    flex: 1,
    gap: 8,
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    width: '75%',
  },
  skeletonLineShort: {
    height: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 5,
    width: '40%',
  },
  skeletonAmount: {
    width: 60,
    height: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 7,
  },

  // ─── Modal ───
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '94%',
    paddingBottom: Spacing.xl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  modalHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollView: {
    flex: 1,
  },
  modalImageContainer: {
    marginHorizontal: Spacing.lg,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    position: 'relative',
  },
  modalImage: {
    width: '100%',
    height: 220,
  },
  imageGradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingRight: 14,
    paddingBottom: 12,
  },
  imageOverlayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  imageBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalDetails: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  modalAmountHero: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalAmountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  modalAmountValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -1,
  },
  modalSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalSectionTitle: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  modalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  modalLabelIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  modalValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
    textAlign: 'right',
    maxWidth: '50%',
  },
  modalFooter: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? Spacing.lg : Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  deleteButtonModal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
