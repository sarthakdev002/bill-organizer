import { Config } from '@/constants/Config';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/Theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Keyboard,
    Linking,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const BACKEND_BASE_URL = Config.BACKEND_URL;

const CATEGORIES = [
    { key: 'Electronics', icon: '[E]', label: 'Electronics' },
    { key: 'Groceries', icon: '[G]', label: 'Groceries' },
    { key: 'Travel', icon: '[T]', label: 'Travel' },
    { key: 'Salon & Beauty', icon: '[S]', label: 'Salon' },
    { key: 'Repairs', icon: '[R]', label: 'Repairs' },
    { key: 'Food', icon: '[F]', label: 'Food' },
    { key: 'Medical', icon: '[M]', label: 'Medical' },
    { key: 'Fashion', icon: '[C]', label: 'Fashion' },
];

const QUICK_SEARCHES: Record<string, string[]> = {
    'Electronics': ['iPhone 16', 'Samsung Galaxy S24', 'MacBook Air M3', 'Sony WH-1000XM5', 'iPad Air'],
    'Groceries': ['Basmati Rice 5kg', 'Amul Butter 500g', 'Olive Oil 1L', 'Tata Tea 1kg', 'Aashirvaad Atta 10kg'],
    'Travel': ['Delhi to Mumbai flight', 'Goa hotel 3 nights', 'Kerala backwater cruise', 'Rajdhani Express ticket'],
    'Salon & Beauty': ['Haircut for men', 'Bridal makeup', 'Hair spa treatment', 'Manicure pedicure'],
    'Repairs': ['AC service', 'Washing machine repair', 'Phone screen replacement', 'Laptop service'],
    'Food': ['Butter chicken meal', 'Pizza delivery', 'Biryani for 4', 'South Indian thali'],
    'Medical': ['Dolo 650', 'Crocin Advance', 'Blood pressure monitor', 'Vitamin D3 supplements'],
    'Fashion': ['Levi\'s jeans', 'Nike Air Max', 'Cotton kurta set', 'Formal shirt men'],
};

export default function CompareScreen() {


    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Electronics');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const scrollRef = useRef<ScrollView>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const startPulse = useCallback(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, [pulseAnim]);

    const handleSearch = async (query?: string) => {
        const q = (query || searchQuery).trim();
        if (!q) return;

        Keyboard.dismiss();
        setLoading(true);
        setError(null);
        setResults(null);
        setHasSearched(true);
        startPulse();

        try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/compare-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, category: selectedCategory }),
      });

            const data = await response.json();
            if (data.error) throw new Error(data.error);
            setResults(data);

            setTimeout(() => {
                scrollRef.current?.scrollTo({ y: 280, animated: true });
            }, 300);
        } catch (e: any) {
            setError(e.message || 'Something went wrong. Check your connection.');
        } finally {
            setLoading(false);
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
    };

    const handleQuickSearch = (query: string) => {
        setSearchQuery(query);
        handleSearch(query);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        // If there's a previous search, we could re-run it, 
        // but typically for compare, we just clear and let the user re-submit if needed,
        // or just simulate a refresh pulse.
        if (searchQuery) {
            await handleSearch(searchQuery);
        }
        setRefreshing(false);
    }, [searchQuery]);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={Colors.primary}
                    />
                }
            >
                {/* Header */}
                <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
                    <TouchableOpacity onPress={() => router.push('/(tabs)/more')} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={20} color={'#0F172A'} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Comparison</Text>
                        <Text style={styles.headerSub}>Find the best value for your products</Text>
                    </View>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={20} color="#666" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search any product or service..."
                            placeholderTextColor={'#666'}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={() => handleSearch()}
                            returnKeyType="search"
                        />
                        {searchQuery !== '' && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close" size={18} color="#666" />
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity
                        style={styles.searchButton}
                        onPress={() => handleSearch()}
                        disabled={loading || !searchQuery.trim()}
                    >
                        <LinearGradient
                            colors={loading ? ['#6366F1', '#4F46E5'] : ['#818CF8', '#6366F1']}
                            style={styles.searchButtonGradient}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Ionicons name="search" size={20} color="#666" />
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {/* Category Chips */}
                <View style={styles.categorySection}>
                    <Text style={styles.categorySectionTitle}>CATEGORIES</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryScroll}
                    >
                        {CATEGORIES.map(cat => (
                            <TouchableOpacity
                                key={cat.key}
                                style={[
                                    styles.categoryChip,
                                    selectedCategory === cat.key && styles.categoryChipActive,
                                ]}
                                onPress={() => setSelectedCategory(cat.key)}
                            >
                                <Text style={styles.categoryChipIcon}>{cat.icon}</Text>
                                <Text
                                    style={[
                                        styles.categoryChipText,
                                        selectedCategory === cat.key && styles.categoryChipTextActive,
                                    ]}
                                >
                                    {cat.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Quick Searches */}
                {!hasSearched && (
                    <View style={styles.quickSection}>
                        <View style={styles.quickHeader}>
                            <Ionicons name="flash-outline" size={16} color="#666" />
                            <Text style={styles.quickTitle}>Quick Search</Text>
                        </View>
                        <View style={styles.quickGrid}>
                            {(QUICK_SEARCHES[selectedCategory] || []).map((item, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={styles.quickChip}
                                    onPress={() => handleQuickSearch(item)}
                                >
                                    <Text style={styles.quickChipText}>{item}</Text>
                                    <Ionicons name="chevron-forward" size={12} color="#666" />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* Loading State */}
                {loading && (
                    <View style={styles.loadingContainer}>
                        <Animated.View style={{ opacity: pulseAnim }}>
                            <LinearGradient
                                colors={['#EEF2FF', '#E0E7FF']}
                                style={styles.loadingCard}
                            >
                                <ActivityIndicator size="large" color={Colors.primary} />
                                <Text style={styles.loadingTitle}>Searching across platforms...</Text>
                                <Text style={styles.loadingSubtitle}>
                                    Comparing prices on Amazon, Flipkart, JioMart & more
                                </Text>
                            </LinearGradient>
                        </Animated.View>
                    </View>
                )}

                {/* Error State */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorIcon}>⚠️</Text>
                        <Text style={styles.errorTitle}>Search Failed</Text>
                        <Text style={styles.errorMessage}>{error}</Text>
                        <TouchableOpacity style={styles.retryButton} onPress={() => handleSearch()}>
                            <Text style={styles.retryText}>Try Again</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Results */}
                {results && !loading && (
                    <View style={styles.resultsContainer}>
                        {/* Savings Summary Banner */}
                        {results.savings_summary && (
                            <LinearGradient
                                colors={['#4F46E5', '#6366F1', '#818CF8']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.savingsBanner, Shadows.medium]}
                            >
                                <View style={styles.savingsRow}>
                                    <View style={{ flex: 1.2 }}>
                                        <Text style={styles.savingsLabel}>Lowest Found</Text>
                                        <Text style={styles.savingsAmount}>
                                            Rs.{results.savings_summary.best_price_found?.toLocaleString()}
                                        </Text>
                                    </View>
                                    <View style={styles.savingsDivider} />
                                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                        <Text style={styles.savingsLabel}>Potential Savings</Text>
                                        <Text style={[styles.savingsAmount, { color: '#6EE7B7' }]}>
                                            {results.savings_summary.savings_percent > 0
                                                ? `Rs.${results.savings_summary.potential_savings?.toLocaleString()} `
                                                : 'Best Deal!'}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.verdictBox}>
                                    <Ionicons name="flash-outline" size={14} color="#666" />
                                    <Text style={styles.savingsVerdict}>
                                        {results.savings_summary.verdict}
                                    </Text>
                                </View>
                            </LinearGradient>
                        )}
                        {/* Data Source Badge */}
                        <View style={styles.trustBadge}>
                            <View style={[styles.trustDot, { backgroundColor: results.data_source?.includes('live') ? '#10B981' : results.data_source?.includes('google') ? '#3B82F6' : '#F59E0B' }]} />
                            <Text style={styles.trustText}>
                                {results.data_source?.includes('live') ? '-- Live Prices' : results.data_source?.includes('google') ? '(G) Google Verified' : 'AI Estimates'}
                                {results.last_updated ? ` * ${new Date(results.last_updated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ` : ''}
                            </Text>
                        </View>

                        {/* Price Comparisons */}
                        {results.price_comparisons?.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>📊 Price Across Platforms</Text>
                                {results.price_comparisons.map((item: any, idx: number) => (
                                    <View key={idx} style={[styles.compCard, Shadows.medium]}>
                                        <View style={styles.compCardHeader}>
                                            <Text style={styles.compItemName} numberOfLines={2}>{item.item_name}</Text>
                                            {item.best_price && (
                                                <LinearGradient colors={['#10B981', '#059669']} style={styles.bestPricePill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                                    <Ionicons name="trending-down" size={12} color="#666" />
                                                    <Text style={styles.bestPriceText}>Rs.{item.best_price?.toLocaleString()}</Text>
                                                </LinearGradient>
                                            )}
                                        </View>
                                        <View style={styles.platformList}>
                                            {item.platforms?.map((p: any, pidx: number) => {
                                                const isBest = p.price <= (item.best_price || Infinity);
                                                return (
                                                    <TouchableOpacity
                                                        key={pidx}
                                                        style={[styles.platformRow, isBest && styles.bestPlatformRow]}
                                                        onPress={() => p.url && Linking.openURL(p.url)}
                                                        activeOpacity={0.7}
                                                    >
                                                        <View style={{ flex: 1 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                <Text style={styles.platformName}>{p.name}</Text>
                                                                {isBest && <View style={styles.bestBadge}><Text style={styles.bestBadgeText}>Best Value</Text></View>}
                                                            </View>
                                                            {p.delivery && (
                                                                <Text style={styles.platformDelivery}>🚚 {p.delivery}</Text>
                                                            )}
                                                        </View>
                                                        <View style={styles.platformRight}>
                                                            <Text style={[
                                                                styles.platformPrice,
                                                                isBest && { color: '#059669' }
                                                            ]}>
                                                                Rs.{p.price?.toLocaleString()}
                                                            </Text>
                                                            {p.rating && (
                                                                <View style={styles.ratingRow}>
                                                                    <Text style={styles.platformRating}>* {p.rating}</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                        <Ionicons name="chevron-forward" size={14} color="#666" />
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Alternatives */}
                        {results.alternatives?.length > 0 && (
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>💡 Smart Alternatives</Text>
                                    <View style={styles.aiBadge}><Ionicons name="flash-outline" size={10} color="#666" /><Text style={styles.aiBadgeText}>AI RECOMMENDED</Text></View>
                                </View>
                                {results.alternatives.map((alt: any, idx: number) => (
                                    <TouchableOpacity
                                        key={idx}
                                        style={[styles.altCard, Shadows.soft]}
                                        onPress={() => alt.url && Linking.openURL(alt.url)}
                                        activeOpacity={alt.url ? 0.7 : 1}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <Text style={styles.altSuggestion}>{alt.suggestion}</Text>
                                                <View style={styles.choiceBadge}><Text style={styles.choiceBadgeText}>Smart Choice</Text></View>
                                            </View>
                                            <Text style={styles.altReason}>{alt.reason}</Text>
                                            <View style={styles.altFooter}>
                                                <Text style={styles.altWhere}>📍 {alt.where_to_buy}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.altPriceContainer}>
                                            <Text style={styles.altPriceLabel}>Est.</Text>
                                            <Text style={styles.altPrice}>Rs.{alt.estimated_price?.toLocaleString()}</Text>
                                            <LinearGradient colors={[Colors.primary, '#6366F1']} style={styles.altGoButton}>
                                                <Ionicons name="chevron-forward" size={12} color={'#FFF'} />
                                            </LinearGradient>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Service Suggestions */}
                        {results.service_suggestions?.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>(Service) Service & Vendor Suggestions</Text>
                                {results.service_suggestions.map((svc: any, idx: number) => (
                                    <TouchableOpacity
                                        key={idx}
                                        style={styles.svcCard}
                                        onPress={() => svc.contact_or_url && Linking.openURL(
                                            svc.contact_or_url.startsWith('http') ? svc.contact_or_url : `https://www.google.com/search?q=${encodeURIComponent(svc.contact_or_url)}`
                                        )}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.svcHeader}>
                                            <Text style={styles.svcSuggestion}>{svc.suggestion}</Text>
                                            {svc.estimated_savings && (
                                                <View style={styles.svcSavingsBadge}>
                                                    <Text style={styles.svcSavingsText}>Save {svc.estimated_savings}</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.svcDetails}>{svc.details}</Text>
                                    </TouchableOpacity >
                                ))}
                            </View >
                        )}

                        {/* Pro Tips */}
                        {
                            results.pro_tips?.length > 0 && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>💡 Pro Tips</Text>
                                    <View style={styles.tipsCard}>
                                        {results.pro_tips.map((tip: string, idx: number) => (
                                            <View key={idx} style={styles.tipRow}>
                                                <Text style={styles.tipBullet}>*</Text>
                                                <Text style={styles.tipText}>{tip}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )
                        }

                        {/* Search Again Button */}
                        <TouchableOpacity
                            style={styles.searchAgainButton}
                            onPress={() => {
                                setResults(null);
                                setHasSearched(false);
                                setSearchQuery('');
                                scrollRef.current?.scrollTo({ y: 0, animated: true });
                            }}
                        >
                            <Ionicons name="search" size={18} color={'#FFF'} />
                            <Text style={styles.searchAgainText}>Start New Comparison</Text>
                        </TouchableOpacity>
                    </View >
                )}

                <View style={{ height: 100 }} />
            </ScrollView >
        </SafeAreaView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F1F5F9',
    },
    scrollContent: {
        paddingBottom: 20,
    },
    // Header
    headerGradient: {
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.xl + 30,
        paddingHorizontal: Spacing.lg,
        borderBottomLeftRadius: BorderRadius.xl,
        borderBottomRightRadius: BorderRadius.xl,
    },
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
    // Search
    searchContainer: {
        flexDirection: 'row',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        height: 52,
        gap: Spacing.sm,
        ...Shadows.soft,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#0F172A',
    },
    searchButton: {
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
    },
    searchButtonGradient: {
        width: 52,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: BorderRadius.md,
    },
    // Categories
    categorySection: {
        marginTop: -20,
        paddingHorizontal: Spacing.lg,
    },
    categorySectionTitle: {
        ...Typography.sectionTitle,
        fontSize: 11,
        marginBottom: Spacing.sm,
        marginTop: Spacing.lg,
    },
    categoryScroll: {
        gap: Spacing.sm,
        paddingRight: Spacing.lg,
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm + 2,
        borderRadius: BorderRadius.full,
        backgroundColor: '#FFF',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        gap: 6,
        ...Shadows.soft,
    },
    categoryChipActive: {
        backgroundColor: 'transparent',
        borderColor: Colors.primary,
    },
    categoryChipIcon: {
        fontSize: 16,
    },
    categoryChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
    },
    categoryChipTextActive: {
        color: '#4F46E5',
        fontWeight: '700',
    },
    // Quick Search
    quickSection: {
        margin: Spacing.lg,
    },
    quickHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: Spacing.md,
    },
    quickTitle: {
        ...Typography.sectionTitle,
        fontSize: 12,
        marginBottom: 0,
    },
    quickGrid: {
        gap: Spacing.sm,
    },
    quickChip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFF',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        ...Shadows.soft,
    },
    quickChipText: {
        fontSize: 14,
        color: '#0F172A',
        fontWeight: '500',
    },
    // Loading
    loadingContainer: {
        paddingHorizontal: Spacing.lg,
        marginTop: Spacing.lg,
    },
    loadingCard: {
        padding: Spacing.xl,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        gap: Spacing.md,
    },
    loadingTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    loadingSubtitle: {
        fontSize: 13,
        color: '#666',
        textAlign: 'center',
    },
    // Error
    errorContainer: {
        margin: Spacing.lg,
        padding: Spacing.xl,
        backgroundColor: '#FFF',
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        gap: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.error,
    },
    errorIcon: {
        fontSize: 32,
    },
    errorTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#DC2626',
    },
    errorMessage: {
        fontSize: 13,
        color: '#7F1D1D',
        textAlign: 'center',
    },
    retryButton: {
        marginTop: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        backgroundColor: Colors.error,
        borderRadius: BorderRadius.full,
    },
    retryText: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 14,
    },
    // Results
    resultsContainer: {
        marginTop: Spacing.xl + 10,
        paddingHorizontal: Spacing.lg,
    },
    savingsBanner: {
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        paddingBottom: Spacing.md,
        marginBottom: Spacing.lg,
    },
    savingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    savingsLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    savingsAmount: {
        fontSize: 26,
        fontWeight: '900',
        color: '#FFF',
        marginTop: 4,
    },
    savingsDivider: {
        width: 1,
        height: 40,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginHorizontal: Spacing.md,
    },
    verdictBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.15)',
        padding: 12,
        borderRadius: BorderRadius.lg,
        marginTop: 4,
    },
    savingsVerdict: {
        fontSize: 13,
        color: '#FFF',
        fontWeight: '600',
        flex: 1,
        lineHeight: 18,
    },
    // Sections
    section: {
        marginBottom: Spacing.lg,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    aiBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    aiBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#4F46E5',
        letterSpacing: 0.5,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: '#0F172A',
    },
    // Comparison Cards
    compCard: {
        backgroundColor: '#FFF',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    compCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.md,
        paddingBottom: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    compItemName: {
        fontSize: 16,
        fontWeight: '800',
        color: '#111827',
        flex: 1,
        marginRight: Spacing.sm,
        lineHeight: 22,
    },
    bestPricePill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
        gap: 4,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    bestPriceText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFF',
    },
    platformList: {
        gap: 4,
    },
    platformRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: BorderRadius.md,
        borderBottomWidth: 0,
    },
    bestPlatformRow: {
        backgroundColor: '#F0FDF4',
        borderWidth: 1,
        borderColor: '#DCFCE7',
    },
    bestBadge: {
        backgroundColor: '#10B981',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    bestBadgeText: {
        color: '#FFF',
        fontSize: 9,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    platformName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#374151',
    },
    platformDelivery: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 2,
    },
    platformRight: {
        alignItems: 'flex-end',
        marginRight: 4,
    },
    platformPrice: {
        fontSize: 16,
        fontWeight: '800',
        color: '#111827',
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    platformRating: {
        fontSize: 11,
        color: '#6B7280',
        fontWeight: '600',
    },
    // Alternatives
    altCard: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderLeftWidth: 4,
        borderLeftColor: Colors.accent,
    },
    choiceBadge: {
        backgroundColor: Colors.accent + '20',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    choiceBadgeText: {
        color: Colors.accent,
        fontSize: 9,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    altSuggestion: {
        fontSize: 15,
        fontWeight: '800',
        color: '#111827',
    },
    altReason: {
        fontSize: 12,
        color: '#4B5563',
        lineHeight: 18,
        marginBottom: 8,
    },
    altFooter: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    altWhere: {
        fontSize: 12,
        color: Colors.primary,
        fontWeight: '700',
    },
    altPriceContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: Spacing.md,
        minWidth: 90,
    },
    altPriceLabel: {
        fontSize: 10,
        color: '#9CA3AF',
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    altPrice: {
        fontSize: 20,
        fontWeight: '900',
        color: '#059669',
        marginBottom: 8,
    },
    altGoButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        ...Shadows.soft,
    },
    // Service Suggestions
    svcCard: {
        backgroundColor: '#FFF',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderLeftWidth: 4,
        borderLeftColor: '#6366F1',
        ...Shadows.soft,
    },
    svcHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    svcSuggestion: {
        fontSize: 15,
        fontWeight: '800',
        color: '#111827',
        flex: 1,
    },
    svcSavingsBadge: {
        backgroundColor: '#F0FDF4',
        borderWidth: 1,
        borderColor: '#BBF7D0',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: BorderRadius.md,
    },
    svcSavingsText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#15803D',
    },
    svcDetails: {
        fontSize: 12,
        color: '#666',
        lineHeight: 17,
    },
    // Pro Tips
    tipsCard: {
        backgroundColor: '#FFFBEB',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    tipRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    tipBullet: {
        fontSize: 14,
        color: '#D97706',
        fontWeight: '900',
    },
    tipText: {
        fontSize: 13,
        color: '#92400E',
        fontWeight: '500',
        lineHeight: 18,
        flex: 1,
    },
    // Search Again
    searchAgainButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        marginTop: Spacing.lg,
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.xl,
        ...Shadows.medium,
    },
    searchAgainText: {
        fontSize: 16,
        fontWeight: '800',
        color: '#FFF',
    },
    // Trust Badge
    trustBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: '#FFF',
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        marginBottom: Spacing.xl,
        alignSelf: 'center',
    },
    trustDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    trustText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#4B5563',
    },
    // Empty State
    emptyStateContainer: {
        alignItems: 'center',
        padding: Spacing.xl * 1.5,
        marginTop: Spacing.xl,
        backgroundColor: '#FFF',
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        ...Shadows.soft,
    },
    emptyStateIcon: {
        fontSize: 64,
        marginBottom: Spacing.md,
    },
    emptyStateTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
        marginBottom: Spacing.sm,
    },
    emptyStateSub: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 22,
    },
});

