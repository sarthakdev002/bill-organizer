import { Config } from '@/constants/Config';
import { Colors, Spacing } from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { Accelerometer } from 'expo-sensors';

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Dimensions, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated';

import CustomAlert from '../components/CustomAlert';
import { BudgetCalculator } from '@/utils/budgetCalculator';
import { BudgetNotificationService } from '@/utils/budgetNotifications';
import { BudgetStorage } from '@/utils/budgetStorage';
import { handlePaymentSlip, type MatchResult } from '@/utils/paymentMatcher';

const { width, height } = Dimensions.get('window');
const BACKEND_BASE_URL = Config.BACKEND_URL;

interface Bill {
  id?: string;
  category: string;
  amount: number;
  merchant_name?: string;
  uri: string;
  gst?: string;
  invoice_date?: string;
  invoice_number?: string;
  user_id?: string;
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
  payment_date?: string;        // full date YYYY-MM-DD
  match_confidence?: number;    // 0-100 confidence score
  match_method?: string;        // ocr_auto | ocr_manual | webhook | manual
}

async function recognizeTextViaOCR(base64: string, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    console.log('[DEBUG] Sending OCR request to:', `${BACKEND_BASE_URL}/api/ocr`);
    const response = await fetch(`${BACKEND_BASE_URL}/api/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image: base64 }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const raw = await response.text();
    console.log('[DEBUG] OCR Backend response received');

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      throw new Error(`Server returned invalid data. Please check if the backend is running at ${BACKEND_BASE_URL}`);
    }

    if (result.error) throw new Error(result.error);
    return result;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error("OCR request timed out. Please check your internet connection or if the backend is slow.");
    }
    throw new Error("OCR connection error: " + e.message + "\n\nMake sure the backend server is running on your PC at " + BACKEND_BASE_URL);
  }
}

async function enrichBillData(billData: any, userLat?: number, userLng?: number, externalSignal?: AbortSignal) {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billData, userLat, userLng }),
      signal: externalSignal,
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error);
    return result;
  } catch (e: any) {
    console.warn("Enrichment failed:", e.message);
    return null;
  }
}


Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Processing Bill...');
  const [notificationPermission, setNotificationPermission] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [session, setSession] = useState<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelProcess = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setLoading(false);
  };

  // --- Live AI Lens State ---
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveResult, setLiveResult] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const analysisTimerRef = useRef<NodeJS.Timeout | null>(null);
  const liveLensAbortControllerRef = useRef<AbortController | null>(null);

  // Custom Alert state
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons?: any[];
  }>({ visible: false, title: '', message: '' });

  // --- Stability Tracking State ---
  const [isSteady, setIsSteady] = useState(false);
  const lastAccel = useRef({ x: 0, y: 0, z: 0 });
  const steadyCount = useRef(0);
  const STEADY_THRESHOLD = 0.08; // Sensitivity: Lower = more strict
  const REQUIRED_STEADY_SAMPLES = 25; // ~2.5 seconds (100ms update * 25)
  const lastAnalysisTimeRef = useRef(0);
  const modeToggleTimeRef = useRef(0);

  const showAlert = (title: string, message: string, buttons?: any[]) => {
    setAlertConfig({ visible: true, title, message, buttons });
  };

  // Animation values
  const scanLineY = useSharedValue(0);
  const frameScale = useSharedValue(1);
  const statusPulse = useSharedValue(1);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (!data.session) {
        router.replace('/(auth)/login');
        return;
      }
    })();
    if (!permission?.granted) {
      requestPermission();
    }
    askNotificationPermission();
    askLocationPermission();

    // Start scanning animation
    scanLineY.value = withRepeat(
      withSequence(
        withTiming(height * 0.55, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );

    frameScale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 1500 }),
        withTiming(1, { duration: 1500 })
      ),
      -1,
      true
    );

    statusPulse.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );

    checkBackendConnection();
    const interval = setInterval(checkBackendConnection, 10000); // Check every 10s

    // --- Accelerometer for Stability Detection ---
    Accelerometer.setUpdateInterval(100);
    const subscription = Accelerometer.addListener(data => {
      const { x, y, z } = data;
      const delta = Math.abs(x - lastAccel.current.x) +
        Math.abs(y - lastAccel.current.y) +
        Math.abs(z - lastAccel.current.z);

      if (delta < STEADY_THRESHOLD) {
        steadyCount.current += 1;
      } else {
        steadyCount.current = 0;
        if (isSteady) setIsSteady(false);
      }

      if (steadyCount.current >= REQUIRED_STEADY_SAMPLES && !isSteady) {
        setIsSteady(true);
      }

      lastAccel.current = { x, y, z };
    });

    const backAction = () => {
      router.replace('/(tabs)/dashboard');
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => {
      clearInterval(interval);
      subscription.remove();
      backHandler.remove();
    };
  }, [permission, requestPermission, router]);

  const checkBackendConnection = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/health`, {
        signal: controller.signal
      });
      setBackendConnected(response.ok);
    } catch {
      setBackendConnected(false);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const animatedStatusDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: statusPulse.value }],
    opacity: withTiming(backendConnected ? 1 : 0.5),
  }));

  const animatedScanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value }],
    opacity: loading ? 1 : 0.8,
  }));

  const animatedFrameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: frameScale.value }],
  }));

  async function askNotificationPermission() {
    const { status } = await Notifications.requestPermissionsAsync();
    setNotificationPermission(status === 'granted');
  }

  async function askLocationPermission() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
      console.log('Location permission:', status);
    } catch (e) {
      console.warn('Location permission request failed:', e);
    }
  }

  async function getUserLocation(): Promise<{ lat: number; lng: number } | null> {
    try {
      if (!locationPermission) return null;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      console.log('User location:', loc.coords.latitude, loc.coords.longitude);
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch (e) {
      console.warn('Failed to get location:', e);
      return null;
    }
  }

  const findMatchingBill = async (amount: number, user_id: string) => {
    // Find bills with matching amount uploaded within the last 24 hours (expanded from 1h for better utility)
    const timeLimit = new Date();
    timeLimit.setHours(timeLimit.getHours() - 24);

    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', user_id)
      .eq('amount', amount)
      .gte('created_at', timeLimit.toISOString())
      .is('utr_number', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error finding matching bill:', error);
      return null;
    }
    return data && data.length > 0 ? data[0] : null;
  };

  const saveBill = async (photoUri: string, ocrData: any, enrichmentData: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('User not authenticated');

      console.log('[saveBill] Saving bill:', { photoUri, ocrData, enrichmentData, userId: session.user.id });

      // -- Payment Slip flow - smart confidence-based matching ------------------
      if (ocrData.type === 'payment_slip') {
        const result = await handlePaymentSlip(
          ocrData,
          photoUri,
          session.user.id,
          // Callback for medium-confidence matches (50–74%): show confirmation dialog
          (matchResult: MatchResult) =>
            new Promise<boolean>((resolve) => {
              const bill = matchResult.bill;
              const dateStr = bill?.created_at
                ? new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : '';
              showAlert(
                `Link Payment? (${matchResult.confidence}% match)`,
                `Found a likely bill match:\n\n  ${bill?.merchant_name || 'Unknown'}\n  Rs. ${bill?.amount?.toLocaleString('en-IN')}  ${dateStr}\n\nLink this payment to the bill above?`,
                [
                  { text: 'Yes, Link It', onPress: () => resolve(true), style: 'default' },
                  { text: 'Save Separately', onPress: () => resolve(false), style: 'cancel' },
                ]
              );
            })
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to process payment slip');
        }

        return {
          ...result.bill,
          isMerged: result.isMerged,
          isManual: result.isManual,
          isDuplicate: result.isDuplicate,
          _paymentConfidence: result.confidence,
        };
      }

      // -- Normal bill save -------------------------------------------------------
      console.log('[saveBill] Inserting bill into Supabase with category:', ocrData.category || 'Others');
      
      const { data: bill, error: billError } = await supabase
        .from('bills')
        .insert({
          category: ocrData.category || 'Others',
          amount: ocrData.amount,
          uri: photoUri,
          merchant_name: enrichmentData?.vendor_details?.trade_name || ocrData.merchant_name || 'Unknown',
          gst: ocrData.gst !== 'N/A' ? ocrData.gst : null,
          invoice_date: ocrData.invoice_date !== 'N/A' ? ocrData.invoice_date : null,
          invoice_number: ocrData.invoice_number !== 'N/A' ? ocrData.invoice_number : null,
          vendor_address: ocrData.vendor_address !== 'N/A' ? ocrData.vendor_address : (enrichmentData?.vendor_details?.address || null),
          payment_mode: ocrData.payment_mode || 'Unknown',
          cgst: ocrData.taxes?.cgst || 0,
          sgst: ocrData.taxes?.sgst || 0,
          igst: ocrData.taxes?.igst || 0,
          total_tax: ocrData.taxes?.total_tax || 0,
          google_maps_link: enrichmentData?.location?.google_maps_link || null,
          distance_km: enrichmentData?.location?.distance_km || null,
          enrichment_data: enrichmentData || {},
          user_id: session.user.id,
          is_verified_payment: false,
        })
        .select()
        .single();

      if (billError) {
        console.error('[saveBill] Error inserting bill:', billError);
        throw billError;
      }
      
      console.log('[saveBill] Bill saved successfully:', bill);

      // Save line items
      if (ocrData.items && ocrData.items.length > 0) {
        const itemsToInsert = ocrData.items.map((item: any) => ({
          bill_id: bill.id,
          name: item.name,
          quantity: item.quantity || 1,
          price: item.price || 0,
          amount: item.amount || 0,
        }));

        const { error: itemsError } = await supabase
          .from('bill_items')
          .insert(itemsToInsert);

        if (itemsError) console.error('Error saving items:', itemsError);
      }

      return bill;
    } catch (error: any) {
      showAlert('Storage Error', error.message || String(error));
      return null;
    }
  };


  const handlePhotoCapture = async (photo: any) => {
    abortControllerRef.current = new AbortController();
    setLoading(true);
    setLoadingText('Processing...');
    try {
      if (!photo.base64 || !photo.uri) throw new Error('Photo missing base64 or uri');

      // 1. OCR Extraction
      const ocrResult = await recognizeTextViaOCR(photo.base64, abortControllerRef.current.signal);
      if (!ocrResult.text) throw new Error("No text identified");

      if (ocrResult.type === 'payment_slip') {
        setLoadingText('Matching Payment...');
      } else {
        setLoadingText('Getting Location...');
      }

      // 2. Smart Enrichment (with real GPS location)
      let enrichmentData = null;
      if (ocrResult.type !== 'payment_slip') {
        const userLoc = await getUserLocation();
        setLoadingText('Enriching Bill...');
        enrichmentData = await enrichBillData(
          ocrResult,
          userLoc?.lat,
          userLoc?.lng,
          abortControllerRef.current.signal
        );
      }

      // 3. Save to Database
      const savedBill: any = await saveBill(photo.uri, ocrResult, enrichmentData);

      if (savedBill) {
        if (notificationPermission) {
          let notifTitle = 'Bill Organized! ✅';
          let notifBody = `Added Rs. ${ocrResult.amount} - ${savedBill.merchant_name || 'Unknown'}`;

          if (ocrResult.type === 'payment_slip') {
            if (savedBill.isDuplicate) {
              notifTitle = '⚠️ Already Linked';
              notifBody = `UTR already matched to ${savedBill.merchant_name}`;
            } else if (savedBill.isMerged && savedBill.isManual) {
              notifTitle = '[Link] Payment Linked ✅';
              notifBody = `Rs. ${ocrResult.amount} linked to ${savedBill.merchant_name} (${savedBill._paymentConfidence}% match)`;
            } else if (savedBill.isMerged) {
              notifTitle = '✅ Payment Auto-Linked!';
              notifBody = `Rs. ${ocrResult.amount} auto-matched -> ${savedBill.merchant_name}`;
            } else {
              notifTitle = '[Card] Payment Slip Saved';
              notifBody = `Rs. ${ocrResult.amount} via ${ocrResult.payment_mode || 'Unknown'} - no bill matched`;
            }
          }

          await Notifications.scheduleNotificationAsync({
            content: { title: notifTitle, body: notifBody, sound: true },
            trigger: null,
          });
        }

        // Budget Monitoring Check (regular bills only)
        if (ocrResult.type !== 'payment_slip' && session?.user) {
          try {
            const budget = await BudgetStorage.getBudgetByCategory(session.user.id, ocrResult.category);
            if (budget) {
              const spent = await BudgetCalculator.getCategorySpending(session.user.id, budget);
              await BudgetNotificationService.checkBudgetAlerts(session.user.id, ocrResult.category, spent, budget);
            }
          } catch (budgetError) {
            console.error('Budget check failed:', budgetError);
          }
        }

        router.push('/bills-table');
      }
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message?.includes('aborted')) {
        console.log('Process cancelled by user');
        return;
      }
      showAlert('Error', e.message);
    } finally {
      if (loading) {
        setLoading(false);
      }
      abortControllerRef.current = null;
    }
  };
  const analyzeLiveFrame = async () => {
    if (!cameraRef.current || !isLiveMode || isAnalyzing) return;

    try {
      console.log('[LiveLens] Capturing frame...');
      setIsAnalyzing(true);
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5, // Pro Optimization: Higher quality for better identification
        skipProcessing: true
      });

      if (photo?.base64) {
        console.log('[LiveLens] Sending to backend...');
        if (liveLensAbortControllerRef.current) {
          liveLensAbortControllerRef.current.abort();
        }
        liveLensAbortControllerRef.current = new AbortController();

        const response = await fetch(`${BACKEND_BASE_URL}/api/live-lens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image: photo.base64 }),
          signal: liveLensAbortControllerRef.current.signal,
        });

        if (response.status === 429) {
          console.warn('[LiveLens] Rate limited (429).');
          showAlert('Rate Limited', 'Please try again in a moment.');
          setIsLiveMode(false);
        } else if (!response.ok) {
          const errorText = await response.text();
          console.warn(`[LiveLens] Backend error ${response.status}:`, errorText);
          setIsLiveMode(false);
        } else {
          const data = await response.json();
          if (data.identified) {
            setLiveResult(data);
          } else {
            console.log('[LiveLens] No product found. Staying on standby.');
            setLiveResult(null);
            // It will loop automatically thanks to the useEffect
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message?.includes('aborted')) {
        console.log('[LiveLens] Process cancelled by user');
        return;
      }
      console.warn('[LiveLens] Analysis failed:', e);
      setIsLiveMode(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    const now = Date.now();
    // Only capture if: 
    // 1. Live Mode is ON 
    // 2. NOT already analyzing 
    // 3. Device is STEADY 
    // 4. No current result shown
    // 5. Cooldown: At least 3s since last attempt
    // 6. Grace period: At least 1.5s since turning ON Live Mode
    if (isLiveMode && !isAnalyzing && isSteady && !liveResult &&
      (now - lastAnalysisTimeRef.current > 3000) &&
      (now - modeToggleTimeRef.current > 1500)) {
      console.log('[LiveLens] Hand is steady + Cooldown passed. Triggering auto-capture...');
      lastAnalysisTimeRef.current = now;
      analyzeLiveFrame();
    }
  }, [isLiveMode, isAnalyzing, isSteady, liveResult]);

  useEffect(() => {
    if (isLiveMode) {
      setLiveResult(null);
    } else {
      if (liveLensAbortControllerRef.current) {
        liveLensAbortControllerRef.current.abort();
        liveLensAbortControllerRef.current = null;
      }
      setLiveResult(null);
      setIsAnalyzing(false);
    }
  }, [isLiveMode]);

  const saveLiveProductAsBill = async () => {
    if (!liveResult) return;

    setLoading(true);
    setLoadingText('Saving Product...');

    try {
      console.log('[LiveLens Save] Live result:', liveResult);
      
      // Map live lens categories to budget categories (case-insensitive)
      const categoryMap: Record<string, string> = {
        'home & kitchen': 'Shopping',
        'electronics': 'Shopping',
        'grocery': 'Food',
        'groceries': 'Food',
        'food': 'Food',
        'food & dining': 'Food',
        'fashion': 'Shopping',
        'clothing': 'Shopping',
        'shopping': 'Shopping',
        'electricity': 'Electricity',
        'water': 'Water',
        'rent': 'Rent',
        'internet': 'Internet',
        'entertainment': 'Entertainment',
        'medical': 'Medical',
        'health': 'Medical',
        'travel': 'Travel',
        'others': 'Others',
        'other': 'Others'
      };
      
      const normalizedCategory = liveResult.category ? liveResult.category.toLowerCase().trim() : '';
      const mappedCategory = categoryMap[normalizedCategory] || 'Shopping';
      console.log('[LiveLens Save] Normalized category:', normalizedCategory, '→ Mapped category:', mappedCategory);
      
      const ocrData = {
        category: mappedCategory,
        amount: liveResult.price || 0,
        merchant_name: liveResult.brand || liveResult.product_name,
        type: 'bill',
        items: [{
          name: liveResult.product_name,
          quantity: 1,
          price: liveResult.price,
          amount: liveResult.price
        }]
      };

      const saved = await saveBill('', ocrData, { source: 'live_lens' });
      if (saved) {
        const itemDtl = `${liveResult.brand && liveResult.brand !== 'Unknown' ? liveResult.brand + ' ' : ''}${liveResult.product_name}`;
        
        // Budget Monitoring Check - same as normal bill save!
        if (notificationPermission && session?.user) {
          try {
            const budget = await BudgetStorage.getBudgetByCategory(session.user.id, ocrData.category);
            if (budget) {
              const spent = await BudgetCalculator.getCategorySpending(session.user.id, budget);
              await BudgetNotificationService.checkBudgetAlerts(session.user.id, ocrData.category, spent, budget);
            }
          } catch (budgetError) {
            console.error('Budget check failed:', budgetError);
          }
        }
        
        showAlert('✨ Success', `${itemDtl} was added to your expenses.\n\nEstimated Price: 💰 Rs. ${liveResult.price?.toLocaleString('en-IN')}\nCategory: ${mappedCategory}`);
        setIsLiveMode(false);
      }
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const takePhoto = async () => {
    if (cameraRef.current) {
      try {
        setLoading(true);
        setLoadingText('Capturing...');
        const photo = await cameraRef.current.takePictureAsync({ base64: true });
        await handlePhotoCapture(photo);
      } catch (e: any) {
        showAlert('Error', e.message || String(e));
        setLoading(false);
      }
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        base64: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0].base64) {
        setLoading(true);
        setLoadingText('Extracting...');

        const photo = {
          uri: result.assets[0].uri,
          base64: result.assets[0].base64
        };

        await handlePhotoCapture(photo);
      }
    } catch (e: any) {
      showAlert('Gallery Error', e.message || String(e));
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        active={!loading}
        enableTorch={flash === 'on'}
      />

      {/* Document Frame Overlay */}
      {!loading && (
        <View style={styles.overlayContainer}>
          <View style={styles.topSection}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <TouchableOpacity onPress={() => router.replace('/(tabs)/dashboard')} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={22} color={Colors.white} />
            </TouchableOpacity>

            <View style={styles.titleContainer}>
              <Text style={styles.overlayTitle}>Smart Scanner</Text>
              <View style={[
                styles.statusBadge,
                backendConnected === null ? styles.statusBadgeChecking :
                  backendConnected ? styles.statusBadgeOnline : styles.statusBadgeOffline
              ]}>
                <View style={styles.statusRow}>
                  <View style={styles.dotContainer}>
                    <Animated.View style={[
                      styles.statusDot,
                      { backgroundColor: backendConnected === null ? Colors.white : backendConnected ? Colors.success : Colors.error },
                      backendConnected && animatedStatusDotStyle
                    ]} />
                  </View>
                  <Text style={[
                    styles.statusText,
                    { color: backendConnected === null ? Colors.white : backendConnected ? Colors.success : Colors.error }
                  ]}>
                    {backendConnected === null ? "AI READY" : backendConnected ? "AI ONLINE" : "OFFLINE"}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}
              style={[styles.iconButton, flash === 'on' && styles.iconButtonActive]}
            >
              <Ionicons name="flash-outline" size={24} color={flash === 'on' ? Colors.accent : Colors.white} />
            </TouchableOpacity>
          </View>

          <Animated.View style={[styles.frameContainer, animatedFrameStyle]}>
            <View style={styles.frameCornerTopLeft} />
            <View style={styles.frameCornerTopRight} />
            <View style={styles.frameCornerBottomLeft} />
            <View style={styles.frameCornerBottomRight} />

            <Animated.View style={[styles.scanLine, animatedScanLineStyle]} />

            <View style={styles.centerGuide}>
              <Ionicons
                name={isAnalyzing ? "sync" : "search"}
                size={48}
                color={
                  isAnalyzing ? Colors.accent :
                    (isLiveMode && isSteady) ? Colors.success :
                      'rgba(255, 255, 255, 0.4)'
                }
              />
            </View>
          </Animated.View>

          <View style={styles.bottomSection}>
            <View style={styles.hintContainer}>
              <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
              <Text style={styles.hintText}>
                {isLiveMode ? (isSteady ? 'Locking on...' : 'Hold steady to identify') : 'Focus AI on product or bill'}
              </Text>
            </View>

            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={[styles.controlsRow, { marginBottom: 10, width: '100%' }]}>
                <TouchableOpacity style={styles.secondaryButton} onPress={pickImage}>
                  <Text style={{ fontSize: 24, color: Colors.white }}>🖼️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.captureButtonOuter}
                  onPress={takePhoto}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <View style={styles.captureButtonInner} />
                </TouchableOpacity>

                <View style={{ width: 48 }} />
              </View>

              <TouchableOpacity
                style={[styles.liveLensButton, isLiveMode && styles.liveLensButtonActive, { marginBottom: 0 }]}
                onPress={() => {
                  const newMode = !isLiveMode;
                  setIsLiveMode(newMode);
                  if (newMode) {
                    modeToggleTimeRef.current = Date.now();
                    steadyCount.current = 0;
                    setIsSteady(false);
                  }
                }}
                activeOpacity={0.7}
              >
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <Text style={[styles.liveLensText, isLiveMode && styles.liveLensTextActive]}>
                  {isLiveMode ? 'LIVE LENS: ON' : 'LIVE LENS'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}


      {/* Live Info Card */}
      {isLiveMode && liveResult && (
        <Animated.View entering={FadeIn.duration(400)} style={styles.liveCardContainer}>
          <View style={styles.liveCard}>
            <LinearGradient
              colors={['#1E293B', '#0F172A']}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.liveCardHeader}>
              <View style={styles.liveCardBadge}>
                <Text style={styles.liveCardBadgeText}>{liveResult.category}</Text>
              </View>
              <Text style={styles.liveCardPrice}>
                {liveResult.price > 0 ? `💰 Rs. ${liveResult.price?.toLocaleString('en-IN')}` : 'Price N/A'}
              </Text>
            </View>

            <Text style={styles.liveCardTitle}>{liveResult.product_name}</Text>
            <Text style={styles.liveCardBrand}>{liveResult.brand}</Text>

            {/* AI Insights & Market Verdict */}
            {liveResult.market_verdict ? (
              <View style={styles.liveMarketInfo}>
                <View style={styles.verdictRow}>
                  <Ionicons name="flash-outline" size={14} color="#666" />
                  <Text style={styles.verdictText}>{liveResult.market_verdict}</Text>
                </View>
                {liveResult.best_market_price > 0 && liveResult.best_market_price < liveResult.price && (
                  <Text style={styles.savingsTag}>✓ Best price: 🏷️ Rs. {liveResult.best_market_price.toLocaleString('en-IN')}</Text>
                )}
              </View>
            ) : null}

            {/* Platform Price Comparisons */}
            {liveResult.price_comparisons?.length > 0 && (
              <View style={styles.livePriceTable}>
                <Text style={styles.livePriceTableTitle}>WHERE TO BUY</Text>
                {liveResult.price_comparisons.flatMap((comp: any) =>
                  (comp.platforms || []).map((p: any, idx: number) => (
                    <View key={`${comp.item_name}-${idx}`} style={styles.livePriceRow}>
                      <View style={styles.livePlatformDot} />
                      <Text style={styles.livePlatformName}>{p.name}</Text>
                      <Text style={styles.livePlatformPrice}>
                        🏷️ Rs. {p.price?.toLocaleString('en-IN')}
                      </Text>
                      {comp.savings_percent > 0 && (
                        <View style={styles.liveSavingsBadge}>
                          <Text style={styles.liveSavingsBadgeText}>-{comp.savings_percent}%</Text>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Specs */}
            {liveResult.specs?.length > 0 && (
              <View style={styles.liveCardSpecs}>
                {liveResult.specs.map((spec: string, idx: number) => (
                  <View key={idx} style={styles.specItem}>
                    <View style={styles.specDot} />
                    <Text style={styles.specText}>{spec}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.liveCardActions}>
              <TouchableOpacity
                style={styles.liveCardButtonSecondary}
                onPress={() => { setLiveResult(null); }}
                activeOpacity={0.8}
              >
                <Text style={styles.liveCardButtonSecondaryText}>Scan Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.liveCardButton, { flexDirection: 'row', gap: 6 }]} onPress={saveLiveProductAsBill} activeOpacity={0.8}>
                <LinearGradient
                  colors={[Colors.white, '#E2E8F0']}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="add-circle" size={18} color="#0F172A" />
                <Text style={styles.liveCardButtonText}>Add to Expenses</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      {isLiveMode && isAnalyzing && !liveResult && (
        <View style={styles.analyzingIndicator}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <ActivityIndicator color={Colors.accent} size="small" />
          <Text style={styles.analyzingText}>AI ANALYZING...</Text>
        </View>
      )}

      {loading && (
        <Animated.View entering={FadeIn} style={styles.loadingOverlay}>
          <LinearGradient
            colors={[Colors.primary, Colors.primaryLight]}
            style={StyleSheet.absoluteFill}
          >
            <View style={styles.loadingContent}>
              <View style={styles.spinnerWrapper}>
                <ActivityIndicator color={Colors.white} size="large" />
                <View
                  style={[styles.loaderGlow, { backgroundColor: Colors.primary, opacity: 0.1 }]}
                />
              </View>
              <Text style={styles.loadingTitle}>{loadingText}</Text>
              <Text style={styles.loadingSubtitle}>Our AI is organizing your finances...</Text>
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: '60%' }]} />
              </View>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelProcess}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>
      )}
      {/* Custom Alert */}
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingBottom: 50,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 100,
    paddingBottom: Spacing.lg,
    overflow: 'hidden',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconButtonActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderColor: Colors.accent,
  },
  titleContainer: {
    alignItems: 'center',
  },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeChecking: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  statusBadgeOnline: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  statusBadgeOffline: {
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    borderColor: 'rgba(248, 113, 113, 0.3)',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotContainer: {
    width: 8,
    height: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  overlayTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  frameContainer: {
    width: width * 0.85,
    height: height * 0.45,
    alignSelf: 'center',
    position: 'relative',
    marginTop: 60,
  },
  frameCornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: Colors.white,
    borderTopLeftRadius: 24,
  },
  frameCornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: Colors.white,
    borderTopRightRadius: 24,
  },
  frameCornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: Colors.white,
    borderBottomLeftRadius: 24,
  },
  frameCornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: Colors.white,
  },
  centerGuide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanLine: {
    height: 2,
    width: '100%',
    backgroundColor: Colors.accent,
    position: 'absolute',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  bottomSection: {
    paddingBottom: 40,
    gap: 30,
  },
  hintContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  hintText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  liveLensButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 8,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  liveLensButtonActive: {
    borderColor: Colors.accent,
  },
  liveLensText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  liveLensTextActive: {
    color: Colors.accent,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 50,
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  captureButtonOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  captureButtonInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  loadingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  spinnerWrapper: {
    marginBottom: 24,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  loadingTitle: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
  },
  progressContainer: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    maxWidth: 240,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.white,
    borderRadius: 3,
  },
  cancelButton: {
    marginTop: 32,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cancelButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  liveCardContainer: {
    position: 'absolute',
    top: 180,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 50,
  },
  liveCard: {
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  liveCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveCardBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  liveCardBadgeText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  liveCardPrice: {
    color: Colors.accent,
    fontSize: 22,
    fontWeight: '800',
  },
  liveCardTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 24,
  },
  liveCardBrand: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
  },
  liveCardSpecs: {
    gap: 8,
    marginBottom: 20,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  specDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },
  specText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    flex: 1,
  },
  liveCardButton: {
    flex: 1.5,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  liveCardButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  analyzingIndicator: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 50,
  },
  analyzingText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 8,
  },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  liveMarketInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 10,
    marginVertical: 12,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  verdictText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  savingsTag: {
    color: '#6EE7B7',
    fontSize: 12,
    fontWeight: '600',
  },
  livePriceTable: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  livePriceTableTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  livePriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  livePlatformDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  livePlatformName: {
    flex: 1,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
  },
  livePlatformPrice: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  liveSavingsBadge: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveSavingsBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  liveCardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  liveCardButtonSecondary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveCardButtonSecondaryText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '700',
  },
});
