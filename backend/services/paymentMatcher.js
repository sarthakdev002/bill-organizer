/**
 * paymentMatcher.js
 * ─────────────────
 * Core payment-to-bill matching engine.
 * Uses a weighted scoring approach to find the best candidate bill
 * for an incoming payment (from OCR screenshot or Razorpay webhook).
 *
 * Score breakdown (0–100):
 *   +60  Exact amount match              (required)
 *   +30  Time gap ≤ 2 hours             (very confident)
 *   +15  Time gap 2–12 hours            (same-day plausible)
 *   +5   Time gap 12–24 hours           (fallback)
 *   +10  Payment mode matches bill       (bonus)
 *   -100 UTR already assigned           (already reconciled — skip)
 *
 * Thresholds:
 *   ≥ 75  → auto-merge
 *   50–74 → prompt user for confirmation
 *   < 50  → save as standalone entry
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

/**
 * Calculate a confidence score between a candidate bill and an incoming payment.
 * @param {Object} bill - The bill record from DB
 * @param {Object} payment - The incoming payment data
 * @param {number} payment.amount
 * @param {string} [payment.paymentTimestamp] - ISO string
 * @param {string} [payment.paymentMode]
 * @returns {number} Score 0–100
 */
function scoreMatch(bill, payment) {
    // Exact amount is a hard requirement — no match without it
    if (Math.abs(Number(bill.amount) - Number(payment.amount)) > 0.01) return 0;

    let score = 60; // Base score for exact amount match

    // Time proximity scoring
    if (payment.paymentTimestamp) {
        const paymentTime = new Date(payment.paymentTimestamp).getTime();
        const billTime = new Date(bill.created_at).getTime();
        const gapMs = Math.abs(paymentTime - billTime);
        const gapHours = gapMs / (1000 * 60 * 60);

        if (gapHours <= 2) {
            score += 30; // Very likely same transaction
        } else if (gapHours <= 12) {
            score += 15; // Same-day plausible
        } else if (gapHours <= 24) {
            score += 5;  // Fallback — 24h window
        }
        // > 24 hours: no time bonus
    } else {
        // No timestamp → add partial points (24h window active)
        score += 5;
    }

    // Payment mode bonus
    if (
        payment.paymentMode &&
        bill.payment_mode &&
        normalizeMode(payment.paymentMode) === normalizeMode(bill.payment_mode)
    ) {
        score += 10;
    }

    return Math.min(score, 100);
}

/**
 * Normalize payment mode strings for comparison.
 * e.g. "UPI", "upi", "Upi" → "upi"
 *      "CARD", "Debit Card" → "card"
 */
function normalizeMode(mode) {
    const m = (mode || '').toLowerCase().trim();
    if (m.includes('upi') || m.includes('gpay') || m.includes('paytm') || m.includes('phonepe') || m.includes('bhim')) return 'upi';
    if (m.includes('card') || m.includes('debit') || m.includes('credit') || m.includes('visa') || m.includes('mastercard') || m.includes('rupay')) return 'card';
    if (m.includes('net') || m.includes('banking') || m.includes('neft') || m.includes('imps') || m.includes('rtgs')) return 'netbanking';
    if (m.includes('cash')) return 'cash';
    if (m.includes('wallet')) return 'wallet';
    return m;
}

/**
 * Find the best matching bill for an incoming payment.
 *
 * @param {string} userId - Authenticated user's UUID
 * @param {Object} payment
 * @param {number}  payment.amount
 * @param {string}  [payment.paymentTimestamp] - ISO string of when payment was made
 * @param {string}  [payment.paymentMode] - e.g. "UPI", "Card"
 * @param {string}  [payment.utr] - Transaction reference to check for duplicates
 * @param {Object}  supabaseClient - An initialized Supabase client
 * @returns {Promise<{ bill: Object|null, confidence: number, autoMerge: boolean }>}
 */
async function findBestMatch(supabaseClient, userId, payment) {
    // Check for duplicate UTR — already reconciled?
    if (payment.utr) {
        const { data: existing } = await supabaseClient
            .from('bills')
            .select('id, merchant_name, amount, utr_number')
            .eq('user_id', userId)
            .eq('utr_number', payment.utr)
            .maybeSingle();

        if (existing) {
            return {
                bill: existing,
                confidence: 100,
                autoMerge: false,
                duplicate: true,
                message: `UTR ${payment.utr} already linked to bill: ${existing.merchant_name}`,
            };
        }
    }

    // Build time window for candidate search (last 36 hours from payment time)
    const refTime = payment.paymentTimestamp ? new Date(payment.paymentTimestamp) : new Date();
    const windowStart = new Date(refTime.getTime() - 36 * 60 * 60 * 1000); // 36h before
    const windowEnd = new Date(refTime.getTime() + 2 * 60 * 60 * 1000); // 2h after (handle clock skew)

    const { data: candidates, error } = await supabaseClient
        .from('bills')
        .select('*')
        .eq('user_id', userId)
        .eq('amount', payment.amount)
        .is('utr_number', null)             // Not already reconciled
        .eq('is_verified_payment', false)   // Not already marked verified
        .neq('type', 'payment_slip')        // Don't match payment slips to other payment slips
        .gte('created_at', windowStart.toISOString())
        .lte('created_at', windowEnd.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('[PaymentMatcher] DB query error:', error);
        return { bill: null, confidence: 0, autoMerge: false };
    }

    if (!candidates || candidates.length === 0) {
        return { bill: null, confidence: 0, autoMerge: false };
    }

    // Score all candidates and pick the best
    const scored = candidates
        .map(bill => ({ bill, score: scoreMatch(bill, payment) }))
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
        return { bill: null, confidence: 0, autoMerge: false };
    }

    const best = scored[0];
    const confidence = best.score;
    const autoMerge = confidence >= 75;
    const promptUser = confidence >= 50 && confidence < 75;

    console.log(`[PaymentMatcher] Best match: "${best.bill.merchant_name}" | score=${confidence} | autoMerge=${autoMerge} | candidates=${scored.length}`);

    return {
        bill: best.bill,
        confidence,
        autoMerge,
        promptUser,
        allCandidates: scored.slice(0, 3).map(c => ({ ...c.bill, _score: c.score })),
    };
}

/**
 * Apply the payment data to a matched bill record in Supabase.
 * Also writes an entry to payment_reconciliations audit table.
 *
 * @param {Object} supabaseClient
 * @param {string} billId
 * @param {string} userId
 * @param {Object} payment
 * @param {number} confidence
 * @param {string} matchMethod - 'ocr_auto' | 'ocr_manual' | 'webhook' | 'manual'
 * @param {Object} [rawPayload] - original OCR/webhook data for audit log
 */
async function applyMatchToBill(supabaseClient, billId, userId, payment, confidence, matchMethod, rawPayload = {}) {
    // 1. Update the bill record
    const { data: updatedBill, error: updateError } = await supabaseClient
        .from('bills')
        .update({
            utr_number: payment.utr || null,
            card_last_4: payment.card_last_4 || null,
            payment_slip_uri: payment.slipUri || null,
            is_verified_payment: true,
            payment_timestamp: payment.paymentTimestamp || new Date().toISOString(),
            payment_date: payment.paymentDate || (payment.paymentTimestamp ? payment.paymentTimestamp.split('T')[0] : new Date().toISOString().split('T')[0]),
            payment_mode: payment.paymentMode || null,
            match_confidence: confidence,
            match_method: matchMethod,
        })
        .eq('id', billId)
        .select()
        .single();

    if (updateError) {
        console.error('[PaymentMatcher] Failed to update bill:', updateError);
        throw updateError;
    }

    // 2. Write to audit log
    try {
        await supabaseClient
            .from('payment_reconciliations')
            .insert({
                bill_id: billId,
                user_id: userId,
                match_method: matchMethod,
                match_confidence: confidence,
                payment_amount: payment.amount,
                utr_number: payment.utr || null,
                payment_mode: payment.paymentMode || null,
                payment_timestamp: payment.paymentTimestamp || null,
                razorpay_order_id: payment.razorpayOrderId || null,
                razorpay_payment_id: payment.razorpayPaymentId || null,
                webhook_event: payment.webhookEvent || null,
                raw_payload: rawPayload,
            });
    } catch (auditErr) {
        // Non-fatal — don't fail the whole operation if audit logging fails
        console.warn('[PaymentMatcher] Audit log failed (non-fatal):', auditErr.message);
    }

    console.log(`[PaymentMatcher] ✅ Bill ${billId} reconciled via ${matchMethod} (confidence: ${confidence}%)`);
    return updatedBill;
}

module.exports = { findBestMatch, applyMatchToBill, scoreMatch, normalizeMode };
