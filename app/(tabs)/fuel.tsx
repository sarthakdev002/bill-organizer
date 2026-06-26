import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomAlert from '../components/CustomAlert';
import { FuelEntry, FuelStorage, Vehicle } from '@/utils/fuelStorage';

const { width } = Dimensions.get('window');

const VEHICLE_TYPES = [
  { key: 'car', icon: '🚗', label: 'Car' },
  { key: 'bike', icon: '🏍️', label: 'Bike' },
  { key: 'scooter', icon: '🛵', label: 'Scooter' },
  { key: 'truck', icon: '🚚', label: 'Truck' },
  { key: 'other', icon: '🚗', label: 'Other' },
] as const;

const FUEL_TYPES = [
  { key: 'petrol', label: 'Petrol', color: '#EF4444' },
  { key: 'diesel', label: 'Diesel', color: '#F59E0B' },
  { key: 'cng', label: 'CNG', color: '#10B981' },
  { key: 'electric', label: 'Electric', color: '#6366F1' },
] as const;

export default function FuelScreen() {

  const [userId, setUserId] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);

  // Add Vehicle form
  const [vName, setVName] = useState('');
  const [vType, setVType] = useState<Vehicle['type']>('car');
  const [vFuel, setVFuel] = useState<Vehicle['fuel_type']>('petrol');

  // Add Entry form
  const [eOdometer, setEOdometer] = useState('');
  const [eFuelQty, setEFuelQty] = useState('');
  const [eFuelCost, setEFuelCost] = useState('');
  const [ePricePerL, setEPricePerL] = useState('');
  const [eStation, setEStation] = useState('');
  const [ePayment, setEPayment] = useState('');
  const [saving, setSaving] = useState(false);
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

      const v = await FuelStorage.getVehicles(session.user.id);
      setVehicles(v);

      if (v.length > 0) {
        const sel = selectedVehicle ? v.find(x => x.id === selectedVehicle.id) || v[0] : v[0];
        setSelectedVehicle(sel);
        const e = await FuelStorage.getEntries(session.user.id, sel.id);
        setEntries(e);
      } else {
        setSelectedVehicle(null);
        setEntries([]);
      }
    } catch (e) {
      console.error('Fuel load error:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedVehicle?.id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const selectVehicle = useCallback(async (v: Vehicle) => {
    setSelectedVehicle(v);
    setShowVehiclePicker(false);
    const e = await FuelStorage.getEntries(userId, v.id);
    setEntries(e);
  }, [userId]);

  // --- Stats & Anomalies ------------------
  const stats = useMemo(() => FuelStorage.getVehicleStats(entries), [entries]);
  const anomalies = useMemo(() => FuelStorage.detectAnomalies(entries), [entries]);

  // --- Add Vehicle ------------------
  const handleAddVehicle = async () => {
    if (!vName.trim()) {
      setAlertConfig({ visible: true, title: 'Error', message: 'Enter vehicle name', type: 'error' });
      return;
    }
    const vehicle: Vehicle = {
      id: Date.now().toString(),
      name: vName.trim(),
      type: vType,
      fuel_type: vFuel,
      user_id: userId,
      created_at: new Date().toISOString(),
    };
    await FuelStorage.saveVehicle(vehicle);
    setVName(''); setVType('car'); setVFuel('petrol');
    setShowAddVehicle(false);
    await loadData();
    setSelectedVehicle(vehicle);
    const e = await FuelStorage.getEntries(userId, vehicle.id);
    setEntries(e);
  };

  const handleDeleteVehicle = (v: Vehicle) => {
    setAlertConfig({
      visible: true,
      title: 'Delete Vehicle',
      message: `Delete "${v.name}" and all its fuel entries?`,
      type: 'error',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await FuelStorage.deleteVehicle(v.id);
            await loadData();
            setAlertConfig(prev => ({ ...prev, visible: false }));
          }
        }
      ]
    });
  };

  // --- Add Entry ------------------
  const handleAddEntry = async () => {
    if (!selectedVehicle) return;
    const odo = parseFloat(eOdometer);
    const qty = parseFloat(eFuelQty);
    const cost = parseFloat(eFuelCost);
    if (!odo || odo <= 0) { setAlertConfig({ visible: true, title: 'Error', message: 'Enter valid odometer reading', type: 'error' }); return; }
    if (!qty || qty <= 0) { setAlertConfig({ visible: true, title: 'Error', message: 'Enter fuel quantity', type: 'error' }); return; }
    if (!cost || cost <= 0) { setAlertConfig({ visible: true, title: 'Error', message: 'Enter fuel cost', type: 'error' }); return; }

    setSaving(true);
    try {
      const pricePerL = ePricePerL ? parseFloat(ePricePerL) : cost / qty;
      const entry: FuelEntry = {
        id: Date.now().toString(),
        vehicle_id: selectedVehicle.id,
        user_id: userId,
        date: new Date().toISOString(),
        odometer: odo,
        fuel_quantity: qty,
        fuel_cost: cost,
        fuel_price_per_liter: pricePerL,
        station_name: eStation || undefined,
        payment_mode: ePayment || undefined,
        created_at: new Date().toISOString(),
      };

      await FuelStorage.saveEntry(entry);
      setEOdometer(''); setEFuelQty(''); setEFuelCost(''); setEPricePerL(''); setEStation(''); setEPayment('');
      setShowAddEntry(false);
      Keyboard.dismiss();

      const e = await FuelStorage.getEntries(userId, selectedVehicle.id);
      setEntries(e);
    } catch (e: any) {
      setAlertConfig({ visible: true, title: 'Error', message: e.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = (entry: FuelEntry) => {
    setAlertConfig({
      visible: true,
      title: 'Delete Entry',
      message: 'Remove this fuel entry?',
      type: 'error',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await FuelStorage.deleteEntry(entry.id);
            const e = await FuelStorage.getEntries(userId, selectedVehicle?.id);
            setEntries(e);
            setAlertConfig(prev => ({ ...prev, visible: false }));
          }
        }
      ]
    });
  };

  // Auto-calc price per liter
  const onCostOrQtyChange = (cost: string, qty: string) => {
    const c = parseFloat(cost);
    const q = parseFloat(qty);
    if (c > 0 && q > 0) {
      setEPricePerL((c / q).toFixed(2));
    }
  };

  const getVehicleIcon = (type: string) => VEHICLE_TYPES.find(t => t.key === type)?.icon || '🚗';

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F1F5F9' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={[styles.headerContainer, { flexDirection: 'column' }]}>
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <TouchableOpacity onPress={() => router.push('/(tabs)/more')} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color={'#0F172A'} />
              </TouchableOpacity>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Fuel Tracker</Text>
                <Text style={styles.headerSub}>Monitor vehicle efficiency</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.addVehicleBtn} onPress={() => setShowAddVehicle(true)}>
              <Ionicons name="add" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Vehicle Selector */}
          {vehicles.length > 0 ? (
            <TouchableOpacity style={styles.vehicleSelector} onPress={() => setShowVehiclePicker(true)}>
              <Text style={styles.vehicleSelectorIcon}>{getVehicleIcon(selectedVehicle?.type || 'car')}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleSelectorName}>{selectedVehicle?.name}</Text>
                <Text style={styles.vehicleSelectorMeta}>{selectedVehicle?.type} • {selectedVehicle?.fuel_type}</Text>
              </View>
              <Ionicons name="chevron-down" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyVehicle}>
              <Text style={{ fontSize: 40 }}>🚗</Text>
              <Text style={styles.emptyVehicleText}>No vehicles yet</Text>
              <TouchableOpacity style={[styles.addVehicleBtn, { width: 'auto', paddingHorizontal: 16, flexDirection: 'row', gap: 6 }]} onPress={() => setShowAddVehicle(true)}>
                <Ionicons name="add" size={18} color={Colors.primary} />
                <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 13 }}>Add Vehicle</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {selectedVehicle && entries.length > 0 && stats && (
          <>
            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.avgMileage.toFixed(1)}</Text>
                <Text style={styles.statLabel}>AVG KM/L</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>Rs.{stats.avgCostPerKm.toFixed(1)}</Text>
                <Text style={styles.statLabel}>AVG Rs./KM</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>Rs.{stats.totalCost.toLocaleString()}</Text>
                <Text style={styles.statLabel}>TOTAL SPENT</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.totalFuel.toFixed(1)}L</Text>
                <Text style={styles.statLabel}>TOTAL FUEL</Text>
              </View>
            </View>

            {/* Anomaly Alerts */}
            {anomalies.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="warning" size={16} color={Colors.error} />
                  <Text style={[styles.sectionTitle, { color: Colors.error }]}>Anomalies</Text>
                </View>
                {anomalies.map((a, i) => (
                  <View key={i} style={styles.alertCard}>
                    <Text style={styles.alertText}>{a}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Insights */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="analytics" size={16} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Insights</Text>
              </View>
              <View style={styles.insightCard}>
                <View style={styles.insightRow}>
                  <View style={styles.insightItem}>
                    <Text style={styles.insightLabel}>Best Mileage</Text>
                    <Text style={[styles.insightValue, { color: '#10B981' }]}>{stats.bestMileage.toFixed(1)} km/L</Text>
                  </View>
                  <View style={styles.insightDivider} />
                  <View style={styles.insightItem}>
                    <Text style={styles.insightLabel}>Worst Mileage</Text>
                    <Text style={[styles.insightValue, { color: '#EF4444' }]}>{stats.worstMileage.toFixed(1)} km/L</Text>
                  </View>
                </View>
                <View style={styles.insightBottomRow}>
                  <Text style={styles.insightBottomLabel}>Total Distance</Text>
                  <Text style={styles.insightBottomValue}>{stats.totalDistance.toLocaleString()} km</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Add Entry Button */}
        {selectedVehicle && (
          <TouchableOpacity style={styles.addEntryButton} onPress={() => setShowAddEntry(true)}>
            <LinearGradient colors={['#0F766E', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.addEntryGradient}>
              <Ionicons name="add-circle" size={22} color="#FFF" />
              <Text style={styles.addEntryText}>Add Fuel Entry</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Entry Cards */}
        {selectedVehicle && entries.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="receipt" size={16} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Recent Entries</Text>
            </View>
            {entries.map((entry) => {
              const prevEntry = entries.find(e => e.odometer < entry.odometer && e.id !== entry.id);
              const distance = prevEntry ? entry.odometer - prevEntry.odometer : null;
              const mileage = distance && entry.fuel_quantity ? distance / entry.fuel_quantity : null;
              const costPerKm = distance && entry.fuel_cost ? entry.fuel_cost / distance : null;

              return (
                <View key={entry.id} style={styles.entryCard}>
                  <View style={styles.entryHeader}>
                    <View>
                      <Text style={styles.entryDate}>{new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                      {entry.station_name && <Text style={styles.entryStation}>{entry.station_name}</Text>}
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteEntry(entry)}>
                      <Ionicons name="trash-outline" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.entryStatsRow}>
                    <View style={styles.entryStat}>
                      <Text style={styles.entryStatLabel}>ODOMETER</Text>
                      <Text style={styles.entryStatValue}>{entry.odometer.toLocaleString()} km</Text>
                    </View>
                    <View style={styles.entryStat}>
                      <Text style={styles.entryStatLabel}>FUEL</Text>
                      <Text style={styles.entryStatValue}>{entry.fuel_quantity}L</Text>
                    </View>
                    <View style={styles.entryStat}>
                      <Text style={styles.entryStatLabel}>COST</Text>
                      <Text style={styles.entryStatValue}>Rs.{entry.fuel_cost}</Text>
                    </View>
                  </View>
                  {mileage && (
                    <View style={styles.entryCalcRow}>
                      <View style={[styles.entryCalcPill, { backgroundColor: '#ECFDF5' }]}>
                        <Text style={[styles.entryCalcText, { color: '#10B981' }]}>{mileage.toFixed(1)} km/L</Text>
                      </View>
                      {costPerKm && (
                        <View style={[styles.entryCalcPill, { backgroundColor: '#FEF3C7' }]}>
                          <Text style={[styles.entryCalcText, { color: '#D97706' }]}>Rs.{costPerKm.toFixed(1)}/km</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {!mileage && <Text style={styles.entryHint}>First entry — mileage will appear after next refuel</Text>}
                </View>
              );
            })}
          </View>
        )}

        {selectedVehicle && entries.length === 0 && (
          <View style={[styles.emptyVehicle, { marginTop: 40 }]}>
            <Text style={{ fontSize: 40 }}>⛽</Text>
            <Text style={styles.emptyVehicleText}>No fuel entries yet</Text>
            <Text style={[styles.emptyVehicleText, { fontSize: 12 }]}>Tap "Add Fuel Entry" to get started</Text>
          </View>
        )}
      </ScrollView>

      {/* Add Vehicle Modal */}
      <Modal visible={showAddVehicle} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Vehicle</Text>
              <TouchableOpacity onPress={() => setShowAddVehicle(false)}>
                <Ionicons name="close" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.formLabel}>Vehicle Name</Text>
            <TextInput style={styles.formInput} placeholder="e.g. My Honda City" value={vName} onChangeText={setVName} placeholderTextColor="#94A3B8" />

            <Text style={styles.formLabel}>Vehicle Type</Text>
            <View style={styles.chipRow}>
              {VEHICLE_TYPES.map(t => (
                <TouchableOpacity key={t.key} style={[styles.chip, vType === t.key && styles.chipActive]} onPress={() => setVType(t.key as Vehicle['type'])}>
                  <Text style={styles.chipIcon}>{t.icon}</Text>
                  <Text style={[styles.chipText, vType === t.key && styles.chipTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Fuel Type</Text>
            <View style={styles.chipRow}>
              {FUEL_TYPES.map(f => (
                <TouchableOpacity key={f.key} style={[styles.chip, vFuel === f.key && styles.chipActive]} onPress={() => setVFuel(f.key as Vehicle['fuel_type'])}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: f.color }} />
                  <Text style={[styles.chipText, vFuel === f.key && styles.chipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleAddVehicle}>
              <LinearGradient colors={['#0F766E', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveButtonGrad}>
                <Text style={styles.saveButtonText}>Save Vehicle</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Entry Modal */}
      <Modal visible={showAddEntry} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Fuel Entry</Text>
              <TouchableOpacity onPress={() => { setShowAddEntry(false); Keyboard.dismiss(); }}>
                <Ionicons name="close" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel}>Odometer (km)</Text>
              <TextInput style={styles.formInput} placeholder="e.g. 45000" keyboardType="numeric" value={eOdometer} onChangeText={setEOdometer} placeholderTextColor="#94A3B8" />

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Fuel Quantity (L)</Text>
                  <TextInput style={styles.formInput} placeholder="e.g. 30" keyboardType="numeric" value={eFuelQty} onChangeText={(v) => { setEFuelQty(v); onCostOrQtyChange(eFuelCost, v); }} placeholderTextColor="#94A3B8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Total Cost (Rs.)</Text>
                  <TextInput style={styles.formInput} placeholder="e.g. 3000" keyboardType="numeric" value={eFuelCost} onChangeText={(v) => { setEFuelCost(v); onCostOrQtyChange(v, eFuelQty); }} placeholderTextColor="#94A3B8" />
                </View>
              </View>

              <Text style={styles.formLabel}>Price Per Litre (auto)</Text>
              <TextInput style={styles.formInput} placeholder="Auto-calculated" keyboardType="numeric" value={ePricePerL} onChangeText={setEPricePerL} placeholderTextColor="#94A3B8" />

              <Text style={styles.formLabel}>Station (optional)</Text>
              <TextInput style={styles.formInput} placeholder="e.g. HP Petrol Pump" value={eStation} onChangeText={setEStation} placeholderTextColor="#94A3B8" />

              <Text style={styles.formLabel}>Payment (optional)</Text>
              <TextInput style={styles.formInput} placeholder="e.g. UPI, Cash, Card" value={ePayment} onChangeText={setEPayment} placeholderTextColor="#94A3B8" />

              <TouchableOpacity style={styles.saveButton} onPress={handleAddEntry} disabled={saving}>
                <LinearGradient colors={['#0F766E', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveButtonGrad}>
                  {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save Entry</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Vehicle Picker Modal */}
      <Modal visible={showVehiclePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Vehicle</Text>
              <TouchableOpacity onPress={() => setShowVehiclePicker(false)}>
                <Ionicons name="close" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            {vehicles.map(v => (
              <TouchableOpacity key={v.id} style={[styles.vehiclePickerRow, selectedVehicle?.id === v.id && styles.vehiclePickerActive]} onPress={() => selectVehicle(v)}>
                <Text style={styles.vehiclePickerIcon}>{getVehicleIcon(v.type)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehiclePickerName}>{v.name}</Text>
                  <Text style={styles.vehiclePickerMeta}>{v.type} • {v.fuel_type}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteVehicle(v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.addVehicleRow} onPress={() => { setShowVehiclePicker(false); setShowAddVehicle(true); }}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
              <Text style={styles.addVehicleRowText}>Add New Vehicle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { paddingBottom: 20 },

  // Header
  headerContainer: { backgroundColor: '#FFF', paddingTop: Spacing.md, paddingBottom: Spacing.lg, paddingHorizontal: Spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...Shadows.soft, marginBottom: Spacing.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  header: { flex: 1 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  addVehicleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },

  // Vehicle Selector
  vehicleSelector: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: '#E2E8F0' },
  vehicleSelectorIcon: { fontSize: 28 },
  vehicleSelectorName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  vehicleSelectorMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  emptyVehicle: { alignItems: 'center', padding: Spacing.xl, gap: Spacing.sm },
  emptyVehicleText: { color: '#666', fontSize: 14 },

  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginTop: 0 },
  statCard: { flex: 1, minWidth: (width - 64) / 2 - 4, backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  statLabel: { fontSize: 11, color: '#666', fontWeight: '600' },

  // Sections
  section: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
  sectionTitle: { ...Typography.sectionTitle, marginBottom: 0 },
  emptyText: { ...Typography.body, color: '#666', fontStyle: 'italic', fontSize: 13 },

  // Alerts
  alertCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderLeftWidth: 3, borderLeftColor: Colors.error, borderTopWidth: 1, borderTopColor: '#E2E8F0', borderRightWidth: 1, borderRightColor: '#E2E8F0', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  alertText: { fontSize: 13, color: '#7F1D1D', lineHeight: 19 },

  // Insights
  insightCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: '#E2E8F0' },
  insightRow: { flexDirection: 'row', marginBottom: Spacing.md },
  insightItem: { flex: 1, alignItems: 'center' },
  insightLabel: { fontSize: 11, color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  insightValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  insightDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 4 },
  insightBottomRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: '#E2E8F0', marginTop: Spacing.sm },
  insightBottomLabel: { fontSize: 13, color: '#666' },
  insightBottomValue: { fontSize: 14, fontWeight: '700', color: '#0F172A' },

  // Add Entry Button
  addEntryButton: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  addEntryGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md },
  addEntryText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // Entry Cards
  entryCard: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: '#E2E8F0' },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  entryDate: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  entryStation: { fontSize: 12, color: '#666', marginTop: 2 },
  entryStatsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  entryStat: {},
  entryStatLabel: { fontSize: 10, color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  entryStatValue: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  entryCalcRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  entryCalcPill: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  entryCalcText: { fontSize: 12, fontWeight: '700' },
  entryHint: { fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 4 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },

  // Forms
  formLabel: { fontSize: 12, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: Spacing.md },
  formInput: { backgroundColor: '#F1F5F9', borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, fontSize: 15, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' },
  formRow: { flexDirection: 'row', gap: Spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipActive: { backgroundColor: 'transparent', borderColor: Colors.primary },
  chipIcon: { fontSize: 16 },
  chipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  chipTextActive: { color: '#4F46E5', fontWeight: '700' },
  saveButton: { marginTop: Spacing.xl, borderRadius: BorderRadius.lg, overflow: 'hidden', marginBottom: Spacing.lg },
  saveButtonGrad: { padding: Spacing.md, alignItems: 'center' },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // Vehicle picker
  vehiclePickerRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.sm, gap: Spacing.md, backgroundColor: '#F1F5F9' },
  vehiclePickerActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.primary },
  vehiclePickerIcon: { fontSize: 28 },
  vehiclePickerName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  vehiclePickerMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  addVehicleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed', justifyContent: 'center' },
  addVehicleRowText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
});

