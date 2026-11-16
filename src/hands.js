import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';

const BASE = import.meta.env.BASE_URL;

/** Opens the chosen camera; falls back to the default if that one is gone. */
async function openCamera(deviceId) {
  const size = { width: 640, height: 480 };
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...size, deviceId: { exact: deviceId } },
        audio: false,
      });
    } catch (err) {
      // A saved camera that was unplugged: quietly use the default instead.
      if (err.name !== 'OverconstrainedError' && err.name !== 'NotFoundError') throw err;
    }
  }
  return navigator.mediaDevices.getUserMedia({ video: { ...size, facingMode: 'user' }, audio: false });
}

/** All cameras (names are only available after the user has allowed camera access). */
export async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

/** Turns a browser camera error into something a person can act on. */
export function friendlyCameraError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera blocked. Click the camera icon in the address bar and allow it.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found. Plug one in and try again.';
    case 'NotReadableError':
      return 'Camera is in use by another app. Close it and try again.';
    default:
      return `Camera error: ${err?.message ?? err}`;
  }
}

/**
 * Starts the webcam and tracks one hand.
 * Calls onFrame(landmarks | null) ~30 times a second.
 * `landmarks` is an array of 21 points {x, y, z}, each 0..1 across the frame.
 * Resolves to { stop, deviceId } where deviceId is the camera actually in use.
 */
export async function startHandTracking({ video, overlay, deviceId, onStatus, onFrame }) {
  // Camera first: the permission prompt appears straight away, and if it is
  // refused we haven't wasted time loading the model.
  onStatus('Waiting for camera permission…');
  const stream = await openCamera(deviceId);
  let landmarker;
  try {
    onStatus('Loading hand model…');
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop()); // don't leave the camera light on
    landmarker?.close();
    throw err;
  }
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  onStatus('Camera on');

  const ctx = overlay.getContext('2d');
  const draw = new DrawingUtils(ctx);
  let lastVideoTime = -1;
  let running = true;

  function loop() {
    if (!running) return;
    // Only run the model when the camera has produced a new frame.
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());
      const hand = result.landmarks[0] ?? null;

      ctx.clearRect(0, 0, overlay.width, overlay.height);
      if (hand) {
        draw.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, { color: '#6aa9ff', lineWidth: 3 });
        draw.drawLandmarks(hand, { color: '#fff', radius: 3 });
      }
      onFrame(hand);
    }
    requestAnimationFrame(loop);
  }
  loop();

  const stop = () => {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    landmarker.close();
  };
  return { stop, deviceId: stream.getVideoTracks()[0]?.getSettings().deviceId ?? '' };
}
