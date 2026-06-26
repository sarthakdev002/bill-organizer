/**
 * FCM Push Notification Service (no-op - not used in this version
 */
class FCMService {
  constructor() {
    console.warn('[FCM] FCM service is disabled in this version');
  }

  async sendPushNotification(token, title, body, data = {}) {
    console.warn('[FCM] FCM service is disabled');
    return { status: 'skipped', reason: 'FCM not enabled' };
  }
}

module.exports = new FCMService();
