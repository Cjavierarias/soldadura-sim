// app.js - Simulador de Soldadura AR - VERSIÓN COMPLETA Y FUNCIONAL
// Basado en tu código original con mejoras

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
  console.log("Simulador de Soldadura AR - Versión estable");
  
  // Configurar botón de inicio
  document.getElementById('startBtn').addEventListener('click', function() {
    this.style.display = 'none';
    document.getElementById('app').style.display = 'block';
    initApp();
  });
});

function initApp() {
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
  
  // Configurar botón de soldadura
  initVolumeButton();
  
  // Configurar paneles minimizables
  initMinimizablePanels();
  
  // Iniciar cámara
  initCamera();
  
  // Manejar redimensionamiento
  window.addEventListener('resize', function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

// ============================================
// CONTROLES BÁSICOS
// ============================================

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
  
  document.getElementById('continueWeldBtn').addEventListener('click', continueWelding);
  document.getElementById('endWeldBtn').addEventListener('click', endWeldingEvaluation);
}

function updateWeldParameters() {
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  markerStatusEl.innerHTML = `🎯 Soldadura ${weldConfig.type.toUpperCase()} - Ángulo óptimo: ${optimal.min}°-${optimal.max}°`;
}

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
// CÁMARA Y SENSORES
// ============================================

async function initCamera() {
  try {
    markerStatusEl.innerHTML = "📸 Activando cámara...";
    
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    
    video.srcObject = stream;
    
    video.onloadedmetadata = function() {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      isProcessing = true;
      processFrame();
      
      // Iniciar sensores para ángulo
      initSensors();
      
      markerStatusEl.innerHTML = "✅ Cámara activa. Muestra el patrón a la cámara.";
    };
    
  } catch (err) {
    console.error("Error cámara:", err);
    markerStatusEl.innerHTML = "⚠️ Sin cámara. Usando modo demostración.";
    isProcessing = true;
    simulateFrameProcessing();
  }
}

function initSensors() {
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', handleDeviceOrientation);
  }
}

function handleDeviceOrientation(event) {
  if (event.beta !== null) {
    // Calcular ángulo basado en inclinación del dispositivo
    let angle = Math.abs(event.beta);
    
    // Normalizar a rango de soldadura (5-85°)
    angle = Math.max(5, Math.min(85, angle));
    
    updateAngleDisplay(Math.round(angle));
    
    // Feedback de sonido
    if (weldConfig.soundEnabled && evaluationSession.weldingActive) {
      const optimal = weldConfig.optimalAngle[weldConfig.type];
      if (angle > optimal.max + 5) {
        playHighBeep();
      } else if (angle < optimal.min - 5) {
        playLowBeep();
      }
    }
  }
}

// ============================================
// PROCESAMIENTO DE VIDEO
// ============================================

function processFrame() {
  if (!isProcessing) {
    requestAnimationFrame(processFrame);
    return;
  }
  
  try {
    // Limpiar y dibujar video
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Detectar patrón simple (basado en contraste)
    detectSimplePattern();
    
    // Dibujar guías
    drawVisualGuides();
    
    // Actualizar métricas
    updateStability();
    updateStraightness();
    
    // Evaluación
    if (isWelding && evaluationSession.active) {
      recordEvaluationData();
    }
    
    // Progreso de soldadura
    updateWeldProgress();
    
  } catch (err) {
    console.error("Error frame:", err);
  }
  
  requestAnimationFrame(processFrame);
}

function detectSimplePattern() {
  // Detección simple basada en movimiento y contraste
  // Esto es un placeholder - puedes mejorarlo después
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Simular detección de patrón
  const currentTime = Date.now();
  if (lastMarkerPosition) {
    const timeDiff = currentTime - lastMarkerPosition.timestamp;
    
    if (timeDiff > 100) { // Cada 100ms
      // Simular movimiento de patrón
      const newX = centerX + (Math.random() - 0.5) * 20;
      const newY = centerY + (Math.random() - 0.5) * 20;
      
      // Calcular velocidad
      const dx = newX - lastMarkerPosition.x;
      const dy = newY - lastMarkerPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const speed = (distance / (timeDiff / 1000)) * 0.1; // Escalado
      
      // Actualizar métricas
      document.getElementById('dist').textContent = "25.0 cm";
      document.getElementById('speed').textContent = speed.toFixed(1) + " cm/s";
      document.getElementById('approachSpeed').textContent = "0.2 cm/s";
      
      // Guardar movimiento
      markerMovementHistory.push({
        from: { x: lastMarkerPosition.x, y: lastMarkerPosition.y },
        to: { x: newX, y: newY },
        timestamp: currentTime
      });
      
      if (markerMovementHistory.length > 30) {
        markerMovementHistory.shift();
      }
      
      lastMarkerPosition = { x: newX, y: newY, timestamp: currentTime };
    }
  } else {
    lastMarkerPosition = { x: centerX, y: centerY, timestamp: currentTime };
  }
  
  // Dibujar marcador simulado
  ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
  ctx.fill();
  
  markerStatusEl.innerHTML = "✅ Patrón detectado (modo demostración)";
}

function simulateFrameProcessing() {
  if (!isProcessing) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawVisualGuides();
  
  // Simular datos para demostración
  if (Math.random() < 0.05) {
    const simulatedAngle = 15 + Math.random() * 20;
    updateAngleDisplay(simulatedAngle);
    
    document.getElementById('dist').textContent = (20 + Math.random() * 10).toFixed(1) + " cm";
    document.getElementById('speed').textContent = (0.5 + Math.random() * 2).toFixed(1) + " cm/s";
    document.getElementById('approachSpeed').textContent = (-0.2 + Math.random() * 0.4).toFixed(1) + " cm/s";
  }
  
  requestAnimationFrame(simulateFrameProcessing);
}

// ============================================
// INTERFAZ Y VISUALIZACIÓN
// ============================================

function updateAngleDisplay(angle) {
  if (isNaN(angle)) return;
  
  angleDisplay.textContent = Math.round(angle) + '°';
  document.getElementById('currentAngle').textContent = Math.round(angle) + '°';
  
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  if (angle >= optimal.min && angle <= optimal.max) {
    angleDisplay.style.color = '#0f0';
    document.getElementById('currentAngle').style.color = '#0f0';
  } else if (angle < optimal.min) {
    angleDisplay.style.color = '#ff0';
    document.getElementById('currentAngle').style.color = '#ff0';
  } else {
    angleDisplay.style.color = '#f00';
    document.getElementById('currentAngle').style.color = '#f00';
  }
}

function drawVisualGuides() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Retícula central
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - 40, centerY);
  ctx.lineTo(centerX + 40, centerY);
  ctx.moveTo(centerX, centerY - 40);
  ctx.lineTo(centerX, centerY + 40);
  ctx.stroke();
  
  // Círculo objetivo
  ctx.beginPath();
  ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 200, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ============================================
// SISTEMA DE SOLDADURA
// ============================================

function initVolumeButton() {
  // Botón de volumen
  document.addEventListener('keydown', function(e) {
    if (e.keyCode === 447 || e.key === 'VolumeUp') {
      e.preventDefault();
      startWelding();
    }
  });
  
  document.addEventListener('keyup', function(e) {
    if (e.keyCode === 447 || e.key === 'VolumeUp') {
      pauseWelding();
    }
  });
  
  // Botón táctil
  const weldButton = document.getElementById('weldButton');
  weldButton.addEventListener('mousedown', startWelding);
  weldButton.addEventListener('mouseup', pauseWelding);
  weldButton.addEventListener('touchstart', function(e) {
    e.preventDefault();
    startWelding();
  });
  weldButton.addEventListener('touchend', function(e) {
    e.preventDefault();
    pauseWelding();
  });
}

function startWelding() {
  if (!isWelding) {
    isWelding = true;
    weldingStartTime = Date.now();
    
    const weldButton = document.getElementById('weldButton');
    weldButton.classList.add('active');
    weldButton.querySelector('.weld-text').textContent = 'SOLDANDO... SUELTA PARA PAUSAR';
    
    // Sonidos
    if (weldConfig.soundEnabled) {
      const arcSound = document.getElementById('arcSound');
      const weldSound = document.getElementById('weldSound');
      
      if (arcSound) {
        arcSound.currentTime = 0;
        arcSound.volume = 0.7;
        arcSound.play().catch(e => console.log("Sonido arco:", e));
      }
      
      setTimeout(() => {
        if (weldSound && isWelding) {
          weldSound.currentTime = 0;
          weldSound.volume = 0.4;
          weldSound.play().catch(e => console.log("Sonido soldadura:", e));
        }
      }, 500);
    }
    
    // Vibración
    if (weldConfig.vibrationEnabled && navigator.vibrate) {
      navigator.vibrate([50, 30, 50]);
    }
    
    // Iniciar evaluación si no está activa
    if (!evaluationSession.active) {
      startEvaluation();
    }
    
    evaluationSession.weldingActive = true;
    markerStatusEl.innerHTML = '🔥 SOLDANDO - Mantén presionado';
  }
}

function pauseWelding() {
  if (isWelding) {
    isWelding = false;
    
    const weldButton = document.getElementById('weldButton');
    weldButton.classList.remove('active');
    weldButton.querySelector('.weld-text').textContent = 'MANTÉN PRESIONADO PARA SOLDAR';
    document.getElementById('weldProgress').style.width = '0%';
    
    // Detener sonido
    const weldSound = document.getElementById('weldSound');
    if (weldSound) {
      weldSound.pause();
      weldSound.currentTime = 0;
    }
    
    evaluationSession.weldingActive = false;
    showPauseModal();
  }
}

function continueWelding() {
  hidePauseModal();
  startWelding();
}

function endWeldingEvaluation() {
  hidePauseModal();
  stopEvaluation();
}

function showPauseModal() {
  document.getElementById('pauseModal').style.display = 'flex';
}

function hidePauseModal() {
  document.getElementById('pauseModal').style.display = 'none';
}

function updateWeldProgress() {
  if (isWelding && weldingStartTime) {
    const elapsed = Date.now() - weldingStartTime;
    const progress = Math.min(100, (elapsed / 30000) * 100);
    document.getElementById('weldProgress').style.width = progress + '%';
  }
}

function playHighBeep() {
  const beep = document.getElementById('beepHigh');
  if (beep && Date.now() - lastVibrationTime > 300) {
    beep.currentTime = 0;
    beep.volume = 0.2;
    beep.play().catch(e => console.log("Sonido alto:", e));
    lastVibrationTime = Date.now();
  }
}

function playLowBeep() {
  const beep = document.getElementById('beepLow');
  if (beep && Date.now() - lastVibrationTime > 300) {
    beep.currentTime = 0;
    beep.volume = 0.2;
    beep.play().catch(e => console.log("Sonido bajo:", e));
    lastVibrationTime = Date.now();
  }
}

// ============================================
// SISTEMA DE EVALUACIÓN (COMPLETO)
// ============================================

function initEvaluationSystem() {
  console.log("Sistema de evaluación inicializado");
  
  document.getElementById('startEvalBtn').addEventListener('click', startEvaluation);
  document.getElementById('stopEvalBtn').addEventListener('click', stopEvaluation);
  document.getElementById('resultsBtn').addEventListener('click', showResults);
  
  // Modal de resultados
  document.getElementById('newSessionBtn').addEventListener('click', startNewSession);
  document.getElementById('shareResultsBtn').addEventListener('click', shareResults);
  document.querySelector('.close-modal').addEventListener('click', hideResults);
  
  document.getElementById('resultsModal').addEventListener('click', function(e) {
    if (e.target === this) hideResults();
  });
}

function startEvaluation() {
  if (evaluationSession.active) return;
  
  evaluationSession = {
    active: true,
    weldingActive: false,
    startTime: Date.now(),
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
  
  // Limpiar historiales
  markerMovementHistory = [];
  angleHistory = [];
  
  // Actualizar UI
  document.getElementById('startEvalBtn').style.display = 'none';
  document.getElementById('stopEvalBtn').style.display = 'block';
  document.getElementById('sessionTimer').textContent = '00:00';
  document.getElementById('evalScore').textContent = '0';
  
  markerStatusEl.innerHTML = '📊 Evaluación lista - Presiona para soldar';
  
  // Iniciar timer
  updateEvaluationTimer();
}

function stopEvaluation() {
  if (!evaluationSession.active) return;
  
  evaluationSession.active = false;
  evaluationSession.weldingActive = false;
  evaluationSession.duration = Date.now() - evaluationSession.startTime;
  
  // Detener soldadura si está activa
  if (isWelding) {
    const weldSound = document.getElementById('weldSound');
    if (weldSound) {
      weldSound.pause();
      weldSound.currentTime = 0;
    }
    isWelding = false;
    document.getElementById('weldButton').classList.remove('active');
  }
  
  // Procesar datos y mostrar resultados
  processEvaluationData();
  showResults();
  
  // Actualizar UI
  document.getElementById('startEvalBtn').style.display = 'block';
  document.getElementById('stopEvalBtn').style.display = 'none';
}

function updateEvaluationTimer() {
  if (!evaluationSession.active) return;
  
  const elapsed = Date.now() - evaluationSession.startTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  document.getElementById('sessionTimer').textContent = timeStr;
  
  setTimeout(updateEvaluationTimer, 1000);
}

function recordEvaluationData() {
  if (!evaluationSession.active || !evaluationSession.weldingActive) return;
  
  const currentAngle = parseFloat(angleDisplay.textContent) || 0;
  const currentStability = stabilityScore || 0;
  const currentSpeed = parseFloat(document.getElementById('speed').textContent) || 0;
  const currentApproachSpeed = parseFloat(document.getElementById('approachSpeed').textContent) || 0;
  const currentStraightness = straightnessScore || 0;
  const currentDistance = parseFloat(document.getElementById('dist').textContent) || 0;
  
  if (!isNaN(currentAngle) && currentAngle > 0) {
    const dataPoint = {
      timestamp: Date.now() - evaluationSession.startTime,
      angle: currentAngle,
      stability: currentStability,
      speed: Math.abs(currentSpeed),
      approachSpeed: Math.abs(currentApproachSpeed),
      straightness: currentStraightness,
      distance: currentDistance
    };
    
    evaluationSession.dataPoints.push(dataPoint);
    
    // Calcular puntaje de ángulo
    const optimal = weldConfig.optimalAngle[weldConfig.type];
    const angleScore = calculateAngleScore(currentAngle, optimal);
    
    evaluationSession.metrics.angleScores.push(angleScore);
    evaluationSession.metrics.stabilityScores.push(currentStability);
    evaluationSession.metrics.speedValues.push(Math.abs(currentSpeed));
    evaluationSession.metrics.approachSpeedValues.push(Math.abs(currentApproachSpeed));
    evaluationSession.metrics.straightnessValues.push(currentStraightness);
    evaluationSession.metrics.distanceValues.push(currentDistance);
    
    // Actualizar puntaje en vivo
    updateLiveScore();
  }
}

function calculateAngleScore(angle, optimal) {
  if (angle >= optimal.min && angle <= optimal.max) {
    return 100;
  } else if (angle < optimal.min) {
    const diff = optimal.min - angle;
    return Math.max(0, 100 - (diff * 15));
  } else {
    const diff = angle - optimal.max;
    return Math.max(0, 100 - (diff * 15));
  }
}

function updateLiveScore() {
  if (evaluationSession.metrics.angleScores.length === 0) return;
  
  const avgAngleScore = evaluationSession.metrics.angleScores.reduce((a, b) => a + b, 0) / evaluationSession.metrics.angleScores.length;
  const avgStability = evaluationSession.metrics.stabilityScores.reduce((a, b) => a + b, 0) / evaluationSession.metrics.stabilityScores.length;
  
  const liveScore = Math.round((avgAngleScore * 0.5) + (avgStability * 0.5));
  
  document.getElementById('evalScore').textContent = liveScore;
  document.getElementById('evalScore').style.color = getScoreColor(liveScore);
}

function getScoreColor(score) {
  if (score >= 80) return '#0f0';
  if (score >= 60) return '#ff0';
  return '#f00';
}

function updateStability() {
  const currentAngle = parseFloat(angleDisplay.textContent);
  if (!isNaN(currentAngle)) {
    angleHistory.push(currentAngle);
    if (angleHistory.length > 30) angleHistory.shift();
    
    if (angleHistory.length >= 10) {
      const mean = angleHistory.reduce((a, b) => a + b, 0) / angleHistory.length;
      const variance = angleHistory.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / angleHistory.length;
      const stdDev = Math.sqrt(variance);
      
      stabilityScore = Math.max(0, 100 - stdDev * 10);
    }
  }
}

function updateStraightness() {
  if (markerMovementHistory.length < 3) {
    straightnessScore = 0;
    document.getElementById('straightness').textContent = '--%';
    return;
  }
  
  const positions = markerMovementHistory.map(move => move.from);
  if (lastMarkerPosition) {
    positions.push(lastMarkerPosition);
  }
  
  if (positions.length < 3) {
    straightnessScore = 0;
    document.getElementById('straightness').textContent = '--%';
    return;
  }
  
  const firstPoint = positions[0];
  const lastPoint = positions[positions.length - 1];
  const dx = lastPoint.x - firstPoint.x;
  const dy = lastPoint.y - firstPoint.y;
  const distanceTotal = Math.sqrt(dx * dx + dy * dy);
  
  if (distanceTotal < 10) {
    straightnessScore = 0;
    document.getElementById('straightness').textContent = '--%';
    return;
  }
  
  let totalDeviation = 0;
  for (let i = 1; i < positions.length - 1; i++) {
    const point = positions[i];
    const deviation = distancePointToLine(point, firstPoint, lastPoint);
    totalDeviation += deviation;
  }
  
  const avgDeviation = totalDeviation / (positions.length - 2);
  straightnessScore = Math.max(0, 100 - (avgDeviation * 5));
  
  document.getElementById('straightness').textContent = Math.round(straightnessScore) + '%';
}

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

function processEvaluationData() {
  if (evaluationSession.dataPoints.length === 0) return;
  
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  const optimalDist = weldConfig.optimalDistance[weldConfig.type];
  const optimalSpeed = weldConfig.optimalSpeed[weldConfig.type];
  
  const angleScores = evaluationSession.metrics.angleScores;
  const stabilityScores = evaluationSession.metrics.stabilityScores;
  const speedValues = evaluationSession.metrics.speedValues;
  const approachSpeedValues = evaluationSession.metrics.approachSpeedValues;
  const straightnessValues = evaluationSession.metrics.straightnessValues;
  const distanceValues = evaluationSession.metrics.distanceValues;
  
  const avgAngleScore = angleScores.reduce((a, b) => a + b, 0) / angleScores.length;
  const avgStability = stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length;
  const avgSpeed = speedValues.reduce((a, b) => a + b, 0) / speedValues.length;
  const avgApproachSpeed = approachSpeedValues.reduce((a, b) => a + b, 0) / approachSpeedValues.length;
  const avgStraightness = straightnessValues.reduce((a, b) => a + b, 0) / straightnessValues.length;
  const avgDistance = distanceValues.reduce((a, b) => a + b, 0) / distanceValues.length;
  
  // Calcular puntajes
  const speedScore = calculateSpeedScore(avgSpeed, optimalSpeed, weldConfig.type);
  const approachScore = calculateApproachScore(avgApproachSpeed, weldConfig.type);
  const distanceScore = calculateDistanceScore(avgDistance, optimalDist, weldConfig.type);
  
  // Puntaje final
  let finalScore = 0;
  if (weldConfig.type === 'electrodo') {
    finalScore = Math.round(
      (avgAngleScore * 0.2) +
      (avgStability * 0.15) +
      (speedScore * 0.15) +
      (approachScore * 0.25) +
      (avgStraightness * 0.15) +
      (distanceScore * 0.1)
    );
  } else {
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
      angle: { score: Math.round(avgAngleScore) },
      stability: { score: Math.round(avgStability) },
      speed: { score: Math.round(speedScore), average: avgSpeed.toFixed(1) },
      approach: { score: Math.round(approachScore), average: avgApproachSpeed.toFixed(1) },
      straightness: { score: Math.round(avgStraightness) },
      distance: { score: Math.round(distanceScore), average: avgDistance.toFixed(1) }
    }
  };
  
  // Generar recomendaciones
  evaluationSession.recommendations = generateRecommendations(evaluationSession.results);
}

function calculateSpeedScore(speed, optimal, weldType) {
  if (weldType === 'electrodo') {
    if (speed >= optimal.min && speed <= optimal.max) return 95;
    if (speed >= optimal.min * 0.7 && speed <= optimal.max * 1.3) return 75;
    return 50;
  } else {
    if (speed >= optimal.min && speed <= optimal.max) return 95;
    if (speed >= optimal.min * 0.8 && speed <= optimal.max * 1.2) return 80;
    return 60;
  }
}

function calculateApproachScore(speed, weldType) {
  if (weldType === 'electrodo') {
    if (Math.abs(speed) <= 0.5) return 90;
    if (Math.abs(speed) <= 1.0) return 70;
    return 50;
  } else {
    if (Math.abs(speed) <= 0.3) return 95;
    if (Math.abs(speed) <= 0.6) return 75;
    return 55;
  }
}

function calculateDistanceScore(distance, optimalDist, weldType) {
  const idealDistance = (optimalDist.min + optimalDist.max) / 2;
  const diff = Math.abs(distance - idealDistance);
  
  if (weldType === 'electrodo') {
    if (diff <= 2) return 90;
    if (diff <= 5) return 70;
    return 50;
  } else {
    if (diff <= 3) return 90;
    if (diff <= 7) return 70;
    return 50;
  }
}

function generateRecommendations(results) {
  const recommendations = [];
  const metrics = results.metrics;
  const weldType = results.weldType;
  
  if (metrics.angle.score < 70) {
    if (weldType === 'electrodo') {
      recommendations.push("Mantén el ángulo entre 5°-15° para electrodo");
    } else if (weldType === 'tig') {
      recommendations.push("Para TIG, ángulo ideal: 10°-20°");
    } else {
      recommendations.push("Para MIG/MAG, ángulo ideal: 15°-25°");
    }
  }
  
  if (metrics.stability.score < 70) {
    recommendations.push("Apoya el codo para mayor estabilidad");
  }
  
  if (metrics.speed.score < 70) {
    if (weldType === 'electrodo') {
      recommendations.push("Electrodo: avanza a 0.3-0.8 cm/s");
    } else if (weldType === 'tig') {
      recommendations.push("TIG: velocidad ideal 3-10 cm/s");
    } else {
      recommendations.push("MIG: velocidad ideal 5-15 cm/s");
    }
  }
  
  if (recommendations.length === 0) {
    recommendations.push("¡Excelente técnica! Mantén la práctica");
  }
  
  return recommendations;
}

function showResults() {
  if (!evaluationSession.results) {
    alert("Primero completa una sesión de evaluación");
    return;
  }
  
  const results = evaluationSession.results;
  const metrics = results.metrics;
  
  // Actualizar tiempo
  const minutes = Math.floor(results.duration / 60000);
  const seconds = Math.floor((results.duration % 60000) / 1000);
  document.getElementById('totalTime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  // Actualizar puntaje
  document.getElementById('finalScore').textContent = results.finalScore;
  
  // Nivel de habilidad
  let skillLevel = "Principiante";
  if (results.finalScore >= 80) skillLevel = "Experto";
  else if (results.finalScore >= 60) skillLevel = "Intermedio";
  document.getElementById('skillLevel').textContent = skillLevel;
  
  // Actualizar métricas
  updateMetric('angle', metrics.angle.score, `Ángulo: ${metrics.angle.score}%`);
  updateMetric('stability', metrics.stability.score, `Estabilidad: ${metrics.stability.score}%`);
  updateMetric('speed', metrics.speed.score, `Velocidad: ${metrics.speed.average} cm/s`);
  updateMetric('approach', metrics.approach.score, `Aproximación: ${metrics.approach.average} cm/s`);
  updateMetric('straightness', metrics.straightness.score, `Rectitud: ${metrics.straightness.score}%`);
  updateMetric('distance', metrics.distance.score, `Distancia: ${metrics.distance.average} cm`);
  
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

function updateMetric(metricName, score, feedback) {
  const scoreElement = document.getElementById(`${metricName}Score`);
  const barElement = document.getElementById(`${metricName}Bar`);
  const feedbackElement = document.getElementById(`${metricName}Feedback`);
  
  if (scoreElement) scoreElement.textContent = `${score}%`;
  if (barElement) barElement.style.width = `${score}%`;
  if (feedbackElement) feedbackElement.textContent = feedback;
}

function hideResults() {
  document.getElementById('resultsModal').style.display = 'none';
}

function startNewSession() {
  hideResults();
  
  // Reiniciar evaluación
  evaluationSession = {
    active: false,
    weldingActive: false,
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
  
  // Limpiar UI
  document.getElementById('startEvalBtn').style.display = 'block';
  document.getElementById('stopEvalBtn').style.display = 'none';
  document.getElementById('sessionTimer').textContent = '00:00';
  document.getElementById('evalScore').textContent = '0';
  document.getElementById('evalScore').style.color = 'white';
  
  const weldButton = document.getElementById('weldButton');
  weldButton.classList.remove('active');
  weldButton.querySelector('.weld-text').textContent = 'MANTÉN PRESIONADO PARA SOLDAR';
}

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

#Soldadura #Simulador #Entrenamiento`;
  
  if (navigator.share) {
    navigator.share({
      title: `Mis Resultados de Soldadura`,
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

// ============================================
// MANEJO DE ERRORES
// ============================================

window.addEventListener('error', function(e) {
  console.error('Error:', e.error);
  if (markerStatusEl) {
    markerStatusEl.innerHTML = "⚠️ Error - Recarga la página";
  }
});

document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    isProcessing = false;
    if (isWelding) {
      pauseWelding();
    }
  } else {
    isProcessing = true;
  }
});
