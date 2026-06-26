/**
 * paymentMatcher.ts
 * -----------------
 * Frontend client for the payment matching system.
 * Handles all payment-slip OCR -> match -> merge -> save flows.
 */

import { Config } from '@/constants/Config';
import { supabase } from '@/lib/supabase';

const BACKEND_BASE_URL = Config.BACKEND_URL;

// --- Confidence Thresholds ----------------------------------------------------
export const MATCH_CONFIDENCE = {
    AUTO_MERGE: 75,  // Auto-link silently
    PROMPT_USER: 50,  // Show confirmation dialog
    // Below 50 -> standalone save
} as const;

// --- Types --------------------------------------------------------------------

export interface PaymentOCRData {
    type: 'payment_slip';
    amount: number;
    payment_mode?: string;
    payment_date?: string;       // YYYY-MM-DD from OCR
    payment_time?: string;       // HH:MM from OCR
    utr?: string;
    card_last_4?: string;
    merchant_name?: string;
    [key: string]: any;
}

export interface MatchResult {
    matched: boolean;
    duplicate: boolean;
    confidence: number;
    autoMerge: boolean;
    promptUser: boolean;
    bill: any | null;
    allCandidates: any[];
    message: string | null;
}

export interface SavePaymentResult {
    success: boolean;
    isMerged: boolean;
    isManual: boolean;
    isDuplicate: boolean;
    confidence: number;
    bill: any | null;
    error?: string;
}

// --- Build ISO timestamp from OCR extracted date + time -----------------------

function buildPaymentTimestamp(paymentDate?: string, paymentTime?: string): string {
    const today = new Date().toISOString().split('T')[0];
    const date = paymentDate || today;
    if (paymentTime) {
        // paymentTime format: "HH:MM" or "HH:MM:SS"
        const timePart = paymentTime.includes(':') ? paymentTime : `${paymentTime}:00`;
        const fullTime = timePart.split(':').length === 2 ? `${timePart}:00` : timePart;
        return `${date}T${fullTime}Z`;
    }
    // No time extracted -- use date + current time (still much better than nothing)
    return `${date}T${new Date().toTimeString().split(' ')[0]}Z`;
}

// --- Step 1: Ask backend for the best bill match ------------------------------

export async function requestPaymentMatch(
    ocrData: PaymentOCRData,
    userId: string
): Promise<MatchResult> {
    try {
        const paymentTimestamp = buildPaymentTimestamp(ocrData.payment_date, ocrData.payment_time);

        const response = await fetch(`${BACKEND_BASE_URL}/api/payment/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                amount: ocrData.amount,
                paymentTimestamp,
                paymentDate: ocrData.payment_date || new Date().toISOString().split('T')[0],
                paymentMode: ocrData.payment_mode,
                utr: ocrData.utr,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Match API error: ${err}`);
        }

        return await response.json() as MatchResult;
    } catch (e: any) {
        console.warn('[PaymentMatcher] requestPaymentMatch failed:', e.message);
        // Network failure -> graceful fallback (save standalone)
        return {
            matched: false,
            duplicate: false,
            confidence: 0,
            autoMerge: false,
            promptUser: false,
            bill: null,
            allCandidates: [],
            message: e.message,
        };
    }
}

// --- Step 2a: Confirm merge (auto or user-confirmed) --------------------------

export async function confirmPaymentMerge(
    billId: string,
    userId: string,
    ocrData: PaymentOCRData,
    photoUri: string,
    confidence: number,
    matchMethod: 'ocr_auto' | 'ocr_manual'
): Promise<any> {
    const paymentTimestamp = buildPaymentTimestamp(ocrData.payment_date, ocrData.payment_time);

    const response = await fetch(`${BACKEND_BASE_URL}/api/payment/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            billId,
            userId,
            amount: ocrData.amount,
            paymentTimestamp,
            paymentDate: ocrData.payment_date || paymentTimestamp.split('T')[0],
            paymentMode: ocrData.payment_mode,
            utr: ocrData.utr,
            cardLast4: ocrData.card_last_4,
            slipUri: photoUri,
            confidence,
            matchMethod,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Confirm API error: ${err}`);
    }

    const json = await response.json();
    return json.bill;
}

// --- Step 2b: Save as standalone payment record (no bill match found) ---------

export async function saveStandalonePayment(
    ocrData: PaymentOCRData,
    photoUri: string,
    userId: string
): Promise<any> {
    const paymentTimestamp = buildPaymentTimestamp(ocrData.payment_date, ocrData.payment_time);

    const { data: bill, error } = await supabase
        .from('bills')
        .insert({
            category: ocrData.category || 'Others',
            amount: ocrData.amount,
            uri: null,
            payment_slip_uri: photoUri,
            merchant_name: ocrData.merchant_name || 'Unknown',
            payment_mode: ocrData.payment_mode || 'Unknown',
            is_verified_payment: true,
            utr_number: ocrData.utr || null,
            card_last_4: ocrData.card_last_4 || null,
            payment_timestamp: paymentTimestamp,
            payment_date: ocrData.payment_date || paymentTimestamp.split('T')[0],
            match_confidence: 0,
            match_method: null,
            enrichment_data: {},
            user_id: userId,
        })
        .select()
        .single();

    if (error) throw error;
    return bill;
}

// --- Master flow: Handle a payment slip end-to-end ----------------------------
// Returns a result describing what happened (merged / saved standalone / duplicate)

export async function handlePaymentSlip(
    ocrData: PaymentOCRData,
    photoUri: string,
    userId: string,
    onPromptUser?: (matchResult: MatchResult) => Promise<boolean>  // resolves true = link, false = save standalone
): Promise<SavePaymentResult> {
    try {
        // 1. Ask the backend for the best match
        const matchResult = await requestPaymentMatch(ocrData, userId);

        // 2. Duplicate UTR -- already reconciled
        if (matchResult.duplicate && matchResult.bill) {
            return {
                success: true,
                isMerged: false,
                isManual: false,
                isDuplicate: true,
                confidence: 100,
                bill: matchResult.bill,
            };
        }

        // 3. High confidence -> auto-merge
        if (matchResult.matched && matchResult.autoMerge && matchResult.bill) {
            const merged = await confirmPaymentMerge(
                matchResult.bill.id,
                userId,
                ocrData,
                photoUri,
                matchResult.confidence,
                'ocr_auto'
            );
            return {
                success: true,
                isMerged: true,
                isManual: false,
                isDuplicate: false,
                confidence: matchResult.confidence,
                bill: merged,
            };
        }

        // 4. Medium confidence -> prompt user if callback provided
        if (matchResult.matched && matchResult.promptUser && matchResult.bill && onPromptUser) {
            const userWantsToLink = await onPromptUser(matchResult);

            if (userWantsToLink) {
                const merged = await confirmPaymentMerge(
                    matchResult.bill.id,
                    userId,
                    ocrData,
                    photoUri,
                    matchResult.confidence,
                    'ocr_manual'
                );
                return {
                    success: true,
                    isMerged: true,
                    isManual: true,
                    isDuplicate: false,
                    confidence: matchResult.confidence,
                    bill: merged,
                };
            }
        }

        // 5. No match / low confidence / user declined -> save standalone
        const standalone = await saveStandalonePayment(ocrData, photoUri, userId);
        return {
            success: true,
            isMerged: false,
            isManual: false,
            isDuplicate: false,
            confidence: 0,
            bill: standalone,
        };

    } catch (e: any) {
        console.error('[PaymentMatcher] handlePaymentSlip error:', e);
        return {
            success: false,
            isMerged: false,
            isManual: false,
            isDuplicate: false,
            confidence: 0,
            bill: null,
            error: e.message,
        };
    }
}
