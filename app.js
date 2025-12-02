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
let currentAngleEl = null;
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
  document.getElementById('resultsBtn').addEventListener('click', showResults);
  
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

// Manejar orientación del dispositivo - CORREGIDO
function handleDeviceOrientation(event) {
  if (event.beta !== null) {
    // beta: inclinación frontal (-180 a 180)
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
    
    // Actualizar displays - CORREGIDO: usar currentAngleEl en lugar de angleValue
    updateAngleDisplay(deviceAngle);
    
    // Verificar ángulo óptimo
    checkOptimalAngle(deviceAngle);
  }
}

// Actualizar display del ángulo - CORREGIDO
function updateAngleDisplay(angle) {
  const roundedAngle = Math.round(angle);
  angleDisplay.textContent = roundedAngle + '°';
  currentAngleEl.textContent = roundedAngle + '°';  // CORREGIDO: usar currentAngleEl
  
  // Actualizar color según ángulo óptimo
  const optimal = weldConfig.optimalAngle[weldConfig.type];
  
  if (roundedAngle >= optimal.min && roundedAngle <= optimal.max) {
    currentAngleEl.className = 'info-value good';
    markerStatusEl.innerHTML = '✅ Ángulo óptimo';
  } else if (roundedAngle < optimal.min) {
    currentAngleEl.className = 'info-value warning';
    markerStatusEl.innerHTML = '⚠️ Ángulo bajo';
  } else {
    currentAngleEl.className = 'info-value error';
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
