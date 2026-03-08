export type WakeMethod = 'wake-lock' | 'video' | 'none';

export type WakeStatus = 'off' | 'on' | 'unsupported' | 'blocked' | 'error';

export interface WakeSnapshot {
  desired: boolean;
  active: boolean;
  status: WakeStatus;
  method: WakeMethod;
  errorMessage: string | null;
}

interface WakeManager {
  setAutoActive(value: boolean): Promise<void>;
  setUserEnabled(value: boolean): Promise<void>;
  sync(): Promise<void>;
  release(): Promise<void>;
  destroy(): Promise<void>;
  getSnapshot(): WakeSnapshot;
  subscribe(listener: (snapshot: WakeSnapshot) => void): () => void;
}

type Outcome = 'on' | 'unsupported' | 'blocked' | 'error';

const INITIAL_SNAPSHOT: WakeSnapshot = {
  desired: false,
  active: false,
  status: 'off',
  method: 'none',
  errorMessage: null,
};

function isPolicyBlockedError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : '';
  return name === 'NotAllowedError' || name === 'SecurityError';
}

function messageFromError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Unknown wake lock error';
}

export function createWakeManager(): WakeManager {
  let autoActive = false;
  let userEnabled = false;
  let destroyed = false;
  let syncing = false;
  let needsResync = false;
  let wakeLockSentinel: WakeLockSentinel | null = null;
  let fallbackVideo: HTMLVideoElement | null = null;
  let fallbackStream: MediaStream | null = null;
  const listeners = new Set<(snapshot: WakeSnapshot) => void>();
  let snapshot: WakeSnapshot = { ...INITIAL_SNAPSHOT };

  function emit(next: WakeSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener(snapshot);
  }

  function getDesired(): boolean {
    return autoActive || userEnabled;
  }

  function shouldBeActive(): boolean {
    return getDesired() && document.visibilityState === 'visible';
  }

  function currentErrorMessage(): string | null {
    return snapshot.status === 'blocked' || snapshot.status === 'error' ? snapshot.errorMessage : null;
  }

  function setOffSnapshot() {
    emit({
      desired: getDesired(),
      active: false,
      status: 'off',
      method: 'none',
      errorMessage: null,
    });
  }

  function cleanupFallbackVideo() {
    if (fallbackVideo) {
      try {
        fallbackVideo.pause();
      } catch {
        /* ignore */
      }
      fallbackVideo.srcObject = null;
      fallbackVideo.removeAttribute('src');
      fallbackVideo.remove();
    }
    fallbackVideo = null;

    if (fallbackStream) {
      for (const track of fallbackStream.getTracks()) track.stop();
    }
    fallbackStream = null;
  }

  async function releaseWakeLock() {
    if (!wakeLockSentinel) return;
    try {
      await wakeLockSentinel.release();
    } catch {
      /* ignore */
    } finally {
      wakeLockSentinel = null;
    }
  }

  async function safeReleaseActiveMethod() {
    await releaseWakeLock();
    cleanupFallbackVideo();
  }

  async function acquireWakeLock(): Promise<{ outcome: Outcome; errorMessage: string | null }> {
    if (!('wakeLock' in navigator) || !navigator.wakeLock?.request) {
      return { outcome: 'unsupported', errorMessage: null };
    }

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel = sentinel;
      sentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
        if (!destroyed) void sync();
      });
      return { outcome: 'on', errorMessage: null };
    } catch (err) {
      if (isPolicyBlockedError(err)) {
        return { outcome: 'blocked', errorMessage: messageFromError(err) };
      }
      return { outcome: 'error', errorMessage: messageFromError(err) };
    }
  }

  async function acquireVideoFallback(): Promise<{ outcome: Outcome; errorMessage: string | null }> {
    if (typeof document === 'undefined') return { outcome: 'unsupported', errorMessage: null };
    if (fallbackVideo && !fallbackVideo.paused) return { outcome: 'on', errorMessage: null };

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const streamFactory = canvas.captureStream?.bind(canvas);
    if (!streamFactory) return { outcome: 'unsupported', errorMessage: null };

    const stream = streamFactory(1);
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.position = 'fixed';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.style.left = '-10000px';
    video.style.top = '-10000px';
    video.srcObject = stream;
    document.body.appendChild(video);

    try {
      await video.play();
      fallbackVideo = video;
      fallbackStream = stream;
      return { outcome: 'on', errorMessage: null };
    } catch (err) {
      video.remove();
      for (const track of stream.getTracks()) track.stop();
      if (isPolicyBlockedError(err)) {
        return { outcome: 'blocked', errorMessage: messageFromError(err) };
      }
      return { outcome: 'error', errorMessage: messageFromError(err) };
    }
  }

  async function doSync() {
    if (destroyed) return;
    if (!shouldBeActive()) {
      await safeReleaseActiveMethod();
      setOffSnapshot();
      return;
    }

    if (wakeLockSentinel) {
      emit({
        desired: getDesired(),
        active: true,
        status: 'on',
        method: 'wake-lock',
        errorMessage: null,
      });
      return;
    }

    if (fallbackVideo && !fallbackVideo.paused) {
      emit({
        desired: getDesired(),
        active: true,
        status: 'on',
        method: 'video',
        errorMessage: null,
      });
      return;
    }

    const native = await acquireWakeLock();
    if (!shouldBeActive()) {
      await safeReleaseActiveMethod();
      setOffSnapshot();
      return;
    }
    if (native.outcome === 'on') {
      emit({
        desired: getDesired(),
        active: true,
        status: 'on',
        method: 'wake-lock',
        errorMessage: null,
      });
      return;
    }

    const fallback = await acquireVideoFallback();
    if (!shouldBeActive()) {
      await safeReleaseActiveMethod();
      setOffSnapshot();
      return;
    }
    if (fallback.outcome === 'on') {
      emit({
        desired: getDesired(),
        active: true,
        status: 'on',
        method: 'video',
        errorMessage: null,
      });
      return;
    }

    if (native.outcome === 'unsupported' && fallback.outcome === 'unsupported') {
      emit({
        desired: getDesired(),
        active: false,
        status: 'unsupported',
        method: 'none',
        errorMessage: null,
      });
      return;
    }

    if (native.outcome === 'blocked' || fallback.outcome === 'blocked') {
      emit({
        desired: getDesired(),
        active: false,
        status: 'blocked',
        method: 'none',
        errorMessage: native.errorMessage ?? fallback.errorMessage ?? currentErrorMessage(),
      });
      return;
    }

    emit({
      desired: getDesired(),
      active: false,
      status: 'error',
      method: 'none',
      errorMessage: native.errorMessage ?? fallback.errorMessage ?? currentErrorMessage(),
    });
  }

  async function sync() {
    if (destroyed) return;
    if (syncing) {
      needsResync = true;
      return;
    }

    syncing = true;
    try {
      do {
        needsResync = false;
        await doSync();
      } while (needsResync && !destroyed);
    } finally {
      syncing = false;
    }
  }

  const onVisibilityChange = () => {
    void sync();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    async setAutoActive(value: boolean) {
      if (destroyed) return;
      autoActive = value;
      await sync();
    },
    async setUserEnabled(value: boolean) {
      if (destroyed) return;
      userEnabled = value;
      await sync();
    },
    async sync() {
      await sync();
    },
    async release() {
      if (destroyed) return;
      autoActive = false;
      userEnabled = false;
      await safeReleaseActiveMethod();
      setOffSnapshot();
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      await safeReleaseActiveMethod();
      listeners.clear();
      snapshot = { ...INITIAL_SNAPSHOT };
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener: (next: WakeSnapshot) => void) {
      listeners.add(listener);
      listener(snapshot);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
