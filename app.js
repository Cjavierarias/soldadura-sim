console.log("Soldadura Sim AR - Versión Simplificada");

// Variables globales
let video = null;
let canvas = null;
let ctx = null;
let isProcessing = false;

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

// Elementos DOM
let startBtn = null;
let appContainer = null;
let loading = null;
let loadStatus = null;
let distEl = null;
let angleEl = null;
let speedEl = null;
let statusEl = null;

// Tamaño del marcador (cm)
const MARKER_SIZE_CM = 10;

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM cargado");
    
    // Obtener elementos
    startBtn = document.getElementById('startBtn');
    appContainer = document.getElementById('app');
    loading = document.getElementById('loading');
    loadStatus = document.getElementById('loadStatus');
    video = document.getElementById('camera');
    canvas = document.getElementById('overlay');
    distEl = document.getElementById('dist');
    angleEl = document.getElementById('angle');
    speedEl = document.getElementById('speed');
    statusEl = document.getElementById('status');
    
    // Contexto del canvas
    ctx = canvas.getContext('2d');
    
    // Configurar botón
    startBtn.addEventListener('click', startApp);
    
    // Inicializar audio
    initAudio();
    
    // Ocultar loading después de un tiempo
    setTimeout(() => {
        if (loading.style.display !== 'none') {
            loading.style.display = 'none';
            startBtn.style.display = 'block';
        }
    }, 2000);
});

// Inicializar audio
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("✅ Audio inicializado");
    } catch (e) {
        console.warn("⚠️ Audio no disponible:", e);
    }
}

// Reproducir sonido
function playSound(frequency, duration = 0.1, type = 'sine') {
    const now = Date.now();
    if (now - ultimoSonido < TIEMPO_ENTRE_SONIDOS) return;
    
    try {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = type;
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
    console.log("Iniciando aplicación...");
    
    try {
        startBtn.style.display = 'none';
        loadStatus.textContent = "Solicitando cámara...";
        loading.style.display = 'flex';
        
        // Solicitar cámara
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment",
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });
        
        video.srcObject = stream;
        
        // Esperar a que el video esté listo
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                console.log("Video listo:", video.videoWidth, "x", video.videoHeight);
                
                // Configurar canvas
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Escalar para móviles
                const scale = Math.min(window.innerWidth / video.videoWidth, window.innerHeight / video.videoHeight);
                canvas.style.transform = `scale(${scale})`;
                canvas.style.transformOrigin = 'top left';
                
                resolve();
            };
        });
        
        // Esperar a que el video empiece
        await new Promise((resolve) => {
            video.onplaying = () => {
                console.log("Video reproduciéndose");
                resolve();
            };
        });
        
        // Mostrar aplicación
        loading.style.display = 'none';
        appContainer.style.display = 'block';
        
        // Iniciar procesamiento
        isProcessing = true;
        processFrame();
        
    } catch (error) {
        console.error("Error al iniciar:", error);
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
        
        // Obtener datos de imagen
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Detectar marcador simple (cuadrado negro)
        const detection = detectSimpleMarker(imageData);
        
        if (detection.found) {
            // Calcular distancia (simulada basada en tamaño)
            const distance = calculateDistance(detection.size);
            
            // Calcular ángulo (basado en deformación del cuadrado)
            const angle = calculateAngle(detection.corners);
            
            // Calcular velocidad
            const now = Date.now();
            let speed = 0;
            
            if (prevDistance && prevTime) {
                const dt = (now - prevTime) / 1000;
                const dDist = Math.abs(distance - prevDistance);
                speed = dt > 0 ? dDist / dt : 0;
            }
            
            // Actualizar UI
            updateUI(distance, angle, speed, detection.corners);
            
            // Feedback de ángulo
            giveAngleFeedback(angle);
            
            // Guardar para siguiente frame
            prevDistance = distance;
            prevAngle = angle;
            prevTime = now;
            
        } else {
            // No se detectó marcador
            distEl.textContent = "--";
            angleEl.textContent = "--";
            speedEl.textContent = "--";
            statusEl.textContent = "🔴 No se detecta marcador";
            prevDistance = null;
            prevAngle = null;
        }
        
        // Siguiente frame
        requestAnimationFrame(processFrame);
        
    } catch (error) {
        console.error("Error en processFrame:", error);
        statusEl.textContent = "⚠️ Error de procesamiento";
        isProcessing = false;
    }
}

// Detectar marcador simple (sin OpenCV)
function detectSimpleMarker(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    
    // Buscar área oscura en el centro de la imagen
    const searchSize = Math.min(width, height) * 0.3;
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    
    let darkestX = centerX;
    let darkestY = centerY;
    let darkestValue = 255 * 3;
    
    // Buscar el punto más oscuro cerca del centro
    for (let y = centerY - searchSize/2; y < centerY + searchSize/2; y += 3) {
        for (let x = centerX - searchSize/2; x < centerX + searchSize/2; x += 3) {
            if (x >= 0 && x < width && y >= 0 && y < height) {
                const idx = (y * width + x) * 4;
                const brightness = data[idx] + data[idx + 1] + data[idx + 2];
                
                if (brightness < darkestValue) {
                    darkestValue = brightness;
                    darkestX = x;
                    darkestY = y;
                }
            }
        }
    }
    
    // Si encontramos un punto oscuro
    if (darkestValue < 150) { // Umbral de oscuridad
        // Intentar encontrar los bordes del cuadrado
        const corners = findSquareCorners(imageData, darkestX, darkestY);
        
        if (corners) {
            // Calcular tamaño aproximado
            const width = Math.abs(corners[1].x - corners[0].x);
            const height = Math.abs(corners[3].y - corners[0].y);
            const size = (width + height) / 2;
            
            // Dibujar detección
            drawDetection(corners);
            
            return {
                found: true,
                corners: corners,
                size: size,
                center: {x: darkestX, y: darkestY}
            };
        }
    }
    
    return { found: false };
}

// Encontrar esquinas del cuadrado
function findSquareCorners(imageData, startX, startY) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    
    // Buscar bordes en 4 direcciones
    const directions = [
        {dx: 1, dy: 0},   // Derecha
        {dx: 0, dy: 1},   // Abajo
        {dx: -1, dy: 0},  // Izquierda
        {dx: 0, dy: -1}   // Arriba
    ];
    
    const corners = [];
    const edgeDistance = 50; // Máxima distancia para buscar borde
    
    for (let dir of directions) {
        let x = startX;
        let y = startY;
        let foundEdge = false;
        
        for (let i = 0; i < edgeDistance; i++) {
            x += dir.dx;
            y += dir.dy;
            
            if (x < 0 || x >= width || y < 0 || y >= height) break;
            
            const idx = (y * width + x) * 4;
            const brightness = data[idx] + data[idx + 1] + data[idx + 2];
            
            // Si encontramos un borde (píxel claro después de oscuro)
            if (brightness > 200) {
                corners.push({x: x - dir.dx, y: y - dir.dy});
                foundEdge = true;
                break;
            }
        }
        
        if (!foundEdge) {
            corners.push({x: startX + dir.dx * edgeDistance, y: startY + dir.dy * edgeDistance});
        }
    }
    
    // Ordenar esquinas: superior izquierda, superior derecha, inferior derecha, inferior izquierda
    if (corners.length === 4) {
        corners.sort((a, b) => a.y - b.y);
        const top = corners.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottom = corners.slice(2, 4).sort((a, b) => a.x - b.x);
        
        return [top[0], top[1], bottom[1], bottom[0]];
    }
    
    return null;
}

// Dibujar detección en canvas
function drawDetection(corners) {
    if (!corners || corners.length !== 4) return;
    
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    // Dibujar cuadrado
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) {
        ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    
    // Dibujar centro
    const centerX = corners.reduce((sum, p) => sum + p.x, 0) / 4;
    const centerY = corners.reduce((sum, p) => sum + p.y, 0) / 4;
    
    ctx.fillStyle = '#f00';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    ctx.fill();
}

// Calcular distancia (simplificado)
function calculateDistance(pixelSize) {
    // Fórmula simple: distancia = constante / tamaño en píxeles
    const constante = 5000;
    const distancia = constante / pixelSize;
    
    // Limitar entre 10-100 cm
    return Math.max(10, Math.min(distancia, 100));
}

// Calcular ángulo (simplificado)
function calculateAngle(corners) {
    if (!corners || corners.length !== 4) return 0;
    
    // Calcular diferencias entre lados opuestos
    const topWidth = Math.abs(corners[1].x - corners[0].x);
    const bottomWidth = Math.abs(corners[2].x - corners[3].x);
    
    const leftHeight = Math.abs(corners[3].y - corners[0].y);
    const rightHeight = Math.abs(corners[2].y - corners[1].y);
    
    // Si el celular está frontal: topWidth ≈ bottomWidth, leftHeight ≈ rightHeight
    // Si está inclinado: hay diferencias
    
    // Calcular diferencia relativa
    const widthDiff = Math.abs(topWidth - bottomWidth) / ((topWidth + bottomWidth) / 2);
    const heightDiff = Math.abs(leftHeight - rightHeight) / ((leftHeight + rightHeight) / 2);
    
    // Combinar diferencias para estimar ángulo
    const diffTotal = (widthDiff + heightDiff) * 50;
    
    // Limitar ángulo entre 0-90 grados
    return Math.min(90, Math.max(0, diffTotal * 100));
}

// Actualizar UI
function updateUI(distance, angle, speed, corners) {
    distEl.textContent = distance.toFixed(1);
    angleEl.textContent = angle.toFixed(1);
    speedEl.textContent = speed.toFixed(1);
    
    // Color del ángulo según rango
    if (angle >= ANGULO_OPTIMO_MIN && angle <= ANGULO_OPTIMO_MAX) {
        angleEl.style.color = '#0f0';
        statusEl.textContent = "✅ Ángulo óptimo";
    } else if (angle < ANGULO_OPTIMO_MIN) {
        angleEl.style.color = '#f00';
        statusEl.textContent = "⚠️ Ángulo muy bajo";
    } else {
        angleEl.style.color = '#f00';
        statusEl.textContent = "⚠️ Ángulo muy alto";
    }
    
    // Dibujar línea de inclinación si hay esquinas
    if (corners) {
        const centerX = corners.reduce((sum, p) => sum + p.x, 0) / 4;
        const centerY = corners.reduce((sum, p) => sum + p.y, 0) / 4;
        
        // Convertir ángulo a radianes
        const angleRad = angle * (Math.PI / 180);
        const lineLength = 50;
        
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
            centerX + Math.sin(angleRad) * lineLength,
            centerY + Math.cos(angleRad) * lineLength
        );
        ctx.stroke();
    }
}

// Dar feedback de ángulo con sonido
function giveAngleFeedback(angle) {
    const now = Date.now();
    if (now - ultimoSonido < TIEMPO_ENTRE_SONIDOS) return;
    
    if (angle < ANGULO_OPTIMO_MIN) {
        // Ángulo bajo - sonido agudo
        playSound(800, 0.15);
        if (navigator.vibrate) navigator.vibrate(50);
        
    } else if (angle > ANGULO_OPTIMO_MAX) {
        // Ángulo alto - sonido grave
        playSound(200, 0.2);
        if (navigator.vibrate) navigator.vibrate(100);
        
    } else if (angle >= ANGULO_OPTIMO_MIN && angle <= ANGULO_OPTIMO_MAX) {
        // Ángulo óptimo - sonido medio (cada 2 segundos)
        if (now - ultimoSonido > 2000) {
            playSound(400, 0.1);
            if (navigator.vibrate) navigator.vibrate(20);
        }
    }
}

// Activar audio con primer toque
document.addEventListener('click', function() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log("Audio activado");
        });
    }
});

// Manejar errores
window.addEventListener('error', function(e) {
    console.error('Error global:', e.error);
    statusEl.textContent = "⚠️ Error - Recarga la página";
    isProcessing = false;
});

// Pausar cuando no está visible
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        isProcessing = false;
    } else if (video.srcObject) {
        isProcessing = true;
        processFrame();
    }
});
