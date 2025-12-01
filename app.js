const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

let prevTime = 0;
let prevPos = null;

const MARKER_SIZE_CM = 10; // tamaño real del marcador ARUCO

function onOpenCvReady() {
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  }).then(stream => {
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      requestAnimationFrame(processFrame);
    };
  });
}

function processFrame() {
  ctx.drawImage(video, 0, 0);
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const dict = cv.aruco.Dictionary_get(cv.aruco.DICT_4X4_1000);
  const params = cv.aruco.DetectorParameters_create();
  const corners = new cv.MatVector();
  const ids = new cv.Mat();

  cv.aruco.detectMarkers(gray, dict, corners, ids, params);

  if (ids.rows > 0) {
    cv.aruco.drawDetectedMarkers(src, corners, ids);

    const corner = corners.get(0);
    const p1 = corner.data32F;
    const widthPx = Math.hypot(p1[2] - p1[0], p1[3] - p1[1]);
    const distance = (MARKER_SIZE_CM * 0.8) / (widthPx / canvas.width);
    document.getElementById('dist').textContent = distance.toFixed(1);

    const angle = Math.atan2(p1[3] - p1[1], p1[2] - p1[0]) * 180 / Math.PI;
    document.getElementById('angle').textContent = angle.toFixed(1);

    const now = Date.now();
    if (prevPos && prevTime) {
      const dt = (now - prevTime) / 1000;
      const dx = distance - prevPos;
      const speed = Math.abs(dx / dt);
      document.getElementById('speed').textContent = speed.toFixed(1);

      if (speed > 5 && speed < 15) {
        playSound();
        navigator.vibrate(100);
      }
    }
    prevPos = distance;
    prevTime = now;
  }

  cv.imshow(canvas, src);
  src.delete(); gray.delete(); corners.delete(); ids.delete();
  requestAnimationFrame(processFrame);
}

function playSound() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 
