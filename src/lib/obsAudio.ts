import OBSWebSocket from "obs-websocket-js";

// Override before calling connect() if OBS uses a different address or password.
export const obsAudioConfig = {
  url: "ws://127.0.0.1:4455",
  password: "",
};

class OBSAudioBridge {
  private readonly obs = new OBSWebSocket();
  private rawLevel = 0;
  private connected = false;
  private connecting = false;

  // Smoothed internal state
  private _level = 0;
  private _bass = 0;
  private _mid = 0;
  private _high = 0;
  private _beatCd = 0;
  private _overclockT = 0;
  private _simT = 0;

  // Public frame state — read these after calling update()
  level = 0;
  bass = 0;
  mid = 0;
  high = 0;
  /** Alias for mid — used by AudioNeuralNetScreen. */
  vocal = 0;
  /** Alias for high — used by AudioNeuralNetScreen. */
  harm = 0;
  beat = false;
  overclock = false;

  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Connect to OBS WebSocket and subscribe to InputVolumeMeters.
   * Safe to call multiple times — connects only once.
   * Falls back to idle simulation if OBS is unreachable.
   */
  async connect(
    url = obsAudioConfig.url,
    password = obsAudioConfig.password,
  ): Promise<void> {
    if (this.connected || this.connecting) return;
    this.connecting = true;
    try {
      await this.obs.connect(url, password, {
        // 1 << 16 = InputVolumeMeters (high-volume event group)
        eventSubscriptions: 1 << 16,
      });
      this.connected = true;

      this.obs.on("InputVolumeMeters", (data) => {
        // Take the maximum magnitude across all inputs and channels.
        // inputLevelsMul[channel] = [magnitude, peak] in linear scale (0-1).
        let max = 0;
        for (const input of data.inputs) {
          const levels = input.inputLevelsMul as unknown as number[][];
          if (!levels) continue;
          for (const ch of levels) {
            const mag = ch[0] ?? 0;
            if (mag > max) max = mag;
          }
        }
        this.rawLevel = max;
      });
    } catch {
      // OBS not running or wrong password — idle simulation kicks in via update()
    }
    this.connecting = false;
  }

  /**
   * Advance the audio state. Call once per animation frame from the active screen.
   * dt is elapsed time in seconds.
   */
  update(dt: number): void {
    this.beat = false;
    this._beatCd = Math.max(0, this._beatCd - dt);

    if (!this.connected) {
      this._simT += dt;
      const t = this._simT;
      this.level = 0.1 + Math.abs(Math.sin(t * 0.29)) * 0.14;
      this.bass = 0.06 + Math.abs(Math.sin(t * 0.73)) * 0.09;
      this.mid = 0.07 + Math.abs(Math.sin(t * 0.41 + 1.1)) * 0.13;
      this.high = 0.05 + Math.abs(Math.sin(t * 0.99 + 2.3)) * 0.08;
      this.vocal = this.mid;
      this.harm = this.high;
      if (Math.sin(t * 1.97) > 0.91 && this._beatCd <= 0) {
        this.beat = true;
        this._beatCd = 0.25;
      }
      return;
    }

    // Perceptual sqrt scaling: linear power → perceived loudness approximation.
    const raw = Math.sqrt(Math.min(1, this.rawLevel));

    // Bass: slow attack and even slower release — tracks sustained low energy.
    const bassUp = raw > this._bass;
    this._bass += (raw - this._bass) * Math.min(1, dt * (bassUp ? 8 : 3));

    // Mid: medium tracking.
    const midUp = raw > this._mid;
    this._mid += (raw - this._mid) * Math.min(1, dt * (midUp ? 14 : 5));

    // High: fast attack, medium release — sensitive to transients.
    const highUp = raw > this._high;
    this._high += (raw - this._high) * Math.min(1, dt * (highUp ? 28 : 8));

    // Overall: balanced fast tracking.
    this._level += (raw - this._level) * Math.min(1, dt * 12);

    this.bass = this._bass;
    this.mid = this._mid;
    this.high = this._high;
    this.level = this._level;
    this.vocal = this._mid;
    this.harm = this._high;

    // Beat: transient on bass band with cooldown.
    if (this._bass > 0.25 && this._beatCd <= 0) {
      this.beat = true;
      this._beatCd = 0.22;
    }

    // Overclock: sustained high energy mode (used by AudioNeuralNetScreen).
    if (this.beat && this.level > 0.35 && !this.overclock) {
      this.overclock = true;
      this._overclockT = 0;
    }
    if (this.overclock) {
      this._overclockT += dt;
      if (this._overclockT > 1.5) this.overclock = false;
    }
  }
}

export const obsAudio = new OBSAudioBridge();
