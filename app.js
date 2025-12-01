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
let prevAngle = null;
let markerHistory = [];
const HISTORY_SIZE = 10;

// Tamaño real del marcador en cm
const MARKER_SIZE_CM = 10;

// Rango óptimo para soldadura (en grados)
const ANGULO_OPTIMO_MIN = 15;
const ANGULO_OPTIMO_MAX = 30;
const ANGULO_TOLERANCIA = 5;

// Audio Context y sonidos
let audioContext = null;
let sonidoAnguloAlto = null;
let sonidoAnguloBajo = null;
let sonidoOptimo = null;
let ultimoSonidoAngulo = 0;
const TIEMPO_ENTRE_SONIDOS = 500; // ms

// Elementos DOM
let startBtn = null;
let appContainer = null;
let loading = null;
let loadStatus = null;
let distEl = null;
let angleEl = null;
let speedEl = null;
let markerStatusEl = null;
let angleStatusEl = null;

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
    angleStatusEl = document.getElementById('angleStatus');
    
    // Obtener contexto del canvas
    ctx = canvas.getContext('2d');
    
    // Configurar botón de inicio
    startBtn.addEventListener('click', startApp);
    
    // Inicializar sistema de audio
    initAudio();
    
    // Verificar si OpenCV ya está cargado
    if (typeof cv !== 'undefined') {
        console.log("OpenCV ya está cargado");
        onOpenCvReady();
    } else {
        console.log("Esperando carga de OpenCV...");
    }
});

// Inicializar sistema de audio
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Crear sonido para ángulo alto (grave)
        sonidoAnguloAlto = {
            play: function() {
                const now = Date.now();
                if (now - ultimoSonidoAngulo < TIEMPO_ENTRE_SONIDOS) return;
                
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(200, audioContext.currentTime); // Grave
                
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.3);
                
                ultimoSonidoAngulo = now;
            }
        };
        
        // Crear sonido para ángulo bajo (agudo)
        sonidoAnguloBajo = {
            play: function() {
                const now = Date.now();
                if (now - ultimoSonidoAngulo < TIEMPO_ENTRE_SONIDOS) return;
                
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // Agudo
                
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.2);
                
                ultimoSonidoAngulo = now;
            }
        };
        
        // Crear sonido para ángulo óptimo
        sonidoOptimo = {
            play: function() {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(400, audioContext.currentTime); // Medio
                
                gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.1);
            }
        };
        
        console.log("✅ Sistema de audio inicializado");
        
    } catch (error) {
        console.warn("⚠️ Audio no disponible:", error);
    }
}

// Callback cuando OpenCV.js se carga
function onOpenCvReady() {
    console.log("✅ OpenCV.js listo!");
    console.log("Versión OpenCV:", cv.getVersionString ? cv.getVersionString() : "3.4.0");
    
    cvReady = true;
    loadStatus.textContent = "OpenCV cargado correctamente";
    loading.style.display = 'none';
    startBtn.style.display = 'block';
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
    let bestPoints = null;
    
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
                
                // Obtener puntos del marcador
                const points = [];
                for (let j = 0; j < 4; j++) {
                    points.push({
                        x: approx.data32S[j * 2],
                        y: approx.data32S[j * 2 + 1]
                    });
                }
                bestPoints = points;
                
                // Calcular distancia estimada
                const pixelArea = area;
                const distance = estimateDistanceFromArea(pixelArea);
                bestDistance = distance;
                
                // Calcular ángulo CORREGIDO
                const angle = calculateAngleCorrected(points);
                bestAngle = angle;
                
                approx.delete();
                break;
            }
        }
        approx.delete();
    }
    
    // Actualizar UI según detección
    if (markerFound && bestPoints) {
        // Dibujar el marcador y información
        drawMarkerAndInfo(src, bestPoints, bestDistance, bestAngle);
        
        // Actualizar valores en pantalla
        distEl.textContent = bestDistance.toFixed(1);
        angleEl.textContent = bestAngle.toFixed(1);
        
        // Evaluar ángulo y dar feedback
        evaluateAngle(bestAngle);
        
        // Calcular velocidad si tenemos datos previos
        const now = Date.now();
        if (prevPos && prevTime) {
            const dt = (now - prevTime) / 1000;
            const distanceChange = Math.abs(bestDistance - prevPos);
            const speed = dt > 0 ? distanceChange / dt : 0;
            
            speedEl.textContent = speed.toFixed(1);
            markerStatusEl.textContent = "🟢 Marcador detectado";
            
            // Feedback por velocidad
            if (speed > 5 && speed < 20) {
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
        prevAngle = bestAngle;
        prevTime = now;
        
    } else {
        // No se detectó marcador
        distEl.textContent = "--";
        angleEl.textContent = "--";
        speedEl.textContent = "--";
        markerStatusEl.textContent = "🔴 No se detecta marcador";
        angleStatusEl.textContent = "";
        prevPos = null;
        prevAngle = null;
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

// Calcular ángulo CORREGIDO: 0° = frontal, 90° = perpendicular
function calculateAngleCorrected(points) {
    if (points.length < 4) return 0;
    
    // Ordenar puntos: superior izquierdo, superior derecho, inferior derecho, inferior izquierdo
    points.sort((a, b) => a.y - b.y);
    const topPoints = points.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottomPoints = points.slice(2, 4).sort((a, b) => a.x - b.x);
    
    const topLeft = topPoints[0];
    const topRight = topPoints[1];
    const bottomLeft = bottomPoints[0];
    const bottomRight = bottomPoints[1];
    
    // Calcular ancho en la parte superior e inferior
    const widthTop = Math.sqrt(Math.pow(topRight.x - topLeft.x, 2) + Math.pow(topRight.y - topLeft.y, 2));
    const widthBottom = Math.sqrt(Math.pow(bottomRight.x - bottomLeft.x, 2) + Math.pow(bottomRight.y - bottomLeft.y, 2));
    
    // Calcular altura izquierda y derecha
    const heightLeft = Math.sqrt(Math.pow(bottomLeft.x - topLeft.x, 2) + Math.pow(bottomLeft.y - topLeft.y, 2));
    const heightRight = Math.sqrt(Math.pow(bottomRight.x - topRight.x, 2) + Math.pow(bottomRight.y - topRight.y, 2));
    
    // Calcular relación de aspecto para estimar ángulo
    // Si el celular está frontal (0°): widthTop ≈ widthBottom, heightLeft ≈ heightRight
    // Si está inclinado: widthTop ≠ widthBottom
    
    // Método 1: Usar diferencia entre anchos
    const widthDiff = Math.abs(widthTop - widthBottom);
    const widthAvg = (widthTop + widthBottom) / 2;
    
    // Método 2: Usar perspectiva (más preciso)
    // Calcular vector normal del plano
    const v1 = {x: topRight.x - topLeft.x, y: topRight.y - topLeft.y, z: 0};
    const v2 = {x: bottomLeft.x - topLeft.x, y: bottomLeft.y - topLeft.y, z: 0};
    
    // Producto cruzado para obtener normal
    const normal = {
        x: v1.y * v2.z - v1.z * v2.y,
        y: v1.z * v2.x - v1.x * v2.z,
        z: v1.x * v2.y - v1.y * v2.x
    };
    
    // Normalizar
    const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    if (length > 0) {
        normal.x /= length;
        normal.y /= length;
        normal.z /= length;
    }
    
    // Ángulo entre la normal y el vector de visión (0,0,1)
    // Si el celular está frontal: normal ≈ (0,0,1) → ángulo ≈ 0°
    // Si está perpendicular: normal ≈ (0,1,0) o (1,0,0) → ángulo ≈ 90°
    const dotProduct = normal.z; // Producto punto con (0,0,1)
    let angle = Math.acos(Math.min(Math.max(dotProduct, -1), 1)) * (180 / Math.PI);
    
    // Ajustar basado en la diferencia de anchos
    const perspectiveFactor = widthDiff / widthAvg;
    angle = angle * (1 + perspectiveFactor * 0.5);
    
    // Limitar entre 0 y 90 grados
    return Math.min(90, Math.max(0, angle));
}

// Evaluar el ángulo y dar feedback
function evaluateAngle(angle) {
    let status = "";
    let color = "";
    
    if (angle < ANGULO_OPTIMO_MIN - ANGULO_TOLERANCIA) {
        status = "Ángulo muy bajo";
        color = "#ff4444";
        angleStatusEl.style.color = color;
        angleStatusEl.textContent = status;
        
        // Reproducir sonido agudo
        if (sonidoAnguloBajo && audioContext && audioContext.state === 'running') {
            sonidoAnguloBajo.play();
        }
        
    } else if (angle > ANGULO_OPTIMO_MAX + ANGULO_TOLERANCIA) {
        status = "Ángulo muy alto";
        color = "#ff4444";
        angleStatusEl.style.color = color;
        angleStatusEl.textContent = status;
        
        // Reproducir sonido grave
        if (sonidoAnguloAlto && audioContext && audioContext.state === 'running') {
            sonidoAnguloAlto.play();
        }
        
    } else if (angle >= ANGULO_OPTIMO_MIN && angle <= ANGULO_OPTIMO_MAX) {
        status = "Ángulo óptimo ✓";
        color = "#44ff44";
        angleStatusEl.style.color = color;
        angleStatusEl.textContent = status;
        
        // Reproducir sonido óptimo
        if (sonidoOptimo && audioContext && audioContext.state === 'running') {
            sonidoOptimo.play();
        }
        
    } else {
        status = "Ángulo aceptable";
        color = "#ffff44";
        angleStatusEl.style.color = color;
        angleStatusEl.textContent = status;
    }
    
    // Actualizar color del valor del ángulo
    angleEl.style.color = color;
}

// Dibujar marcador e información
function drawMarkerAndInfo(img, points, distance, angle) {
    // Dibujar contorno del marcador
    const contourColor = new cv.Scalar(0, 255, 0, 255);
    const pointsArray = [];
    
    for (let i = 0; i < points.length; i++) {
        pointsArray.push(new cv.Point(points[i].x, points[i].y));
        // Dibujar línea entre puntos
        if (i > 0) {
            cv.line(img, pointsArray[i-1], pointsArray[i], contourColor, 3);
        }
    }
    // Última línea para cerrar el polígono
    cv.line(img, pointsArray[points.length-1], pointsArray[0], contourColor, 3);
    
    // Calcular centro
    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    
    // Dibujar punto central
    const centerColor = new cv.Scalar(255, 0, 0, 255);
    cv.circle(img, new cv.Point(centerX, centerY), 8, centerColor, -1);
    
    // Dibujar línea que muestra la inclinación
    const lineLength = 50;
    const angleRad = angle * (Math.PI / 180);
    const endX = centerX + lineLength * Math.sin(angleRad);
    const endY = centerY + lineLength * Math.cos(angleRad);
    
    const lineColor = new cv.Scalar(255, 255, 0, 255);
    cv.line(img, new cv.Point(centerX, centerY), new cv.Point(endX, endY), lineColor, 3);
    
    // Dibujar información
    const infoText = `${distance.toFixed(0)}cm | ${angle.toFixed(0)}°`;
    const textColor = new cv.Scalar(255, 255, 255, 255);
    const bgColor = new cv.Scalar(0, 0, 0, 180);
    
    // Fondo para texto
    const textSize = cv.getTextSize(infoText, cv.FONT_HERSHEY_SIMPLEX, 0.7, 2);
    const textX = centerX - textSize.width / 2;
    const textY = centerY - 40;
    
    cv.rectangle(img, 
        new cv.Point(textX - 10, textY - textSize.height - 10),
        new cv.Point(textX + textSize.width + 10, textY + 10),
        bgColor, -1);
    
    // Texto
    cv.putText(img, infoText, new cv.Point(textX, textY), 
              cv.FONT_HERSHEY_SIMPLEX, 0.7, textColor, 2);
}

// Estimar distancia basada en el área del marcador
function estimateDistanceFromArea(pixelArea) {
    const REAL_AREA_CM2 = MARKER_SIZE_CM * MARKER_SIZE_CM;
    const CALIBRATION_CONSTANT = 5000;
    
    if (pixelArea <= 0) return 100;
    
    const distance = CALIBRATION_CONSTANT / Math.sqrt(pixelArea);
    return Math.max(10, Math.min(distance, 200));
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

// Activar audio con primer toque (requerido en iOS)
document.addEventListener('click', function() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log("Audio activado");
        });
    }
}, { once: true });
