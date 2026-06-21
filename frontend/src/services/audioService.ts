/**
 * Audio Service for playing notification sounds
 * Handles browser autoplay policies and ensures consistent playback
 */

class AudioService {
  private audioContext: AudioContext | null = null;
  private isInitialized = false;
  private activationListeners: (() => void)[] = [];
  private isActivated = false;

  /**
   * Initialize AudioContext (call this early in app lifecycle)
   */
  public init(): void {
    if (this.isInitialized && this.audioContext) {
      // Re-setup activation listeners if needed
      if (this.activationListeners.length === 0) {
        this.activateOnUserInteraction();
      }
      return;
    }

    try {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      this.isInitialized = true;

      // Activate on any user interaction
      this.activateOnUserInteraction();
    } catch (error) {
      // Failed to initialize AudioContext
    }
  }

  /**
   * Unlock AudioContext by resuming it (required for autoplay policy)
   * This must be called in response to a user gesture
   * We don't play a sound here - just resume the context
   */
  private unlockAudioContext(): void {
    if (!this.audioContext) {
      return;
    }

    try {
      // Just resume the context without playing any sound
      // This unlocks it for future playback without triggering speaker icon
      if (this.audioContext.state === "suspended") {
        this.audioContext
          .resume()
          .then(() => {
            this.isActivated = true;
          })
          .catch(() => {
            // Failed to resume AudioContext
          });
      } else if (this.audioContext.state === "running") {
        this.isActivated = true;
      }
    } catch (error) {
      // Error unlocking AudioContext
    }
  }

  /**
   * Activate AudioContext on user interaction (required for autoplay policy)
   * Only unlocks without playing any sound to avoid triggering speaker icon
   */
  private activateOnUserInteraction(): void {
    const activate = () => {
      // Only activate once to avoid unnecessary unlocks
      if (this.isActivated) {
        return;
      }

      if (!this.audioContext) {
        // Re-initialize if context was lost
        if (!this.isInitialized) {
          this.init();
          return;
        }
        return;
      }

      // Unlock audio context without playing sound
      this.unlockAudioContext();
    };

    // Only listen for meaningful interactions (not scroll/wheel which happen constantly)
    const events = ["click", "keydown", "touchstart", "mousedown"];

    // Add listener only once per event type (once: true means it auto-removes after first trigger)
    events.forEach((eventType) => {
      const handler = () => {
        activate();
      };
      // Use capture phase to catch early, once: true so it only triggers once
      const options = { passive: true, capture: true, once: true };

      window.addEventListener(eventType, handler, options);
      // Don't need to add to cleanup list since once: true auto-removes it
    });
  }

  /**
   * Ensure AudioContext is ready for playback
   */
  private async ensureReady(): Promise<AudioContext | null> {
    // Don't initialize here - it must be initialized on app start with init()
    // Initializing here without user gesture will create a suspended context
    if (!this.isInitialized || !this.audioContext) {
      return null;
    }

    if (!this.audioContext) {
      return null;
    }

    // If not activated yet, still try to play (some browsers allow it)
    if (!this.isActivated && this.audioContext.state === "suspended") {
      // Don't try to resume here - it will fail without user gesture
      // Just return the context and let it try to play
      return this.audioContext;
    }

    // Always try to resume if suspended (context can become suspended again)
    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch (error: any) {
        // If resume fails due to autoplay policy, continue anyway
        // It might work if context was previously unlocked
      }
    }

    // If context is running, we're good to go
    if (this.audioContext.state === "running") {
      this.isActivated = true;
      return this.audioContext;
    }

    // If still suspended, still return context
    // Some browsers allow playback even when suspended if previously unlocked
    if (this.audioContext.state === "suspended") {
      return this.audioContext;
    }

    return this.audioContext;
  }

  /**
   * Play a notification sound
   * @param type - Type of notification sound ('newOrder' | 'statusChange')
   */
  public async playNotificationSound(
    type: "newOrder" | "statusChange" = "statusChange"
  ): Promise<void> {
    const ctx = await this.ensureReady();
    if (!ctx) {
      return;
    }

    try {
      if (type === "newOrder") {
        this.playNewOrderSound(ctx);
      } else {
        this.playStatusChangeSound(ctx);
      }
    } catch (error) {
      // Retry once after a short delay
      setTimeout(async () => {
        const retryCtx = await this.ensureReady();
        if (retryCtx) {
          try {
            if (type === "newOrder") {
              this.playNewOrderSound(retryCtx);
            } else {
              this.playStatusChangeSound(retryCtx);
            }
          } catch (retryError) {
            // Retry failed
          }
        }
      }, 100);
    }
  }

  /**
   * Play sound for new order (louder, more attention-grabbing)
   */
  private playNewOrderSound(audioContext: AudioContext): void {
    try {
      // Try to play even if context is suspended (some browsers allow it)
      if (audioContext.state === "suspended") {
        // Try to resume in the background (might not work without user gesture)
        audioContext.resume().catch(() => {
          // Ignore resume errors - we'll try to play anyway
        });
      }

      const startTime = audioContext.currentTime;
      const masterGain = audioContext.createGain();
      masterGain.connect(audioContext.destination);
      masterGain.gain.value = 0.4; // Loud but not too loud

      // Create multiple oscillators for a rich sound
      const frequencies = [800, 1000, 1200];

      // First beep sequence
      frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const oscillatorGain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = freq;

        const noteStartTime = startTime + index * 0.05;
        oscillatorGain.gain.setValueAtTime(0, noteStartTime);
        oscillatorGain.gain.linearRampToValueAtTime(0.5, noteStartTime + 0.01);
        oscillatorGain.gain.exponentialRampToValueAtTime(
          0.01,
          noteStartTime + 0.3
        );

        oscillator.connect(oscillatorGain);
        oscillatorGain.connect(masterGain);

        oscillator.start(noteStartTime);
        oscillator.stop(noteStartTime + 0.3);
      });

      // Second beep after short delay
      const secondBeepStartTime = startTime + 0.35;
      frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const oscillatorGain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = freq;

        const noteStartTime = secondBeepStartTime + index * 0.05;
        oscillatorGain.gain.setValueAtTime(0, noteStartTime);
        oscillatorGain.gain.linearRampToValueAtTime(0.5, noteStartTime + 0.01);
        oscillatorGain.gain.exponentialRampToValueAtTime(
          0.01,
          noteStartTime + 0.25
        );

        oscillator.connect(oscillatorGain);
        oscillatorGain.connect(masterGain);

        oscillator.start(noteStartTime);
        oscillator.stop(noteStartTime + 0.25);
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Play sound for order status change (pleasant tone)
   */
  private playStatusChangeSound(audioContext: AudioContext): void {
    try {
      // Try to play even if context is suspended (some browsers allow it)
      if (audioContext.state === "suspended") {
        // Try to resume in the background (might not work without user gesture)
        audioContext.resume().catch(() => {
          // Ignore resume errors - we'll try to play anyway
        });
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Pleasant notification tone
      oscillator.frequency.value = 800;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.5
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      // Don't throw - let it fail silently if autoplay is blocked
    }
  }

  /**
   * Get AudioContext state (for debugging)
   */
  public getState(): string {
    return this.audioContext?.state || "not-initialized";
  }
}

// Export singleton instance
export const audioService = new AudioService();
