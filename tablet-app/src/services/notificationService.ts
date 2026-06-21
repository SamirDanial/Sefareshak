import * as Haptics from "expo-haptics";

class NotificationService {
  private isInitialized = false;

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    this.isInitialized = true;
  }

  public async playStatusChangeSound(): Promise<void> {
    try {
      await this.init();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
    }
  }

  public async vibrate(): Promise<void> {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {
        }
      }, 150);

      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {
        }
      }, 300);

      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {
        }
      }, 500);

      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {
        }
      }, 700);
    } catch {
    }
  }

  public async notifyStatusChange(): Promise<void> {
    await Promise.all([this.playStatusChangeSound(), this.vibrate()]);
  }

  public async playNewOrderSound(): Promise<void> {
    try {
      await this.init();

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } catch {
        }
      }, 200);
    } catch {
    }
  }

  public async notifyNewOrder(): Promise<void> {
    await Promise.all([this.playNewOrderSound(), this.vibrate()]);
  }
}

export const notificationService = new NotificationService();
