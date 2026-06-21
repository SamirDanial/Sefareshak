import * as Haptics from "expo-haptics";

class NotificationService {
  private isInitialized = false;

  /**
   * Initialize the notification service
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  /**
   * Play notification sound for order status change
   * Using system sound instead of custom audio to avoid expo-av dependency
   */
  public async playStatusChangeSound(): Promise<void> {
    try {
      await this.init();
      
      // Use a simple system beep/haptic instead of custom audio
      // This avoids the expo-av deprecation warning
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Failed to play notification sound:", error);
    }
  }

  /**
   * Play longer vibration for notification (enhanced for new orders)
   */
  public async vibrate(): Promise<void> {
    try {
      // Play multiple vibrations for longer, more noticeable effect
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Add multiple vibrations with delays for longer effect
      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (e) {
          // Ignore errors
        }
      }, 150);

      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (e) {
          // Ignore errors
        }
      }, 300);

      // Additional vibrations for longer effect
      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (e) {
          // Ignore errors
        }
      }, 500);

      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (e) {
          // Ignore errors
        }
      }, 700);
    } catch (error) {
      console.error("Failed to vibrate:", error);
    }
  }

  /**
   * Play sound and vibrate together for order status change
   */
  public async notifyStatusChange(): Promise<void> {
    // Play both sound and vibration concurrently
    await Promise.all([this.playStatusChangeSound(), this.vibrate()]);
  }

  /**
   * Play new order chime sound
   */
  public async playNewOrderSound(): Promise<void> {
    try {
      await this.init();
      
      // Use a different haptic pattern for new orders
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      
      // Add additional haptic for distinction
      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } catch (e) {
          // Ignore errors
        }
      }, 200);
    } catch (error) {
      console.error("Failed to play new order sound:", error);
    }
  }

  /**
   * Play new order notification (sound + vibration)
   */
  public async notifyNewOrder(): Promise<void> {
    // Play both sound and vibration concurrently
    await Promise.all([this.playNewOrderSound(), this.vibrate()]);
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
