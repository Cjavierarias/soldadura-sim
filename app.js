const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

console.log("Script cargado");

let prevTime = 0;
let prevPos = null;
let cvReady = false;

const MARKER_SIZE_CM = 10; // tamaño real del marcador ARUCO

function onOpenCvReady() {
  console.log("OpenCV.js listo!");
  cvReady = true;
  initCamera();
}

function initCamera() {
  console.log("Intentando acceder a cámara...");
  
  // Primero, verificamos si tenemos permisos de cámara
  navigator.mediaDevices.getUserMedia({
    video: { 
      facingMode: "environment",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  }).then(stream => {
    console.log("Cámara accedida correctamente");
    video.srcObject = stream;
    
    video.onloadedmetadata = () => {
      console.log("Metadatos de video cargados");
      console.log("Dimensiones:", video.videoWidth, "x", video.videoHeight);
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Esperar a que el video realmente tenga datos
      video.onplaying = () => {
        console.log("Video reproduciéndose");
        requestAnimationFrame(processFrame);
      };
    };
  }).catch(err => {
    console.error("Error al acceder a la cámara:", err);
    alert("Error de cámara: " + err.message + "\n\nAsegúrate de dar permisos y usar HTTPS.");
  });
}

function processFrame() {
  // Dibujar el video en el canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Si OpenCV no está listo, solo mostrar video
  if (!cvReady) {
    requestAnimationFrame(processFrame);
    return;
  }
  
  try {
    // Leer imagen del canvas
    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // Detectar marcadores ARUCO
    const dict = cv.aruco.getPredefinedDictionary(cv.aruco.DICT_4X4_1000);
    const params = new cv.aruco.DetectorParameters();
    const corners = new cv.MatVector();
    const ids = new cv.Mat();
    
    cv.aruco.detectMarkers(gray, dict, corners, ids, params);
    
    // Si se detectó al menos un marcador
    if (ids.rows > 0) {
      console.log(`Marcador detectado! ID: ${ids.data32S[0]}`);
      
      cv.aruco.drawDetectedMarkers(src, corners, ids);
      
      // Calcular distancia
      const corner = corners.get(0);
      const points = corner.data32F;
      
      // Calcular ancho en píxeles usando dos puntos opuestos
      const p0 = {x: points[0], y: points[1]};
      const p1 = {x: points[2], y: points[3]};
      const widthPx = Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2));
      
      // Distancia estimada (fórmula simplificada)
      const focalLength = 800; // estimado, puede calibrarse
      const distance = (MARKER_SIZE_CM * focalLength) / (widthPx * 0.0264);
      document.getElementById('dist').textContent = distance.toFixed(1);
      
      // Calcular ángulo de inclinación
      const dx = points[2] - points[0];
      const dy = points[3] - points[1];
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      document.getElementById('angle').textContent = angle.toFixed(1);
      
      // Calcular velocidad
      const now = Date.now();
      if (prevPos && prevTime) {
        const dt = (now - prevTime) / 1000;
        const dxDist = distance - prevPos;
        const speed = Math.abs(dxDist / dt);
        document.getElementById('speed').textContent = speed.toFixed(1);
        
        // Feedback de velocidad
        if (speed > 5 && speed < 15) {
          playSound();
          if (navigator.vibrate) navigator.vibrate(50);
        }
      }
      
      prevPos = distance;
      prevTime = now;
      
    } else {
      // Si no se detecta marcador
      document.getElementById('dist').textContent = "--";
      document.getElementById('angle').textContent = "--";
      document.getElementById('speed').textContent = "--";
      prevPos = null;
    }
    
    // Liberar memoria
    src.delete();
    gray.delete();
    corners.delete();
    ids.delete();
    params.delete();
    
  } catch (error) {
    console.error("Error en procesamiento:", error);
  }
  
  requestAnimationFrame(processFrame);
}

function playSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    console.log("Audio no disponible");
  }
}

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM cargado");
  
  // Si OpenCV ya está cargado (cache)
  if (typeof cv !== 'undefined' && cv.getBuildInformation) {
    console.log("OpenCV ya estaba cargado");
    onOpenCvReady();
  }
  
  // Manejar clic para activar audio en iOS
  document.body.addEventListener('click', function() {
    if (typeof AudioContext !== 'undefined') {
      const ctx = new AudioContext();
      ctx.resume();
    }
  });
});
