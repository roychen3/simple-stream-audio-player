type EventType = 'ended';
/**
 * StreamAudioPlayer - Handles streaming audio playback using Web Audio API
 * Supports continuous playback of PCM Linear16 audio chunks without interruption
 */
export class StreamAudioPlayer {
  private audioContext: AudioContext | null = null;
  private audioBufferQueue: AudioBuffer[] = [];
  private internalState: 'idle' | 'playing' | 'paused' | 'ended' | 'resetting' =
    'idle';
  private nextStartTime: number = 0;
  private scheduledBufferSources: AudioBufferSourceNode[] = [];
  private eventTarget: EventTarget;

  constructor() {
    this.initAudioContext();
    this.eventTarget = new EventTarget();
  }

  private initAudioContext(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
  }

  get state() {
    return this.internalState;
  }

  /**
   * Convert base64 Linear16 PCM to AudioBuffer
   * @param base64Data - Base64 encoded Linear16 PCM audio data
   * @param sampleRate - Sample rate (default: 8000 Hz for mulaw, 24000 Hz for Linear16)
   */
  private convertBase64ToAudioBuffer(
    base64Data: string,
    sampleRate: number = 24000
  ): AudioBuffer {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Convert Linear16 PCM to Float32 array
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      // Convert 16-bit PCM to float32 (-1.0 to 1.0)
      float32Array[i] = int16Array[i] / 32768.0;
    }

    // Create AudioBuffer
    const audioBuffer = this.audioContext.createBuffer(
      1, // mono
      float32Array.length,
      sampleRate
    );

    // Copy data to AudioBuffer
    audioBuffer.getChannelData(0).set(float32Array);
    return audioBuffer;
  }

  /**
   * Add audio chunk to the queue
   * @param base64Data - Base64 encoded audio data
   * @param sampleRate - Sample rate (default: 24000 Hz)
   */
  async addChunk(
    base64Data: string,
    sampleRate: number = 24000
  ): Promise<void> {
    if (this.internalState === 'resetting') {
      throw new Error('Cannot add chunk while resetting');
    }

    const audioBuffer = this.convertBase64ToAudioBuffer(base64Data, sampleRate);
    this.audioBufferQueue.push(audioBuffer);
  }

  /**
   * Schedule the next buffer source for playback
   */
  private scheduleNextBufferSource() {
    if (
      !this.audioContext ||
      this.audioBufferQueue.length === 0 ||
      this.internalState !== 'playing'
    ) {
      return;
    }

    const audioBuffer = this.audioBufferQueue.shift()!;
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // Schedule playback
    const startTime = Math.max(
      this.nextStartTime,
      this.audioContext.currentTime
    );
    source.start(startTime);

    // Update next start time
    this.nextStartTime = startTime + audioBuffer.duration;

    // Store the source node
    this.scheduledBufferSources.push(source);

    // Clean up when buffer finishes
    source.onended = () => {
      if (this.internalState === 'resetting') {
        return;
      }

      const index = this.scheduledBufferSources.indexOf(source);
      if (index > -1) {
        this.scheduledBufferSources.splice(index, 1);
      }

      if (
        this.scheduledBufferSources.length === 0 &&
        this.audioBufferQueue.length === 0
      ) {
        this.internalState = 'ended';
        this.dispatchEvent(new Event('ended'));
      } else if (this.audioBufferQueue.length > 0) {
        this.scheduleNextBufferSource();
      }
    };

    // Continue scheduling if there are more buffers in queue
    if (this.audioBufferQueue.length > 0) {
      this.scheduleNextBufferSource();
    }
  }

  async play(): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    if (this.internalState === 'playing') {
      return;
    }

    this.internalState = 'playing';

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // If no buffers are scheduled yet, start scheduling
    if (
      this.scheduledBufferSources.length === 0 &&
      this.audioBufferQueue.length > 0
    ) {
      this.nextStartTime = this.audioContext.currentTime;
      this.scheduleNextBufferSource();
    }
  }

  async pause(): Promise<void> {
    if (this.internalState !== 'playing') {
      return;
    }

    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    this.internalState = 'paused';
    await this.audioContext.suspend();
  }

  async reset(): Promise<void> {
    this.internalState = 'resetting';

    for (const source of this.scheduledBufferSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        console.error('Error stopping source:', e);
      }
    }
    this.scheduledBufferSources = [];

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    this.initAudioContext();

    this.audioBufferQueue = [];
    this.nextStartTime = 0;
    this.eventTarget = new EventTarget();
    this.internalState = 'idle';
  }

  addEventListener(
    type: EventType,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.eventTarget.addEventListener(type, listener, options);
  }

  removeEventListener(
    type: EventType,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    this.eventTarget.removeEventListener(type, listener, options);
  }

  private dispatchEvent(event: Event): boolean {
    return this.eventTarget.dispatchEvent(event);
  }
}
