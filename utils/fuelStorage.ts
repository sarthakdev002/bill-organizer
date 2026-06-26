import AsyncStorage from '@react-native-async-storage/async-storage';

const VEHICLES_KEY = '@fuel_vehicles';
const FUEL_ENTRIES_KEY = '@fuel_entries';

export interface Vehicle {
  id: string;
  name: string;           // e.g. "My Honda City"
  type: 'car' | 'bike' | 'scooter' | 'truck' | 'other';
  fuel_type: 'petrol' | 'diesel' | 'cng' | 'electric';
  user_id: string;
  created_at: string;
}

export interface FuelEntry {
  id: string;
  vehicle_id: string;
  user_id: string;
  date: string;               // ISO date
  odometer: number;           // current odometer reading in km
  fuel_quantity: number;       // liters
  fuel_cost: number;           // total Rs. paid
  fuel_price_per_liter: number;
  station_name?: string;
  payment_mode?: string;
  bill_uri?: string;           // linked bill image (optional)
  // Calculated fields (filled on save)
  distance?: number;           // km since last fill
  mileage?: number;            // km/L
  cost_per_km?: number;        // Rs./km
  created_at: string;
}

export const FuelStorage = {
  // --- Vehicles ------------------
  async getVehicles(userId: string): Promise<Vehicle[]> {
    try {
      const stored = await AsyncStorage.getItem(VEHICLES_KEY);
      if (!stored) return [];
      return (JSON.parse(stored) as Vehicle[]).filter(v => v.user_id === userId);
    } catch { return []; }
  },

  async saveVehicle(vehicle: Vehicle): Promise<void> {
    const all = await this.getAllVehicles();
    const filtered = all.filter(v => v.id !== vehicle.id);
    filtered.push(vehicle);
    await AsyncStorage.setItem(VEHICLES_KEY, JSON.stringify(filtered));
  },

  async deleteVehicle(vehicleId: string): Promise<void> {
    const all = await this.getAllVehicles();
    await AsyncStorage.setItem(VEHICLES_KEY, JSON.stringify(all.filter(v => v.id !== vehicleId)));
    // Also delete related entries
    const allEntries = await this.getAllEntries();
    await AsyncStorage.setItem(FUEL_ENTRIES_KEY, JSON.stringify(allEntries.filter(e => e.vehicle_id !== vehicleId)));
  },

  async getAllVehicles(): Promise<Vehicle[]> {
    try {
      const stored = await AsyncStorage.getItem(VEHICLES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  },

  // --- Fuel Entries ------------------
  async getEntries(userId: string, vehicleId?: string): Promise<FuelEntry[]> {
    try {
      const stored = await AsyncStorage.getItem(FUEL_ENTRIES_KEY);
      if (!stored) return [];
      let entries = (JSON.parse(stored) as FuelEntry[]).filter(e => e.user_id === userId);
      if (vehicleId) entries = entries.filter(e => e.vehicle_id === vehicleId);
      return entries.sort((a, b) => b.odometer - a.odometer);
    } catch { return []; }
  },

  async saveEntry(entry: FuelEntry): Promise<FuelEntry> {
    const allEntries = await this.getAllEntries();
    
    // Get previous entry for this vehicle to calculate distance & mileage
    const vehicleEntries = allEntries
      .filter(e => e.vehicle_id === entry.vehicle_id && e.id !== entry.id)
      .sort((a, b) => b.odometer - a.odometer);
    
    const prevEntry = vehicleEntries.find(e => e.odometer < entry.odometer);
    
    if (prevEntry) {
      entry.distance = entry.odometer - prevEntry.odometer;
      entry.mileage = entry.distance / entry.fuel_quantity;
      entry.cost_per_km = entry.fuel_cost / entry.distance;
    }
    
    const filtered = allEntries.filter(e => e.id !== entry.id);
    filtered.push(entry);
    await AsyncStorage.setItem(FUEL_ENTRIES_KEY, JSON.stringify(filtered));
    return entry;
  },

  async deleteEntry(entryId: string): Promise<void> {
    const all = await this.getAllEntries();
    await AsyncStorage.setItem(FUEL_ENTRIES_KEY, JSON.stringify(all.filter(e => e.id !== entryId)));
  },

  async getAllEntries(): Promise<FuelEntry[]> {
    try {
      const stored = await AsyncStorage.getItem(FUEL_ENTRIES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  },

  // --- Analytics ------------------
  getVehicleStats(entries: FuelEntry[]) {
    if (entries.length === 0) return null;

    const validEntries = entries.filter(e => e.mileage && e.mileage > 0);
    const totalFuel = entries.reduce((s, e) => s + e.fuel_quantity, 0);
    const totalCost = entries.reduce((s, e) => s + e.fuel_cost, 0);
    const totalDistance = validEntries.reduce((s, e) => s + (e.distance || 0), 0);
    const avgMileage = validEntries.length > 0
      ? validEntries.reduce((s, e) => s + (e.mileage || 0), 0) / validEntries.length
      : 0;
    const avgCostPerKm = totalDistance > 0 ? totalCost / totalDistance : 0;
    const avgPricePerLiter = totalFuel > 0 ? totalCost / totalFuel : 0;

    return {
      totalEntries: entries.length,
      totalFuel: Math.round(totalFuel * 10) / 10,
      totalCost: Math.round(totalCost),
      totalDistance: Math.round(totalDistance),
      avgMileage: Math.round(avgMileage * 10) / 10,
      avgCostPerKm: Math.round(avgCostPerKm * 10) / 10,
      avgPricePerLiter: Math.round(avgPricePerLiter * 100) / 100,
      bestMileage: validEntries.length > 0 ? Math.round(Math.max(...validEntries.map(e => e.mileage || 0)) * 10) / 10 : 0,
      worstMileage: validEntries.length > 0 ? Math.round(Math.min(...validEntries.map(e => e.mileage || 0)) * 10) / 10 : 0,
    };
  },

  // --- Anomaly Detection ------------------
  detectAnomalies(entries: FuelEntry[]): string[] {
    const alerts: string[] = [];
    const validEntries = entries.filter(e => e.mileage && e.mileage > 0);
    if (validEntries.length < 3) return alerts;

    const avgMileage = validEntries.reduce((s, e) => s + (e.mileage || 0), 0) / validEntries.length;
    const stdDev = Math.sqrt(
      validEntries.reduce((s, e) => s + Math.pow((e.mileage || 0) - avgMileage, 2), 0) / validEntries.length
    );

    // Check latest entry for anomaly
    const latest = validEntries[0];
    if (latest && latest.mileage) {
      if (latest.mileage < avgMileage - 2 * stdDev) {
        alerts.push(`⚠️ Mileage drop detected! Latest: ${latest.mileage.toFixed(1)} km/L vs avg ${avgMileage.toFixed(1)} km/L. Check tire pressure, air filter, or driving habits.`);
      }
      if (latest.mileage > avgMileage + 2 * stdDev) {
        alerts.push(`⚠️ Excellent mileage! ${latest.mileage.toFixed(1)} km/L -- significantly above your average of ${avgMileage.toFixed(1)} km/L.`);
      }
    }

    // Check for consistent decline (last 3 entries)
    if (validEntries.length >= 3) {
      const last3 = validEntries.slice(0, 3);
      const declining = last3.every((e, i) => i === 0 || (e.mileage || 0) >= (last3[i - 1].mileage || 0));
      if (declining && (last3[0].mileage || 0) < avgMileage * 0.85) {
        alerts.push(`⚠️ Consistent mileage decline over last 3 fill-ups. Consider a vehicle service check.`);
      }
    }

    // Fuel price alert
    const avgPrice = validEntries.reduce((s, e) => s + e.fuel_price_per_liter, 0) / validEntries.length;
    if (latest && latest.fuel_price_per_liter > avgPrice * 1.1) {
      alerts.push(`[!!] Fuel price is ${((latest.fuel_price_per_liter / avgPrice - 1) * 100).toFixed(0)}% above your average. Compare nearby stations.`);
    }

    return alerts;
  },
};
