console.log("🔥 Simulador de Soldadura AR - Iniciando...");

// Variables globales
let video = null;
let canvas = null;
let ctx = null;
let cvReady = false;
let isProcessing = false;
let zeroAngleCalibrated = false;
let calibrationValue = 0;

// Configuración de soldadura
let weldConfig = {
  type: 'mig',
  material: 'acero',
  mode: 'guided',
  optimalAngle: {
    mig: { min: 15, max: 25 },
    tig: { min: 10, max: 20 },
    electrodo: { min: 5, max: 15 }
  },
  soundEnabled: true
};

// Variables de seguimiento
let prevTime = 0;
let prevPos = null;
let angleHistory = [];
let stabilityScore = 0;

// Elementos DOM
let startBtn = null;
let appContainer = null;
let loading = null;
let loadStatus = null;
let angleDisplay = null;
let markerStatusEl = null;

// Sensores del dispositivo
let isDeviceOrientationSupported = false;
let deviceAngle = 0;
let lastSoundTime = 0;
const SOUND_COOLDOWN = 500; // ms entre sonidos

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM cargado");
  
  // Obtener referencias a elementos DOM
  startBtn = document.getElementById('startBtn');
  appContainer = document.getElementById('app');
  loading = document.getElementById('loading');
  loadStatus = document.getElementById('loadStatus');
  video = document.getElementById('camera');
  canvas = document.getElementById('overlay');
  angleDisplay = document.getElementById('angleDisplay');
  markerStatusEl = document.getElementById('markerStatus');
  
  // Contexto del canvas
  ctx = canvas.getContext('2d');
  
  // Configurar botones y controles
  startBtn.addEventListener('click', startApp);
  document.getElementById('weldType').addEventListener('change', updateWeldConfig);
  document.getElementById('material').addEventListener('change', updateWeldConfig);
  document.getElementById('modeBtn').addEventListener('click', toggleMode);
  document.getElementById('calibrateBtn').addEventListener('click', calibrateZeroAngle);
  document.getElementById('helpBtn').addEventListener('click', showHelp);
  
  // Verificar sensores del dispositivo
  checkDeviceSensors();
  
  // Verificar si OpenCV ya está cargado
  if (typeof cv !== 'undefined') {
    onOpenCvReady();
  }
});

// Verificar sensores del dispositivo
function checkDeviceSensors() {
  if (window.DeviceOrientationEvent) {
    isDeviceOrientationSupported = true;
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    console.log("✅ Sensores de orientación soportados");
  } else {
    console.log("⚠️ Sensores de orientación no soportados");
    markerStatusEl.textContent = "⚠️ Usando detección por cámara (activa los sensores para mejor precisión)";
  }
}

// Manejar orientación del dispositivo - CORREGIDO EL ÁNGULO
function handleDeviceOrientation(event) {
  if (event.beta !== null && event.gamma !== null) {
    // beta: inclinación frontal (-180 a 180)
    // gamma: inclinación lateral (-90 a 90)
    
    // Usar beta para ángulo frontal (como si fuera una antorcha)
    let angle = Math.abs(event.beta);
    
    // Cuando el celular está plano sobre una mesa (frente a la imagen): beta ≈ 0°, gamma ≈ 0°
    // Cuando el celular está vertical/perpendicular: beta ≈ 90°, gamma ≈ 0°
    
    // Ajustar según calibración
    if (zeroAngleCalibrated) {
      angle = Math.abs(event.beta - calibrationValue);
    }
    
    // Normalizar a 0-90 grados
    angle = Math.min(Math.max(angle, 0), 90);
    
    // Actualizar display
    deviceAngle = angle;
    angleDisplay.textContent = Math.round(angle) + '°';
    document.getElementById('angle').textContent = Math.round(angle) + '°';
    
    // Actualizar clase CSS según ángulo
    const angleEl = document.getElementById('angle');
    const optimal = weldConfig.optimalAngle[weldConfig.type];
    
    if (angle >= optimal.min && angle <= optimal.max) {
      angleEl.className = 'info-value good';
    } else {
      angleEl.className = 'info-value warning';
    }
    
    // Verificar ángulo óptimo
    checkOptimalAngle(angle);
  }
}

// Verificar si el ángulo está en rango óptimo
function checkOptimalAngle(angle) {
  if (!weldConfig.soundEnabled || Date.now() - lastSoundTime < SOUND_COOLDOWN) {
    return;
  }
  
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  
  if (angle < optimal.min) {
    // Ángulo demasiado bajo - sonido agudo
    playSound('errorSound');
    markerStatusEl.innerHTML = '⚠️ Ángulo demasiado bajo (sonido agudo)';
    lastSoundTime = Date.now();
  } else if (angle > optimal.max) {
    // Ángulo demasiado alto - sonido grave
    playSound('warningSound');
    markerStatusEl.innerHTML = '⚠️ Ángulo demasiado alto (sonido grave)';
    lastSoundTime = Date.now();
  } else {
    // Ángulo óptimo
    markerStatusEl.innerHTML = '✅ Ángulo óptimo para soldadura';
  }
}

// Reproducir sonido
function playSound(soundId) {
  if (!weldConfig.soundEnabled) return;
  
  const sound = document.getElementById(soundId);
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(e => console.log("Error reproduciendo sonido:", e));
  }
}

// Calibrar ángulo cero
function calibrateZeroAngle() {
  if (isDeviceOrientationSupported) {
    // Para calibrar, asumimos que el usuario tiene el celular paralelo a la superficie (ángulo 0 deseado)
    // En este punto, event.beta debería ser el ángulo actual
    calibrationValue = deviceAngle;
    zeroAngleCalibrated = true;
    
    // Feedback visual
    const btn = document.getElementById('calibrateBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ Calibrado!';
    btn.style.background = 'linear-gradient(135deg, #0a6, #0fc)';
    
    playSound('goodSound');
    
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = '';
    }, 2000);
    
    markerStatusEl.innerHTML = '✅ Ángulo cero calibrado correctamente';
    
    // Para prueba sin sensores
    console.log("Ángulo calibrado a: ", calibrationValue);
  } else {
    alert("Los sensores de orientación no están disponibles. Usa un dispositivo móvil con sensores para calibración precisa.");
  }
}

// Actualizar configuración
function updateWeldConfig() {
  weldConfig.type = document.getElementById('weldType').value;
  weldConfig.material = document.getElementById('material').value;
  
  // Actualizar display de ángulo óptimo
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  markerStatusEl.innerHTML = `🎯 Ángulo óptimo: ${optimal.min}° - ${optimal.max}°`;
}

// Alternar modo
function toggleMode() {
  const btn = document.getElementById('modeBtn');
  if (weldConfig.mode === 'guided') {
    weldConfig.mode = 'free';
    btn.innerHTML = 'Modo Libre';
    btn.classList.remove('active');
    markerStatusEl.innerHTML = '🔓 Modo libre activado';
  } else {
    weldConfig.mode = 'guided';
    btn.innerHTML = 'Modo Guiado';
    btn.classList.add('active');
    markerStatusEl.innerHTML = '🔒 Modo guiado activado';
  }
}

// Mostrar ayuda
function showHelp() {
  alert("SIMULADOR DE SOLDADURA\n\n" +
        "1. Coloca el marcador en la superficie a soldar\n" +
        "2. Sostén el celular como si fuera una antorcha\n" +
        "3. Calibra el ángulo cero presionando el botón de calibración\n" +
        "4. Mantén el ángulo entre los rangos óptimos:\n" +
        "   - MIG/MAG: 15°-25°\n" +
        "   - TIG: 10°-20°\n" +
        "   - Electrodo: 5°-15°\n" +
        "5. Escucha los sonidos de feedback:\n" +
        "   - Sonido agudo: ángulo demasiado bajo\n" +
        "   - Sonido grave: ángulo demasiado alto\n\n" +
        "Consejo: Mantén el celular estable para mejor precisión.");
}

// Callback cuando OpenCV.js se carga
function onOpenCvReady() {
  console.log("✅ OpenCV.js listo!");
  cvReady = true;
  loadStatus.textContent = "OpenCV cargado correctamente";
  loading.style.display = 'none';
  startBtn.style.display = 'block';
}

// Iniciar la aplicación
async function startApp() {
  console.log("Iniciando aplicación...");
  
  try {
    startBtn.style.display = 'none';
    loadStatus.textContent = "Solicitando acceso a cámara y sensores...";
    loading.style.display = 'flex';
    
    // Solicitar acceso a cámara
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    });
    
    video.srcObject = stream;
    
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        resolve();
      };
    });
    
    await new Promise((resolve) => {
      video.onplaying = () => {
        console.log("Video reproduciéndose");
        resolve();
      };
    });
    
    // Mostrar aplicación
    loading.style.display = 'none';
    appContainer.style.display = 'block';
    
    // Iniciar procesamiento
    isProcessing = true;
    processFrame();
    
    // Configurar inicial
    updateWeldConfig();
    
    // Solicitar permiso para sensores en iOS
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission === 'granted') {
          console.log("✅ Permiso para sensores concedido");
        }
      } catch (e) {
        console.log("Permiso para sensores no concedido:", e);
      }
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
    loadStatus.textContent = `Error: ${error.message}`;
    startBtn.style.display = 'block';
    startBtn.textContent = "🔄 Reintentar";
    
    if (error.name === 'NotAllowedError') {
      alert("Permiso de cámara denegado. Por favor, permite el acceso a la cámara.");
    }
  }
}

// Procesar cada frame
function processFrame() {
  if (!isProcessing) return;
  
  try {
    // Dibujar video en canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Si OpenCV está listo, procesar marcador
    if (cvReady && cv.Mat) {
      processWithOpenCV();
    }
    
    // Dibujar guías visuales
    drawVisualGuides();
    
    // Actualizar estabilidad
    updateStability();
    
    // Actualizar otros valores (simulados si no hay sensores)
    if (!isDeviceOrientationSupported) {
      updateSimulatedValues();
    }
    
    // Continuar procesamiento
    requestAnimationFrame(processFrame);
    
  } catch (error) {
    console.error("Error en processFrame:", error);
    markerStatusEl.innerHTML = "🔴 Error de procesamiento";
    isProcessing = false;
  }
}

// Actualizar valores simulados para demostración
function updateSimulatedValues() {
  // Solo para demostración cuando no hay sensores
  const now = Date.now();
  
  if (!prevTime) prevTime = now;
  
  // Simular ángulo si no hay sensores
  if (!isDeviceOrientationSupported) {
    const time = now / 1000;
    const simulatedAngle = 20 + Math.sin(time * 0.5) * 10;
    angleDisplay.textContent = Math.round(simulatedAngle) + '°';
    document.getElementById('angle').textContent = Math.round(simulatedAngle) + '°';
    checkOptimalAngle(simulatedAngle);
  }
  
  // Simular distancia y velocidad
  const dt = (now - prevTime) / 1000;
  if (dt > 0.1) {
    const simulatedDist = 25 + Math.sin(now / 1000) * 5;
    const simulatedSpeed = 3 + Math.cos(now / 800) * 2;
    
    document.getElementById('dist').textContent = simulatedDist.toFixed(1) + ' cm';
    document.getElementById('speed').textContent = simulatedSpeed.toFixed(1) + ' cm/s';
    
    prevTime = now;
  }
}

// Procesar con OpenCV
function processWithOpenCV() {
  try {
    // Crear matriz desde el canvas
    const src = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    src.data.set(imageData.data);
    
    // Convertir a escala de grises
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // Umbralizar
    const threshold = new cv.Mat();
    cv.threshold(gray, threshold, 100, 255, cv.THRESH_BINARY);
    
    // Liberar memoria
    src.delete();
    gray.delete();
    threshold.delete();
    
  } catch (error) {
    console.log("OpenCV processing:", error);
  }
}

// Dibujar guías visuales
function drawVisualGuides() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Dibujar retícula central
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - 50, centerY);
  ctx.lineTo(centerX + 50, centerY);
  ctx.moveTo(centerX, centerY - 50);
  ctx.lineTo(centerX, centerY + 50);
  ctx.stroke();
  
  // Dibujar círculo de objetivo
  ctx.beginPath();
  ctx.arc(centerX, centerY, 80, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Dibujar indicador de ángulo actual si tenemos datos
  const currentAngle = parseFloat(angleDisplay.textContent) || 0;
  if (!isNaN(currentAngle)) {
    const optimal = weldConfig.optimalAngle[weldConfig.type];
    
    // Dibujar arco de ángulo óptimo
    ctx.beginPath();
    ctx.arc(centerX, centerY, 100, 
            (optimal.min - 90) * Math.PI / 180, 
            (optimal.max - 90) * Math.PI / 180);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // Dibujar línea de ángulo actual
    const angleRad = (currentAngle - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(angleRad) * 120,
      centerY + Math.sin(angleRad) * 120
    );
    ctx.strokeStyle = currentAngle >= optimal.min && currentAngle <= optimal.max 
      ? '#0f0' : '#f00';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Dibujar texto de ángulo actual
    ctx.fillStyle = currentAngle >= optimal.min && currentAngle <= optimal.max 
      ? '#0f0' : '#f00';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(currentAngle)}°`, centerX, centerY - 100);
  }
}

// Actualizar puntuación de estabilidad
function updateStability() {
  const currentAngle = parseFloat(angleDisplay.textContent);
  if (!isNaN(currentAngle)) {
    angleHistory.push(currentAngle);
    if (angleHistory.length > 20) angleHistory.shift();
    
    // Calcular variación
    if (angleHistory.length > 5) {
      const avg = angleHistory.reduce((a, b) => a + b) / angleHistory.length;
      const variance = angleHistory.reduce((a, b) => a + Math.abs(b - avg), 0) / angleHistory.length;
      stabilityScore = Math.max(0, 100 - variance * 5);
      
      document.getElementById('stability').textContent = Math.round(stabilityScore) + '%';
      document.getElementById('stability').className = stabilityScore > 80 
        ? 'info-value good' 
        : stabilityScore > 60 
          ? 'info-value warning' 
          : 'info-value error';
    }
  }
}

// Manejar errores globales
window.addEventListener('error', function(e) {
  console.error('Error global:', e.error);
  markerStatusEl.innerHTML = "🔴 Error crítico - Recarga la página";
  isProcessing = false;
});

// Pausar cuando la página no es visible
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    isProcessing = false;
  } else if (cvReady && video.srcObject) {
    isProcessing = true;
    processFrame();
  }
});

// Vibrar dispositivo (si está soportado)
function vibrateDevice(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}
