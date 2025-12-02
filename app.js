// app.js - Simulador de Soldadura AR Mejorado
// Compatible con GitHub Pages y Chrome Android

// Variables globales
let video, canvas, ctx;
let isProcessing = false;
let isWelding = false;
let lastMarkerPosition = null;
let markerMovementHistory = [];
let pathHistory = [];
let angleHistory = [];
let stabilityScore = 0;
let straightnessScore = 0;
let electrodoConsumption = 0;
let lastVibrationTime = 0;
let weldingStartTime = 0;
let weldingDuration = 0;

// Configuración de soldadura
const weldConfig = {
  type: 'mig',
  material: 'acero',
  soundEnabled: true,
  vibrationEnabled: true,
  optimalAngle: {
    mig: { min: 15, max: 25 },
    tig: { min: 10, max: 20 },
    electrodo: { min: 5, max: 15 }
  },
  optimalDistance: {
    mig: { min: 15, max: 25 },
    tig: { min: 8, max: 15 },
    electrodo: { min: 5, max: 10 }
  },
  optimalSpeed: {
    mig: { min: 5, max: 15 },
    tig: { min: 3, max: 10 },
    electrodo: { min: 0.3, max: 0.8 }
  }
};

// Sistema de evaluación
let evaluationSession = {
  active: false,
  weldingActive: false,
  startTime: null,
  duration: 0,
  dataPoints: [],
  results: null,
  recommendations: [],
  metrics: {
    angleScores: [],
    stabilityScores: [],
    speedValues: [],
    approachSpeedValues: [],
    straightnessValues: [],
    distanceValues: []
  }
};

// Elementos del DOM
let markerStatusEl, angleDisplay;

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  console.log("Simulador de Soldadura AR cargado");
  
  // Obtener elementos del DOM
  video = document.getElementById('camera');
  canvas = document.getElementById('overlay');
  ctx = canvas.getContext('2d');
  markerStatusEl = document.getElementById('markerStatus');
  angleDisplay = document.getElementById('angleDisplay');
  
  // Configurar canvas
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  // Configurar controles
  initControls();
  
  // Configurar sistema de evaluación
  initEvaluationSystem();
  
  // Configurar botón de soldadura (VOLUMEN)
  initVolumeButton();
  
  // Configurar paneles minimizables
  initMinimizablePanels();
  
  // Iniciar cámara automáticamente
  initCamera();
  
  // Manejar redimensionamiento
  window.addEventListener('resize', function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
});

// Inicializar controles
function initControls() {
  document.getElementById('weldType').addEventListener('change', function(e) {
    weldConfig.type = e.target.value;
    updateWeldParameters();
  });
  
  document.getElementById('material').addEventListener('change', function(e) {
    weldConfig.material = e.target.value;
  });
  
  document.getElementById('soundToggle').addEventListener('click', function() {
    weldConfig.soundEnabled = !weldConfig.soundEnabled;
    this.textContent = weldConfig.soundEnabled ? '🔊 Sonidos ON' : '🔇 Sonidos OFF';
    this.classList.toggle('active', weldConfig.soundEnabled);
  });
  
  // Botones del modal de pausa
  document.getElementById('continueWeldBtn').addEventListener('click', continueWelding);
  document.getElementById('endWeldBtn').addEventListener('click', endWeldingEvaluation);
}

// Actualizar parámetros de soldadura
function updateWeldParameters() {
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  markerStatusEl.innerHTML = `🎯 Soldadura ${weldConfig.type.toUpperCase()} - Ángulo óptimo: ${optimal.min}°-${optimal.max}°`;
}

// Inicializar paneles minimizables
function initMinimizablePanels() {
  document.getElementById('minimizeControls').addEventListener('click', function() {
    document.getElementById('controlsPanel').classList.toggle('minimized');
    this.textContent = document.getElementById('controlsPanel').classList.contains('minimized') ? '+' : '−';
  });
  
  document.getElementById('minimizeEval').addEventListener('click', function() {
    document.getElementById('evaluationPanel').classList.toggle('minimized');
    this.textContent = document.getElementById('evaluationPanel').classList.contains('minimized') ? '+' : '−';
  });
}

// ============================================
// BOTÓN DE VOLUMEN PARA SOLDAR
// ============================================

function initVolumeButton() {
  // Detectar botón de subir volumen (keyCode 447 en algunos Android/Chrome)
  document.addEventListener('keydown', function(e) {
    // Botón de volumen arriba o tecla específica
    if (e.keyCode === 447 || e.key === 'VolumeUp' || e.key === 'AudioVolumeUp') {
      e.preventDefault(); // Prevenir cambio de volumen del sistema
      startWelding();
    }
  });
  
  document.addEventListener('keyup', function(e) {
    if (e.keyCode === 447 || e.key === 'VolumeUp' || e.key === 'AudioVolumeUp') {
      pauseWelding();
    }
  });
  
  // También mantener botón táctil como alternativa
  const weldButton = document.getElementById('weldButton');
  weldButton.addEventListener('touchstart', function(e) {
    e.preventDefault();
    startWelding();
  });
  
  weldButton.addEventListener('touchend', function(e) {
    e.preventDefault();
    pauseWelding();
  });
  
  weldButton.addEventListener('mousedown', startWelding);
  weldButton.addEventListener('mouseup', pauseWelding);
  weldButton.addEventListener('mouseleave', pauseWelding);
}

// ============================================
// CÁMARA Y SENSORES
// ============================================

async function initCamera() {
  try {
    markerStatusEl.innerHTML = "📸 Activando cámara trasera...";
    
    const constraints = {
      video: {
        facingMode: "environment", // Cámara trasera
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    // Esperar a que el video cargue
    video.onloadedmetadata = function() {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Iniciar procesamiento
      isProcessing = true;
      processFrame();
      
      // Iniciar sensores si están disponibles
      initSensors();
      
      markerStatusEl.innerHTML = "✅ Cámara activa. Usa el BOTÓN DE VOLUMEN para soldar.";
    };
    
  } catch (err) {
    console.error("Error con la cámara:", err);
    markerStatusEl.innerHTML = "❌ Error con la cámara: " + err.message;
    
    // Usar video de prueba si hay error
    fallbackToTestVideo();
  }
}

// Inicializar sensores del celular (acelerómetro/giroscopio)
function initSensors() {
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', handleDeviceOrientation);
  } else {
    console.log("DeviceOrientationEvent no soportado");
  }
}

// Manejar orientación del dispositivo
function handleDeviceOrientation(event) {
  if (event.beta !== null && event.gamma !== null) {
    // Calcular ángulo aproximado
    const angle = Math.abs(event.beta); // Inclinación frontal (0-180)
    
    // Solo actualizar si estamos en evaluación
    if (evaluationSession.active && evaluationSession.weldingActive) {
      updateAngleDisplay(angle);
      
      // Feedback de sonido según ángulo
      const optimal = weldConfig.optimalAngle[weldConfig.type];
      if (weldConfig.soundEnabled) {
        if (angle > optimal.max) {
          // Sonido agudo - por encima
          playHighBeep();
        } else if (angle < optimal.min) {
          // Sonido grave - por debajo
          playLowBeep();
        }
      }
    }
  }
}

// Reproducir sonido agudo
function playHighBeep() {
  const beep = document.getElementById('beepHigh');
  if (beep) {
    beep.currentTime = 0;
    beep.volume = 0.3;
    beep.play().catch(e => console.log("Error sonido agudo:", e));
  }
}

// Reproducir sonido grave
function playLowBeep() {
  const beep = document.getElementById('beepLow');
  if (beep) {
    beep.currentTime = 0;
    beep.volume = 0.3;
    beep.play().catch(e => console.log("Error sonido grave:", e));
  }
}

// Fallback a video de prueba
function fallbackToTestVideo() {
  markerStatusEl.innerHTML = "⚠️ Usando modo simulación (sin cámara)";
  
  // Simular procesamiento
  isProcessing = true;
  simulateFrameProcessing();
}

// Simular procesamiento de frames
function simulateFrameProcessing() {
  if (!isProcessing) return;
  
  // Limpiar canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Dibujar guías
  drawVisualGuides();
  
  // Simular ángulo aleatorio para pruebas
  if (Math.random() < 0.1) {
    const simulatedAngle = 10 + Math.random() * 30;
    updateAngleDisplay(simulatedAngle);
  }
  
  // Continuar
  requestAnimationFrame(simulateFrameProcessing);
}

// ============================================
// PROCESAMIENTO DE FRAMES
// ============================================

function processFrame() {
  if (!isProcessing || !video.videoWidth) {
    requestAnimationFrame(processFrame);
    return;
  }
  
  try {
    // Limpiar canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar video
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Procesar marcador con OpenCV
    if (window.cv && window.cv.Mat) {
      processWithOpenCV();
    } else {
      // Fallback a procesamiento simple
      processSimpleMarker();
    }
    
    // Dibujar guías visuales
    drawVisualGuides();
    
    // Actualizar estabilidad y rectitud
    updateStability();
    updateStraightness();
    
    // Registrar datos de evaluación si estamos soldando
    if (isWelding && evaluationSession.active) {
      recordEvaluationData();
    }
    
    // Actualizar progreso de soldadura
    updateWeldProgress();
    
  } catch (err) {
    console.error("Error procesando frame:", err);
  }
  
  // Continuar procesamiento
  requestAnimationFrame(processFrame);
}

// Procesamiento simple de marcador (sin OpenCV)
function processSimpleMarker() {
  // Simular detección de marcador
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Dibujar marcador simulado
  ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
  ctx.fill();
  
  // Actualizar posición
  const currentTime = Date.now();
  if (lastMarkerPosition) {
    const timeDiff = currentTime - lastMarkerPosition.timestamp;
    if (timeDiff > 100) { // Cada 100ms
      const newX = centerX + (Math.random() - 0.5) * 20;
      const newY = centerY + (Math.random() - 0.5) * 20;
      
      // Registrar movimiento
      markerMovementHistory.push({
        from: { x: lastMarkerPosition.x, y: lastMarkerPosition.y },
        to: { x: newX, y: newY },
        timestamp: currentTime
      });
      
      // Mantener historial limitado
      if (markerMovementHistory.length > 50) {
        markerMovementHistory.shift();
      }
      
      lastMarkerPosition = { x: newX, y: newY, timestamp: currentTime };
    }
  } else {
    lastMarkerPosition = { x: centerX, y: centerY, timestamp: currentTime };
  }
  
  // Calcular y mostrar métricas
  updateMetrics();
}

// Procesar con OpenCV cuando esté disponible
function processWithOpenCV() {
  // TODO: Implementar detección de marcador AR con OpenCV
  // Por ahora usamos simulación
  processSimpleMarker();
}

// Actualizar métricas en pantalla
function updateMetrics() {
  if (!lastMarkerPosition) return;
  
  // Simular distancia (en cm)
  const distance = 10 + Math.random() * 5;
  document.getElementById('dist').textContent = distance.toFixed(1) + ' cm';
  
  // Simular velocidad (en cm/s)
  if (markerMovementHistory.length >= 2) {
    const lastMove = markerMovementHistory[markerMovementHistory.length - 1];
    const speed = Math.random() * 2;
    document.getElementById('speed').textContent = speed.toFixed(1) + ' cm/s';
    
    // Velocidad de aproximación
    const approachSpeed = -0.2 + Math.random() * 0.4;
    document.getElementById('approachSpeed').textContent = approachSpeed.toFixed(1) + ' cm/s';
  }
}

// Actualizar display de ángulo
function updateAngleDisplay(angle) {
  if (isNaN(angle)) return;
  
  angleDisplay.textContent = Math.round(angle) + '°';
  document.getElementById('currentAngle').textContent = Math.round(angle) + '°';
  
  // Color según rango óptimo
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  if (angle >= optimal.min && angle <= optimal.max) {
    angleDisplay.style.color = '#0f0';
  } else if (angle < optimal.min) {
    angleDisplay.style.color = '#ff0';
  } else {
    angleDisplay.style.color = '#f00';
  }
}

// Continúa con el resto de funciones (drawVisualGuides, updateStability, etc.)
// ... [El resto del código que ya tienes desde app.js original]
