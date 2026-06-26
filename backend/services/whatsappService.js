const fetch = require('node-fetch');

/**
 * WhatsApp Business API Service
 */
class WhatsAppService {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.apiUrl = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
  }

  /**
   * Send a template message
   */
  async sendBudgetAlert(recipient, category, spent, budget, threshold) {
    if (!this.accessToken || !this.phoneNumberId) {
      console.warn('[WHATSAPP] Missing credentials. Skipping message.');
      return { status: 'skipped', reason: 'Missing credentials' };
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template: {
            name: 'budget_alert_threshold',
            language: { code: 'en_US' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: category },
                  { type: 'text', text: spent.toFixed(2) },
                  { type: 'text', text: budget.toFixed(2) },
                  { type: 'text', text: threshold.toString() }
                ]
              }
            ]
          }
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(data));

      console.log(`[WHATSAPP] Alert sent to ${recipient}`);
      return { status: 'sent', id: data.messages[0].id };
    } catch (error) {
      console.error('[WHATSAPP] Error sending alert:', error);
      return { status: 'error', error: error.message };
    }
  }
}

module.exports = new WhatsAppService();
