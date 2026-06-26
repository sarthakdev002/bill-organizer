const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxrsjnwncuhibhsmcxie.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_lFzgzGHSkz5AvlIw_jQw6w_LPeYY4ce';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkData() {
    console.log('Connecting to:', SUPABASE_URL);

    const { count, error } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Error fetching count:', error);
        return;
    }

    console.log('Total bills in table (all users):', count);

    const { data, error: dataError } = await supabase
        .from('bills')
        .select('id, amount, created_at, category, user_id')
        .limit(5);

    if (dataError) {
        console.error('Error fetching data:', dataError);
    } else {
        console.log('Sample Bills (anon key):', data.length);
    }

    const now = new Date();
    const som = new Date(now.getFullYear(), now.getMonth(), 1);
    console.log(`Current Month Start: ${som.toISOString()}`);

    const matches = data.filter(b => new Date(b.created_at) >= som);
    console.log('Bills matching This Month:', matches.length);
}

checkData();
