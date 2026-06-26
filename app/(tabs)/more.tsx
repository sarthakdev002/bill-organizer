import { Colors, Shadows, Spacing } from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomAlert from '../components/CustomAlert';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (width - Spacing.lg * 2 - CARD_GAP) / 2;

interface FeatureCard {
  id: string;
  icon: string;
  ionicon: string;
  title: string;
  subtitle: string;
  route: string;
  gradient: [string, string];
  accent: string;
}

const FEATURES: FeatureCard[] = [
  {
    id: 'compare',
    icon: '🔍',
    ionicon: 'search-outline',
    title: 'Compare',
    subtitle: 'AI price comparison & alternatives',
    route: '/(tabs)/compare',
    gradient: ['#6366F1', '#4F46E5'],
    accent: '#6366F1',
  },
  {
    id: 'fuel',
    icon: '⛽',
    ionicon: 'speedometer-outline',
    title: 'Fuel Tracker',
    subtitle: 'Mileage, cost/km & analytics',
    route: '/(tabs)/fuel',
    gradient: ['#F59E0B', '#D97706'],
    accent: '#F59E0B',
  },
  {
    id: 'creditcard',
    icon: '💳',
    ionicon: 'card-outline',
    title: 'Card Analyzer',
    subtitle: 'Statement insights & alerts',
    route: '/(tabs)/creditcard',
    gradient: ['#3B82F6', '#2563EB'],
    accent: '#3B82F6',
  },
  {
    id: 'stocks',
    icon: '📈',
    ionicon: 'trending-up-outline',
    title: 'Stock Analyzer',
    subtitle: 'P&L, tax reports & portfolio',
    route: '/(tabs)/stocks',
    gradient: ['#10B981', '#059669'],
    accent: '#10B981',
  },
  {
    id: 'bills-table',
    icon: '🧾',
    ionicon: 'document-text-outline',
    title: 'Reports',
    subtitle: 'Export, filter & analyze bills',
    route: '/bills-table',
    gradient: ['#8B5CF6', '#7C3AED'],
    accent: '#8B5CF6',
  },
  {
    id: 'budget',
    icon: '💰',
    ionicon: 'wallet-outline',
    title: 'Budget Setup',
    subtitle: 'Set category spending limits',
    route: '/budget-setup',
    gradient: ['#EC4899', '#DB2777'],
    accent: '#EC4899',
  },
];

export default function MoreScreen() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState('');
  const [refreshing, setRefreshing] = useState(false);
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
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) setUserEmail(session.user.email);
    })();
  }, Array.from([]));

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) setUserEmail(session.user.email);
    setRefreshing(false);
  }, []);

  const handleLogout = () => {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerWrapper}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>More</Text>
              <Text style={styles.headerSub}>Tools & configuration</Text>
            </View>
            <View style={styles.headerIconWrapper}>
              <Ionicons name="apps-outline" size={22} color={Colors.primary} />
            </View>
          </View>
        </View>

        {/* Section Label */}
        <View style={styles.sectionLabel}>
          <View style={styles.sectionLabelDot} />
          <Text style={styles.sectionLabelText}>TOOLS</Text>
          <View style={styles.sectionLabelLine} />
        </View>

        {/* Feature Grid */}
        <View style={styles.grid}>
          {FEATURES.map(feature => (
            <TouchableOpacity
              key={feature.id}
              style={styles.card}
              onPress={() => router.push(feature.route as any)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={feature.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradient}
              >
                <View style={styles.cardIconWrapper}>
                  <Ionicons name={feature.ionicon as any} size={24} color="rgba(255,255,255,0.9)" />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{feature.title}</Text>
                  <Text style={styles.cardSubtitle}>{feature.subtitle}</Text>
                </View>
                <View style={styles.cardArrow}>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        {/* Section Label */}
        <View style={[styles.sectionLabel, { marginTop: Spacing.xl }]}>
          <View style={styles.sectionLabelDot} />
          <Text style={styles.sectionLabelText}>ACCOUNT</Text>
          <View style={styles.sectionLabelLine} />
        </View>

        {/* Account Section */}
        <View style={styles.accountCard}>
          <View style={styles.accountRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{userEmail.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountEmail} numberOfLines={1}>{userEmail || 'Not signed in'}</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.accountHint}>Signed in</Text>
              </View>
            </View>
          </View>

          <View style={styles.accountDivider} />

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <View style={styles.logoutIconWrapper}>
              <Ionicons name="log-out-outline" size={16} color="#EF4444" />
            </View>
            <Text style={styles.logoutText}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <View style={styles.appInfoDot} />
          <Text style={styles.appName}>Bill Organizer</Text>
          <Text style={styles.appVersion}>v2.0 · AI-powered</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
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
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 2,
  },
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

  // Section Label
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
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
  },
  sectionLabelLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 20,
    overflow: 'hidden',
    ...Shadows.soft,
  },
  cardGradient: {
    padding: Spacing.md,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  cardIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 15,
  },
  cardArrow: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
  },

  // Account
  accountCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Shadows.soft,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
  },
  accountEmail: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  accountHint: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  accountDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: Spacing.md,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: Spacing.xs,
  },
  logoutIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },

  // App Info
  appInfo: {
    alignItems: 'center',
    marginTop: Spacing.xl * 1.5,
    gap: 4,
  },
  appInfoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    marginBottom: 8,
  },
  appName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  appVersion: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '500',
  },
});
