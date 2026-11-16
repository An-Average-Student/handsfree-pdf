import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';

const BASE = import.meta.env.BASE_URL;

/**
 * Starts the webcam and tracks one hand.
 * Calls onFrame(landmarks | null) ~30 times a second.
 * `landmarks` is an array of 21 points {x, y, z}, each 0..1 across the frame.
 */
export async function startHandTracking({ video, overlay, onStatus, onFrame }) {
  onStatus('Loading hand model…');
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 1,
  });

  onStatus('Waiting for camera permission…');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
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

  return function stop() {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    landmarker.close();
  };
}
