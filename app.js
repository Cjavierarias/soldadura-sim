console.log("Soldadura Sim AR - Iniciando...");

// Variables globales
let video = null;
let canvas = null;
let ctx = null;
let cvReady = false;
let isProcessing = false;

// Variables de seguimiento
let prevTime = 0;
let prevPos = null;
let markerHistory = [];
const HISTORY_SIZE = 10;

// Tamaño real del marcador en cm
const MARKER_SIZE_CM = 10;

// Elementos DOM
let startBtn = null;
let appContainer = null;
let loading = null;
let loadStatus = null;
let distEl = null;
let angleEl = null;
let speedEl = null;
let markerStatusEl = null;

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
    distEl = document.getElementById('dist');
    angleEl = document.getElementById('angle');
    speedEl = document.getElementById('speed');
    markerStatusEl = document.getElementById('markerStatus');
    
    // Obtener contexto del canvas
    ctx = canvas.getContext('2d');
    
    // Configurar botón de inicio
    startBtn.addEventListener('click', startApp);
    
    // Verificar si OpenCV ya está cargado
    if (typeof cv !== 'undefined') {
        console.log("OpenCV ya está cargado");
        onOpenCvReady();
    } else {
        console.log("Esperando carga de OpenCV...");
    }
});

// Callback cuando OpenCV.js se carga
function onOpenCvReady() {
    console.log("✅ OpenCV.js listo!");
    console.log("Versión OpenCV:", cv.getVersionString ? cv.getVersionString() : "3.4.0");
    
    cvReady = true;
    loadStatus.textContent = "OpenCV cargado correctamente";
    loading.style.display = 'none';
    startBtn.style.display = 'block';
    
    // Mostrar versión en consola
    if (cv.getBuildInformation) {
        const info = cv.getBuildInformation();
        console.log("Build info:", info.substring(0, 100) + "...");
    }
}

// Iniciar la aplicación
async function startApp() {
    console.log("Iniciando aplicación...");
    
    try {
        // Ocultar botón de inicio
        startBtn.style.display = 'none';
        
        // Solicitar acceso a la cámara
        loadStatus.textContent = "Solicitando acceso a cámara...";
        loading.style.display = 'flex';
        
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            }
        });
        
        console.log("✅ Cámara accedida correctamente");
        video.srcObject = stream;
        
        // Esperar a que el video esté listo
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                console.log("📷 Dimensiones del video:", video.videoWidth, "x", video.videoHeight);
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Ajustar tamaño del canvas para dispositivos móviles
                const scale = Math.min(window.innerWidth / video.videoWidth, window.innerHeight / video.videoHeight);
                canvas.style.transform = `scale(${scale})`;
                canvas.style.transformOrigin = 'top left';
                
                resolve();
            };
        });
        
        // Esperar a que el video empiece a reproducirse
        await new Promise((resolve) => {
            video.onplaying = () => {
                console.log("▶️ Video reproduciéndose");
                resolve();
            };
        });
        
        // Mostrar la aplicación
        loading.style.display = 'none';
        appContainer.style.display = 'block';
        
        // Iniciar el procesamiento
        isProcessing = true;
        processFrame();
        
    } catch (error) {
        console.error("❌ Error al iniciar:", error);
        loadStatus.textContent = `Error: ${error.message}`;
        startBtn.style.display = 'block';
        startBtn.textContent = "🔄 Reintentar";
        
        // Mostrar mensaje de error específico
        if (error.name === 'NotAllowedError') {
            alert("Permiso de cámara denegado. Por favor, permite el acceso a la cámara en los ajustes del navegador.");
        } else if (error.name === 'NotFoundError') {
            alert("No se encontró ninguna cámara trasera. Asegúrate de usar un dispositivo con cámara trasera.");
        } else {
            alert(`Error de cámara: ${error.message}`);
        }
    }
}

// Procesar cada frame del video
function processFrame() {
    if (!isProcessing) return;
    
    try {
        // Dibujar el video en el canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Procesar con OpenCV si está listo
        if (cvReady && cv.Mat) {
            processWithOpenCV();
        } else {
            // Mostrar mensaje de espera
            markerStatusEl.textContent = "🟡 Cargando OpenCV...";
        }
        
        // Continuar con el siguiente frame
        requestAnimationFrame(processFrame);
        
    } catch (error) {
        console.error("Error en processFrame:", error);
        markerStatusEl.textContent = "🔴 Error de procesamiento";
        isProcessing = false;
    }
}

// Procesar el frame con OpenCV
function processWithOpenCV() {
    // Leer la imagen del canvas
    const src = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4);
    const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    src.data.set(srcData.data);
    
    // Convertir a escala de grises
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // Umbralizar para mejorar detección
    const threshold = new cv.Mat();
    cv.threshold(gray, threshold, 100, 255, cv.THRESH_BINARY);
    
    // Detectar contornos
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(threshold, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);
    
    let markerFound = false;
    let bestDistance = 0;
    let bestAngle = 0;
    
    // Buscar contornos cuadrados (posibles marcadores)
    for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const perimeter = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
        
        // Si tiene 4 vértices, es un posible marcador
        if (approx.rows === 4) {
            const area = cv.contourArea(approx);
            if (area > 1000) { // Área mínima para evitar ruido
                markerFound = true;
                
                // Dibujar el contorno detectado
                const color = new cv.Scalar(0, 255, 0, 255);
                cv.drawContours(src, contours, i, color, 3);
                
                // Obtener puntos del marcador
                const points = [];
                for (let j = 0; j < 4; j++) {
                    points.push({
                        x: approx.data32S[j * 2],
                        y: approx.data32S[j * 2 + 1]
                    });
                }
                
                // Calcular distancia estimada (basada en el área)
                const pixelArea = area;
                const distance = estimateDistanceFromArea(pixelArea);
                bestDistance = distance;
                
                // Calcular ángulo de inclinación
                const angle = calculateAngle(points);
                bestAngle = angle;
                
                // Dibujar información
                drawMarkerInfo(src, points, distance, angle);
                
                approx.delete();
                break;
            }
        }
        approx.delete();
    }
    
    // Actualizar UI según detección
    if (markerFound) {
        // Actualizar valores
        distEl.textContent = bestDistance.toFixed(1);
        angleEl.textContent = bestAngle.toFixed(1);
        
        // Calcular velocidad si tenemos datos previos
        const now = Date.now();
        if (prevPos && prevTime) {
            const dt = (now - prevTime) / 1000; // en segundos
            const distanceChange = Math.abs(bestDistance - prevPos);
            const speed = dt > 0 ? distanceChange / dt : 0;
            
            speedEl.textContent = speed.toFixed(1);
            markerStatusEl.textContent = "🟢 Marcador detectado";
            
            // Feedback por velocidad
            if (speed > 5 && speed < 20) {
                // Velocidad óptima
                markerStatusEl.textContent = "✅ Velocidad óptima";
                if (navigator.vibrate) navigator.vibrate(50);
            } else if (speed >= 20) {
                markerStatusEl.textContent = "⚠️ Demasiado rápido";
            }
        } else {
            speedEl.textContent = "0.0";
        }
        
        // Guardar datos para siguiente frame
        prevPos = bestDistance;
        prevTime = now;
        
    } else {
        // No se detectó marcador
        distEl.textContent = "--";
        angleEl.textContent = "--";
        speedEl.textContent = "--";
        markerStatusEl.textContent = "🔴 No se detecta marcador";
        prevPos = null;
    }
    
    // Mostrar la imagen procesada
    cv.imshow(canvas, src);
    
    // Liberar memoria
    src.delete();
    gray.delete();
    threshold.delete();
    contours.delete();
    hierarchy.delete();
}

// Estimar distancia basada en el área del marcador
function estimateDistanceFromArea(pixelArea) {
    // Fórmula: distancia = k / sqrt(área)
    // Donde k es una constante que depende del tamaño real del marcador
    const REAL_AREA_CM2 = MARKER_SIZE_CM * MARKER_SIZE_CM; // 100 cm²
    const CALIBRATION_CONSTANT = 5000; // Este valor necesita calibración
    
    if (pixelArea <= 0) return 100;
    
    const distance = CALIBRATION_CONSTANT / Math.sqrt(pixelArea);
    return Math.max(10, Math.min(distance, 200)); // Limitar entre 10-200 cm
}

// Calcular ángulo de inclinación basado en los puntos
function calculateAngle(points) {
    if (points.length < 2) return 0;
    
    // Calcular vector entre dos puntos opuestos
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    
    // Calcular ángulo en grados
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Normalizar a 0-360
    if (angle < 0) angle += 360;
    if (angle > 180) angle -= 180; // Mostrar ángulo absoluto
    
    return Math.abs(angle - 90); // Ángulo relativo a vertical
}

// Dibujar información del marcador en la imagen
function drawMarkerInfo(img, points, distance, angle) {
    // Calcular centro del marcador
    const centerX = points.reduce((sum, p) => sum + p.x, 0) / 4;
    const centerY = points.reduce((sum, p) => sum + p.y, 0) / 4;
    
    // Dibujar punto central
    const centerColor = new cv.Scalar(255, 0, 0, 255);
    cv.circle(img, new cv.Point(centerX, centerY), 10, centerColor, -1);
    
    // Dibujar texto con distancia y ángulo
    const text = `Dist: ${distance.toFixed(1)}cm | Ang: ${angle.toFixed(1)}°`;
    const textColor = new cv.Scalar(0, 255, 255, 255);
    const textPos = new cv.Point(centerX - 100, centerY - 30);
    
    cv.putText(img, text, textPos, cv.FONT_HERSHEY_SIMPLEX, 0.7, textColor, 2);
}

// Manejar errores no capturados
window.addEventListener('error', function(e) {
    console.error('Error global:', e.error);
    markerStatusEl.textContent = "🔴 Error crítico - Recarga la página";
    isProcessing = false;
});

// Pausar procesamiento cuando la página no es visible
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        console.log("Página oculta, pausando procesamiento");
        isProcessing = false;
    } else if (cvReady && video.srcObject) {
        console.log("Página visible, reanudando procesamiento");
        isProcessing = true;
        processFrame();
    }
});
