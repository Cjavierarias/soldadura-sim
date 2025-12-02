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
// INICIALIZACIÓN Y OPENCV
// ============================================

// Función requerida por OpenCV.js
function onOpenCvReady() {
  console.log('OpenCV.js está listo');
  document.getElementById('loadStatus').textContent = 'OpenCV cargado ✅';
  
  // Ocultar loading después de un tiempo
  setTimeout(() => {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('startBtn').style.display = 'block';
  }, 1000);
}

document.addEventListener('DOMContentLoaded', function() {
  console.log("Simulador de Soldadura AR cargado");
  
  // Configurar botón de inicio
  document.getElementById('startBtn').addEventListener('click', function() {
    this.style.display = 'none';
    document.getElementById('app').style.display = 'block';
    initApp();
  });
  
  // Mostrar loading inicial
  document.getElementById('loadStatus').textContent = 'Cargando OpenCV.js...';
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
}

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
  // Detectar botón de subir volumen
  document.addEventListener('keydown', function(e) {
    // Verificar si es el botón de volumen (códigos comunes)
    if (e.keyCode === 447 || e.key === 'VolumeUp' || e.keyCode === 38) {
      e.preventDefault();
      startWelding();
    }
  });
  
  document.addEventListener('keyup', function(e) {
    if (e.keyCode === 447 || e.key === 'VolumeUp' || e.keyCode === 38) {
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
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    video.onloadedmetadata = function() {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      isProcessing = true;
      processFrame();
      
      initSensors();
      
      markerStatusEl.innerHTML = "✅ Cámara activa. Usa el BOTÓN DE VOLUMEN para soldar.";
    };
    
  } catch (err) {
    console.error("Error con la cámara:", err);
    markerStatusEl.innerHTML = "❌ Error con la cámara: " + err.message;
    fallbackToTestVideo();
  }
}

// Inicializar sensores del celular
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
    const angle = Math.abs(event.beta);
    
    if (evaluationSession.active && evaluationSession.weldingActive) {
      updateAngleDisplay(angle);
      
      // Feedback de sonido según ángulo
      const optimal = weldConfig.optimalAngle[weldConfig.type];
      if (weldConfig.soundEnabled) {
        if (angle > optimal.max) {
          playHighBeep();
        } else if (angle < optimal.min) {
          playLowBeep();
        }
      }
    }
  }
}

// Reproducir sonido agudo
function playHighBeep() {
  const beep = document.getElementById('beepHigh');
  if (beep && Date.now() - lastVibrationTime > 500) {
    beep.currentTime = 0;
    beep.volume = 0.3;
    beep.play().catch(e => console.log("Error sonido agudo:", e));
    lastVibrationTime = Date.now();
  }
}

// Reproducir sonido grave
function playLowBeep() {
  const beep = document.getElementById('beepLow');
  if (beep && Date.now() - lastVibrationTime > 500) {
    beep.currentTime = 0;
    beep.volume = 0.3;
    beep.play().catch(e => console.log("Error sonido grave:", e));
    lastVibrationTime = Date.now();
  }
}

// Fallback a video de prueba
function fallbackToTestVideo() {
  markerStatusEl.innerHTML = "⚠️ Usando modo simulación (sin cámara)";
  isProcessing = true;
  simulateFrameProcessing();
}

// Simular procesamiento de frames
function simulateFrameProcessing() {
  if (!isProcessing) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawVisualGuides();
  
  if (Math.random() < 0.1) {
    const simulatedAngle = 10 + Math.random() * 30;
    updateAngleDisplay(simulatedAngle);
  }
  
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    if (window.cv && window.cv.Mat) {
      processWithOpenCV();
    } else {
      processSimpleMarker();
    }
    
    drawVisualGuides();
    updateStability();
    updateStraightness();
    
    if (isWelding && evaluationSession.active) {
      recordEvaluationData();
    }
    
    updateWeldProgress();
    
  } catch (err) {
    console.error("Error procesando frame:", err);
  }
  
  requestAnimationFrame(processFrame);
}

// Procesamiento simple de marcador
function processSimpleMarker() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Dibujar marcador simulado
  ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
  ctx.fill();
  
  const currentTime = Date.now();
  if (lastMarkerPosition) {
    const timeDiff = currentTime - lastMarkerPosition.timestamp;
    if (timeDiff > 100) {
      const newX = centerX + (Math.random() - 0.5) * 20;
      const newY = centerY + (Math.random() - 0.5) * 20;
      
      markerMovementHistory.push({
        from: { x: lastMarkerPosition.x, y: lastMarkerPosition.y },
        to: { x: newX, y: newY },
        timestamp: currentTime
      });
      
      if (markerMovementHistory.length > 50) {
        markerMovementHistory.shift();
      }
      
      lastMarkerPosition = { x: newX, y: newY, timestamp: currentTime };
    }
  } else {
    lastMarkerPosition = { x: centerX, y: centerY, timestamp: currentTime };
  }
  
  updateMetrics();
}

// Procesar con OpenCV
function processWithOpenCV() {
  processSimpleMarker(); // Temporal, implementar OpenCV después
}

// Actualizar métricas en pantalla
function updateMetrics() {
  if (!lastMarkerPosition) return;
  
  const distance = 10 + Math.random() * 5;
  document.getElementById('dist').textContent = distance.toFixed(1) + ' cm';
  
  if (markerMovementHistory.length >= 2) {
    const lastMove = markerMovementHistory[markerMovementHistory.length - 1];
    const speed = Math.random() * 2;
    document.getElementById('speed').textContent = speed.toFixed(1) + ' cm/s';
    
    const approachSpeed = -0.2 + Math.random() * 0.4;
    document.getElementById('approachSpeed').textContent = approachSpeed.toFixed(1) + ' cm/s';
  }
}

// Actualizar display de ángulo
function updateAngleDisplay(angle) {
  if (isNaN(angle)) return;
  
  const roundedAngle = Math.round(angle);
  angleDisplay.textContent = roundedAngle + '°';
  document.getElementById('currentAngle').textContent = roundedAngle + '°';
  
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  if (angle >= optimal.min && angle <= optimal.max) {
    angleDisplay.style.color = '#0f0';
  } else if (angle < optimal.min) {
    angleDisplay.style.color = '#ff0';
  } else {
    angleDisplay.style.color = '#f00';
  }
}

// ============================================
// GUÍAS VISUALES
// ============================================

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
  
  // Dibujar guía de ángulo
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

// ============================================
// ESTABILIDAD Y RECTITUD
// ============================================

function updateStability() {
  const currentAngle = parseFloat(angleDisplay.textContent);
  if (!isNaN(currentAngle)) {
    angleHistory.push(currentAngle);
    if (angleHistory.length > 30) angleHistory.shift();
    
    if (angleHistory.length >= 10) {
      const mean = angleHistory.reduce((a, b) => a + b) / angleHistory.length;
      const variance = angleHistory.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / angleHistory.length;
      const stdDev = Math.sqrt(variance);
      
      stabilityScore = Math.max(0, 100 - stdDev * 10);
      
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

function updateStraightness() {
  if (markerMovementHistory.length < 3) {
    straightnessScore = 0;
    document.getElementById('straightness').textContent = '--%';
    return;
  }
  
  const positions = [];
  markerMovementHistory.forEach(move => {
    positions.push(move.from);
  });
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
  
  const straightnessEl = document.getElementById('straightness');
  if (straightnessScore >= 80) {
    straightnessEl.className = 'info-value good';
  } else if (straightnessScore >= 60) {
    straightnessEl.className = 'info-value warning';
  } else {
    straightnessEl.className = 'info-value error';
  }
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

// ============================================
// SISTEMA DE SOLDADURA
// ============================================

function startWelding() {
  if (!isWelding) {
    isWelding = true;
    weldingStartTime = Date.now();
    
    const weldButton = document.getElementById('weldButton');
    weldButton.classList.add('active');
    weldButton.querySelector('.weld-text').textContent = 'SOLDANDO... SUELTA PARA PAUSAR';
    
    if (weldConfig.soundEnabled) {
      const weldSound = document.getElementById('weldSound');
      const arcSound = document.getElementById('arcSound');
      
      if (arcSound) {
        arcSound.currentTime = 0;
        arcSound.volume = 0.7;
        arcSound.play().catch(e => console.log("Error sonido arco:", e));
        
        setTimeout(() => {
          if (weldSound && isWelding) {
            weldSound.currentTime = 0;
            weldSound.volume = 0.4;
            weldSound.play().catch(e => console.log("Error sonido soldadura:", e));
          }
        }, 500);
      }
    }
    
    if (weldConfig.vibrationEnabled && navigator.vibrate) {
      navigator.vibrate([50, 30, 50]);
    }
    
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
    weldingDuration = Date.now() - weldingStartTime;
    
    const weldButton = document.getElementById('weldButton');
    weldButton.classList.remove('active');
    weldButton.querySelector('.weld-text').textContent = 'MANTÉN PRESIONADO PARA SOLDAR';
    document.getElementById('weldProgress').style.width = '0%';
    
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
    
    if (weldConfig.vibrationEnabled && Date.now() - lastVibrationTime > 2000 && navigator.vibrate) {
      navigator.vibrate([50]);
      lastVibrationTime = Date.now();
    }
  }
}

// ============================================
// SISTEMA DE EVALUACIÓN
// ============================================

function initEvaluationSystem() {
  console.log("Inicializando sistema de evaluación...");
  
  document.getElementById('startEvalBtn').addEventListener('click', startEvaluation);
  document.getElementById('stopEvalBtn').addEventListener('click', stopEvaluation);
  document.getElementById('resultsBtn').addEventListener('click', showResults);
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
  
  markerMovementHistory = [];
  pathHistory = [];
  electrodoConsumption = 0;
  
  document.getElementById('startEvalBtn').style.display = 'none';
  document.getElementById('stopEvalBtn').style.display = 'block';
  markerStatusEl.innerHTML = '📊 Evaluación lista - Presiona para soldar';
  
  console.log("✅ Evaluación iniciada");
  updateEvaluationTimer();
}

function stopEvaluation() {
  if (!evaluationSession.active) return;
  
  evaluationSession.active = false;
  evaluationSession.weldingActive = false;
  evaluationSession.duration = Date.now() - evaluationSession.startTime;
  
  if (isWelding) {
    const weldSound = document.getElementById('weldSound');
    if (weldSound) {
      weldSound.pause();
      weldSound.currentTime = 0;
    }
    isWelding = false;
    document.getElementById('weldButton').classList.remove('active');
  }
  
  processEvaluationData();
  showResults();
  
  document.getElementById('startEvalBtn').style.display = 'block';
  document.getElementById('stopEvalBtn').style.display = 'none';
  
  console.log("⏹️ Evaluación finalizada");
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
    
    const optimal = weldConfig.optimalAngle[weldConfig.type];
    const angleScore = calculateAngleScore(currentAngle, optimal);
    
    evaluationSession.metrics.angleScores.push(angleScore);
    evaluationSession.metrics.stabilityScores.push(currentStability);
    evaluationSession.metrics.speedValues.push(Math.abs(currentSpeed));
    evaluationSession.metrics.approachSpeedValues.push(Math.abs(currentApproachSpeed));
    evaluationSession.metrics.straightnessValues.push(currentStraightness);
    evaluationSession.metrics.distanceValues.push(currentDistance);
    
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
  const angleInOptimalRange = angleScores.filter(score => score === 100).length / angleScores.length * 100;
  
  const avgStability = stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length;
  
  const avgSpeed = speedValues.reduce((a, b) => a + b, 0) / speedValues.length;
  const speedScore = calculateSpeedScore(avgSpeed, optimalSpeed, weldConfig.type);
  
  const avgApproachSpeed = approachSpeedValues.reduce((a, b) => a + b, 0) / approachSpeedValues.length;
  const approachScore = calculateApproachScore(avgApproachSpeed, weldConfig.type);
  
  const avgStraightness = straightnessValues.reduce((a, b) => a + b, 0) / straightnessValues.length;
  
  const avgDistance = distanceValues.reduce((a, b) => a + b, 0) / distanceValues.length;
  const distanceScore = calculateDistanceScore(avgDistance, optimalDist, weldConfig.type);
  
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
  
  evaluationSession.recommendations = generateRecommendations(evaluationSession.results);
}

function calculateSpeedScore(speed, optimal, weldType) {
  if (weldType === 'electrodo') {
    if (speed >= optimal.min && speed <= optimal.max) {
      return 90 + (Math.random() * 5);
    } else if (speed >= optimal.min * 0.7 && speed <= optimal.max * 1.3) {
      return 70 + (Math.random() * 10);
    } else {
      return 40 + (Math.random() * 20);
    }
  } else {
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

function calculateApproachScore(speed, weldType) {
  if (weldType === 'electrodo') {
    if (speed >= 0.1 && speed <= 0.5) {
      return 85 + (Math.random() * 10);
    } else if (speed >= 0.05 && speed <= 0.7) {
      return 65 + (Math.random() * 10);
    } else {
      return 40 + (Math.random() * 15);
    }
  } else {
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

function calculateDistanceScore(distance, optimalDist, weldType) {
  const idealDistance = (optimalDist.min + optimalDist.max) / 2;
  const diff = Math.abs(distance - idealDistance);
  const range = optimalDist.max - optimalDist.min;
  
  if (weldType === 'electrodo') {
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
  
  if (metrics.approach.score < 70) {
    if (weldType === 'electrodo') {
      recommendations.push("Con electrodo, acerca la antorcha gradualmente (-0.1 a -0.5 cm/s)");
    } else {
      recommendations.push("Mantén distancia constante (variación < 0.5 cm/s)");
    }
  }
  
  if (metrics.straightness.score < 70) {
    recommendations.push("Practica mantener una línea recta al soldar");
  }
  
  if (metrics.distance.score < 70) {
    if (weldType === 'electrodo') {
      recommendations.push("Electrodo: mantén 5-10 cm de distancia");
    } else if (weldType === 'tig') {
      recommendations.push("TIG: distancia ideal 8-15 cm");
    } else {
      recommendations.push("MIG: distancia ideal 15-25 cm");
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
  
  const minutes = Math.floor(results.duration / 60000);
  const seconds = Math.floor((results.duration % 60000) / 1000);
  document.getElementById('totalTime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  document.getElementById('finalScore').textContent = results.finalScore;
  
  let skillLevel = "Principiante";
  if (results.finalScore >= 80) skillLevel = "Experto";
  else if (results.finalScore >= 60) skillLevel = "Intermedio";
  document.getElementById('skillLevel').textContent = skillLevel;
  
  updateMetric('angle', metrics.angle.score, getAngleFeedback(metrics.angle.score, results.weldType));
  updateMetric('stability', metrics.stability.score, getStabilityFeedback(metrics.stability.score));
  updateMetric('speed', metrics.speed.score, getSpeedFeedback(metrics.speed, results.weldType));
  updateMetric('approach', metrics.approach.score, getApproachFeedback(metrics.approach, results.weldType));
  updateMetric('straightness', metrics.straightness.score, getStraightnessFeedback(metrics.straightness.score));
  updateMetric('distance', metrics.distance.score, getDistanceFeedback(metrics.distance, results.weldType));
  
  const recommendationsList = document.getElementById('recommendationsList');
  recommendationsList.innerHTML = '';
  
  evaluationSession.recommendations.forEach(rec => {
    const li = document.createElement('li');
    li.textContent = rec;
    recommendationsList.appendChild(li);
  });
  
  document.getElementById('resultsModal').style.display = 'flex';
}

function updateMetric(metricName, score, feedback) {
  document.getElementById(`${metricName}Score`).textContent = `${score}%`;
  document.getElementById(`${metricName}Bar`).style.width = `${score}%`;
  document.getElementById(`${metricName}Feedback`).textContent = feedback;
}

function getAngleFeedback(score, weldType) {
  let typeName = weldType === 'electrodo' ? "electrodo" : weldType === 'tig' ? "TIG" : "MIG/MAG";
  
  if (score >= 90) return `Ángulo perfecto para ${typeName}`;
  if (score >= 70) return `Buen control del ángulo en ${typeName}`;
  if (score >= 50) return `Ángulo aceptable para ${typeName}`;
  return `Necesita mejorar ángulo para ${typeName}`;
}

function getStabilityFeedback(score) {
  if (score >= 85) return "Muy estable, mano firme";
  if (score >= 65) return "Estabilidad aceptable";
  if (score >= 45) return "Inestabilidad notable";
  return "Muy inestable, necesita entrenamiento";
}

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

function getStraightnessFeedback(score) {
  if (score >= 85) return "Línea muy recta";
  if (score >= 65) return "Rectitud aceptable";
  if (score >= 45) return "Línea algo curva";
  return "Necesita practicar línea recta";
}

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

function hideResults() {
  document.getElementById('resultsModal').style.display = 'none';
}

function startNewSession() {
  hideResults();
  
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
  
  markerMovementHistory = [];
  pathHistory = [];
  electrodoConsumption = 0;
  
  document.getElementById('startEvalBtn').style.display = 'block';
  document.getElementById('stopEvalBtn').style.display = 'none';
  document.getElementById('sessionTimer').textContent = '00:00';
  document.getElementById('evalScore').textContent = '0';
  document.getElementById('evalScore').style.color = 'white';
  
  const weldButton = document.getElementById('weldButton');
  weldButton.classList.remove('active');
  weldButton.querySelector('.weld-text').textContent = 'MANTÉN PRESIONADO PARA SOLDAR';
  
  console.log("🔄 Nueva sesión preparada");
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

// ============================================
// MANEJO DE ERRORES
// ============================================

window.addEventListener('error', function(e) {
  console.error('Error global:', e.error);
  markerStatusEl.innerHTML = "⚠️ Error - Recarga la página";
  isProcessing = false;
});

document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    isProcessing = false;
    if (isWelding) {
      pauseWelding();
    }
  } else if (video.srcObject) {
    isProcessing = true;
    processFrame();
  }
});

// Función vibrar dispositivo
function vibrateDevice(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}
