import { Config } from '@/constants/Config';
import * as Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Budget, BudgetAlert } from '../types/budget';
import { BudgetCalculator } from './budgetCalculator';
import { BudgetStorage } from './budgetStorage';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export class BudgetNotificationService {
  /**
   * Request notification permissions
   */
  static async requestPermissions(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  }

  /**
   * Get Expo Push Token
   */
  static async getPushToken(): Promise<string | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      // Project ID is required for getExpoPushTokenAsync in newer Expo versions
      const projectId =
        Constants.default.expoConfig?.extra?.eas?.projectId ||
        Constants.default.easConfig?.projectId;

      if (!projectId) {
        console.warn('Push Notification Setup: No projectId found. To enable push notifications, run "npx eas project:init" or add your projectId to app.json under expo.extra.eas.projectId');
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync({
        projectId
      })).data;

      return token;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  /**
   * Check and send budget alerts
   */
  static async checkBudgetAlerts(
    userId: string,
    category: string,
    spent: number,
    budget: Budget
  ): Promise<void> {
    try {
      const percentage = BudgetCalculator.calculateSpendingPercentage(spent, budget.amount);

      // Check different thresholds
      const thresholds = [75, 80, 90, 100];

      for (const threshold of thresholds) {
        if (percentage >= threshold) {
          const hasAlerted = await BudgetStorage.hasAlertBeenTriggered(budget.id, threshold, userId);

          if (!hasAlerted) {
            await this.sendBudgetAlert(userId, category, spent, budget, threshold, percentage);

            // External Alerts (Email/WA)
            await this.sendExternalAlerts(userId, category, spent, budget.amount, threshold, percentage);

            // Save alert record
            const alert: BudgetAlert = {
              id: `${budget.id}-${threshold}-${Date.now()}`,
              budget_id: budget.id,
              threshold,
              triggered_at: new Date().toISOString(),
              user_id: userId
            };

            await BudgetStorage.saveBudgetAlert(alert);
          }
        }
      }
    } catch (error) {
      console.error('Error checking budget alerts:', error);
    }
  }

  /**
   * Send external alerts via backend (Email, WhatsApp)
   */
  private static async sendExternalAlerts(
    userId: string,
    category: string,
    spent: number,
    budget: number,
    threshold: number,
    percentage: number
  ): Promise<void> {
    try {
      const pushToken = await this.getPushToken();

      const response = await fetch(`${Config.BACKEND_URL}/api/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          category,
          spent,
          budget,
          threshold,
          percentage,
          pushToken,
          channels: ['email', 'whatsapp', 'fcm'] // Explicitly adding FCM
        }),
      });

      if (!response.ok) {
        throw new Error('Backend notification failed');
      }

      console.log('External alerts sent successfully');
    } catch (error) {
      console.error('Error sending external alerts:', error);
    }
  }

  /**
   * Send budget alert notification
   */
  private static async sendBudgetAlert(
    userId: string,
    category: string,
    spent: number,
    budget: Budget,
    threshold: number,
    percentage: number
  ): Promise<void> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.log('Notification permission not granted');
        return;
      }

      let title = '';
      let body = '';
      let sound: boolean | string = true;

      switch (threshold) {
        case 75:
          title = 'Budget Approaching';
          body = `You've used ${percentage.toFixed(0)}% of your Rs.${budget.amount.toLocaleString()} ${category} budget. Spending: ${BudgetCalculator.formatCurrency(spent)}.`;
          sound = false;
          break;
        case 80:
          title = 'Budget Warning';
          body = `You've spent ${BudgetCalculator.formatCurrency(spent)} on ${category} - ${percentage.toFixed(1)}% of your Rs.${budget.amount.toLocaleString()} budget.`;
          sound = false; // Gentle notification
          break;
        case 90:
          title = 'Budget Critical';
          body = `⚠️ ${category} spending at ${percentage.toFixed(1)}% of budget. Only Rs.${(budget.amount - spent).toLocaleString()} remaining!`;
          sound = true;
          break;
        case 100:
          title = 'Budget Exceeded';
          body = `[!!] ${category} budget exceeded! You've spent Rs.${(spent - budget.amount).toLocaleString()} over your Rs.${budget.amount.toLocaleString()} budget`;
          sound = 'default'; // More urgent sound
          break;
      }

      // Trigger haptic feedback
      if (threshold >= 90) {
        Haptics.notificationAsync(
          threshold === 100 ?
            Haptics.NotificationFeedbackType.Error :
            Haptics.NotificationFeedbackType.Warning
        );
      }

      // Schedule notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            type: 'budget_alert',
            category,
            threshold,
            userId,
            spent,
            budget: budget.amount,
            percentage
          },
          sound,
          badge: threshold === 100 ? 1 : undefined, // Badge only for critical alerts
        },
        trigger: null, // Show immediately
      });

      console.log(`Budget alert sent: ${title} - ${body}`);
    } catch (error) {
      console.error('Error sending budget notification:', error);
    }
  }

  /**
   * Clear all pending notifications
   */
  static async clearAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('All notifications cleared');
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }

  /**
   * Get notification settings
   */
  static async getNotificationSettings(): Promise<{
    enabled: boolean;
    permission: Notifications.PermissionStatus;
  }> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      const enabled = status === 'granted';

      return {
        enabled,
        permission: status
      };
    } catch (error) {
      console.error('Error getting notification settings:', error);
      return {
        enabled: false,
        permission: Notifications.PermissionStatus.UNDETERMINED
      };
    }
  }

  /**
   * Test notification (for development)
   */
  static async testNotification(): Promise<void> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Budget Alert Test',
          body: 'This is a test notification for budget alerts',
          data: { type: 'test' },
          sound: true,
        },
        trigger: null,
      });

      console.log('Test notification sent');
    } catch (error) {
      console.error('Error sending test notification:', error);
    }
  }
}
