const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const fcmService = require('./services/fcmService');
const whatsappService = require('./services/whatsappService');
const { findBestMatch, applyMatchToBill } = require('./services/paymentMatcher');

// Load environment variables
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const app = express();
app.use(cors());
// Razorpay webhook requires raw body for signature verification — must come BEFORE bodyParser.json
app.use('/api/razorpay/webhook', express.raw({ type: 'application/json' }));
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyB98W39PpNXcHGwbg5Yk9_UYcMim9YqFYI';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const PORT = process.env.BACKEND_PORT || 5000;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

// Supabase admin client for server-side operations (webhook, matching)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

app.get('/api/health', (req, res) => {
  // Health check - no logging to avoid spam
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/api/ocr', async (req, res) => {
  try {
    console.log('Received OCR request');
    const { base64Image } = req.body;
    if (!base64Image) {
      console.error('No image data provided');
      return res.status(400).json({ error: 'Image data is required' });
    }

    const base64String = String(base64Image);
    const cleanedBase64 = base64String.includes(',') ? base64String.split(',').pop() : base64String;
    const approxBytes = Math.floor(cleanedBase64.length * 0.75);
    if (approxBytes > 200 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large' });
    }

    const requestBody = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: cleanedBase64
              }
            },
            {
              text: `Analyze this image. It can be a bill/receipt OR a payment slip (e.g., GPay, Paytm, Bank Transfer, Card slip). 
              Extract the following information and return ONLY valid JSON in this format:
              {
                "type": "bill" or "payment_slip",
                "text": "all readable text from the image",
                "category": "One of: Food, Electricity, Water, Rent, Internet, Shopping, Entertainment, Medical, Travel, Others. Choose the best match.",
                "amount": 0.00 (numeric value of the total amount),
                "merchant_name": "Main name of the shop/brand (e.g., 'McDonald's', 'Reliance Retail', 'Airtel'). Exclude long legal suffixes like 'Pvt Ltd' unless it's the only name.",
                "vendor_address": "Full address of the vendor if found",
                "gst": "GST/Service Tax number if found",
                "invoice_date": "Invoice/bill date in YYYY-MM-DD format",
                "invoice_number": "Invoice/bill number if found",
                "payment_mode": "Detected payment mode (UPI, Cash, Card, etc.)",
                "utr": "Transaction ID / UTR / Reference number (for payment_slip)",
                "card_last_4": "Last four digits of the card (if payment slip and card used)",
                "payment_date": "Full date of payment in YYYY-MM-DD format if visible (for payment_slip)",
                "payment_time": "Time of payment in HH:MM format (24h) if found (for payment_slip)",
                "taxes": {
                  "cgst": 0.00, "sgst": 0.00, "igst": 0.00, "total_tax": 0.00
                },
                "items": [
                  { "name": "name of item", "quantity": 1, "price": 0.00, "amount": 0.00 }
                ]
              }
              If it's a payment slip, set "type": "payment_slip" and extract utr, card_last_4, and payment_time. 
              If it's a bill, set "type": "bill" and extract items and taxes.
              If the amount is unclear, return 0. If category is unclear, return "Others".`
            }
          ]
        }
      ]
    };

    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean markdown code blocks if present
    const jsonString = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    // Keyword-based classification overrides
    const KEYWORD_CATEGORIES = {
      'Food': ['restaurant', 'cafe', 'food', 'burger', 'pizza', 'kitchen', 'dining', 'swiggy', 'zomato', 'mcdonalds', 'kfc', 'starbucks', 'subway', 'dominos', 'coffee', 'tea', 'bakery', 'hotel', 'bar', 'pub', 'bistro'],
      'Electricity': ['electricity', 'power', 'torrent', 'adani', 'bescom', 'tata power', 'bill', 'electric'],
      'Water': ['water', 'jal', 'board', 'supply'],
      'Rent': ['rent', 'lease', 'housing', 'landlord', 'tenant', 'broker'],
      'Internet': ['internet', 'broadband', 'wifi', 'fiber', 'airtel', 'jio', 'act', 'hathway', 'vodafone', 'data'],
      'Shopping': ['mall', 'mart', 'D Mart', 'DMart', 'store', 'center', 'shop', 'fashion', 'clothing', 'apparel', 'amazon', 'flipkart', 'myntra', 'zara', 'h&m', 'uniqlo', 'retail', 'supermart', 'SUPERMART'],
      'Entertainment': ['movie', 'cinema', 'theater', 'netflix', 'prime', 'hotstar', 'bookmyshow', 'ticket'],
      'Medical': ['hospital', 'pharmacy', 'medical', 'clinic', 'doctor', 'health', 'medplus', 'apollo'],
      'Travel': ['uber', 'ola', 'rapido', 'taxi', 'cab', 'flight', 'airline', 'irctc', 'railway', 'train', 'bus', 'redbus', 'metro', 'fuel', 'petrol', 'diesel', 'shell', 'hp', 'indianoil', 'Ride', 'Ride Charge'],
    };

    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonString);
    } catch (e) {
      console.error("Failed to parse AI JSON:", jsonString);
      parsedResult = { text: rawText, category: 'Others', amount: 0 };
    }

    // Apply Smart Tax Distribution (India GST 50/50 split if missing)
    if (parsedResult.taxes && Number(parsedResult.taxes.total_tax) > 0) {
      const t = parsedResult.taxes;
      const hasDetailedTaxes = Number(t.cgst || 0) > 0 || Number(t.sgst || 0) > 0 || Number(t.igst || 0) > 0;

      if (!hasDetailedTaxes) {
        console.log(`DEBUG: Splitting total_tax ${t.total_tax} into CGST/SGST...`);
        t.cgst = Number(t.total_tax) / 2;
        t.sgst = Number(t.total_tax) / 2;
      } else {
        console.log('DEBUG: Detailed taxes found, skipping split.');
      }
    }

    // Apply Keyword Matching
    const lowerText = (parsedResult.text + " " + rawText).toLowerCase();
    let keywordMatchFound = false;

    for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        parsedResult.category = category;
        keywordMatchFound = true;
        console.log(`Keyword match found: ${category}`);
        break;
      }
    }

    if (!keywordMatchFound && !parsedResult.category) {
      parsedResult.category = "Others";
    }

    console.log('OCR Success:', parsedResult);
    res.json(parsedResult);
  } catch (error) {
    console.error('Server Logic Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Helper: Haversine Distance (km) ---
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Helper: Geocode a place name via Gemini ---
async function geocodeViaGemini(query) {
  try {
    const requestBody = {
      contents: [{
        parts: [{
          text: `What are the latitude and longitude coordinates for this place: "${query}"?
Return ONLY a JSON object in this exact format, nothing else:
{"lat": 0.0, "lng": 0.0}
If you cannot determine the exact location, make your best estimate based on the address or business name. Do not include any explanation.`
        }]
      }]
    };

    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error('Gemini geocode error:', response.status);
      return null;
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonString = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const coords = JSON.parse(jsonString);

    if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
      console.log(`Geocoded "${query}" => lat: ${coords.lat}, lng: ${coords.lng}`);
      return coords;
    }
    return null;
  } catch (e) {
    console.error('Geocode via Gemini failed:', e.message);
    return null;
  }
}

// --- Helper: Lookup GSTIN Details via Gemini ---
async function lookupGSTINViaGemini(gstin) {
  try {
    const requestBody = {
      contents: [{
        parts: [{
          text: `Lookup the official details for Indian GSTIN: "${gstin}".
Return ONLY a JSON object in this exact format, nothing else:
{
  "legal_name": "Official Registered Name",
  "trade_name": "Common Trade Name",
  "address": "Full Registered Address",
  "status": "Active/Inactive/Cancelled",
  "registration_date": "YYYY-MM-DD"
}
If accurate data is unavailable, provide your best estimate based on the GSTIN structure (first 2 digits = state, middle 10 = PAN) or general knowledge. If completely unknown, use empty strings.`
        }]
      }],
      tools: [{ google_search: {} }]
    };

    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) return null;

    const result = await response.json();
    const parts = result?.candidates?.[0]?.content?.parts || [];
    const rawText = parts.filter(p => p.text).map(p => p.text).join('\n');
    const jsonString = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    // Use regex to find the JSON block if there's other text
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : jsonString);
  } catch (e) {
    console.error('GSTIN lookup failed:', e.message);
    return null;
  }
}

// --- Helper: AI-Powered Comparison Engine via Gemini ---
// --- Helper: AI-Powered Comparison Engine via Gemini (with Live Scraping) ---
async function getAIComparisons(billData) {
  try {
    const items = (billData.items || []).slice(0, 5); // Limit to top 5 items for deep comparison
    if (items.length === 0 && !billData.merchant_name) return null;

    const category = billData.category || 'General';
    const merchant = billData.merchant_name || 'Unknown';
    const totalAmount = billData.amount || 0;

    // --- Step 1: Live Scraping for key items ---
    console.log(`[AI Engine] Scraping real prices for ${items.length} items in category: ${category}`);
    const scrapeTasks = [];

    items.forEach(item => {
      const query = item.name || item.description;
      if (!query || query.length < 3) return;

      const encodedQuery = encodeURIComponent(query);

      // Target specific platforms based on category
      if (['Electronics'].includes(category)) {
        scrapeTasks.push(fetchPlatformPrices('Amazon', `https://www.amazon.in/s?k=${encodedQuery}`, query));
        scrapeTasks.push(fetchPlatformPrices('Flipkart', `https://www.flipkart.com/search?q=${encodedQuery}`, query));
      } else if (['Food', 'Grocery', 'Shopping'].includes(category)) {
        scrapeTasks.push(fetchPlatformPrices('Blinkit', `https://blinkit.com/s/?q=${encodedQuery}`, query));
        scrapeTasks.push(fetchPlatformPrices('Zepto', `https://www.zepto.co.in/search?query=${encodedQuery}`, query));
        scrapeTasks.push(fetchPlatformPrices('Amazon Fresh', `https://www.amazon.in/s?k=${encodedQuery}`, query));
      } else {
        // Fallback for general items
        scrapeTasks.push(fetchPlatformPrices('Amazon', `https://www.amazon.in/s?k=${encodedQuery}`, query));
      }
    });

    const scrapeResults = await Promise.allSettled(scrapeTasks);
    const scrapedData = scrapeResults
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    // Build context from scraped data
    let scrapedContext = "";
    if (scrapedData.length > 0) {
      scrapedContext = "\n\nREAL LIVE PRICE DATA (USE THESE EXACT PRICES):\n";
      scrapedData.forEach(d => {
        if (d.products && d.products.length > 0) {
          scrapedContext += `\nPlatform: ${d.platform} (Search: ${d.searchUrl})\n`;
          d.products.slice(0, 2).forEach(p => {
            scrapedContext += `- "${p.name}" : ₹${p.price} [URL: ${p.url}]\n`;
          });
        }
      });
    }

    const itemsList = items.map(i => `- ${i.name}: Rs.${i.price}`).join('\n');

    const prompt = `You are a smart shopping assistant for Indian consumers. Analyze this bill and provide comparison data.
    
    Bill Details:
    - Merchant: ${merchant}
    - Category: ${category}
    - Total: Rs.${totalAmount}
    ${itemsList ? `\nItems:\n${itemsList}` : ''}
    ${scrapedContext}

    Return ONLY a JSON object (no markdown) with this structure:
    {
      "price_comparisons": [
        {
          "item_name": "Item from bill",
          "bill_price": 100,
          "platforms": [
            {"name": "Amazon", "price": 89, "url": "https://www.amazon.in/s?k=SEARCH_TERM"},
            {"name": "Blinkit", "price": 85, "url": "https://blinkit.com/s/?q=SEARCH_TERM"}
          ],
          "best_price": 85,
          "savings_percent": 15
        }
      ],
      "alternatives": [
        {
          "original_item": "Item from bill",
          "suggestion": "Real product name",
          "estimated_price": 70,
          "reason": "Direct competitor, better value",
          "where_to_buy": "Platform Name",
          "url": "https://direct-link"
        }
      ],
      "service_suggestions": [
        {
          "type": "vendor",
          "suggestion": "Swiggy/Zomato/Blinkit equivalent",
          "estimated_savings": "10-20%",
          "details": "Real world reason why this is better/cheaper"
        }
      ],
      "savings_summary": {
        "total_bill": ${totalAmount},
        "potential_savings": 0,
        "savings_percent": 0,
        "verdict": "Real-time market analysis based on scraped data"
      }
    }

    Important rules:
    - IF SCRAPED DATA IS PROVIDED ABOVE, USE IT. DO NOT HALUCINATE PRICES.
    - Platforms for Food/Grocery: Swiggy, Zomato, Blinkit, Zepto, BigBasket, Amazon Fresh.
    - Platforms for Electronics: Amazon, Flipkart, Reliance Digital, Croma.
    - Generate REAL URLs if not provided in scraped context.
    - Limit to top 3 items for comparison.`;

    const requestBody = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      tools: [{ googleSearch: {} }] // Use Search grounding for even better accuracy
    };

    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error('Gemini comparison error:', response.status);
      return null;
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonString = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    // Use regex to find the JSON block safely
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonString);

    console.log(`[AI Engine] Finalized comparison for ${parsed.price_comparisons?.length || 0} items with live data.`);
    return parsed;
  } catch (e) {
    console.error('AI Comparison Engine failed:', e.message);
    return null;
  }
}

app.post('/api/enrich', async (req, res) => {
  try {
    const { billData, userLat, userLng } = req.body;
    console.log('Received enrichment request for:', billData.merchant_name);

    const enrichment = {
      vendor_details: {},
      location: {},
      price_intelligence: []
    };

    // 1. GSTIN Enrichment
    if (billData.gst && billData.gst !== 'N/A') {
      console.log('Enriching via GSTIN:', billData.gst);
      const gstinDetails = await lookupGSTINViaGemini(billData.gst);

      const hasReceiptAddress = billData.vendor_address && billData.vendor_address !== 'N/A' && billData.vendor_address.trim().length > 5;

      enrichment.vendor_details = {
        gstin: billData.gst,
        legal_name: gstinDetails?.legal_name || billData.merchant_name,
        trade_name: gstinDetails?.trade_name || billData.merchant_name,
        // Priority: Receipt Address > GSTIN Lookup Address > Fallback
        address: hasReceiptAddress ? billData.vendor_address : (gstinDetails?.address || 'Address found in bill'),
        status: gstinDetails?.status || 'Active',
        registration_date: gstinDetails?.registration_date || null,
        source: gstinDetails ? 'gstin_lookup' : 'ocr_fallback'
      };

      // Update billData for downstream location enrichment if we got a new address
      if (!hasReceiptAddress && gstinDetails?.address) {
        billData.vendor_address = gstinDetails.address;
        console.log('Using GSTIN address for location enrichment:', gstinDetails.address);
      }
    }

    // 2. Location & Distance Enrichment (REAL)
    if (billData.merchant_name && billData.merchant_name !== 'Unknown') {
      const locationQuery = billData.vendor_address && billData.vendor_address !== 'N/A'
        ? `${billData.merchant_name}, ${billData.vendor_address}`
        : billData.merchant_name;

      // Try to geocode the shop
      const shopCoords = await geocodeViaGemini(locationQuery);

      if (shopCoords && typeof userLat === 'number' && typeof userLng === 'number') {
        // Calculate real distance
        const distKm = haversineDistance(userLat, userLng, shopCoords.lat, shopCoords.lng);
        const roundedDist = Math.round(distKm * 10) / 10; // 1 decimal

        // --- Travel Time Estimates ---
        const drivingTimeMin = Math.round((distKm / 30) * 60); // avg 30 km/h in city
        const publicTimeMin = Math.round((distKm / 18) * 60);  // avg 18 km/h (bus/metro with stops)
        const walkingTimeMin = Math.round((distKm / 5) * 60);  // avg 5 km/h walking

        // --- Travel Cost Estimates (Indian pricing) ---
        const autoRickshawCost = Math.round(Math.max(30, 25 + distKm * 13));  // ₹25 base + ₹13/km
        const cabCost = Math.round(Math.max(50, 40 + distKm * 14));            // ₹40 base + ₹14/km
        const busCost = Math.round(Math.max(10, 5 + distKm * 2));             // ₹5 base + ₹2/km
        const bikeTaxiCost = Math.round(Math.max(20, 15 + distKm * 7));       // ₹15 base + ₹7/km

        // --- Feasibility: travel cost vs bill amount ---
        const billAmount = billData.amount || 0;
        const cheapestTravel = busCost;
        const roundTripCheapest = cheapestTravel * 2;
        const roundTripCab = cabCost * 2;
        const travelPercent = billAmount > 0 ? Math.round((roundTripCheapest / billAmount) * 100) : null;

        let feasibility = 'unknown';
        let feasibilityMessage = '';
        if (billAmount > 0) {
          if (travelPercent <= 5) {
            feasibility = 'excellent';
            feasibilityMessage = `Travel costs only ${travelPercent}% of your bill — very convenient!`;
          } else if (travelPercent <= 15) {
            feasibility = 'good';
            feasibilityMessage = `Travel costs ~${travelPercent}% of your bill — reasonable trip.`;
          } else if (travelPercent <= 30) {
            feasibility = 'moderate';
            feasibilityMessage = `Travel costs ~${travelPercent}% of your bill — consider ordering online.`;
          } else {
            feasibility = 'poor';
            feasibilityMessage = `Travel costs ~${travelPercent}% of your bill — delivery may save money.`;
          }
        }

        // Google Maps directions link (from user → shop)
        enrichment.location = {
          google_maps_link: `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${shopCoords.lat},${shopCoords.lng}&travelmode=driving`,
          distance_km: roundedDist,
          shop_lat: shopCoords.lat,
          shop_lng: shopCoords.lng,
          travel_time: {
            driving_min: drivingTimeMin,
            public_min: publicTimeMin,
            walking_min: walkingTimeMin
          },
          travel_cost: {
            auto_rickshaw: autoRickshawCost,
            cab: cabCost,
            bus: busCost,
            bike_taxi: bikeTaxiCost
          },
          feasibility: {
            rating: feasibility,
            message: feasibilityMessage,
            travel_percent: travelPercent,
            round_trip_cheapest: roundTripCheapest,
            round_trip_cab: roundTripCab
          }
        };
        console.log(`Distance: ${roundedDist} km | Driving: ${drivingTimeMin}min | Auto: ₹${autoRickshawCost} | Feasibility: ${feasibility}`);
      } else {
        // Fallback: search link without distance
        enrichment.location = {
          google_maps_link: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationQuery)}`,
          distance_km: null
        };
        console.log('Could not compute distance — missing user location or geocode failed');
      }
    }

    // 3. AI-Powered Comparison Engine
    try {
      const comparisonData = await getAIComparisons(billData);
      if (comparisonData) {
        enrichment.price_intelligence = comparisonData.price_comparisons || [];
        enrichment.alternatives = comparisonData.alternatives || [];
        enrichment.service_suggestions = comparisonData.service_suggestions || [];
        enrichment.savings_summary = comparisonData.savings_summary || null;
      }
    } catch (e) {
      console.warn('AI Comparison failed, using empty:', e.message);
      enrichment.price_intelligence = [];
      enrichment.alternatives = [];
      enrichment.service_suggestions = [];
    }

    console.log('Enrichment completed');
    res.json(enrichment);
  } catch (error) {
    console.error('Enrichment Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Standalone Comparison Search Endpoint ---
app.post('/api/compare-search', async (req, res) => {
  try {
    const { query, category } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    console.log(`Compare search: "${query}" in category: ${category || 'General'}`);
    const cat = category || 'General';
    const encodedQuery = encodeURIComponent(query);

    // ─── Step 1: Scrape REAL prices from live platforms ───
    const scrapeTasks = [];

    // Amazon India
    scrapeTasks.push(
      fetchPlatformPrices('Amazon', `https://www.amazon.in/s?k=${encodedQuery}`, query)
    );
    // Flipkart
    scrapeTasks.push(
      fetchPlatformPrices('Flipkart', `https://www.flipkart.com/search?q=${encodedQuery}`, query)
    );

    // Category-specific platforms
    if (['Electronics'].includes(cat)) {
      scrapeTasks.push(
        fetchPlatformPrices('Croma', `https://www.croma.com/searchB?q=${encodedQuery}`, query)
      );
    }
    if (['Groceries'].includes(cat)) {
      scrapeTasks.push(
        fetchPlatformPrices('BigBasket', `https://www.bigbasket.com/ps/?q=${encodedQuery}`, query)
      );
      scrapeTasks.push(
        fetchPlatformPrices('JioMart', `https://www.jiomart.com/search/${encodedQuery}`, query)
      );
    }
    if (['Medical'].includes(cat)) {
      scrapeTasks.push(
        fetchPlatformPrices('1mg', `https://www.1mg.com/search/all?name=${encodedQuery}`, query)
      );
      scrapeTasks.push(
        fetchPlatformPrices('PharmEasy', `https://pharmeasy.in/search/all?name=${encodedQuery}`, query)
      );
    }
    if (['Fashion'].includes(cat)) {
      scrapeTasks.push(
        fetchPlatformPrices('Myntra', `https://www.myntra.com/${encodedQuery}`, query)
      );
      scrapeTasks.push(
        fetchPlatformPrices('Ajio', `https://www.ajio.com/search/?text=${encodedQuery}`, query)
      );
    }

    const scrapeResults = await Promise.allSettled(scrapeTasks);
    const scrapedData = scrapeResults
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    console.log(`Scraped data from ${scrapedData.length} platforms for "${query}"`);

    // ─── Step 2: Use Gemini with scraped context for trustworthy analysis ───
    const platformGuide = {
      'Electronics': 'Amazon.in, Flipkart, Croma, Reliance Digital, Vijay Sales',
      'Groceries': 'BigBasket, JioMart, Amazon Fresh, Blinkit, DMart, Zepto',
      'Travel': 'MakeMyTrip, Goibibo, IRCTC, RedBus, Yatra, Cleartrip, Ixigo',
      'Salon & Beauty': 'UrbanCompany, Yes Madam, Looks Salon, local salons',
      'Repairs': 'UrbanCompany, Mr Right, local service providers, brand service centers',
      'Food': 'Swiggy, Zomato, Blinkit, BigBasket, local restaurants',
      'Medical': 'PharmEasy, 1mg, Netmeds, Apollo Pharmacy, MedPlus',
      'Fashion': 'Myntra, Ajio, Amazon Fashion, Flipkart Fashion, Meesho, Nykaa Fashion',
      'General': 'Amazon.in, Flipkart, JioMart, local vendors',
    };
    const platforms = platformGuide[cat] || platformGuide['General'];

    // Build context from scraped data
    let scrapedContext = '';
    if (scrapedData.length > 0) {
      scrapedContext = `\n\nREAL SCRAPED PRICE DATA FROM LIVE WEBSITES (use these EXACT prices, they are real and current as of today ${new Date().toISOString().split('T')[0]}):\n`;
      scrapedData.forEach(d => {
        scrapedContext += `\n${d.platform}:\n`;
        scrapedContext += `  Search URL: ${d.searchUrl}\n`;
        if (d.products && d.products.length > 0) {
          d.products.forEach((p, i) => {
            scrapedContext += `  ${i + 1}. "${p.name}" - ₹${p.price}${p.rating ? ` (${p.rating})` : ''}${p.url ? ` [${p.url}]` : ''}\n`;
          });
        } else {
          scrapedContext += `  No products found via scraping — use your knowledge with realistic 2026 prices\n`;
        }
      });
    }

    const prompt = `You are an expert Indian market price comparison assistant providing REAL-TIME trustworthy data.

Query: "${query}"
Category: ${cat}
Date: ${new Date().toISOString().split('T')[0]}

Platforms to compare across: ${platforms}
${scrapedContext}

CRITICAL RULES:
1. ${scrapedData.length > 0 ? 'USE THE REAL SCRAPED PRICES ABOVE as your PRIMARY data source. These are LIVE prices from actual websites.' : 'Use your most up-to-date knowledge of Indian market prices for 2025-2026.'}
2. ALL URLs MUST be real, clickable search URLs (format: https://www.amazon.in/s?k=SEARCH_TERM, https://www.flipkart.com/search?q=SEARCH_TERM, etc.)
3. Prices MUST be in Indian Rupees (Rs.) and realistic for the current market
4. Include the EXACT product names as found on the platforms
5. Be HONEST -- if you're not sure about a price, give a realistic range

Return ONLY valid JSON:
{
  "search_query": "${query}",
  "category": "${cat}",
  "data_source": "${scrapedData.length > 0 ? 'live_scraping + ai' : 'ai_knowledge'}",
  "last_updated": "${new Date().toISOString()}",
  "price_comparisons": [
    {
      "item_name": "Exact product name from platform",
      "avg_market_price": 1000,
      "platforms": [
        {"name": "Platform", "price": 950, "url": "https://real-platform-search-url", "rating": "4.2/5", "delivery": "2-3 days", "in_stock": true}
      ],
      "best_price": 950,
      "best_platform": "Platform Name",
      "savings_percent": 5
    }
  ],
  "alternatives": [
    {
      "original_item": "${query}",
      "suggestion": "Alternative product name",
      "estimated_price": 700,
      "reason": "Why this is good",
      "where_to_buy": "Platform",
      "url": "https://search-url"
    }
  ],
  "service_suggestions": [
    {
      "type": "vendor",
      "suggestion": "Alternative vendor/service",
      "estimated_savings": "10-20%",
      "details": "Why cheaper",
      "contact_or_url": "https://url-or-app"
    }
  ],
  "savings_summary": {
    "avg_market_price": 1000,
    "best_price_found": 950,
    "potential_savings": 50,
    "savings_percent": 5,
    "verdict": "Brief honest verdict"
  },
  "pro_tips": ["Real money-saving tips"],
  "trust_score": "high/medium/low based on data confidence"
}`;

    // Use Gemini with Google Search grounding for extra accuracy
    const GROUNDED_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    let parsed;
    let dataSource = scrapedData.length > 0 ? 'live_scraping' : 'ai_knowledge';

    try {
      const groundedController = new AbortController();
      const groundedTimeout = setTimeout(() => groundedController.abort(), 60000);

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      };

      const response = await fetch(GROUNDED_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: groundedController.signal,
      });
      clearTimeout(groundedTimeout);

      if (response.ok) {
        const result = await response.json();
        // Grounded responses have multiple parts - find all text parts
        const parts = result?.candidates?.[0]?.content?.parts || [];
        const textParts = parts.filter(p => p.text).map(p => p.text);
        const rawText = textParts.join('\n');

        if (rawText) {
          const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
            dataSource += '_google_grounded';
          }
        }
      }
    } catch (groundedErr) {
      console.log('Grounded search failed:', groundedErr.message);
    }

    // Fallback: try without grounding
    if (!parsed) {
      console.log('Using fallback (non-grounded) Gemini...');
      const fallbackBody = {
        contents: [{ parts: [{ text: prompt }] }],
      };
      const fallbackResp = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fallbackBody),
      });
      if (!fallbackResp.ok) {
        const errorText = await fallbackResp.text();
        console.error('Gemini compare-search error:', fallbackResp.status, errorText);
        return res.status(fallbackResp.status).json({ error: 'AI comparison failed' });
      }
      const fallbackResult = await fallbackResp.json();
      const parts = fallbackResult?.candidates?.[0]?.content?.parts || [];
      const rawText = parts.filter(p => p.text).map(p => p.text).join('\n');
      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    }

    parsed.data_source = dataSource;
    parsed.last_updated = new Date().toISOString();
    console.log(`Compare results: ${parsed.price_comparisons?.length || 0} comparisons, source: ${dataSource}`);
    res.json(parsed);
  } catch (e) {
    console.error('Compare search error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Helper: Scrape product prices from a platform ───
async function fetchPlatformPrices(platformName, searchUrl, query) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout — scraping is best-effort

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
        'Accept-Encoding': 'identity',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`${platformName}: HTTP ${response.status}`);
      return { platform: platformName, searchUrl, products: [] };
    }

    const html = await response.text();
    const products = extractPricesFromHTML(platformName, html, query);

    console.log(`${platformName}: Found ${products.length} products`);
    return { platform: platformName, searchUrl, products: products.slice(0, 5) };
  } catch (e) {
    console.log(`${platformName} scrape failed: ${e.message}`);
    return { platform: platformName, searchUrl, products: [] };
  }
}

// ─── HTML price extractor (platform-specific patterns) ───
function extractPricesFromHTML(platform, html, query) {
  const products = [];
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  try {
    if (platform === 'Amazon') {
      // Amazon: look for price spans and product titles
      const blocks = html.split(/data-component-type="s-search-result"/);
      for (let i = 1; i < Math.min(blocks.length, 8); i++) {
        const block = blocks[i];
        const titleMatch = block.match(/<span[^>]*class="a-size-[^"]*a-text-normal[^"]*"[^>]*>(.*?)<\/span>/);
        const priceMatch = block.match(/<span class="a-price-whole">([0-9,]+)/);
        const ratingMatch = block.match(/aria-label="([0-9.]+) out of 5/);
        const asinMatch = block.match(/data-asin="([A-Z0-9]+)"/);

        if (titleMatch && priceMatch) {
          const name = titleMatch[1].replace(/<[^>]*>/g, '').trim();
          const price = parseInt(priceMatch[1].replace(/,/g, ''));
          if (price > 0 && price < 10000000) {
            products.push({
              name: name.substring(0, 100),
              price,
              rating: ratingMatch ? `${ratingMatch[1]}/5` : null,
              url: asinMatch ? `https://www.amazon.in/dp/${asinMatch[1]}` : `https://www.amazon.in/s?k=${encodeURIComponent(query)}`,
            });
          }
        }
      }
    }

    if (platform === 'Flipkart') {
      // Flipkart: price and title patterns  
      const pricePatterns = html.match(/₹\s?([0-9,]+)/g) || [];
      const titlePatterns = html.match(/<a[^>]*title="([^"]+)"[^>]*class="[^"]*"/g) || [];

      const titles = titlePatterns
        .map(t => { const m = t.match(/title="([^"]+)"/); return m ? m[1] : null; })
        .filter(Boolean)
        .filter(t => queryWords.some(w => t.toLowerCase().includes(w)));

      const prices = pricePatterns
        .map(p => parseInt(p.replace(/[₹,\s]/g, '')))
        .filter(p => p > 50 && p < 10000000);

      for (let i = 0; i < Math.min(titles.length, prices.length, 5); i++) {
        products.push({
          name: titles[i].substring(0, 100),
          price: prices[i],
          url: `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
        });
      }
    }

    // Generic fallback for other platforms
    if (products.length === 0) {
      const priceMatches = html.match(/₹\s?([0-9,]+)/g) || [];
      const prices = priceMatches
        .map(p => parseInt(p.replace(/[₹,\s]/g, '')))
        .filter(p => p > 50 && p < 10000000);

      // Deduplicate and take top 5 unique prices
      const uniquePrices = [...new Set(prices)].sort((a, b) => a - b).slice(0, 5);
      uniquePrices.forEach(price => {
        products.push({
          name: `${query} (${platform})`,
          price,
          url: searchUrl,
        });
      });
    }

  } catch (e) {
    console.log(`${platform} parse error: ${e.message}`);
  }

  return products;
}



app.post('/api/notify', async (req, res) => {
  try {
    const { type, userId, category, spent, budget, threshold, percentage, channels } = req.body;

    console.log(`[ALERT] Received notification request for User ${userId}`);
    console.log(`[ALERT] Budget: ${category}, Spent: ${spent}/${budget} (${percentage.toFixed(1)}%), Threshold: ${threshold}%`);

    const results = [];

    if (channels.includes('email')) {
      // Simulate Email sending
      console.log(`[EMAIL] Sending budget alert email to user ${userId}...`);
      results.push({ channel: 'email', status: 'sent', recipient: 'user@example.com' });
    }

    if (channels.includes('fcm')) {
      const { pushToken } = req.body;
      if (pushToken) {
        let title = 'Budget Alert';
        let body = `You've spent ${percentage.toFixed(1)}% of your ${category} budget.`;

        if (threshold >= 100) {
          title = 'Budget Exceeded! 🚨';
          body = `Warning: ${category} budget exceeded. Spent: ${spent}/${budget}`;
        } else if (threshold >= 90) {
          title = 'Budget Critical ⚠️';
          body = `${category} spending is at ${percentage.toFixed(1)}%. Almost out of budget!`;
        }

        const fcmResult = await fcmService.sendPushNotification(pushToken, title, body, {
          userId, category, threshold: threshold.toString(), percentage: percentage.toString()
        });
        results.push({ channel: 'fcm', ...fcmResult });
      } else {
        results.push({ channel: 'fcm', status: 'skipped', reason: 'No push token provided' });
      }
    }

    if (channels.includes('whatsapp')) {
      // For WhatsApp, we need a recipient phone number. 
      // In a real app, you'd fetch this from the user's profile.
      // For now, we'll try to find it in the request or use a placeholder.
      const recipient = req.body.phoneNumber || process.env.WHATSAPP_TEST_RECIPIENT || "+91XXXXXXXXXX";

      const waResult = await whatsappService.sendBudgetAlert(
        recipient,
        category,
        spent,
        budget,
        threshold
      );
      results.push({ channel: 'whatsapp', ...waResult });
    }

    res.json({
      success: true,
      message: 'Alerts processed',
      timestamp: new Date().toISOString(),
      results
    });
  } catch (error) {
    console.error('Notification Error:', error);
    res.status(500).json({ error: error.message });
  }
});
// ─── Credit Card Statement Analyzer ───────────────────────
app.post('/api/analyze-cc-statement', async (req, res) => {
  try {
    console.log('Received CC statement analysis request');
    const { base64Image } = req.body;
    if (!base64Image) return res.status(400).json({ error: 'Image data is required' });

    const cleanedBase64 = base64Image.includes(',') ? base64Image.split(',').pop() : base64Image;

    const requestBody = {
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: cleanedBase64 } },
          {
            text: `Analyze this credit card statement image and extract all financial details.
Return ONLY valid JSON in this exact format:
{
  "card_name": "Name/type of the card (e.g. HDFC Regalia, SBI SimplyCLICK)",
  "card_last_4": "Last 4 digits of card number if visible",
  "statement_date": "Statement date in YYYY-MM-DD format",
  "due_date": "Payment due date in YYYY-MM-DD format",
  "billing_period": "e.g. 01 Jan 2026 - 31 Jan 2026",
  "total_due": 0.00,
  "minimum_due": 0.00,
  "previous_balance": 0.00,
  "payments_received": 0.00,
  "new_charges": 0.00,
  "interest_charged": 0.00,
  "finance_charges": 0.00,
  "late_fee": 0.00,
  "credit_limit": 0.00,
  "available_credit": 0.00,
  "cash_limit": 0.00,
  "reward_points": 0,
  "emi_details": [
    { "description": "EMI item description", "emi_amount": 0.00, "remaining_emis": 0, "total_amount": 0.00, "principal": 0.00, "interest": 0.00 }
  ],
  "revolving_balance": 0.00,
  "transaction_summary": {
    "total_debits": 0.00,
    "total_credits": 0.00,
    "transaction_count": 0,
    "top_categories": [
      { "category": "Category name", "amount": 0.00, "count": 0 }
    ],
    "top_merchants": [
      { "merchant": "Merchant name", "amount": 0.00, "count": 0 }
    ]
  },
  "transactions": [
    { "date": "YYYY-MM-DD", "description": "Transaction description", "amount": 0.00, "type": "debit or credit", "category": "Category" }
  ],
  "warnings": ["Any important warnings like overlimit, high interest, missed payment etc."],
  "tips": ["Money-saving tips based on the statement analysis"]
}
Extract ALL visible information. For any field not found, use 0 or empty. Parse all transactions visible. Categorize transactions into: Shopping, Food, Travel, Entertainment, Fuel, EMI, Insurance, Utilities, Medical, Transfer, Others.` }
        ]
      }]
    };

    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini CC analysis error:', response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Failed to parse statement data' });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('CC statement analyzed successfully');
    res.json(parsed);
  } catch (error) {
    console.error('CC analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});
// ─── Brokerage Statement Analyzer ───────────────────────
app.post('/api/analyze-brokerage-statement', async (req, res) => {
  try {
    console.log('Received brokerage statement analysis request');
    const { base64Image } = req.body;
    if (!base64Image) return res.status(400).json({ error: 'Image data is required' });

    const cleanedBase64 = base64Image.includes(',') ? base64Image.split(',').pop() : base64Image;

    const requestBody = {
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: cleanedBase64 } },
          {
            text: `Analyze this brokerage/demat/stock market statement image and extract all financial details.
Return ONLY valid JSON in this exact format:
{
  "broker_name": "Name of the broker (e.g. Zerodha, Groww, Angel One)",
  "account_id": "Client/account ID if visible",
  "statement_period": "e.g. 01 Jan 2026 - 31 Jan 2026",
  "statement_date": "Statement date in YYYY-MM-DD format",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "type": "buy or sell",
      "symbol": "Stock/MF symbol (e.g. RELIANCE, TATAMOTORS)",
      "name": "Full company/fund name",
      "quantity": 0,
      "price": 0.00,
      "amount": 0.00,
      "brokerage": 0.00,
      "stt": 0.00,
      "charges": 0.00,
      "net_amount": 0.00,
      "exchange": "NSE or BSE",
      "segment": "Equity, F&O, MF, etc."
    }
  ],
  "holdings": [
    {
      "symbol": "Stock symbol",
      "name": "Company name",
      "quantity": 0,
      "avg_buy_price": 0.00,
      "current_price": 0.00,
      "invested_value": 0.00,
      "current_value": 0.00,
      "pnl": 0.00,
      "pnl_percent": 0.00,
      "sector": "Sector name"
    }
  ],
  "charges_summary": {
    "total_brokerage": 0.00,
    "stt": 0.00,
    "transaction_charges": 0.00,
    "gst": 0.00,
    "sebi_charges": 0.00,
    "stamp_duty": 0.00,
    "total_charges": 0.00
  },
  "pnl_summary": {
    "realized_pnl": 0.00,
    "unrealized_pnl": 0.00,
    "total_invested": 0.00,
    "current_value": 0.00,
    "total_returns": 0.00,
    "total_returns_percent": 0.00
  },
  "tax_summary": {
    "stcg_profit": 0.00,
    "stcg_tax_estimate": 0.00,
    "ltcg_profit": 0.00,
    "ltcg_tax_estimate": 0.00,
    "stcg_holdings": [
      { "symbol": "Stock", "profit": 0.00, "holding_days": 0 }
    ],
    "ltcg_holdings": [
      { "symbol": "Stock", "profit": 0.00, "holding_days": 0 }
    ]
  },
  "portfolio_allocation": [
    { "sector": "Sector name", "value": 0.00, "percent": 0.00, "stocks_count": 0 }
  ],
  "insights": ["Key observations about the portfolio"],
  "risks": ["Risk warnings based on the portfolio"]
}
Extract ALL visible information. For STCG, use 20% tax rate (new regime). For LTCG above ₹1.25L, use 12.5% tax rate. Holdings held < 12 months = STCG, >= 12 months = LTCG. If any field is not found, use 0 or empty array.` }
        ]
      }]
    };

    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini brokerage analysis error:', response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Failed to parse statement data' });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('Brokerage statement analyzed successfully');
    res.json(parsed);
  } catch (error) {
    console.error('Brokerage analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Payment Match Endpoint ──────────────────────────────────────────────────
// Called by the app when a payment slip is scanned (OCR complete).
// Returns the best matching bill and a confidence score.
app.post('/api/payment/match', async (req, res) => {
  try {
    const { userId, amount, paymentTimestamp, paymentMode, utr, paymentDate } = req.body;

    if (!userId || amount == null) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }

    console.log(`[PaymentMatch] Looking for match: userId=${userId}, amount=${amount}, mode=${paymentMode}, utr=${utr}`);

    const result = await findBestMatch(supabaseAdmin, userId, {
      amount,
      paymentTimestamp,
      paymentMode,
      utr,
      paymentDate,
    });

    res.json({
      matched: !!result.bill,
      duplicate: result.duplicate || false,
      confidence: result.confidence,
      autoMerge: result.autoMerge || false,
      promptUser: result.promptUser || false,
      bill: result.bill || null,
      allCandidates: result.allCandidates || [],
      message: result.message || null,
    });
  } catch (error) {
    console.error('[PaymentMatch] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Payment Confirm Endpoint ─────────────────────────────────────────────────
// Called after user confirms (or auto-merges) a matched payment.
app.post('/api/payment/confirm', async (req, res) => {
  try {
    const {
      billId, userId, amount, paymentTimestamp, paymentDate,
      paymentMode, utr, cardLast4, slipUri, confidence, matchMethod
    } = req.body;

    if (!billId || !userId) {
      return res.status(400).json({ error: 'billId and userId are required' });
    }

    const updatedBill = await applyMatchToBill(
      supabaseAdmin,
      billId,
      userId,
      { amount, paymentTimestamp, paymentDate, paymentMode, utr, card_last_4: cardLast4, slipUri },
      confidence || 0,
      matchMethod || 'ocr_manual',
      req.body
    );

    res.json({ success: true, bill: updatedBill });
  } catch (error) {
    console.error('[PaymentConfirm] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Razorpay Webhook Endpoint ────────────────────────────────────────────────
// Receives payment events from Razorpay. Verifies HMAC signature,
// then auto-matches and reconciles payments.
//
// Setup: Razorpay Dashboard → Settings → Webhooks → Add New Webhook
//   URL: http://<your-ip>:5000/api/razorpay/webhook
//   Secret: set RAZORPAY_WEBHOOK_SECRET in .env.local
//   Events: payment.captured
app.post('/api/razorpay/webhook', async (req, res) => {
  try {
    const rawBody = req.body; // raw Buffer (due to express.raw middleware)
    const signature = req.headers['x-razorpay-signature'];

    // ── Signature Verification ──────────────────────────────────────────────
    if (RAZORPAY_WEBHOOK_SECRET && signature) {
      const expectedSig = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      if (expectedSig !== signature) {
        console.warn('[Razorpay Webhook] ❌ Invalid signature — request rejected');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
      console.log('[Razorpay Webhook] ✅ Signature verified');
    } else if (RAZORPAY_WEBHOOK_SECRET && !signature) {
      console.warn('[Razorpay Webhook] Missing signature header');
      return res.status(400).json({ error: 'Missing x-razorpay-signature header' });
    } else {
      // No secret configured — allow through (dev/test mode)
      console.warn('[Razorpay Webhook] ! No RAZORPAY_WEBHOOK_SECRET set — skipping signature check (dev mode)');
    }

    // --- Parse Event ---
    const event = typeof rawBody === 'Buffer' || Buffer.isBuffer(rawBody)
      ? JSON.parse(rawBody.toString())
      : (typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody);

    const eventType = event.event;
    console.log(`[Razorpay Webhook] Event: ${eventType}`);

    // Only handle payment.captured events
    if (eventType !== 'payment.captured') {
      return res.json({ success: true, message: `Event ${eventType} acknowledged (not processed)` });
    }

    const paymentEntity = event?.payload?.payment?.entity;
    if (!paymentEntity) {
      return res.status(400).json({ error: 'Invalid payload: missing payment entity' });
    }

    // Extract payment details
    const razorpayPaymentId = paymentEntity.id;                      // e.g. pay_AbCdEfGhIj
    const razorpayOrderId = paymentEntity.order_id || null;
    const amountPaise = paymentEntity.amount || 0;
    const amountRupees = amountPaise / 100;                     // Razorpay stores in paise
    const paymentMethod = paymentEntity.method || 'unknown';     // upi, card, netbanking
    const upiId = paymentEntity.vpa || null;             // UPI ID
    const cardNetwork = paymentEntity.card?.network || null;
    const cardLast4 = paymentEntity.card?.last4 || null;
    const createdAtUnix = paymentEntity.created_at;
    const paymentTimestamp = createdAtUnix
      ? new Date(createdAtUnix * 1000).toISOString()
      : new Date().toISOString();
    const paymentDate = paymentTimestamp.split('T')[0];

    // Map Razorpay method to our payment_mode labels
    const modeMap = {
      upi: 'UPI',
      card: cardNetwork ? `${cardNetwork} Card` : 'Card',
      netbanking: 'Net Banking',
      wallet: 'Wallet',
      emi: 'EMI',
      paylater: 'Pay Later',
    };
    const paymentMode = modeMap[paymentMethod] || paymentMethod;

    // Check if this payment was already processed (idempotency)
    const { data: existingReconcile } = await supabaseAdmin
      .from('payment_reconciliations')
      .select('id, bill_id')
      .eq('razorpay_payment_id', razorpayPaymentId)
      .maybeSingle();

    if (existingReconcile) {
      console.log(`[Razorpay Webhook] Payment ${razorpayPaymentId} already reconciled — skipping`);
      return res.json({ success: true, message: 'Already reconciled', billId: existingReconcile.bill_id });
    }

    console.log(`[Razorpay Webhook] Processing payment: ${razorpayPaymentId} | Rs.${amountRupees} | ${paymentMode}`);

    // --- Attempt to find matching bill ---
    // NOTE: Webhook doesn't have a userId directly. 
    // Strategy: match by order_id metadata (if set) OR find by amount in recent unmatched bills.
    // In a production setup, store userId in Razorpay order notes during order creation.
    let userId = paymentEntity.notes?.user_id || null;

    if (!userId && razorpayOrderId) {
      // Try to find userId from order notes stored in Razorpay (if order was created with notes.user_id)
      console.log(`[Razorpay Webhook] No userId in notes for orderId=${razorpayOrderId}`);
    }

    if (!userId) {
      // Fallback: record the event in a pending table for manual review
      console.warn(`[Razorpay Webhook] Cannot match — no user_id in payment notes. Payment ${razorpayPaymentId} stored for manual review.`);

      // Still insert to reconciliations with null bill_id for audit
      await supabaseAdmin.from('payment_reconciliations').insert({
        bill_id: null,
        user_id: '00000000-0000-0000-0000-000000000000', // placeholder
        match_method: 'webhook',
        match_confidence: 0,
        payment_amount: amountRupees,
        utr_number: razorpayPaymentId,
        payment_mode: paymentMode,
        payment_timestamp: paymentTimestamp,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        webhook_event: eventType,
        raw_payload: event,
      }).catch(e => console.warn('Audit log failed:', e.message));

      return res.json({
        success: true,
        matched: false,
        message: 'Payment received but no user_id in notes. Add notes.user_id when creating Razorpay orders.',
      });
    }

    const matchResult = await findBestMatch(supabaseAdmin, userId, {
      amount: amountRupees,
      paymentTimestamp,
      paymentDate,
      paymentMode,
      utr: razorpayPaymentId,
    });

    if (matchResult.bill && matchResult.autoMerge) {
      // Auto-reconcile
      const updatedBill = await applyMatchToBill(
        supabaseAdmin,
        matchResult.bill.id,
        userId,
        {
          amount: amountRupees,
          paymentTimestamp,
          paymentDate,
          paymentMode,
          utr: razorpayPaymentId,
          card_last_4: cardLast4,
          razorpayOrderId,
          razorpayPaymentId,
          webhookEvent: eventType,
        },
        matchResult.confidence,
        'webhook',
        event
      );

      console.log(`[Razorpay Webhook] [OK] Auto-matched bill: ${updatedBill.merchant_name} (confidence: ${matchResult.confidence}%)`);
      return res.json({
        success: true,
        matched: true,
        autoMerge: true,
        confidence: matchResult.confidence,
        billId: updatedBill.id,
        merchant: updatedBill.merchant_name,
      });
    } else {
      // Low confidence or no match — log for manual review
      console.log(`[Razorpay Webhook] No auto-match (confidence: ${matchResult.confidence}%). Manual review needed.`);

      await supabaseAdmin.from('payment_reconciliations').insert({
        bill_id: matchResult.bill?.id || null,
        user_id: userId,
        match_method: 'webhook',
        match_confidence: matchResult.confidence || 0,
        payment_amount: amountRupees,
        utr_number: razorpayPaymentId,
        payment_mode: paymentMode,
        payment_timestamp: paymentTimestamp,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        webhook_event: eventType,
        raw_payload: event,
      }).catch(e => console.warn('Audit log failed:', e.message));

      return res.json({
        success: true,
        matched: false,
        confidence: matchResult.confidence,
        message: 'Payment received but confidence too low for auto-merge. Manual review required.',
      });
    }
  } catch (error) {
    console.error('[Razorpay Webhook] Error:', error);
    // IMPORTANT: Always return 200 to Razorpay even on errors to prevent retries
    // (unless it's a signature failure — those should 400)
    res.status(200).json({ received: true, error: error.message });
  }
});

// --- Live AI Lens Endpoint — Single Combined Gemini Call (fast path) ---
app.post('/api/live-lens', async (req, res) => {
  try {
    const { base64Image } = req.body;
    if (!base64Image) return res.status(400).json({ error: 'Image data is required' });

    console.log('[LiveLens] Single-shot identify + price lookup...');
    const cleanedBase64 = base64Image.includes(',') ? base64Image.split(',').pop() : base64Image;

    // Single combined prompt: identify the product AND get prices in one API call
    const combinedPrompt = `Look at this image extremely carefully. Identify the primary object or product visually, EVEN IF it is a generic, everyday item (like a tiffin box, lunch box, water bottle, container, utensil, or household item). DO NOT reject generic physical items.
    If it is a generic item, provide a reasonable Indian market retail price estimate for a typical item of this kind.

    Return ONLY valid JSON in this exact format (no markdown, no extra text):
    {
      "identified": true,
      "product_name": "Exact product name or generic description (e.g., 'Steel Tiffin Box', 'Plastic Bottle')",
      "brand": "Primary/Main brand name of the business (e.g., 'McDonald's', 'Apple', 'Airtel') or 'Generic/Unknown'",
      "category": "Home & Kitchen or Electronics or Grocery or Food or Fashion or Others",
      "estimated_price": 999,
      "market_verdict": "One sentence on whether this is a typical price limit in India",
      "price_comparisons": [
        { "platform": "Amazon", "price": 950, "url": "https://www.amazon.in/s?k=PRODUCT" },
        { "platform": "Flipkart", "price": 920, "url": "https://www.flipkart.com/search?q=PRODUCT" }
      ],
      "alternatives": [
        { "suggestion": "Alternative product name", "estimated_price": 800, "reason": "Why it's better value", "where_to_buy": "Online" }
      ],
      "specs": ["Material/Type if known", "Visible feature or color", "Approximate use"]
    }
    If and ONLY if absolutely NO clear object is visible in the frame, return: { "identified": false }`;

    const requestBody = {
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: cleanedBase64 } },
          { text: combinedPrompt }
        ]
      }],
      tools: [{ googleSearch: {} }]
    };

    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[LiveLens] Gemini error:', response.status, errText);
      return res.status(response.status).json({ error: 'Live Lens analysis failed' });
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[LiveLens] Raw response received:', rawText.substring(0, 200));

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[LiveLens] No product identified');
      return res.json({ identified: false });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.identified || !parsed.product_name) {
      return res.json({ identified: false });
    }

    console.log(`[LiveLens] Identified: ${parsed.product_name} (~Rs.${parsed.estimated_price})`);

    const finalResult = {
      identified: true,
      product_name: parsed.product_name,
      brand: parsed.brand || 'Unknown',
      category: parsed.category || 'Others',
      price: parsed.estimated_price || 0,
      best_market_price: parsed.price_comparisons?.reduce((min, p) => p.price < min ? p.price : min, parsed.estimated_price || 0) || 0,
      market_verdict: parsed.market_verdict || 'Product identified.',
      alternatives: parsed.alternatives || [],
      insights: [],
      price_comparisons: (parsed.price_comparisons || []).map(p => ({
        item_name: parsed.product_name,
        bill_price: parsed.estimated_price || 0,
        platforms: [{ name: p.platform, price: p.price, url: p.url }],
        best_price: p.price,
        savings_percent: parsed.estimated_price ? Math.round((parsed.estimated_price - p.price) / parsed.estimated_price * 100) : 0
      })),
      specs: parsed.specs || []
    };

    res.json(finalResult);
  } catch (error) {
    console.error('LiveLens Server Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[Proxy] Fetching bills for user: ${userId}`);

    const { data, error } = await supabaseAdmin
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Proxy] Supabase Error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('[Proxy] Server Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
  console.log(`Payment matching endpoint: POST /api/payment/match`);
  console.log(`Razorpay webhook endpoint: POST /api/razorpay/webhook`);
});

setInterval(() => { }, 10000);
