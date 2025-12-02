console.log("🔥 Simulador de Soldadura AR - Iniciando...");

// Variables globales
let video = null;
let canvas = null;
let ctx = null;
let cvReady = false;
let isProcessing = false;
let zeroAngleCalibrated = false;
let calibrationValue = 0;
let panelsVisible = true;

// Configuración de soldadura
let weldConfig = {
  type: 'mig',
  material: 'acero',
  soundEnabled: true,
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
    mig: { min: 5, max: 15 }, // cm/s
    tig: { min: 3, max: 10 },
    electrodo: { min: 0.3, max: 0.8 } // más lento para electrodo
  },
  optimalApproachSpeed: {
    electrodo: { min: -0.5, max: -0.1 } // negativa porque debe acercarse
  }
};

// Variables de seguimiento de posición
let prevTime = 0;
let prevDistance = 20; // Distancia inicial en cm
let prevPositions = []; // Para seguimiento de movimiento
let pathHistory = []; // Para calcular rectitud
let angleHistory = [];
let stabilityScore = 0;
let straightnessScore = 0;
let lastMarkerTime = null;
let markerVisible = false;
let electrodoConsumption = 0;
let electrodoStartLength = 30;

// Para cálculo de velocidad
let lastPosition = { x: 0, y: 0, distance: 20 };
let positionHistory = [];
const MAX_HISTORY = 50;

// Elementos DOM
let startBtn = null;
let appContainer = null;
let loading = null;
let loadStatus = null;
let angleDisplay = null;
let currentAngleEl = null;
let markerStatusEl = null;

// Sensores del dispositivo
let isDeviceOrientationSupported = false;
let deviceAngle = 0;
let lastSoundTime = 0;
const SOUND_COOLDOWN = 800;

// ============================================
// SISTEMA DE EVALUACIÓN TEMPORAL
// ============================================

let evaluationSession = {
  active: false,
  startTime: null,
  duration: 0,
  dataPoints: [],
  metrics: {
    angleScores: [],
    stabilityScores: [],
    speedValues: [],
    approachSpeedValues: [],
    straightnessValues: [],
    distanceValues: [],
    distanceConsistency: []
  }
};

// ============================================
// INICIALIZACIÓN
// ============================================

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
  currentAngleEl = document.getElementById('currentAngle');
  markerStatusEl = document.getElementById('markerStatus');
  
  // Contexto del canvas
  ctx = canvas.getContext('2d');
  
  // Configurar botones y controles
  startBtn.addEventListener('click', startApp);
  document.getElementById('weldType').addEventListener('change', updateWeldConfig);
  document.getElementById('material').addEventListener('change', updateWeldConfig);
  document.getElementById('soundToggle').addEventListener('click', toggleSound);
  document.getElementById('calibrateBtn').addEventListener('click', calibrateZeroAngle);
  document.getElementById('togglePanelsBtn').addEventListener('click', toggleAllPanels);
  
  // Inicializar sistema de evaluación
  initEvaluationSystem();
  
  // Inicializar paneles minimizables
  initMinimizablePanels();
  
  // Verificar sensores del dispositivo
  checkDeviceSensors();
  
  // Pre-cargar sonidos
  preloadSounds();
});

// Pre-cargar sonidos
function preloadSounds() {
  const sounds = ['beepHigh', 'beepLow', 'goodSound'];
  sounds.forEach(soundId => {
    const sound = document.getElementById(soundId);
    if (sound) {
      sound.load();
    }
  });
}

// Callback cuando OpenCV.js se carga
function onOpenCvReady() {
  console.log("✅ OpenCV.js listo!");
  cvReady = true;
  loadStatus.textContent = "OpenCV cargado correctamente";
  loading.style.display = 'none';
  startBtn.style.display = 'block';
}

// Inicializar paneles minimizables
function initMinimizablePanels() {
  // Panel de controles
  document.getElementById('controlsHeader').addEventListener('click', function() {
    const panel = document.getElementById('controlsPanel');
    const btn = document.getElementById('minimizeControls');
    panel.classList.toggle('minimized');
    btn.textContent = panel.classList.contains('minimized') ? '+' : '−';
  });
  
  document.getElementById('minimizeControls').addEventListener('click', function(e) {
    e.stopPropagation();
    const panel = document.getElementById('controlsPanel');
    panel.classList.toggle('minimized');
    this.textContent = panel.classList.contains('minimized') ? '+' : '−';
  });
  
  // Panel de evaluación
  document.getElementById('evalHeader').addEventListener('click', function() {
    const panel = document.getElementById('evaluationPanel');
    const btn = document.getElementById('minimizeEval');
    panel.classList.toggle('minimized');
    btn.textContent = panel.classList.contains('minimized') ? '+' : '−';
  });
  
  document.getElementById('minimizeEval').addEventListener('click', function(e) {
    e.stopPropagation();
    const panel = document.getElementById('evaluationPanel');
    panel.classList.toggle('minimized');
    this.textContent = panel.classList.contains('minimized') ? '+' : '−';
  });
}

// Alternar visibilidad de todos los paneles
function toggleAllPanels() {
  panelsVisible = !panelsVisible;
  const btn = document.getElementById('togglePanelsBtn');
  
  if (panelsVisible) {
    // Mostrar todos los paneles
    document.getElementById('controlsPanel').style.display = 'block';
    document.getElementById('evaluationPanel').style.display = 'block';
    document.getElementById('info').style.display = 'block';
    document.getElementById('angleIndicator').style.display = 'flex';
    btn.innerHTML = '📱 Mostrar/Ocultar Paneles';
    markerStatusEl.innerHTML = 'Paneles visibles';
  } else {
    // Ocultar todos los paneles
    document.getElementById('controlsPanel').style.display = 'none';
    document.getElementById('evaluationPanel').style.display = 'none';
    document.getElementById('info').style.display = 'none';
    document.getElementById('angleIndicator').style.display = 'none';
    btn.innerHTML = '📱 Mostrar Paneles';
    markerStatusEl.innerHTML = 'Paneles ocultos - enfoque en soldadura';
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
  currentAngleEl.textContent = roundedAngle + '°';
  
  // Actualizar color según ángulo óptimo
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  
  if (roundedAngle >= optimal.min && roundedAngle <= optimal.max) {
    currentAngleEl.className = 'info-value good';
    if (!evaluationSession.active) {
      markerStatusEl.innerHTML = '✅ Ángulo óptimo';
    }
  } else if (roundedAngle < optimal.min) {
    currentAngleEl.className = 'info-value warning';
  } else {
    currentAngleEl.className = 'info-value error';
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
    // Ángulo demasiado bajo - sonido AGUDO (pitido alto)
    playAngleSound('high');
    lastSoundTime = Date.now();
    markerStatusEl.innerHTML = '⚠️ Ángulo demasiado bajo (sonido agudo)';
  } else if (roundedAngle > optimal.max) {
    // Ángulo demasiado alto - sonido GRAVE (pitido bajo)
    playAngleSound('low');
    lastSoundTime = Date.now();
    markerStatusEl.innerHTML = '⚠️ Ángulo demasiado alto (sonido grave)';
  }
}

// Reproducir sonido según ángulo
function playAngleSound(type) {
  if (!weldConfig.soundEnabled) return;
  
  const sound = type === 'high' ? document.getElementById('beepHigh') : document.getElementById('beepLow');
  if (sound) {
    sound.currentTime = 0;
    sound.volume = 0.4;
    sound.play().catch(e => {
      console.log("Error reproduciendo sonido:", e);
      sound.load();
      setTimeout(() => {
        sound.play().catch(console.error);
      }, 100);
    });
  }
}

// Calibrar ángulo cero
function calibrateZeroAngle() {
  if (isDeviceOrientationSupported) {
    calibrationValue = deviceAngle;
    zeroAngleCalibrated = true;
    
    // Feedback visual
    const btn = document.getElementById('calibrateBtn');
    btn.innerHTML = '✅ Calibrado!';
    btn.style.background = 'linear-gradient(135deg, #0a6, #0fc)';
    
    // Sonido de confirmación
    if (weldConfig.soundEnabled) {
      const sound = document.getElementById('goodSound');
      if (sound) {
        sound.currentTime = 0;
        sound.volume = 0.3;
        sound.play();
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
  
  // Reiniciar electrodo si cambiamos de tipo
  if (weldConfig.type !== 'electrodo') {
    electrodoConsumption = 0;
  }
}

// ============================================
// FUNCIONES PRINCIPALES MEJORADAS
// ============================================

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
        
        // Inicializar posición
        lastPosition = {
          x: canvas.width / 2,
          y: canvas.height / 2,
          distance: 20,
          time: Date.now()
        };
        
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
    
    // Inicializar electrodo
    electrodoConsumption = 0;
    
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
    
    // Si no hay sensores, usar datos simulados
    if (!isDeviceOrientationSupported) {
      simulateData();
    }
    
    // Actualizar datos de distancia, velocidad y posición
    updatePositionAndVelocities();
    
    // Dibujar guías visuales y trayectoria
    drawVisualGuides();
    drawTrajectory();
    
    // Actualizar estabilidad y rectitud
    updateStability();
    updateStraightness();
    
    // Registrar datos para evaluación si está activa
    if (evaluationSession.active) {
      recordEvaluationData();
    }
    
    // Continuar procesamiento
    requestAnimationFrame(processFrame);
    
  } catch (error) {
    console.error("Error en processFrame:", error);
    markerStatusEl.innerHTML = "⚠️ Error de procesamiento";
  }
}

// Simular datos cuando no hay sensores
function simulateData() {
  const now = Date.now();
  
  // Simular ángulo
  if (!isDeviceOrientationSupported) {
    const time = now / 1000;
    const simulatedAngle = 20 + Math.sin(time * 0.3) * 8;
    updateAngleDisplay(simulatedAngle);
    checkOptimalAngle(simulatedAngle);
  }
  
  // Simular detección de marcador
  const time = now / 1000;
  markerVisible = Math.sin(time) > -0.5;
  
  if (markerVisible) {
    markerStatusEl.innerHTML = '🎯 Marcador detectado';
    if (lastMarkerTime === null) {
      lastMarkerTime = now;
    }
  } else {
    markerStatusEl.innerHTML = '🔍 Buscando marcador...';
  }
}

// Actualizar posición y calcular velocidades - SISTEMA MEJORADO
function updatePositionAndVelocities() {
  const now = Date.now();
  
  // Solo actualizar si ha pasado suficiente tiempo
  if (prevTime > 0 && now - prevTime < 100) {
    return;
  }
  
  // 1. CALCULAR DISTANCIA (simulada para demo)
  let currentDistance = calculateCurrentDistance(now);
  
  // 2. CALCULAR POSICIÓN (simulada para demo)
  // En una implementación real, esto vendría de OpenCV/tracking
  const currentPosition = calculateCurrentPosition(now, currentDistance);
  
  // 3. CALCULAR VELOCIDAD DE TRASLACIÓN (movimiento paralelo al plano)
  let translationSpeed = 0;
  if (positionHistory.length > 1) {
    // Calcular distancia recorrida en el plano XY
    const totalDistance = calculatePlaneDistance(positionHistory);
    const timeElapsed = (positionHistory[positionHistory.length - 1].time - positionHistory[0].time) / 1000;
    translationSpeed = timeElapsed > 0 ? totalDistance / timeElapsed : 0;
  }
  
  // 4. CALCULAR VELOCIDAD DE APROXIMACIÓN (cambio de distancia)
  let approachSpeed = 0;
  if (prevTime > 0 && prevDistance !== null) {
    const dt = (now - prevTime) / 1000;
    const distanceChange = currentDistance - prevDistance;
    approachSpeed = dt > 0 ? distanceChange / dt : 0;
  }
  
  // 5. ACTUALIZAR UI
  updateDisplayValues(currentDistance, translationSpeed, approachSpeed);
  
  // 6. GUARDAR DATOS PARA SIGUIENTE FRAME
  savePositionData(now, currentPosition, currentDistance, translationSpeed, approachSpeed);
}

// Calcular distancia actual (simulación)
function calculateCurrentDistance(now) {
  const optimalDist = weldConfig.optimalDistance[weldConfig.type];
  
  if (weldConfig.type === 'electrodo') {
    // Para electrodo: la distancia debe ir disminuyendo
    const timeElapsed = evaluationSession.active ? 
      (now - evaluationSession.startTime) / 1000 : 
      (now % 60000) / 1000;
    
    // El electrodo se consume a 0.3 cm por segundo
    electrodoConsumption = Math.min(electrodoStartLength, timeElapsed * 0.3);
    let distance = optimalDist.max - (electrodoConsumption * 0.6);
    distance = Math.max(optimalDist.min, distance);
    
    // Si el electrodo se consumió completamente, reiniciar
    if (electrodoConsumption >= electrodoStartLength && !evaluationSession.active) {
      electrodoConsumption = 0;
    }
    
    return distance;
  } else {
    // Para MIG/TIG: distancia más estable con pequeña variación
    const timeVar = Math.sin(now / 2000) * 0.3 + 0.85;
    let distance = (optimalDist.min + optimalDist.max) / 2 * timeVar;
    return Math.max(optimalDist.min, Math.min(optimalDist.max, distance));
  }
}

// Calcular posición actual (simulación para demo)
function calculateCurrentPosition(now, distance) {
  // En una implementación real, esto vendría del tracking del marcador
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Simular movimiento en el plano
  const time = now / 1000;
  const amplitude = 50; // Píxeles de movimiento máximo
  
  // Patrón de movimiento para simular soldadura
  let x, y;
  
  if (weldConfig.type === 'electrodo') {
    // Electrodo: movimiento más lento y preciso
    x = centerX + Math.sin(time * 0.5) * amplitude * 0.3;
    y = centerY + Math.cos(time * 0.8) * amplitude * 0.2;
  } else if (weldConfig.type === 'tig') {
    // TIG: movimiento suave y controlado
    x = centerX + Math.sin(time * 0.7) * amplitude * 0.4;
    y = centerY + Math.cos(time * 0.5) * amplitude * 0.3;
  } else {
    // MIG: movimiento más amplio
    x = centerX + Math.sin(time * 0.9) * amplitude * 0.5;
    y = centerY + Math.cos(time * 0.6) * amplitude * 0.4;
  }
  
  return {
    x: x,
    y: y,
    distance: distance,
    time: now
  };
}

// Calcular distancia recorrida en el plano (píxeles convertidos a cm)
function calculatePlaneDistance(positions) {
  if (positions.length < 2) return 0;
  
  let totalDistance = 0;
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i-1].x;
    const dy = positions[i].y - positions[i-1].y;
    const distancePixels = Math.sqrt(dx * dx + dy * dy);
    
    // Convertir píxeles a cm (aproximación: 100 píxeles = 10 cm)
    totalDistance += distancePixels * 0.1;
  }
  
  return totalDistance;
}

// Actualizar valores en pantalla
function updateDisplayValues(distance, translationSpeed, approachSpeed) {
  // Distancia
  document.getElementById('dist').textContent = distance.toFixed(1) + ' cm';
  const distEl = document.getElementById('dist');
  const optimalDist = weldConfig.optimalDistance[weldConfig.type];
  
  if (distance >= optimalDist.min && distance <= optimalDist.max) {
    distEl.className = 'info-value good';
  } else if (distance < optimalDist.min) {
    distEl.className = 'info-value warning';
  } else {
    distEl.className = 'info-value error';
  }
  
  // Velocidad de traslación
  document.getElementById('speed').textContent = Math.abs(translationSpeed).toFixed(1) + ' cm/s';
  const speedEl = document.getElementById('speed');
  const optimalSpeed = weldConfig.optimalSpeed[weldConfig.type];
  
  if (translationSpeed >= optimalSpeed.min && translationSpeed <= optimalSpeed.max) {
    speedEl.className = 'info-value good';
  } else if (translationSpeed < optimalSpeed.min) {
    speedEl.className = 'info-value warning';
  } else {
    speedEl.className = 'info-value error';
  }
  
  // Velocidad de aproximación
  const approachEl = document.getElementById('approachSpeed');
  let approachDisplay = approachSpeed.toFixed(1);
  
  if (weldConfig.type === 'electrodo') {
    // Para electrodo, mostrar como negativa cuando se acerca
    const electrodoOptimal = weldConfig.optimalApproachSpeed.electrodo;
    
    if (approachSpeed <= electrodoOptimal.max && approachSpeed >= electrodoOptimal.min) {
      approachEl.className = 'info-value good';
      approachDisplay = approachSpeed.toFixed(1) + ' cm/s';
    } else if (approachSpeed > 0) {
      // Positiva = se aleja (malo para electrodo)
      approachEl.className = 'info-value error';
      approachDisplay = '+' + approachSpeed.toFixed(1) + ' cm/s';
    } else {
      // Negativa pero fuera de rango
      approachEl.className = 'info-value warning';
      approachDisplay = approachSpeed.toFixed(1) + ' cm/s';
    }
  } else {
    // Para MIG/TIG, la aproximación debe ser mínima
    if (Math.abs(approachSpeed) < 0.5) {
      approachEl.className = 'info-value good';
      approachDisplay = Math.abs(approachSpeed).toFixed(1) + ' cm/s';
    } else {
      approachEl.className = 'info-value warning';
      approachDisplay = Math.abs(approachSpeed).toFixed(1) + ' cm/s';
    }
  }
  
  approachEl.textContent = approachDisplay;
}

// Guardar datos de posición
function savePositionData(now, position, distance, translationSpeed, approachSpeed) {
  // Guardar en historial
  positionHistory.push({
    x: position.x,
    y: position.y,
    distance: distance,
    time: now,
    translationSpeed: translationSpeed,
    approachSpeed: approachSpeed
  });
  
  // Limitar tamaño del historial
  if (positionHistory.length > MAX_HISTORY) {
    positionHistory.shift();
  }
  
  // Guardar para cálculo de rectitud
  pathHistory.push({ x: position.x, y: position.y });
  if (pathHistory.length > 20) {
    pathHistory.shift();
  }
  
  // Actualizar valores previos
  prevDistance = distance;
  prevTime = now;
  lastPosition = position;
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
      ctx.strokeStyle = '#ff0';
    } else {
      ctx.strokeStyle = '#f00';
    }
    
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

// Dibujar trayectoria
function drawTrajectory() {
  if (pathHistory.length < 2) return;
  
  ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  // Mover al primer punto
  ctx.moveTo(pathHistory[0].x, pathHistory[0].y);
  
  // Dibujar línea a través de todos los puntos
  for (let i = 1; i < pathHistory.length; i++) {
    ctx.lineTo(pathHistory[i].x, pathHistory[i].y);
  }
  
  ctx.stroke();
  
  // Dibujar puntos de la trayectoria
  ctx.fillStyle = 'rgba(255, 200, 0, 0.8)';
  for (let i = 0; i < pathHistory.length; i++) {
    // Puntos más grandes para puntos más recientes
    const size = 3 + (i / pathHistory.length) * 3;
    ctx.beginPath();
    ctx.arc(pathHistory[i].x, pathHistory[i].y, size, 0, Math.PI * 2);
    ctx.fill();
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

// Calcular y actualizar rectitud de la trayectoria
function updateStraightness() {
  if (pathHistory.length < 3) {
    straightnessScore = 0;
    document.getElementById('straightness').textContent = '--%';
    return;
  }
  
  // Calcular desviación de la línea recta
  const firstPoint = pathHistory[0];
  const lastPoint = pathHistory[pathHistory.length - 1];
  
  // Calcular línea recta ideal entre primer y último punto
  const dx = lastPoint.x - firstPoint.x;
  const dy = lastPoint.y - firstPoint.y;
  const distanceTotal = Math.sqrt(dx * dx + dy * dy);
  
  if (distanceTotal < 10) { // Muy poco movimiento
    straightnessScore = 0;
    document.getElementById('straightness').textContent = '--%';
    return;
  }
  
  let totalDeviation = 0;
  for (let i = 1; i < pathHistory.length - 1; i++) {
    const point = pathHistory[i];
    
    // Calcular distancia del punto a la línea recta
    const deviation = distancePointToLine(point, firstPoint, lastPoint);
    totalDeviation += deviation;
  }
  
  const avgDeviation = totalDeviation / (pathHistory.length - 2);
  
  // Convertir a puntuación (menos desviación = más recto = mayor puntuación)
  // Máxima desviación aceptable: 20 píxeles
  straightnessScore = Math.max(0, 100 - (avgDeviation * 5));
  
  document.getElementById('straightness').textContent = Math.round(straightnessScore) + '%';
  
  // Color según rectitud
  const straightnessEl = document.getElementById('straightness');
  if (straightnessScore >= 80) {
    straightnessEl.className = 'info-value good';
  } else if (straightnessScore >= 60) {
    straightnessEl.className = 'info-value warning';
  } else {
    straightnessEl.className = 'info-value error';
  }
}

// Calcular distancia de un punto a una línea
function distancePointToLine(point, lineStart, lineEnd) {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) {
    param = dot / lenSq;
  }
  
  let xx, yy;
  
  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }
  
  const dx = point.x - xx;
  const dy = point.y - yy;
  
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================
// SISTEMA DE EVALUACIÓN TEMPORAL MEJORADO
// ============================================

// Inicializar sistema de evaluación
function initEvaluationSystem() {
  console.log("Inicializando sistema de evaluación...");
  
  // Configurar botones de evaluación
  document.getElementById('startEvalBtn').addEventListener('click', startEvaluation);
  document.getElementById('stopEvalBtn').addEventListener('click', stopEvaluation);
  document.getElementById('resultsBtn').addEventListener('click', showResults);
  document.getElementById('newSessionBtn').addEventListener('click', startNewSession);
  document.getElementById('shareResultsBtn').addEventListener('click', shareResults);
  document.querySelector('.close-modal').addEventListener('click', hideResults);
  
  // Cerrar modal haciendo clic fuera
  document.getElementById('resultsModal').addEventListener('click', function(e) {
    if (e.target === this) hideResults();
  });
}

// Iniciar evaluación
function startEvaluation() {
  if (evaluationSession.active) return;
  
  evaluationSession = {
    active: true,
    startTime: Date.now(),
    duration: 0,
    dataPoints: [],
    metrics: {
      angleScores: [],
      stabilityScores: [],
      speedValues: [],
      approachSpeedValues: [],
      straightnessValues: [],
      distanceValues: [],
      distanceConsistency: []
    }
  };
  
  // Reiniciar historiales
  pathHistory = [];
  positionHistory = [];
  electrodoConsumption = 0;
  
  // Actualizar UI
  document.getElementById('startEvalBtn').style.display = 'none';
  document.getElementById('stopEvalBtn').style.display = 'block';
  markerStatusEl.innerHTML = '📊 Evaluación en curso...';
  
  console.log("✅ Evaluación iniciada");
  
  // Actualizar timer cada segundo
  updateEvaluationTimer();
}

// Detener evaluación
function stopEvaluation() {
  if (!evaluationSession.active) return;
  
  evaluationSession.active = false;
  evaluationSession.duration = Date.now() - evaluationSession.startTime;
  
  // Procesar datos y mostrar resultados
  processEvaluationData();
  showResults();
  
  // Actualizar UI
  document.getElementById('startEvalBtn').style.display = 'block';
  document.getElementById('stopEvalBtn').style.display = 'none';
  
  console.log("⏹️ Evaluación finalizada");
}

// Actualizar timer de evaluación
function updateEvaluationTimer() {
  if (!evaluationSession.active) return;
  
  const elapsed = Date.now() - evaluationSession.startTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  
  // Formatear tiempo
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  document.getElementById('sessionTimer').textContent = timeStr;
  
  // Actualizar cada segundo
  setTimeout(updateEvaluationTimer, 1000);
}

// Registrar datos para evaluación
function recordEvaluationData() {
  if (!evaluationSession.active) return;
  
  const currentAngle = parseFloat(angleDisplay.textContent) || 0;
  const currentStability = stabilityScore || 0;
  const currentSpeed = parseFloat(document.getElementById('speed').textContent) || 0;
  const currentApproachSpeed = parseFloat(document.getElementById('approachSpeed').textContent) || 0;
  const currentStraightness = straightnessScore || 0;
  const currentDistance = parseFloat(document.getElementById('dist').textContent) || 0;
  
  // Solo registrar si tenemos datos válidos
  if (!isNaN(currentAngle) && currentAngle > 0) {
    const dataPoint = {
      timestamp: Date.now() - evaluationSession.startTime,
      angle: currentAngle,
      stability: currentStability,
      speed: currentSpeed,
      approachSpeed: currentApproachSpeed,
      straightness: currentStraightness,
      distance: currentDistance
    };
    
    evaluationSession.dataPoints.push(dataPoint);
    
    // Calcular puntajes en tiempo real
    const optimal = weldConfig.optimalAngle[weldConfig.type];
    const angleScore = calculateAngleScore(currentAngle, optimal);
    
    evaluationSession.metrics.angleScores.push(angleScore);
    evaluationSession.metrics.stabilityScores.push(currentStability);
    evaluationSession.metrics.speedValues.push(currentSpeed);
    evaluationSession.metrics.approachSpeedValues.push(Math.abs(currentApproachSpeed));
    evaluationSession.metrics.straightnessValues.push(currentStraightness);
    evaluationSession.metrics.distanceValues.push(currentDistance);
    
    // Actualizar puntaje en UI
    updateLiveScore();
  }
}

// Calcular puntaje del ángulo
function calculateAngleScore(angle, optimal) {
  if (angle >= optimal.min && angle <= optimal.max) {
    return 100;
  } else if (angle < optimal.min) {
    const diff = optimal.min - angle;
    return Math.max(0, 100 - (diff * 20));
  } else {
    const diff = angle - optimal.max;
    return Math.max(0, 100 - (diff * 20));
  }
}

// Actualizar puntaje en vivo
function updateLiveScore() {
  if (evaluationSession.metrics.angleScores.length === 0) return;
  
  const avgAngleScore = evaluationSession.metrics.angleScores.reduce((a, b) => a + b, 0) / evaluationSession.metrics.angleScores.length;
  const avgStability = evaluationSession.metrics.stabilityScores.reduce((a, b) => a + b, 0) / evaluationSession.metrics.stabilityScores.length;
  
  const liveScore = Math.round((avgAngleScore * 0.6) + (avgStability * 0.4));
  
  document.getElementById('evalScore').textContent = liveScore;
  document.getElementById('evalScore').style.color = getScoreColor(liveScore);
}

// Obtener color según puntaje
function getScoreColor(score) {
  if (score >= 80) return '#0f0';
  if (score >= 60) return '#ff0';
  return '#f00';
}

// Procesar datos de evaluación
function processEvaluationData() {
  if (evaluationSession.dataPoints.length === 0) return;
  
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  const optimalDist = weldConfig.optimalDistance[weldConfig.type];
  const optimalSpeed = weldConfig.optimalSpeed[weldConfig.type];
  
  // Calcular métricas
  const angleScores = evaluationSession.metrics.angleScores;
  const stabilityScores = evaluationSession.metrics.stabilityScores;
  const speedValues = evaluationSession.metrics.speedValues;
  const approachSpeedValues = evaluationSession.metrics.approachSpeedValues;
  const straightnessValues = evaluationSession.metrics.straightnessValues;
  const distanceValues = evaluationSession.metrics.distanceValues;
  
  // 1. Puntaje de ángulo
  const avgAngleScore = angleScores.reduce((a, b) => a + b, 0) / angleScores.length;
  const angleInOptimalRange = angleScores.filter(score => score === 100).length / angleScores.length * 100;
  
  // 2. Puntaje de estabilidad
  const avgStability = stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length;
  
  // 3. Puntaje de velocidad de traslación
  const avgSpeed = speedValues.reduce((a, b) => a + b, 0) / speedValues.length;
  const speedScore = calculateSpeedScore(avgSpeed, optimalSpeed, weldConfig.type);
  
  // 4. Puntaje de velocidad de aproximación
  const avgApproachSpeed = approachSpeedValues.reduce((a, b) => a + b, 0) / approachSpeedValues.length;
  const approachScore = calculateApproachScore(avgApproachSpeed, weldConfig.type);
  
  // 5. Puntaje de rectitud
  const avgStraightness = straightnessValues.reduce((a, b) => a + b, 0) / straightnessValues.length;
  
  // 6. Puntaje de distancia
  const avgDistance = distanceValues.reduce((a, b) => a + b, 0) / distanceValues.length;
  const distanceScore = calculateDistanceScore(avgDistance, optimalDist, weldConfig.type);
  
  // Puntaje final - PESOS AJUSTADOS
  let finalScore = 0;
  if (weldConfig.type === 'electrodo') {
    // Para electrodo: énfasis en aproximación y rectitud
    finalScore = Math.round(
      (avgAngleScore * 0.2) +
      (avgStability * 0.15) +
      (speedScore * 0.15) +
      (approachScore * 0.25) +
      (avgStraightness * 0.15) +
      (distanceScore * 0.1)
    );
  } else {
    // Para MIG/TIG: énfasis en velocidad y rectitud
    finalScore = Math.round(
      (avgAngleScore * 0.25) +
      (avgStability * 0.2) +
      (speedScore * 0.2) +
      (approachScore * 0.1) +
      (avgStraightness * 0.15) +
      (distanceScore * 0.1)
    );
  }
  
  // Guardar resultados
  evaluationSession.results = {
    duration: evaluationSession.duration,
    finalScore: finalScore,
    weldType: weldConfig.type,
    metrics: {
      angle: {
        score: Math.round(avgAngleScore),
        optimalPercentage: Math.round(angleInOptimalRange)
      },
      stability: {
        score: Math.round(avgStability)
      },
      speed: {
        score: Math.round(speedScore),
        average: avgSpeed.toFixed(1)
      },
      approach: {
        score: Math.round(approachScore),
        average: avgApproachSpeed.toFixed(1)
      },
      straightness: {
        score: Math.round(avgStraightness)
      },
      distance: {
        score: Math.round(distanceScore),
        average: avgDistance.toFixed(1)
      }
    }
  };
  
  // Generar recomendaciones
  evaluationSession.recommendations = generateRecommendations(evaluationSession.results);
}

// Calcular puntaje de velocidad de traslación
function calculateSpeedScore(speed, optimal, weldType) {
  if (weldType === 'electrodo') {
    // Electrodo: más lento y constante
    if (speed >= optimal.min && speed <= optimal.max) {
      return 90 + (Math.random() * 5);
    } else if (speed >= optimal.min * 0.7 && speed <= optimal.max * 1.3) {
      return 70 + (Math.random() * 10);
    } else {
      return 40 + (Math.random() * 20);
    }
  } else {
    // MIG/TIG
    if (speed >= optimal.min && speed <= optimal.max) {
      return 90 + (Math.random() * 5);
    } else if (speed >= optimal.min * 0.8 && speed <= optimal.max * 1.2) {
      return 75 + (Math.random() * 10);
    } else if (speed >= optimal.min * 0.6 && speed <= optimal.max * 1.4) {
      return 55 + (Math.random() * 10);
    } else {
      return 35 + (Math.random() * 20);
    }
  }
}

// Calcular puntaje de velocidad de aproximación
function calculateApproachScore(speed, weldType) {
  if (weldType === 'electrodo') {
    // Para electrodo, ideal: -0.3 cm/s (acercamiento constante)
    if (speed >= 0.1 && speed <= 0.5) {
      return 85 + (Math.random() * 10);
    } else if (speed >= 0.05 && speed <= 0.7) {
      return 65 + (Math.random() * 10);
    } else {
      return 40 + (Math.random() * 15);
    }
  } else {
    // Para MIG/TIG, ideal: mínima aproximación (< 0.5 cm/s)
    if (speed < 0.3) {
      return 90 + (Math.random() * 5);
    } else if (speed < 0.6) {
      return 70 + (Math.random() * 10);
    } else if (speed < 1.0) {
      return 50 + (Math.random() * 10);
    } else {
      return 30 + (Math.random() * 15);
    }
  }
}

// Calcular puntaje de distancia
function calculateDistanceScore(distance, optimalDist, weldType) {
  const idealDistance = (optimalDist.min + optimalDist.max) / 2;
  const diff = Math.abs(distance - idealDistance);
  const range = optimalDist.max - optimalDist.min;
  
  if (weldType === 'electrodo') {
    // Para electrodo, más tolerante
    if (diff <= range * 0.3) {
      return 85 + (Math.random() * 10);
    } else if (diff <= range * 0.6) {
      return 65 + (Math.random() * 10);
    } else if (diff <= range) {
      return 45 + (Math.random() * 10);
    } else {
      return 25 + (Math.random() * 10);
    }
  } else {
    // Para MIG/TIG
    if (diff <= range * 0.2) {
      return 90 + (Math.random() * 5);
    } else if (diff <= range * 0.4) {
      return 75 + (Math.random() * 10);
    } else if (diff <= range * 0.6) {
      return 55 + (Math.random() * 10);
    } else {
      return 35 + (Math.random() * 10);
    }
  }
}

// Generar recomendaciones
function generateRecommendations(results) {
  const recommendations = [];
  const metrics = results.metrics;
  const weldType = results.weldType;
  
  // Recomendaciones basadas en ángulo
  if (metrics.angle.score < 70) {
    if (weldType === 'electrodo') {
      recommendations.push("Mantén el ángulo entre 5°-15° para electrodo");
    } else if (weldType === 'tig') {
      recommendations.push("Para TIG, ángulo ideal: 10°-20°");
    } else {
      recommendations.push("Para MIG/MAG, ángulo ideal: 15°-25°");
    }
  }
  
  // Recomendaciones basadas en estabilidad
  if (metrics.stability.score < 70) {
    recommendations.push("Apoya el codo para mayor estabilidad");
  }
  
  // Recomendaciones basadas en velocidad de traslación
  if (metrics.speed.score < 70) {
    if (weldType === 'electrodo') {
      recommendations.push("Electrodo: avanza a 0.3-0.8 cm/s");
    } else if (weldType === 'tig') {
      recommendations.push("TIG: velocidad ideal 3-10 cm/s");
    } else {
      recommendations.push("MIG: velocidad ideal 5-15 cm/s");
    }
  }
  
  // Recomendaciones basadas en velocidad de aproximación
  if (metrics.approach.score < 70) {
    if (weldType === 'electrodo') {
      recommendations.push("Con electrodo, acerca la antorcha gradualmente (-0.1 a -0.5 cm/s)");
    } else {
      recommendations.push("Mantén distancia constante (variación < 0.5 cm/s)");
    }
  }
  
  // Recomendaciones basadas en rectitud
  if (metrics.straightness.score < 70) {
    recommendations.push("Practica mantener una línea recta al soldar");
  }
  
  // Recomendaciones basadas en distancia
  if (metrics.distance.score < 70) {
    if (weldType === 'electrodo') {
      recommendations.push("Electrodo: mantén 5-10 cm de distancia");
    } else if (weldType === 'tig') {
      recommendations.push("TIG: distancia ideal 8-15 cm");
    } else {
      recommendations.push("MIG: distancia ideal 15-25 cm");
    }
  }
  
  // Recomendaciones generales
  if (recommendations.length === 0) {
    recommendations.push("¡Excelente técnica! Mantén la práctica");
  }
  
  return recommendations;
}

// Mostrar resultados
function showResults() {
  if (!evaluationSession.results) {
    alert("Primero completa una sesión de evaluación");
    return;
  }
  
  const results = evaluationSession.results;
  const metrics = results.metrics;
  
  // Actualizar resumen
  const minutes = Math.floor(results.duration / 60000);
  const seconds = Math.floor((results.duration % 60000) / 1000);
  document.getElementById('totalTime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  document.getElementById('finalScore').textContent = results.finalScore;
  
  // Determinar nivel de habilidad
  let skillLevel = "Principiante";
  if (results.finalScore >= 80) skillLevel = "Experto";
  else if (results.finalScore >= 60) skillLevel = "Intermedio";
  document.getElementById('skillLevel').textContent = skillLevel;
  
  // Actualizar métricas detalladas
  updateMetric('angle', metrics.angle.score, getAngleFeedback(metrics.angle.score, results.weldType));
  updateMetric('stability', metrics.stability.score, getStabilityFeedback(metrics.stability.score));
  updateMetric('speed', metrics.speed.score, getSpeedFeedback(metrics.speed, results.weldType));
  updateMetric('approach', metrics.approach.score, getApproachFeedback(metrics.approach, results.weldType));
  updateMetric('straightness', metrics.straightness.score, getStraightnessFeedback(metrics.straightness.score));
  updateMetric('distance', metrics.distance.score, getDistanceFeedback(metrics.distance, results.weldType));
  
  // Actualizar recomendaciones
  const recommendationsList = document.getElementById('recommendationsList');
  recommendationsList.innerHTML = '';
  
  evaluationSession.recommendations.forEach(rec => {
    const li = document.createElement('li');
    li.textContent = rec;
    recommendationsList.appendChild(li);
  });
  
  // Mostrar modal
  document.getElementById('resultsModal').style.display = 'flex';
}

// Actualizar una métrica en el modal
function updateMetric(metricName, score, feedback) {
  document.getElementById(`${metricName}Score`).textContent = `${score}%`;
  document.getElementById(`${metricName}Bar`).style.width = `${score}%`;
  document.getElementById(`${metricName}Feedback`).textContent = feedback;
}

// Obtener feedback para ángulo
function getAngleFeedback(score, weldType) {
  let typeName = weldType === 'electrodo' ? "electrodo" : weldType === 'tig' ? "TIG" : "MIG/MAG";
  
  if (score >= 90) return `Ángulo perfecto para ${typeName}`;
  if (score >= 70) return `Buen control del ángulo en ${typeName}`;
  if (score >= 50) return `Ángulo aceptable para ${typeName}`;
  return `Necesita mejorar ángulo para ${typeName}`;
}

// Obtener feedback para estabilidad
function getStabilityFeedback(score) {
  if (score >= 85) return "Muy estable, mano firme";
  if (score >= 65) return "Estabilidad aceptable";
  if (score >= 45) return "Inestabilidad notable";
  return "Muy inestable, necesita entrenamiento";
}

// Obtener feedback para velocidad
function getSpeedFeedback(speedData, weldType) {
  const score = speedData.score;
  const avg = speedData.average;
  
  if (weldType === 'electrodo') {
    if (score >= 80) return `Ritmo perfecto (${avg} cm/s)`;
    if (score >= 60) return `Ritmo aceptable (${avg} cm/s)`;
    return `Ritmo irregular (${avg} cm/s)`;
  } else {
    if (score >= 80) return `Velocidad óptima (${avg} cm/s)`;
    if (score >= 60) return `Velocidad moderada (${avg} cm/s)`;
    return `Velocidad inadecuada (${avg} cm/s)`;
  }
}

// Obtener feedback para aproximación
function getApproachFeedback(approachData, weldType) {
  const score = approachData.score;
  const avg = approachData.average;
  
  if (weldType === 'electrodo') {
    if (score >= 80) return `Aproximación constante (${avg} cm/s)`;
    if (score >= 60) return `Aproximación aceptable (${avg} cm/s)`;
    return `Aproximación irregular (${avg} cm/s)`;
  } else {
    if (score >= 80) return `Distancia muy constante`;
    if (score >= 60) return `Distancia aceptable`;
    return `Variación excesiva en distancia`;
  }
}

// Obtener feedback para rectitud
function getStraightnessFeedback(score) {
  if (score >= 85) return "Línea muy recta";
  if (score >= 65) return "Rectitud aceptable";
  if (score >= 45) return "Línea algo curva";
  return "Necesita practicar línea recta";
}

// Obtener feedback para distancia
function getDistanceFeedback(distanceData, weldType) {
  const score = distanceData.score;
  const avg = distanceData.average;
  
  if (weldType === 'electrodo') {
    if (score >= 80) return `Distancia óptima (${avg} cm)`;
    if (score >= 60) return `Distancia aceptable (${avg} cm)`;
    return `Distancia inadecuada (${avg} cm)`;
  } else {
    if (score >= 80) return `Distancia perfecta (${avg} cm)`;
    if (score >= 60) return `Distancia adecuada (${avg} cm)`;
    return `Distancia incorrecta (${avg} cm)`;
  }
}

// Ocultar resultados
function hideResults() {
  document.getElementById('resultsModal').style.display = 'none';
}

// Iniciar nueva sesión
function startNewSession() {
  hideResults();
  
  // Reiniciar evaluación
  evaluationSession = {
    active: false,
    startTime: null,
    duration: 0,
    dataPoints: [],
    metrics: {
      angleScores: [],
      stabilityScores: [],
      speedValues: [],
      approachSpeedValues: [],
      straightnessValues: [],
      distanceValues: []
    }
  };
  
  // Reiniciar historiales
  pathHistory = [];
  positionHistory = [];
  electrodoConsumption = 0;
  
  // Actualizar UI
  document.getElementById('startEvalBtn').style.display = 'block';
  document.getElementById('stopEvalBtn').style.display = 'none';
  document.getElementById('sessionTimer').textContent = '00:00';
  document.getElementById('evalScore').textContent = '0';
  document.getElementById('evalScore').style.color = 'white';
  
  console.log("🔄 Nueva sesión preparada");
}

// Compartir resultados
function shareResults() {
  if (!evaluationSession.results) return;
  
  const results = evaluationSession.results;
  const metrics = results.metrics;
  const weldTypeName = results.weldType === 'electrodo' ? 'Electrodo' : 
                      results.weldType === 'tig' ? 'TIG' : 'MIG/MAG';
  
  const text = `🏆 Resultados Simulador Soldadura ${weldTypeName}:
⏱️ Duración: ${Math.floor(results.duration / 1000)}s
📊 Puntaje: ${results.finalScore}/100
🎯 Ángulo: ${metrics.angle.score}%
🤲 Estabilidad: ${metrics.stability.score}%
🚀 Vel. Traslación: ${metrics.speed.score}%
⬇️ Vel. Aproximación: ${metrics.approach.score}%
📐 Rectitud: ${metrics.straightness.score}%
📏 Distancia: ${metrics.distance.score}%

#Soldadura #Simulador #Entrenamiento #${weldTypeName}`;
  
  if (navigator.share) {
    navigator.share({
      title: `Mis Resultados de Soldadura ${weldTypeName}`,
      text: text
    }).catch(console.error);
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert("Resultados copiados al portapapeles");
    }).catch(() => {
      prompt("Copia estos resultados:", text);
    });
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
