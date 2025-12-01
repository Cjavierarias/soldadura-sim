console.log("Soldadura Sim AR - Iniciando...");

// Variables globales
let video = null;
let canvas = null;
let ctx = null;
let isProcessing = false;
let stream = null;

// Variables de seguimiento
let prevTime = 0;
let prevDistance = null;
let prevAngle = null;

// Rango óptimo para soldadura
const ANGULO_OPTIMO_MIN = 15;
const ANGULO_OPTIMO_MAX = 30;

// Audio
let audioContext = null;
let ultimoSonido = 0;
const TIEMPO_ENTRE_SONIDOS = 300;

// Tamaño del marcador (cm)
const MARKER_SIZE_CM = 10;

// Referencias a elementos DOM
let startBtn, appContainer, loading, loadStatus;
let distEl, angleEl, speedEl, statusEl;

// Inicialización
function init() {
    console.log("Inicializando...");
    
    // Obtener elementos DOM
    startBtn = document.getElementById('startBtn');
    appContainer = document.getElementById('app');
    loading = document.getElementById('loading');
    loadStatus = document.getElementById('loadStatus');
    canvas = document.getElementById('cameraView');
    distEl = document.getElementById('dist');
    angleEl = document.getElementById('angle');
    speedEl = document.getElementById('speed');
    statusEl = document.getElementById('status');
    
    // Obtener contexto 2D del canvas
    ctx = canvas.getContext('2d');
    
    // Configurar botón de inicio
    startBtn.addEventListener('click', startApp);
    
    // Inicializar audio
    initAudio();
    
    // Mostrar botón después de carga
    setTimeout(() => {
        loading.style.display = 'none';
        startBtn.style.display = 'block';
    }, 1000);
}

// Inicializar sistema de audio
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("✅ Audio inicializado");
    } catch (e) {
        console.warn("⚠️ Audio no disponible:", e);
    }
}

// Reproducir sonido
function playSound(frequency, duration = 0.1) {
    const now = Date.now();
    if (now - ultimoSonido < TIEMPO_ENTRE_SONIDOS) return;
    
    try {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
        
        ultimoSonido = now;
    } catch (e) {
        console.log("Error en audio:", e);
    }
}

// Iniciar aplicación
async function startApp() {
    console.log("🚀 Iniciando aplicación...");
    
    try {
        // Ocultar botón y mostrar loading
        startBtn.style.display = 'none';
        loadStatus.textContent = "Solicitando acceso a cámara...";
        loading.style.display = 'flex';
        
        // Crear elemento video oculto
        video = document.createElement('video');
        video.setAttribute('autoplay', '');
        video.setAttribute('playsinline', '');
        video.style.display = 'none';
        document.body.appendChild(video);
        
        // Solicitar acceso a cámara trasera
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { exact: "environment" }, // Forzar cámara trasera
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });
        
        video.srcObject = stream;
        
        // Esperar a que el video esté listo
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                console.log("📷 Video listo:", video.videoWidth, "x", video.videoHeight);
                
                // Configurar canvas con las mismas dimensiones del video
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Ajustar visualmente al tamaño de la pantalla
                adjustCanvasToScreen();
                
                resolve();
            };
        });
        
        // Esperar a que el video empiece
        await new Promise((resolve) => {
            video.onplaying = () => {
                console.log("▶️ Video reproduciéndose");
                resolve();
            };
            
            // Timeout de seguridad
            setTimeout(resolve, 1000);
        });
        
        // Ocultar loading y mostrar aplicación
        loading.style.display = 'none';
        appContainer.style.display = 'block';
        
        // Iniciar procesamiento
        isProcessing = true;
        processFrame();
        
        console.log("✅ Aplicación iniciada correctamente");
        
    } catch (error) {
        console.error("❌ Error al iniciar:", error);
        
        // Intentar con configuración más permisiva
        if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
            console.log("Intentando con configuración alternativa...");
            loadStatus.textContent = "Intentando configuración alternativa...";
            
            try {
                // Configuración alternativa
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: "environment",
                        width: { min: 320, ideal: 640, max: 1280 },
                        height: { min: 240, ideal: 480, max: 720 }
                    }
                });
                
                video.srcObject = stream;
                
                // Reintentar inicio
                setTimeout(() => {
                    loading.style.display = 'none';
                    appContainer.style.display = 'block';
                    isProcessing = true;
                    processFrame();
                }, 500);
                
            } catch (secondError) {
                showError(secondError);
            }
        } else {
            showError(error);
        }
    }
}

// Mostrar error
function showError(error) {
    loadStatus.textContent = `Error: ${error.message}`;
    startBtn.style.display = 'block';
    startBtn.textContent = "🔄 Reintentar";
    
    if (error.name === 'NotAllowedError') {
        alert("Permiso de cámara denegado. Por favor, permite el acceso a la cámara en los ajustes de tu navegador.");
    } else if (error.name === 'NotFoundError') {
        alert("No se encontró cámara trasera. Asegúrate de usar un dispositivo con cámara trasera.");
    } else {
        alert(`Error: ${error.message}\n\nIntenta recargar la página.`);
    }
}

// Ajustar canvas al tamaño de la pantalla
function adjustCanvasToScreen() {
    if (!canvas || !video) return;
    
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const videoRatio = video.videoWidth / video.videoHeight;
    const screenRatio = screenWidth / screenHeight;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (screenRatio > videoRatio) {
        // Pantalla más ancha que el video
        drawHeight = screenHeight;
        drawWidth = screenHeight * videoRatio;
        offsetX = (screenWidth - drawWidth) / 2;
        offsetY = 0;
    } else {
        // Pantalla más alta que el video
        drawWidth = screenWidth;
        drawHeight = screenWidth / videoRatio;
        offsetX = 0;
        offsetY = (screenHeight - drawHeight) / 2;
    }
    
    // Aplicar transformación CSS
    canvas.style.position = 'fixed';
    canvas.style.top = offsetY + 'px';
    canvas.style.left = offsetX + 'px';
    canvas.style.width = drawWidth + 'px';
    canvas.style.height = drawHeight + 'px';
    canvas.style.objectFit = 'cover';
}

// Procesar cada frame
function processFrame() {
    if (!isProcessing || !video || video.readyState !== 4) {
        if (isProcessing) {
            requestAnimationFrame(processFrame);
        }
        return;
    }
    
    try {
        // LIMPIAR el canvas completamente
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Dibujar el video en el canvas (sin escala para procesamiento)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Obtener datos de imagen para procesamiento
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Detectar marcador
        const detection = detectMarker(imageData);
        
        if (detection.found) {
            // Calcular valores
            const distance = calculateDistance(detection.size);
            const angle = calculateAngle(detection.corners);
            const speed = calculateSpeed(distance, angle);
            
            // Actualizar UI
            updateDisplay(distance, angle, speed);
            
            // Dibujar sobre el canvas (después del video)
            drawOverlay(detection.corners, angle, distance);
            
            // Feedback de audio
            provideAudioFeedback(angle);
            
        } else {
            // No se detectó marcador
            resetDisplay();
        }
        
        // Continuar procesamiento
        requestAnimationFrame(processFrame);
        
    } catch (error) {
        console.error("Error en processFrame:", error);
        statusEl.textContent = "⚠️ Error de procesamiento";
        isProcessing = false;
    }
}

// Detectar marcador (algoritmo simplificado)
function detectMarker(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    
    // Área de búsqueda (centro de la pantalla)
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const searchRadius = Math.min(width, height) * 0.2;
    
    // Buscar área oscura
    let totalDark = 0;
    let minX = centerX, maxX = centerX;
    let minY = centerY, maxY = centerY;
    
    for (let y = centerY - searchRadius; y < centerY + searchRadius; y += 2) {
        for (let x = centerX - searchRadius; x < centerX + searchRadius; x += 2) {
            if (x >= 0 && x < width && y >= 0 && y < height) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                
                // Píxel oscuro (negro)
                if (r < 50 && g < 50 && b < 50) {
                    totalDark++;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
    }
    
    // Si encontramos suficiente área oscura
    const area = (maxX - minX) * (maxY - minY);
    const darkRatio = totalDark / (area || 1);
    
    if (darkRatio > 0.3 && area > 500) {
        // Esquinas del área detectada
        const corners = [
            {x: minX, y: minY}, // superior izquierda
            {x: maxX, y: minY}, // superior derecha
            {x: maxX, y: maxY}, // inferior derecha
            {x: minX, y: maxY}  // inferior izquierda
        ];
        
        return {
            found: true,
            corners: corners,
            size: Math.max(maxX - minX, maxY - minY),
            center: {x: (minX + maxX) / 2, y: (minY + maxY) / 2}
        };
    }
    
    return { found: false };
}

// Calcular distancia (simplificado)
function calculateDistance(pixelSize) {
    const baseSize = 100; // tamaño en píxeles a 30cm
    const distance = (baseSize / pixelSize) * 30;
    return Math.max(10, Math.min(distance, 100));
}

// Calcular ángulo (0° = frontal, 90° = perpendicular)
function calculateAngle(corners) {
    if (!corners || corners.length !== 4) return 0;
    
    const [tl, tr, br, bl] = corners;
    
    // Calcular diferencias entre lados
    const topWidth = Math.abs(tr.x - tl.x);
    const bottomWidth = Math.abs(br.x - bl.x);
    
    // Si el celular está frontal: topWidth ≈ bottomWidth
    // Si está inclinado: topWidth ≠ bottomWidth
    
    const widthRatio = Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth);
    const widthDiff = 1 - widthRatio;
    
    // Convertir a ángulo (0-90 grados)
    let angle = widthDiff * 90;
    
    // Suavizar el valor
    if (prevAngle !== null) {
        angle = prevAngle * 0.7 + angle * 0.3;
    }
    
    return Math.min(90, Math.max(0, angle));
}

// Calcular velocidad
function calculateSpeed(distance, angle) {
    const now = Date.now();
    let speed = 0;
    
    if (prevDistance !== null && prevTime !== 0) {
        const dt = (now - prevTime) / 1000; // segundos
        if (dt > 0) {
            const distanceChange = Math.abs(distance - prevDistance);
            speed = distanceChange / dt;
        }
    }
    
    prevDistance = distance;
    prevTime = now;
    
    return speed;
}

// Actualizar display
function updateDisplay(distance, angle, speed) {
    distEl.textContent = distance.toFixed(1);
    angleEl.textContent = angle.toFixed(1);
    speedEl.textContent = speed.toFixed(1);
    
    // Color según ángulo
    if (angle >= ANGULO_OPTIMO_MIN && angle <= ANGULO_OPTIMO_MAX) {
        angleEl.style.color = '#0f0';
        statusEl.textContent = "✅ Ángulo óptimo";
        statusEl.style.color = '#0f0';
    } else if (angle < ANGULO_OPTIMO_MIN) {
        angleEl.style.color = '#f00';
        statusEl.textContent = "⚠️ Ángulo bajo";
        statusEl.style.color = '#f00';
    } else {
        angleEl.style.color = '#f00';
        statusEl.textContent = "⚠️ Ángulo alto";
        statusEl.style.color = '#f00';
    }
}

// Resetear display
function resetDisplay() {
    distEl.textContent = "--";
    angleEl.textContent = "--";
    speedEl.textContent = "--";
    statusEl.textContent = "🔴 Buscando marcador...";
    statusEl.style.color = '#ff0';
    angleEl.style.color = '#ff0';
    
    prevDistance = null;
}

// Dibujar overlay en el canvas
function drawOverlay(corners, angle, distance) {
    if (!corners) return;
    
    const [tl, tr, br, bl] = corners;
    const centerX = (tl.x + tr.x + br.x + bl.x) / 4;
    const centerY = (tl.y + tr.y + br.y + bl.y) / 4;
    
    // Dibujar contorno del marcador
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.stroke();
    
    // Dibujar línea de inclinación
    const angleRad = (90 - angle) * (Math.PI / 180);
    const lineLength = 80;
    
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
        centerX + Math.cos(angleRad) * lineLength,
        centerY + Math.sin(angleRad) * lineLength
    );
    ctx.stroke();
    
    // Dibujar punto central
    ctx.fillStyle = '#f00';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    ctx.fill();
}

// Proporcionar feedback de audio
function provideAudioFeedback(angle) {
    const now = Date.now();
    if (now - ultimoSonido < TIEMPO_ENTRE_SONIDOS) return;
    
    if (angle < ANGULO_OPTIMO_MIN) {
        // Ángulo muy bajo - sonido agudo
        playSound(800, 0.15);
        if (navigator.vibrate) navigator.vibrate(50);
    } else if (angle > ANGULO_OPTIMO_MAX) {
        // Ángulo muy alto - sonido grave
        playSound(200, 0.2);
        if (navigator.vibrate) navigator.vibrate(100);
    } else if (angle >= ANGULO_OPTIMO_MIN && angle <= ANGULO_OPTIMO_MAX) {
        // Ángulo óptimo - sonido medio (menos frecuente)
        if (now - ultimoSonido > 1500) {
            playSound(400, 0.1);
            if (navigator.vibrate) navigator.vibrate(20);
        }
    }
}

// Manejar cambios de tamaño de ventana
window.addEventListener('resize', () => {
    if (video) {
        adjustCanvasToScreen();
    }
});

// Activar audio con primer toque (requerido en iOS)
document.addEventListener('click', function activateAudio() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log("Audio activado");
        });
    }
    document.removeEventListener('click', activateAudio);
});

// Pausar procesamiento cuando la app no es visible
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        isProcessing = false;
    } else if (stream) {
        isProcessing = true;
        processFrame();
    }
});

// Manejar errores globales
window.addEventListener('error', (e) => {
    console.error('Error global:', e.error);
    statusEl.textContent = "⚠️ Error - Recarga la página";
    isProcessing = false;
});

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
