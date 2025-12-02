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
  }
};

// Variables de seguimiento
let prevTime = 0;
let prevDistance = 25;
let angleHistory = [];
let stabilityScore = 0;

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
    distanceValues: []
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
});

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
  } else if (roundedAngle > optimal.max) {
    // Ángulo demasiado alto - sonido GRAVE (pitido bajo)
    playAngleSound('low');
    lastSoundTime = Date.now();
  }
}

// Reproducir sonido según ángulo - MEJORADO
function playAngleSound(type) {
  if (!weldConfig.soundEnabled) return;
  
  const sound = type === 'high' ? document.getElementById('beepHigh') : document.getElementById('beepLow');
  if (sound) {
    sound.currentTime = 0;
    sound.volume = 0.5; // Volumen moderado
    sound.play().catch(e => console.log("Error reproduciendo sonido:", e));
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
}

// ============================================
// FUNCIONES PRINCIPALES DE LA APLICACIÓN
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
    
    // Dibujar guías visuales
    drawVisualGuides();
    
    // Actualizar estabilidad
    updateStability();
    
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
  
  // Simular distancia y velocidad
  const timeVariation = Math.sin(now / 1500) * 0.3 + 0.7;
  const simulatedDistance = 20 + timeVariation * 10;
  
  let simulatedSpeed = 0;
  if (prevTime > 0) {
    const dt = (now - prevTime) / 1000;
    const distanceChange = Math.abs(simulatedDistance - prevDistance);
    simulatedSpeed = dt > 0 ? distanceChange / dt : 0;
  }
  
  // Actualizar UI
  document.getElementById('dist').textContent = simulatedDistance.toFixed(1) + ' cm';
  document.getElementById('speed').textContent = simulatedSpeed.toFixed(1) + ' cm/s';
  
  // Guardar para siguiente frame
  prevDistance = simulatedDistance;
  prevTime = now;
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

// ============================================
// SISTEMA DE EVALUACIÓN TEMPORAL
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
      distanceValues: []
    }
  };
  
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
  const currentDistance = parseFloat(document.getElementById('dist').textContent) || 0;
  
  // Solo registrar si tenemos datos válidos
  if (!isNaN(currentAngle) && currentAngle > 0) {
    const dataPoint = {
      timestamp: Date.now() - evaluationSession.startTime,
      angle: currentAngle,
      stability: currentStability,
      speed: currentSpeed,
      distance: currentDistance
    };
    
    evaluationSession.dataPoints.push(dataPoint);
    
    // Calcular puntaje en tiempo real
    const optimal = weldConfig.optimalAngle[weldConfig.type];
    const angleScore = calculateAngleScore(currentAngle, optimal);
    
    evaluationSession.metrics.angleScores.push(angleScore);
    evaluationSession.metrics.stabilityScores.push(currentStability);
    evaluationSession.metrics.speedValues.push(currentSpeed);
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
  
  const liveScore = Math.round((avgAngleScore * 0.7) + (avgStability * 0.3));
  
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
  
  // Calcular métricas
  const angleScores = evaluationSession.metrics.angleScores;
  const stabilityScores = evaluationSession.metrics.stabilityScores;
  const speedValues = evaluationSession.metrics.speedValues;
  const distanceValues = evaluationSession.metrics.distanceValues;
  
  // 1. Puntaje de ángulo
  const avgAngleScore = angleScores.reduce((a, b) => a + b, 0) / angleScores.length;
  const angleInOptimalRange = angleScores.filter(score => score === 100).length / angleScores.length * 100;
  
  // 2. Puntaje de estabilidad
  const avgStability = stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length;
  
  // 3. Puntaje de velocidad (consistencia)
  const speedScore = calculateSpeedScore(speedValues);
  
  // 4. Puntaje de distancia
  const avgDistance = distanceValues.reduce((a, b) => a + b, 0) / distanceValues.length;
  const distanceScore = calculateDistanceScore(avgDistance);
  
  // Puntaje final
  const finalScore = Math.round(
    (avgAngleScore * 0.4) +
    (avgStability * 0.3) +
    (speedScore * 0.15) +
    (distanceScore * 0.15)
  );
  
  // Guardar resultados
  evaluationSession.results = {
    duration: evaluationSession.duration,
    finalScore: finalScore,
    metrics: {
      angle: {
        score: Math.round(avgAngleScore),
        optimalPercentage: Math.round(angleInOptimalRange)
      },
      stability: {
        score: Math.round(avgStability)
      },
      speed: {
        score: Math.round(speedScore)
      },
      distance: {
        score: Math.round(distanceScore),
        average: Math.round(avgDistance * 10) / 10
      }
    }
  };
  
  // Generar recomendaciones
  evaluationSession.recommendations = generateRecommendations(evaluationSession.results);
}

// Calcular puntaje de velocidad
function calculateSpeedScore(speedValues) {
  const validSpeeds = speedValues.filter(v => v > 0 && v < 50);
  if (validSpeeds.length < 2) return 50;
  
  const avgSpeed = validSpeeds.reduce((a, b) => a + b) / validSpeeds.length;
  
  // Velocidad ideal: 5-15 cm/s
  if (avgSpeed >= 5 && avgSpeed <= 15) {
    return 85 + (Math.random() * 10);
  } else if (avgSpeed >= 3 && avgSpeed <= 20) {
    return 70 + (Math.random() * 10);
  } else {
    return 40 + (Math.random() * 20);
  }
}

// Calcular puntaje de distancia
function calculateDistanceScore(distance) {
  const idealDistance = 20;
  const diff = Math.abs(distance - idealDistance);
  
  if (diff <= 5) return 90 + (Math.random() * 10);
  if (diff <= 10) return 70 + (Math.random() * 10);
  if (diff <= 15) return 50 + (Math.random() * 10);
  return 30 + (Math.random() * 10);
}

// Generar recomendaciones
function generateRecommendations(results) {
  const recommendations = [];
  const metrics = results.metrics;
  
  // Recomendaciones basadas en ángulo
  if (metrics.angle.score < 70) {
    recommendations.push("Practica mantener el ángulo entre 15°-25° para soldadura MIG");
  }
  
  // Recomendaciones basadas en estabilidad
  if (metrics.stability.score < 70) {
    recommendations.push("Mejora la estabilidad de tu mano apoyando el codo");
  }
  
  // Recomendaciones basadas en velocidad
  if (metrics.speed.score < 70) {
    recommendations.push("Mantén una velocidad constante de 5-15 cm/s");
  }
  
  // Recomendaciones basadas en distancia
  if (metrics.distance.score < 70) {
    recommendations.push("Mantén la antorcha a 15-25 cm de la pieza");
  }
  
  // Recomendaciones generales si todo está bien
  if (recommendations.length === 0) {
    recommendations.push("¡Excelente técnica! Mantén la práctica para perfeccionar");
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
  updateMetric('angle', metrics.angle.score, getAngleFeedback(metrics.angle.score));
  updateMetric('stability', metrics.stability.score, getStabilityFeedback(metrics.stability.score));
  updateMetric('speed', metrics.speed.score, getSpeedFeedback(metrics.speed.score));
  updateMetric('distance', metrics.distance.score, getDistanceFeedback(metrics.distance.score, metrics.distance.average));
  
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
function getAngleFeedback(score) {
  if (score >= 90) return "Ángulo perfectamente mantenido";
  if (score >= 70) return "Buen control del ángulo";
  if (score >= 50) return "Necesita práctica para mantener ángulo";
  return "Requiere mucha práctica en control de ángulo";
}

// Obtener feedback para estabilidad
function getStabilityFeedback(score) {
  if (score >= 85) return "Muy estable, mano firme";
  if (score >= 65) return "Estabilidad aceptable";
  if (score >= 45) return "Inestabilidad notable";
  return "Muy inestable, necesita entrenamiento";
}

// Obtener feedback para velocidad
function getSpeedFeedback(score) {
  if (score >= 80) return "Velocidad constante y óptima";
  if (score >= 60) return "Velocidad moderada";
  return "Velocidad variable, practica movimientos suaves";
}

// Obtener feedback para distancia
function getDistanceFeedback(score, avgDistance) {
  if (score >= 80) return `Distancia óptima (${avgDistance.toFixed(1)} cm)`;
  if (score >= 60) return `Distancia aceptable (${avgDistance.toFixed(1)} cm)`;
  return `Distancia inadecuada (${avgDistance.toFixed(1)} cm)`;
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
      distanceValues: []
    }
  };
  
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
  const text = `🏆 Resultados Simulador Soldadura:
⏱️ Duración: ${Math.floor(results.duration / 1000)}s
📊 Puntaje: ${results.finalScore}/100
🎯 Ángulo: ${results.metrics.angle.score}%
🤲 Estabilidad: ${results.metrics.stability.score}%
🚀 Velocidad: ${results.metrics.speed.score}%
📏 Distancia: ${results.metrics.distance.score}%

#Soldadura #Simulador #Entrenamiento`;
  
  if (navigator.share) {
    navigator.share({
      title: 'Mis Resultados de Soldadura',
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
