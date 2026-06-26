const fetch = require('node-fetch');


const GEMINI_API_KEY = 'AIzaSyB98W39PpNXcHGwbg5Yk9_UYcMim9YqFYI';
const LIST_MODELS_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;


async function listModels() {
    console.log('Listing Gemini Models...');
    try {
        const response = await fetch(LIST_MODELS_ENDPOINT);
        if (!response.ok) {
            const text = await response.text();
            console.error('API Error:', response.status, text);
            return;
        }
        const data = await response.json();
        console.log('Models:', JSON.stringify(data, null, 1));
    } catch (err) {
        console.error('Network Error:', err);
    }
}


listModels();

