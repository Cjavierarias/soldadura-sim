console.log("🔥 Simulador de Soldadura AR - Iniciando...");

// Variables globales
let video = null;
let canvas = null;
let ctx = null;
let cvReady = false;
let isProcessing = false;
let zeroAngleCalibrated = false;
let calibrationValue = 0;
let audioContext = null;

// Configuración de soldadura
let weldConfig = {
  type: 'mig',
  material: 'acero',
  soundEnabled: true,
  optimalAngle: {
    mig: { min: 15, max: 25 },
    tig: { min: 10, max: 20 },
    electrodo: { min: 5, max: 15 }
  }
};

// Variables de seguimiento para distancia y velocidad
let prevTime = 0;
let prevDistance = 25; // Distancia inicial en cm
let prevPositions = [];
let angleHistory = [];
let stabilityScore = 0;
let lastMarkerPosition = null;
let lastMarkerTime = null;

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
const SOUND_COOLDOWN = 800; // ms entre sonidos

// Para cálculo de distancia con marcador
let markerDetected = false;
let markerSize = 0;
const REAL_MARKER_SIZE_CM = 10; // Tamaño real del marcador en cm

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
  document.getElementById('soundToggle').addEventListener('click', toggleSound);
  document.getElementById('calibrateBtn').addEventListener('click', calibrateZeroAngle);
  document.getElementById('helpBtn').addEventListener('click', showHelp);
  
  // Inicializar audio
  initAudio();
  
  // Verificar sensores del dispositivo
  checkDeviceSensors();
  
  // Verificar si OpenCV ya está cargado
  if (typeof cv !== 'undefined') {
    onOpenCvReady();
  }
});

// Inicializar sistema de audio
function initAudio() {
  try {
    // Crear contexto de audio para sonidos generados
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log("✅ Audio inicializado");
  } catch (e) {
    console.log("⚠️ Audio no soportado:", e);
  }
}

// Crear sonido personalizado
function createBeepSound(frequency, duration, type = 'sine') {
  if (!audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    // Configurar envolvente
    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0.1, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);
    
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch (e) {
    console.log("Error creando sonido:", e);
  }
}

// Verificar sensores del dispositivo
function checkDeviceSensors() {
  if (window.DeviceOrientationEvent) {
    isDeviceOrientationSupported = true;
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    console.log("✅ Sensores de orientación soportados");
  } else {
    console.log("⚠️ Sensores de orientación no soportados");
    markerStatusEl.textContent = "⚠️ Usando ángulo simulado";
  }
}

// Manejar orientación del dispositivo
function handleDeviceOrientation(event) {
  if (event.beta !== null) {
    // beta: inclinación frontal (-180 a 180)
    // Convertir a ángulo absoluto entre 0-90
    let rawAngle = Math.abs(event.beta);
    
    // Limitar a 0-90 grados
    if (rawAngle > 90) {
      rawAngle = 180 - rawAngle;
    }
    
    // Ajustar según calibración
    if (zeroAngleCalibrated) {
      deviceAngle = Math.abs(rawAngle - calibrationValue);
    } else {
      deviceAngle = rawAngle;
    }
    
    // Asegurar que esté entre 0-90
    deviceAngle = Math.max(0, Math.min(90, deviceAngle));
    
    // Actualizar displays
    updateAngleDisplay(deviceAngle);
    
    // Verificar ángulo óptimo
    checkOptimalAngle(deviceAngle);
  }
}

// Actualizar display del ángulo
function updateAngleDisplay(angle) {
  const roundedAngle = Math.round(angle);
  angleDisplay.textContent = roundedAngle + '°';
  document.getElementById('angleValue').textContent = roundedAngle + '°';
  
  // Actualizar color según ángulo óptimo
  const angleEl = document.getElementById('angleValue');
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  
  if (roundedAngle >= optimal.min && roundedAngle <= optimal.max) {
    angleEl.className = 'info-value good';
    markerStatusEl.innerHTML = '✅ Ángulo óptimo';
  } else if (roundedAngle < optimal.min) {
    angleEl.className = 'info-value warning';
    markerStatusEl.innerHTML = '⚠️ Ángulo bajo';
  } else {
    angleEl.className = 'info-value error';
    markerStatusEl.innerHTML = '⚠️ Ángulo alto';
  }
}

// Verificar si el ángulo está en rango óptimo
function checkOptimalAngle(angle) {
  if (!weldConfig.soundEnabled || Date.now() - lastSoundTime < SOUND_COOLDOWN) {
    return;
  }
  
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  const roundedAngle = Math.round(angle);
  
  if (roundedAngle < optimal.min) {
    // Ángulo demasiado bajo - sonido AGUDO (alta frecuencia)
    playAngleSound('low');
    lastSoundTime = Date.now();
  } else if (roundedAngle > optimal.max) {
    // Ángulo demasiado alto - sonido GRAVE (baja frecuencia)
    playAngleSound('high');
    lastSoundTime = Date.now();
  }
}

// Reproducir sonido según ángulo
function playAngleSound(type) {
  if (!weldConfig.soundEnabled) return;
  
  if (type === 'low') {
    // Sonido agudo para ángulo bajo (800Hz)
    if (audioContext) {
      createBeepSound(800, 0.3);
    } else {
      const sound = document.getElementById('lowAngleSound');
      if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.log("Error sonido bajo:", e));
      }
    }
  } else if (type === 'high') {
    // Sonido grave para ángulo alto (200Hz)
    if (audioContext) {
      createBeepSound(200, 0.5);
    } else {
      const sound = document.getElementById('highAngleSound');
      if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.log("Error sonido alto:", e));
      }
    }
  }
}

// Calibrar ángulo cero
function calibrateZeroAngle() {
  if (isDeviceOrientationSupported) {
    calibrationValue = deviceAngle;
    zeroAngleCalibrated = true;
    
    // Feedback visual y auditivo
    const btn = document.getElementById('calibrateBtn');
    btn.innerHTML = '✅ Calibrado!';
    btn.style.background = 'linear-gradient(135deg, #0a6, #0fc)';
    
    if (weldConfig.soundEnabled) {
      if (audioContext) {
        createBeepSound(500, 0.2);
      } else {
        const sound = document.getElementById('goodSound');
        if (sound) {
          sound.currentTime = 0;
          sound.play();
        }
      }
    }
    
    setTimeout(() => {
      btn.innerHTML = '📐 Calibrar Ángulo Cero';
      btn.style.background = '';
    }, 2000);
    
    markerStatusEl.innerHTML = '✅ Ángulo cero calibrado: ' + Math.round(calibrationValue) + '°';
  } else {
    alert("Para calibrar, usa un dispositivo móvil con sensores de movimiento.");
  }
}

// Alternar sonidos
function toggleSound() {
  const btn = document.getElementById('soundToggle');
  weldConfig.soundEnabled = !weldConfig.soundEnabled;
  
  if (weldConfig.soundEnabled) {
    btn.innerHTML = '🔊 Sonidos ON';
    btn.classList.add('active');
    markerStatusEl.innerHTML = 'Sonidos activados';
  } else {
    btn.innerHTML = '🔇 Sonidos OFF';
    btn.classList.remove('active');
    markerStatusEl.innerHTML = 'Sonidos desactivados';
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

// Mostrar ayuda
function showHelp() {
  alert("SIMULADOR DE SOLDADURA\n\n" +
        "INSTRUCCIONES:\n" +
        "1. Imprime el marcador ARUCO\n" +
        "2. Colócalo en la superficie\n" +
        "3. Sostén el celular como antorcha\n" +
        "4. Calibra el ángulo cero\n" +
        "5. Mantén el ángulo en rango óptimo\n\n" +
        "RANGOS ÓPTIMOS:\n" +
        "• MIG/MAG: 15°-25°\n" +
        "• TIG: 10°-20°\n" +
        "• Electrodo: 5°-15°\n\n" +
        "SONIDOS:\n" +
        "• Agudo: ángulo demasiado bajo\n" +
        "• Grave: ángulo demasiado alto");
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
    loadStatus.textContent = "Solicitando acceso a cámara...";
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
        console.log("Canvas size:", canvas.width, "x", canvas.height);
        resolve();
      };
    });
    
    // Esperar a que el video comience
    await new Promise((resolve) => {
      video.onplaying = () => {
        console.log("✅ Video reproduciéndose");
        resolve();
      };
      setTimeout(resolve, 1000);
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
    } else if (error.name === 'NotFoundError') {
      alert("No se encontró cámara trasera. Usa un dispositivo con cámara trasera.");
    }
  }
}

// Procesar cada frame
function processFrame() {
  if (!isProcessing) return;
  
  try {
    // Dibujar video en canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Procesar con OpenCV si está listo
    if (cvReady && cv.Mat) {
      processWithOpenCV();
    } else {
      // Si no hay OpenCV, usar datos simulados
      simulateMarkerData();
    }
    
    // Dibujar guías visuales
    drawVisualGuides();
    
    // Actualizar estabilidad
    updateStability();
    
    // Continuar procesamiento
    requestAnimationFrame(processFrame);
    
  } catch (error) {
    console.error("Error en processFrame:", error);
    markerStatusEl.innerHTML = "⚠️ Error de procesamiento";
  }
}

// Simular datos de marcador cuando OpenCV no está disponible
function simulateMarkerData() {
  const now = Date.now();
  
  // Simular ángulo si no hay sensores
  if (!isDeviceOrientationSupported) {
    const time = now / 1000;
    const simulatedAngle = 20 + Math.sin(time * 0.3) * 8;
    updateAngleDisplay(simulatedAngle);
    checkOptimalAngle(simulatedAngle);
  }
  
  // Simular detección de marcador intermitente
  const markerVisible = Math.sin(now / 1000) > 0;
  
  if (markerVisible) {
    // Calcular distancia basada en posición "simulada"
    const timeVariation = Math.sin(now / 1500) * 0.3 + 0.7;
    const simulatedDistance = 20 + timeVariation * 10; // 20-30 cm
    
    // Calcular velocidad
    let simulatedSpeed = 0;
    if (prevTime > 0) {
      const dt = (now - prevTime) / 1000; // segundos
      const distanceChange = Math.abs(simulatedDistance - prevDistance);
      simulatedSpeed = dt > 0 ? distanceChange / dt : 0;
    }
    
    // Actualizar UI
    updateDistanceAndSpeed(simulatedDistance, simulatedSpeed);
    
    // Guardar para siguiente frame
    prevDistance = simulatedDistance;
    prevTime = now;
    
    markerStatusEl.innerHTML = '🎯 Marcador detectado (simulado)';
  } else {
    markerStatusEl.innerHTML = '🔍 Buscando marcador...';
  }
}

// Actualizar distancia y velocidad en UI
function updateDistanceAndSpeed(distance, speed) {
  document.getElementById('dist').textContent = distance.toFixed(1) + ' cm';
  document.getElementById('speed').textContent = speed.toFixed(1) + ' cm/s';
}

// Procesar con OpenCV para detección real de marcador
function processWithOpenCV() {
  try {
    const src = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    src.data.set(imageData.data);
    
    // Convertir a escala de grises
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // Aplicar umbral
    const binary = new cv.Mat();
    cv.threshold(gray, binary, 100, 255, cv.THRESH_BINARY);
    
    // Buscar contornos
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    let foundMarker = false;
    let currentDistance = 25; // Distancia por defecto
    let markerCenter = null;
    const now = Date.now();
    
    // Buscar contornos cuadrados (posibles marcadores)
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
      
      // Si tiene 4 vértices, podría ser nuestro marcador
      if (approx.rows === 4) {
        const area = cv.contourArea(approx);
        
        if (area > 500) { // Área mínima
          foundMarker = true;
          
          // Calcular centro
          const moments = cv.moments(contour);
          if (moments.m00 !== 0) {
            const cx = moments.m10 / moments.m00;
            const cy = moments.m01 / moments.m00;
            markerCenter = { x: cx, y: cy };
          }
          
          // Calcular distancia basada en área (área más grande = más cerca)
          const distance = estimateDistanceFromArea(area);
          currentDistance = distance;
          
          // Dibujar contorno
          const color = new cv.Scalar(0, 255, 0, 255);
          cv.drawContours(src, contours, i, color, 3);
          
          // Dibujar información
          if (markerCenter) {
            const text = `Dist: ${distance.toFixed(1)}cm`;
            const textPos = new cv.Point(markerCenter.x - 50, markerCenter.y - 20);
            cv.putText(src, text, textPos, cv.FONT_HERSHEY_SIMPLEX, 0.7, color, 2);
          }
          
          break;
        }
      }
      approx.delete();
    }
    
    // Actualizar datos si se encontró marcador
    if (foundMarker) {
      markerDetected = true;
      
      // Calcular velocidad si tenemos datos previos
      let speed = 0;
      if (lastMarkerPosition && lastMarkerTime) {
        const dt = (now - lastMarkerTime) / 1000;
        if (dt > 0 && markerCenter) {
          const dx = markerCenter.x - lastMarkerPosition.x;
          const dy = markerCenter.y - lastMarkerPosition.y;
          const distanceMoved = Math.sqrt(dx * dx + dy * dy);
          
          // Convertir pixels a cm (estimación)
          const pixelsPerCm = canvas.width / 50; // Asumiendo 50cm de ancho de campo de visión
          speed = (distanceMoved / pixelsPerCm) / dt;
        }
      }
      
      // Actualizar UI
      updateDistanceAndSpeed(currentDistance, speed);
      markerStatusEl.innerHTML = '🎯 Marcador detectado';
      
      // Guardar datos para siguiente frame
      lastMarkerPosition = markerCenter;
      lastMarkerTime = now;
      prevDistance = currentDistance;
      
    } else {
      markerDetected = false;
      markerStatusEl.innerHTML = '🔍 Buscando marcador...';
    }
    
    // Mostrar imagen procesada
    cv.imshow(canvas, src);
    
    // Liberar memoria
    src.delete();
    gray.delete();
    binary.delete();
    contours.delete();
    hierarchy.delete();
    
  } catch (error) {
    console.log("Error en OpenCV:", error);
    // Si falla OpenCV, usar simulación
    simulateMarkerData();
  }
}

// Estimar distancia basada en área del marcador
function estimateDistanceFromArea(pixelArea) {
  // Fórmula simplificada: distancia = k / sqrt(área)
  const CALIBRATION_CONSTANT = 1500; // Ajustar según necesidad
  
  if (pixelArea <= 0) return 30;
  
  const distance = CALIBRATION_CONSTANT / Math.sqrt(pixelArea);
  return Math.max(10, Math.min(distance, 50)); // Limitar entre 10-50 cm
}

// Dibujar guías visuales
function drawVisualGuides() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Dibujar retícula central
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - 40, centerY);
  ctx.lineTo(centerX + 40, centerY);
  ctx.moveTo(centerX, centerY - 40);
  ctx.lineTo(centerX, centerY + 40);
  ctx.stroke();
  
  // Dibujar círculo objetivo
  ctx.beginPath();
  ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 200, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Dibujar guía de ángulo si tenemos datos
  const angle = parseFloat(angleDisplay.textContent);
  if (!isNaN(angle) && angle >= 0) {
    const optimal = weldConfig.optimalAngle[weldConfig.type];
    
    // Dibujar arco de rango óptimo
    ctx.beginPath();
    ctx.arc(centerX, centerY, 80, 
            (optimal.min - 90) * Math.PI / 180, 
            (optimal.max - 90) * Math.PI / 180);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.lineWidth = 6;
    ctx.stroke();
    
    // Dibujar línea de ángulo actual
    const angleRad = (angle - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(angleRad) * 100,
      centerY + Math.sin(angleRad) * 100
    );
    
    // Color según rango óptimo
    if (angle >= optimal.min && angle <= optimal.max) {
      ctx.strokeStyle = '#0f0';
    } else if (angle < optimal.min) {
      ctx.strokeStyle = '#ff0'; // Amarillo para ángulo bajo
    } else {
      ctx.strokeStyle = '#f00'; // Rojo para ángulo alto
    }
    
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

// Actualizar puntuación de estabilidad
function updateStability() {
  const currentAngle = parseFloat(angleDisplay.textContent);
  if (!isNaN(currentAngle)) {
    angleHistory.push(currentAngle);
    if (angleHistory.length > 30) angleHistory.shift();
    
    if (angleHistory.length >= 10) {
      // Calcular desviación estándar
      const mean = angleHistory.reduce((a, b) => a + b) / angleHistory.length;
      const variance = angleHistory.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / angleHistory.length;
      const stdDev = Math.sqrt(variance);
      
      // Convertir a puntuación de estabilidad (0-100%)
      stabilityScore = Math.max(0, 100 - stdDev * 10);
      
      document.getElementById('stability').textContent = Math.round(stabilityScore) + '%';
      
      // Color según estabilidad
      const stabilityEl = document.getElementById('stability');
      if (stabilityScore >= 80) {
        stabilityEl.className = 'info-value good';
      } else if (stabilityScore >= 60) {
        stabilityEl.className = 'info-value warning';
      } else {
        stabilityEl.className = 'info-value error';
      }
    }
  }
}

// Manejar errores globales
window.addEventListener('error', function(e) {
  console.error('Error global:', e.error);
  markerStatusEl.innerHTML = "⚠️ Error - Recarga la página";
  isProcessing = false;
});

// Pausar cuando la página no es visible
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    isProcessing = false;
  } else if (video.srcObject) {
    isProcessing = true;
    processFrame();
  }
});

// Vibrar dispositivo (feedback táctil)
function vibrateDevice(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}
