// app.js - Simulador de Soldadura AR con AR.js
// Datos REALES del patrón, compatible GitHub Pages

// Variables globales
let canvas, ctx;
let isProcessing = false;
let isWelding = false;
let lastMarkerPosition = null;
let markerMovementHistory = [];
let angleHistory = [];
let stabilityScore = 0;
let straightnessScore = 0;
let lastVibrationTime = 0;
let weldingStartTime = 0;
let markerDetected = false;
let currentAngle = 0;
let currentDistance = 0;
let currentSpeed = 0;
let currentApproachSpeed = 0;

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
let arScene = null;
let arMarker = null;

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  console.log("Simulador de Soldadura AR cargado");
  
  // Configurar botón de inicio
  document.getElementById('startBtn').addEventListener('click', function() {
    this.style.display = 'none';
    document.getElementById('app').style.display = 'block';
    initApp();
  });
  
  document.getElementById('loadStatus').textContent = 'Preparando simulador...';
  
  // Verificar si AR.js está disponible
  if (typeof AFRAME !== 'undefined') {
    document.getElementById('loadStatus').textContent = 'AR.js listo ✅';
  }
});

function initApp() {
  // Obtener elementos del DOM
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
  
  // Iniciar AR.js
  initAR();
  
  // Iniciar sensores
  initSensors();
  
  // Iniciar procesamiento
  isProcessing = true;
  processFrame();
  
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
// AR.js - DETECCIÓN REAL DEL PATRÓN
// ============================================

function initAR() {
  console.log("Inicializando AR.js...");
  
  const arContainer = document.getElementById('arContainer');
  
  // Crear escena AR
  arContainer.innerHTML = `
    <a-scene 
      embedded 
      arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 4x4;"
      vr-mode-ui="enabled: false"
      renderer="logarithmicDepthBuffer: true;"
    >
      <!-- Cámara -->
      <a-entity camera></a-entity>
      
      <!-- Marcador para tu patrón 4x4_1000 -->
      <a-marker 
        id="weld-marker"
        type="pattern" 
        url="4x4_1000.patt"
        size="0.2"
        smooth="true"
        smoothCount="5"
        smoothTolerance="0.01"
        smoothThreshold="5"
        emitevents="true"
      >
        <!-- Indicador visual cuando se detecta -->
        <a-entity position="0 0.1 0">
          <a-plane 
            color="#ff0000" 
            opacity="0.3" 
            width="0.18" 
            height="0.18"
          ></a-plane>
        </a-entity>
      </a-marker>
    </a-scene>
  `;
  
  // Obtener referencia al marcador y escena
  setTimeout(() => {
    arScene = document.querySelector('a-scene');
    arMarker = document.querySelector('#weld-marker');
    
    if (arScene && arMarker) {
      console.log("AR.js inicializado correctamente");
      
      // Escuchar eventos del marcador
      arMarker.addEventListener('markerFound', function() {
        markerDetected = true;
        updateMarkerPosition();
      });
      
      arMarker.addEventListener('markerLost', function() {
        markerDetected = false;
      });
      
      // Monitorear posición constantemente
      setInterval(updateMarkerPosition, 100);
      
    } else {
      console.error("Error inicializando AR.js");
      markerStatusEl.innerHTML = "⚠️ AR.js no inicializado - Usando simulación";
    }
  }, 1000);
}

// Actualizar posición del marcador
function updateMarkerPosition() {
  if (!arMarker || !markerDetected) return;
  
  try {
    // Obtener posición 3D del marcador
    const position = arMarker.object3D.position;
    const rotation = arMarker.object3D.rotation;
    
    // Convertir a coordenadas de pantalla
    const screenPos = worldToScreen(position.x, position.y);
    
    // Registrar movimiento
    const currentTime = Date.now();
    if (lastMarkerPosition) {
      const timeDiff = (currentTime - lastMarkerPosition.timestamp) / 1000; // en segundos
      
      if (timeDiff > 0.1) { // Cada 100ms
        // Calcular distancia 3D real (en metros)
        const dx = position.x - lastMarkerPosition.x;
        const dy = position.y - lastMarkerPosition.y;
        const dz = position.z - lastMarkerPosition.z;
        const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        // Convertir a cm/s (1 metro = 100 cm)
        currentSpeed = (distance3D * 100) / timeDiff;
        
        // Calcular distancia a la cámara (en cm)
        currentDistance = Math.abs(position.z * 100); // z es profundidad
        
        // Calcular velocidad de aproximación (cambio en distancia)
        const distanceChange = currentDistance - lastMarkerPosition.distance;
        currentApproachSpeed = distanceChange / timeDiff;
        
        // Guardar en historial
        markerMovementHistory.push({
          from: { x: lastMarkerPosition.screenX, y: lastMarkerPosition.screenY },
          to: { x: screenPos.x, y: screenPos.y },
          timestamp: currentTime,
          distance3D: distance3D,
          speed: currentSpeed
        });
        
        // Mantener historial limitado
        if (markerMovementHistory.length > 50) {
          markerMovementHistory.shift();
        }
      }
    }
    
    // Guardar posición actual
    lastMarkerPosition = {
      x: position.x,
      y: position.y,
      z: position.z,
      screenX: screenPos.x,
      screenY: screenPos.y,
      distance: currentDistance,
      timestamp: currentTime,
      rotation: {
        x: rotation.x * (180 / Math.PI),
        y: rotation.y * (180 / Math.PI),
        z: rotation.z * (180 / Math.PI)
      }
    };
    
    // Calcular ángulo basado en rotación del marcador
    if (rotation.y !== undefined) {
      // Convertir rotación a ángulo de soldadura (0-90°)
      let angle = Math.abs(rotation.y * (180 / Math.PI)) % 90;
      if (angle < 0) angle += 90;
      if (angle > 90) angle = 90 - (angle - 90);
      
      currentAngle = Math.max(5, Math.min(85, Math.round(angle)));
    }
    
  } catch (err) {
    console.error("Error actualizando posición AR:", err);
  }
}

// Convertir coordenadas 3D a pantalla
function worldToScreen(x, y) {
  // Conversión simple (mejorar con matriz de proyección si es necesario)
  return {
    x: (x + 1) * (canvas.width / 2),
    y: (-y + 1) * (canvas.height / 2)
  };
}

// ============================================
// SENSORES DEL TELÉFONO (backup para ángulo)
// ============================================

function initSensors() {
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    console.log("Sensores de orientación activados");
  }
  
  // iOS necesita permiso
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          window.addEventListener('devicemotion', handleDeviceMotion);
        }
      })
      .catch(console.error);
  }
}

function handleDeviceOrientation(event) {
  if (event.beta !== null && !markerDetected) {
    // Usar sensor solo si no hay detección AR
    let angle = Math.abs(event.beta);
    
    // Ajustar según orientación del dispositivo
    if (window.orientation === 90 || window.orientation === -90) {
      angle = Math.abs(event.gamma);
    }
    
    // Normalizar a 5-85 grados
    angle = Math.max(5, Math.min(85, angle));
    currentAngle = Math.round(angle);
    
    // Feedback de sonido
    if (evaluationSession.weldingActive && weldConfig.soundEnabled) {
      const optimal = weldConfig.optimalAngle[weldConfig.type];
      if (currentAngle > optimal.max + 5) {
        playHighBeep();
      } else if (currentAngle < optimal.min - 5) {
        playLowBeep();
      }
    }
  }
}

function handleDeviceMotion(event) {
  // Puede usarse para estabilidad adicional
}

// ============================================
// BOTÓN DE VOLUMEN PARA SOLDAR
// ============================================

function initVolumeButton() {
  // Detectar botón de subir volumen
  document.addEventListener('keydown', function(e) {
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
  
  // Botón táctil
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
// PROCESAMIENTO PRINCIPAL
// ============================================

function processFrame() {
  if (!isProcessing) {
    requestAnimationFrame(processFrame);
    return;
  }
  
  try {
    // Limpiar canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Actualizar UI con datos REALES
    updateRealTimeUI();
    
    // Dibujar guías visuales
    drawVisualGuides();
    
    // Dibujar trayectoria del marcador
    drawMarkerTrajectory();
    
    // Actualizar métricas
    updateStability();
    updateStraightness();
    
    // Registrar datos de evaluación
    if (isWelding && evaluationSession.active) {
      recordEvaluationData();
    }
    
    // Actualizar progreso de soldadura
    updateWeldProgress();
    
  } catch (err) {
    console.error("Error en processFrame:", err);
  }
  
  requestAnimationFrame(processFrame);
}

// Actualizar UI con datos reales
function updateRealTimeUI() {
  // Actualizar estado del marcador
  if (markerDetected) {
    markerStatusEl.innerHTML = `✅ Patrón detectado | Distancia: ${currentDistance.toFixed(1)}cm`;
    markerStatusEl.style.color = '#0f0';
  } else {
    markerStatusEl.innerHTML = "🔍 Buscando patrón... Usa el patrón impreso";
    markerStatusEl.style.color = '#ff0';
  }
  
  // Actualizar ángulo
  updateAngleDisplay(currentAngle);
  
  // Actualizar métricas
  document.getElementById('dist').textContent = currentDistance.toFixed(1) + ' cm';
  document.getElementById('speed').textContent = Math.abs(currentSpeed).toFixed(1) + ' cm/s';
  document.getElementById('approachSpeed').textContent = currentApproachSpeed.toFixed(1) + ' cm/s';
}

// Actualizar display de ángulo
function updateAngleDisplay(angle) {
  if (isNaN(angle)) return;
  
  angleDisplay.textContent = angle + '°';
  document.getElementById('currentAngle').textContent = angle + '°';
  
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

// Dibujar trayectoria del marcador
function drawMarkerTrajectory() {
  if (markerMovementHistory.length < 2) return;
  
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  // Dibujar línea continua de la trayectoria
  for (let i = 0; i < markerMovementHistory.length - 1; i++) {
    const point1 = markerMovementHistory[i].to || markerMovementHistory[i].from;
    const point2 = markerMovementHistory[i + 1].from;
    
    if (i === 0) {
      ctx.moveTo(point1.x, point1.y);
    }
    ctx.lineTo(point2.x, point2.y);
  }
  
  ctx.stroke();
  
  // Dibujar puntos de la trayectoria
  ctx.fillStyle = '#00ffff';
  markerMovementHistory.forEach(move => {
    const point = move.to || move.from;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Dibujar guías visuales
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
  
  // Guía de ángulo
  const angle = currentAngle;
  if (!isNaN(angle) && angle >= 0) {
    const optimal = weldConfig.optimalAngle[weldConfig.type];
    
    // Arco de rango óptimo
    ctx.beginPath();
    ctx.arc(centerX, centerY, 80, 
            (optimal.min - 90) * Math.PI / 180, 
            (optimal.max - 90) * Math.PI / 180);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.lineWidth = 6;
    ctx.stroke();
    
    // Línea de ángulo actual
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
// SONIDOS
// ============================================

function playHighBeep() {
  const beep = document.getElementById('beepHigh');
  if (beep && Date.now() - lastVibrationTime > 300) {
    beep.currentTime = 0;
    beep.volume = 0.2;
    beep.play().catch(e => console.log("Error sonido agudo:", e));
    lastVibrationTime = Date.now();
  }
}

function playLowBeep() {
  const beep = document.getElementById('beepLow');
  if (beep && Date.now() - lastVibrationTime > 300) {
    beep.currentTime = 0;
    beep.volume = 0.2;
    beep.play().catch(e => console.log("Error sonido grave:", e));
    lastVibrationTime = Date.now();
  }
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
// ESTABILIDAD Y RECTITUD (funciones iguales)
// ============================================

function updateStability() {
  angleHistory.push(currentAngle);
  if (angleHistory.length > 30) angleHistory.shift();
  
  if (angleHistory.length >= 10) {
    const mean = angleHistory.reduce((a, b) => a + b, 0) / angleHistory.length;
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

function updateStraightness() {
  if (markerMovementHistory.length < 3) {
    straightnessScore = 0;
    document.getElementById('straightness').textContent = '--%';
    return;
  }
  
  const positions = markerMovementHistory.map(move => move.from);
  if (lastMarkerPosition) {
    positions.push({x: lastMarkerPosition.screenX, y: lastMarkerPosition.screenY});
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
// SISTEMA DE EVALUACIÓN (igual que antes)
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
  angleHistory = [];
  
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
  
  if (!isNaN(currentAngle) && currentAngle > 0) {
    const dataPoint = {
      timestamp: Date.now() - evaluationSession.startTime,
      angle: currentAngle,
      stability: stabilityScore,
      speed: Math.abs(currentSpeed),
      approachSpeed: Math.abs(currentApproachSpeed),
      straightness: straightnessScore,
      distance: currentDistance
    };
    
    evaluationSession.dataPoints.push(dataPoint);
    
    const optimal = weldConfig.optimalAngle[weldConfig.type];
    const angleScore = calculateAngleScore(currentAngle, optimal);
    
    evaluationSession.metrics.angleScores.push(angleScore);
    evaluationSession.metrics.stabilityScores.push(stabilityScore);
    evaluationSession.metrics.speedValues.push(Math.abs(currentSpeed));
    evaluationSession.metrics.approachSpeedValues.push(Math.abs(currentApproachSpeed));
    evaluationSession.metrics.straightnessValues.push(straightnessScore);
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

// [MANTENER TODAS LAS FUNCIONES DE EVALUACIÓN RESTANTES]
// processEvaluationData(), calculateSpeedScore(), generateRecommendations(), etc.
// Son exactamente las mismas que en tu código original

// ============================================
// ARCHIVOS ADICIONALES NECESARIOS
// ============================================

// Para que funcione, necesitamos:
// 1. Convertir 4x4_1000.png a formato .patt (AR.js)
// 2. Servir ambos archivos en GitHub Pages
