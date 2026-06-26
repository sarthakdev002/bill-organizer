import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';

import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../../constants/Theme';
import ZoomableImageModal from '../components/ZoomableImageModal';

interface Bill {
    id: string;
    category: string;
    amount: number;
    uri: string;
    merchant_name?: string;
    created_at: string;
    invoice_number?: string;
    total_tax?: number;
}

export default function CategoryDetails() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [bills, setBills] = useState<Bill[]>([]);
    const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
    const [showZoomableImage, setShowZoomableImage] = useState(false);
    const [loading, setLoading] = useState(true);

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

    React.useEffect(() => {
        async function loadCategoryBills() {
            setLoading(true);
            const categoryName = typeof id === 'string' ? id : '';
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('bills')
                .select('*')
                .eq('category', categoryName)
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Error loading bills:", error);
            } else if (data) {
                setBills(data as unknown as Bill[]);
            }
            setLoading(false);
        }
        loadCategoryBills();
    }, [id]);

    const formatDateTime = (dateString?: string) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const deleteBill = async (billId: string) => {
        showAlert(
            "Delete Bill",
            "This action cannot be undone. Are you sure?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const { data: { session } } = await supabase.auth.getSession();
                            if (!session?.user) throw new Error('User not authenticated');

                            const { error } = await supabase
                                .from('bills')
                                .delete()
                                .eq('id', billId)
                                .eq('user_id', session.user.id);

                            if (error) throw error;

                            const updatedBills = bills.filter(b => b.id !== billId);
                            setBills(updatedBills);
                            setSelectedBill(null);

                            if (updatedBills.length === 0) {
                                router.back();
                            }
                        } catch (e: any) {
                            showAlert("Error", e?.message ? String(e.message) : "Failed to delete bill");
                        }
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <Ionicons name="arrow-back" size={22} color="#666" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerSubtitle}>Category</Text>
                    <Text style={styles.headerTitle}>{id}</Text>
                </View>
                <View style={[styles.statPill, { backgroundColor: Colors.primaryLight + '20' }]}>
                    <Text style={styles.statCount}>{bills.length}</Text>
                    <Text style={styles.statLabel}>Bills</Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Loading bills...</Text>
                </View>
            ) : (
                <FlatList
                    data={bills}
                    keyExtractor={item => String(item.id)}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => setSelectedBill(item)}
                            activeOpacity={0.7}
                            style={styles.billCard}
                        >
                            <View style={styles.cardMain}>
                                <Image source={{ uri: item.uri }} style={styles.thumbnail} contentFit="cover" />
                                <View style={styles.billDetails}>
                                    <Text style={styles.merchantName} numberOfLines={1}>
                                        {item.merchant_name || 'General Bill'}
                                    </Text>
                                    <View style={styles.metaRow}>
                                        <Ionicons name="calendar-outline" size={12} color="#666" />
                                        <Text style={styles.dateText}>{formatDateTime(item.created_at)}</Text>
                                    </View>
                                </View>
                                <View style={styles.amountContainer}>
                                    <Text style={styles.currencySymbol}>{'Rs.'}</Text>
                                    <Text style={styles.amountText}>{item.amount.toFixed(0)}</Text>
                                    <Text style={styles.amountDecimals}>.{(item.amount % 1).toFixed(2).slice(2)}</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="receipt-outline" size={48} color={Colors.border} />
                            <Text style={styles.emptyText}>No bills found in this category</Text>
                        </View>
                    }
                />
            )}

            <Modal
                visible={!!selectedBill}
                transparent
                animationType="slide"
                onRequestClose={() => setSelectedBill(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalIndicator} />
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Bill Details</Text>
                            <TouchableOpacity onPress={() => setSelectedBill(null)} style={styles.closeIcon}>
                                <Ionicons name="close" size={18} color="#666" />
                            </TouchableOpacity>
                        </View>

                        {selectedBill && (
                            <View style={styles.modalBody}>
                                <TouchableOpacity onPress={() => setShowZoomableImage(true)} activeOpacity={0.9}>
                                    <Image source={{ uri: selectedBill.uri }} style={styles.modalImage} contentFit="contain" />
                                    <LinearGradient
                                        colors={['transparent', 'rgba(0,0,0,0.4)']}
                                        style={styles.imageOverlay}
                                    >
                                        <Text style={styles.tapToZoom}>Tap to Enlarge</Text>
                                    </LinearGradient>
                                </TouchableOpacity>

                                <View style={styles.detailRows}>
                                    <View style={styles.infoRow}>
                                        <View style={styles.iconBox}>
                                            <Ionicons name="receipt-outline" size={20} color="#666" />
                                        </View>
                                        <View style={styles.infoContent}>
                                            <Text style={styles.infoLabel}>Merchant</Text>
                                            <Text style={styles.infoValue}>{selectedBill.merchant_name || 'N/A'}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.infoRow}>
                                        <View style={styles.iconBox}>
                                            <Ionicons name="calendar-outline" size={20} color="#666" />
                                        </View>
                                        <View style={styles.infoContent}>
                                            <Text style={styles.infoLabel}>Date</Text>
                                            <Text style={styles.infoValue}>{formatDateTime(selectedBill.created_at)}</Text>
                                        </View>
                                        <View style={[styles.iconBox, { marginLeft: Spacing.xl }]}>
                                            <Ionicons name="document-text-outline" size={20} color="#666" />
                                        </View>
                                        <View style={styles.infoContent}>
                                            <Text style={styles.infoLabel}>Invoice</Text>
                                            <Text style={styles.infoValue}>{selectedBill.invoice_number || '---'}</Text>
                                        </View>
                                    </View>

                                    <LinearGradient
                                        colors={[Colors.primary, Colors.primaryLight]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.amountHighlight}
                                    >
                                        <View>
                                            <Text style={styles.highlightLabel}>Total Amount</Text>
                                            <Text style={styles.highlightValue}>{'Rs.'}{selectedBill.amount.toFixed(2)}</Text>
                                        </View>
                                        {selectedBill.total_tax ? (
                                            <View style={styles.taxBadge}>
                                                <Text style={styles.taxBadgeText}>Tax: {'Rs.'}{selectedBill.total_tax}</Text>
                                            </View>
                                        ) : null}
                                    </LinearGradient>
                                </View>

                                <View style={styles.modalActions}>
                                    <TouchableOpacity
                                        style={styles.deleteAction}
                                        onPress={() => deleteBill(selectedBill.id)}
                                    >
                                        <Ionicons name="trash-outline" size={20} color="#666" />
                                        <Text style={styles.deleteActionText}>Delete</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.primaryAction}
                                        onPress={() => setSelectedBill(null)}
                                    >
                                        <Text style={styles.primaryActionText}>Done</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            <ZoomableImageModal
                visible={showZoomableImage}
                imageUri={selectedBill?.uri || ''}
                onClose={() => setShowZoomableImage(false)}
                onDelete={() => {
                    if (selectedBill) deleteBill(selectedBill.id);
                }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        backgroundColor: Colors.white,
        ...Shadows.soft,
    },
    iconButton: {
        padding: Spacing.sm,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.background,
    },
    headerTitleContainer: {
        flex: 1,
        marginLeft: Spacing.md,
    },
    headerSubtitle: {
        ...Typography.caption,
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontWeight: '600',
    },
    headerTitle: {
        ...Typography.h2,
        color: Colors.text,
    },
    statPill: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    statCount: {
        fontSize: 14,
        fontWeight: '800',
        color: Colors.primary,
    },
    statLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.primaryLight,
    },
    list: {
        padding: Spacing.lg,
        paddingBottom: Spacing.xxl,
    },
    billCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        ...Shadows.soft,
    },
    cardMain: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    thumbnail: {
        width: 56,
        height: 56,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.background,
    },
    billDetails: {
        flex: 1,
        marginLeft: Spacing.md,
        gap: 4,
    },
    merchantName: {
        ...Typography.h3,
        color: Colors.text,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    dateText: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    currencySymbol: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text,
        marginRight: 1,
    },
    amountText: {
        fontSize: 20,
        fontWeight: '800',
        color: Colors.text,
    },
    amountDecimals: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textSecondary,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    emptyContainer: {
        marginTop: 100,
        alignItems: 'center',
        gap: Spacing.md,
    },
    emptyText: {
        ...Typography.body,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingBottom: Spacing.xl,
        ...Shadows.medium,
    },
    modalIndicator: {
        width: 40,
        height: 4,
        backgroundColor: Colors.border,
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: Spacing.md,
    },
    modalHeader: {
        padding: Spacing.xl,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    modalTitle: {
        ...Typography.h2,
        color: Colors.text,
    },
    closeIcon: {
        padding: Spacing.xs,
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.sm,
    },
    modalBody: {
        paddingHorizontal: Spacing.xl,
    },
    modalImage: {
        width: '100%',
        height: 200,
        borderRadius: BorderRadius.xl,
        backgroundColor: Colors.background,
    },
    imageOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 40,
        borderBottomLeftRadius: BorderRadius.xl,
        borderBottomRightRadius: BorderRadius.xl,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tapToZoom: {
        fontSize: 10,
        color: Colors.white,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    detailRows: {
        marginTop: Spacing.xl,
        gap: Spacing.lg,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    infoContent: {
        marginLeft: Spacing.md,
    },
    infoLabel: {
        ...Typography.caption,
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: '600',
    },
    infoValue: {
        ...Typography.body,
        fontWeight: '700',
        color: Colors.text,
    },
    amountHighlight: {
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: Spacing.md,
    },
    highlightLabel: {
        ...Typography.caption,
        color: 'rgba(255, 255, 255, 0.8)',
        fontWeight: '600',
    },
    highlightValue: {
        fontSize: 32,
        fontWeight: '800',
        color: Colors.white,
    },
    taxBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
    },
    taxBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.white,
    },
    modalActions: {
        flexDirection: 'row',
        marginTop: Spacing.xxl,
        gap: Spacing.md,
    },
    deleteAction: {
        flex: 1,
        height: 56,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: '#FEE2E2',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    deleteActionText: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.error,
    },
    primaryAction: {
        flex: 1.5,
        height: 56,
        backgroundColor: Colors.text,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryActionText: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.white,
    },
});
