/**
 * Audio Service for playing notification sounds
 * Uses Electron IPC to play sounds via Node.js (no browser restrictions!)
 */

class AudioService {
  /**
   * Initialize audio service (no-op in Electron, handled by main process)
   */
  public init(): void {
    console.log("AudioService: Initialized (using Electron IPC)");
  }

  /**
   * Play a notification sound via Electron IPC
   * @param type - Type of notification sound ('newOrder' | 'statusChange')
   */
  public async playNotificationSound(
    type: "newOrder" | "statusChange" = "statusChange"
  ): Promise<void> {
    try {
      // Check if we're in Electron
      if (window.electronAPI && typeof window.electronAPI.playNotificationSound === 'function') {
        await window.electronAPI.playNotificationSound(type);
      } else {
        console.warn("AudioService: Electron API not available, falling back to Web Audio API");
        // Fallback to Web Audio API if not in Electron
        await this.playWebAudioSound(type);
      }
    } catch (error) {
      console.error("AudioService: Error playing notification sound:", error);
      // Try fallback
      try {
        await this.playWebAudioSound(type);
      } catch (fallbackError) {
        console.error("AudioService: Fallback also failed:", fallbackError);
      }
    }
  }

  /**
   * Fallback: Play sound using Web Audio API (for web environments)
   */
  private async playWebAudioSound(type: "newOrder" | "statusChange"): Promise<void> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === "newOrder") {
      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
      
      // Second beep
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 1000;
        gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.3);
      }, 200);
    } else {
      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    }
  }

  /**
   * Get audio service state (for debugging)
   */
  public getState(): string {
    return window.electronAPI ? "electron-ipc" : "web-audio";
  }
}

// Export singleton instance
export const audioService = new AudioService();

