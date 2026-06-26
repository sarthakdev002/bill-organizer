const admin = require('firebase-admin');

/**
 * FCM Push Notification Service
 */
class FCMService {
  constructor() {
    this.initialized = false;
    this.init();
  }

  init() {
    try {
      // Look for service account key in backend/config
      const serviceAccount = require('./config/serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      this.initialized = true;
      console.log('[FCM] Firebase Admin initialized');
    } catch (error) {
      console.warn('[FCM] Firebase Admin initialization failed (Check serviceAccountKey.json). Skipping FCM.');
    }
  }

  /**
   * Send push notification to a specific token
   */
  async sendPushNotification(token, title, body, data = {}) {
    if (!this.initialized) return { status: 'error', reason: 'FCM not initialized' };

    const message = {
      notification: { title, body },
      data: data,
      token: token
    };

    try {
      const response = await admin.messaging().send(message);
      console.log('[FCM] Notification sent successfully:', response);
      return { status: 'sent', id: response };
    } catch (error) {
      console.error('[FCM] Error sending notification:', error);
      return { status: 'error', error: error.message };
    }
  }
}

module.exports = new FCMService();
