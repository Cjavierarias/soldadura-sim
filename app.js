const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

console.log("App iniciada - Versión corregida");

let prevTime = 0;
let prevPos = null;
let prevAngle = null;

const MARKER_SIZE_CM = 10; // tamaño real del marcador ARUCO

function onOpenCvReady() {
    console.log("OpenCV.js listo!");
    
    // Solicitar cámara
    navigator.mediaDevices.getUserMedia({
        video: { 
            facingMode: "environment",
            width: { ideal: 640 },
            height: { ideal: 480 }
        }
    }).then(stream => {
        console.log("Cámara accedida");
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            console.log("Dimensiones video:", video.videoWidth, "x", video.videoHeight);
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // Iniciar procesamiento
            requestAnimationFrame(processFrame);
        };
        
    }).catch(err => {
        console.error("Error cámara:", err);
        alert("Error de cámara: " + err.message);
    });
}

function processFrame() {
    try {
        // Dibujar video en canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Solo procesar si OpenCV está cargado
        if (typeof cv === 'undefined') {
            requestAnimationFrame(processFrame);
            return;
        }
        
        // Leer imagen para OpenCV
        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        // Umbralizar para mejor detección
        const threshold = new cv.Mat();
        cv.threshold(gray, threshold, 100, 255, cv.THRESH_BINARY);
        
        // Encontrar contornos
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(threshold, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);
        
        let markerFound = false;
        let bestDistance = 0;
        let bestAngle = 0;
        
        // Buscar contornos cuadrados
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const perimeter = cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
            
            // Si tiene 4 lados, es un posible marcador
            if (approx.rows === 4) {
                const area = cv.contourArea(approx);
                
                // Filtrar por área mínima
                if (area > 1000) {
                    markerFound = true;
                    
                    // Obtener puntos del contorno
                    const points = [];
                    for (let j = 0; j < 4; j++) {
                        points.push({
                            x: approx.data32S[j * 2],
                            y: approx.data32S[j * 2 + 1]
                        });
                    }
                    
                    // Calcular distancia (basada en área)
                    const distance = estimateDistanceFromArea(area);
                    bestDistance = distance;
                    
                    // Calcular ángulo CORREGIDO - función nueva
                    const angle = calculateAngleCorrected(points);
                    bestAngle = angle;
                    
                    // Dibujar contorno
                    const color = new cv.Scalar(0, 255, 0, 255);
                    cv.drawContours(src, contours, i, color, 3);
                    
                    // Dibujar información
                    drawMarkerInfo(src, points, distance, angle);
                    
                    approx.delete();
                    break;
                }
            }
            approx.delete();
        }
        
        // Actualizar UI si se encontró marcador
        if (markerFound) {
            document.getElementById('dist').textContent = bestDistance.toFixed(1);
            document.getElementById('angle').textContent = bestAngle.toFixed(1);
            
            // Calcular velocidad
            const now = Date.now();
            if (prevPos && prevTime) {
                const dt = (now - prevTime) / 1000;
                const dx = bestDistance - prevPos;
                const speed = Math.abs(dx / dt);
                document.getElementById('speed').textContent = speed.toFixed(1);
            } else {
                document.getElementById('speed').textContent = "0.0";
            }
            
            prevPos = bestDistance;
            prevAngle = bestAngle;
            prevTime = now;
            
        } else {
            // No se encontró marcador
            document.getElementById('dist').textContent = "--";
            document.getElementById('angle').textContent = "--";
            document.getElementById('speed').textContent = "--";
            prevPos = null;
            prevAngle = null;
        }
        
        // Mostrar imagen procesada
        cv.imshow(canvas, src);
        
        // Liberar memoria
        src.delete();
        gray.delete();
        threshold.delete();
        contours.delete();
        hierarchy.delete();
        
    } catch (error) {
        console.error("Error en procesamiento:", error);
    }
    
    // Continuar procesamiento
    requestAnimationFrame(processFrame);
}

// FUNCIÓN CORREGIDA: Calcular ángulo (0° = frontal, 90° = perpendicular)
function calculateAngleCorrected(points) {
    if (!points || points.length !== 4) return 0;
    
    // Ordenar puntos: superior izquierdo, superior derecho, inferior derecho, inferior izquierdo
    // Primero ordenar por Y, luego por X
    const sortedPoints = [...points].sort((a, b) => {
        if (Math.abs(a.y - b.y) < 20) { // Si están en similar altura
            return a.x - b.x; // Ordenar por X
        }
        return a.y - b.y; // Ordenar por Y
    });
    
    // Los 2 primeros son los superiores
    const topPoints = sortedPoints.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottomPoints = sortedPoints.slice(2, 4).sort((a, b) => a.x - b.x);
    
    const topLeft = topPoints[0];
    const topRight = topPoints[1];
    const bottomLeft = bottomPoints[0];
    const bottomRight = bottomPoints[1];
    
    // Calcular vectores de los lados
    const topVector = {
        x: topRight.x - topLeft.x,
        y: topRight.y - topLeft.y
    };
    
    const bottomVector = {
        x: bottomRight.x - bottomLeft.x,
        y: bottomRight.y - bottomLeft.y
    };
    
    const leftVector = {
        x: bottomLeft.x - topLeft.x,
        y: bottomLeft.y - topLeft.y
    };
    
    const rightVector = {
        x: bottomRight.x - topRight.x,
        y: bottomRight.y - topRight.y
    };
    
    // Calcular longitudes
    const topLength = Math.sqrt(topVector.x * topVector.x + topVector.y * topVector.y);
    const bottomLength = Math.sqrt(bottomVector.x * bottomVector.x + bottomVector.y * bottomVector.y);
    const leftLength = Math.sqrt(leftVector.x * leftVector.x + leftVector.y * leftVector.y);
    const rightLength = Math.sqrt(rightVector.x * rightVector.x + rightVector.y * rightVector.y);
    
    // Si el cuadrado está frontal: 
    // - topLength ≈ bottomLength
    // - leftLength ≈ rightLength
    // - Los vectores son paralelos
    
    // Calcular diferencia de perspectivas
    const widthRatio = Math.min(topLength, bottomLength) / Math.max(topLength, bottomLength);
    const heightRatio = Math.min(leftLength, rightLength) / Math.max(leftLength, rightLength);
    
    // El ángulo se basa en cuánto difieren los lados opuestos
    // Si widthRatio ≈ 1 y heightRatio ≈ 1 → ángulo ≈ 0° (frontal)
    // Si widthRatio << 1 o heightRatio << 1 → ángulo ≈ 90° (perpendicular)
    
    const widthDiff = 1 - widthRatio;
    const heightDiff = 1 - heightRatio;
    
    // Combinar ambas diferencias
    const totalDiff = (widthDiff + heightDiff) / 2;
    
    // Convertir a ángulo (0-90 grados)
    // Usamos una función exponencial para mejor respuesta
    let angle = 90 * (1 - Math.exp(-3 * totalDiff));
    
    // Suavizar con valor anterior si existe
    if (prevAngle !== null) {
        angle = prevAngle * 0.7 + angle * 0.3;
    }
    
    return Math.min(90, Math.max(0, angle));
}

// Estimar distancia basada en área
function estimateDistanceFromArea(pixelArea) {
    const REAL_AREA_CM2 = MARKER_SIZE_CM * MARKER_SIZE_CM; // 100 cm²
    const CALIBRATION_CONSTANT = 50000; // Ajustar según cámara
    
    if (pixelArea <= 0) return 100;
    
    // Fórmula: distancia ∝ 1/√área
    const distance = CALIBRATION_CONSTANT / Math.sqrt(pixelArea);
    
    // Limitar entre 10-200 cm
    return Math.max(10, Math.min(distance, 200));
}

// Dibujar información del marcador
function drawMarkerInfo(img, points, distance, angle) {
    if (!points || points.length !== 4) return;
    
    // Calcular centro
    const centerX = points.reduce((sum, p) => sum + p.x, 0) / 4;
    const centerY = points.reduce((sum, p) => sum + p.y, 0) / 4;
    
    // Dibujar punto central
    const centerColor = new cv.Scalar(255, 0, 0, 255);
    cv.circle(img, new cv.Point(centerX, centerY), 8, centerColor, -1);
    
    // Dibujar línea de inclinación
    const angleRad = angle * (Math.PI / 180);
    const lineLength = 60;
    const endX = centerX + Math.sin(angleRad) * lineLength;
    const endY = centerY + Math.cos(angleRad) * lineLength;
    
    const lineColor = new cv.Scalar(255, 255, 0, 255);
    cv.line(img, new cv.Point(centerX, centerY), new cv.Point(endX, endY), lineColor, 3);
    
    // Mostrar texto con información
    const infoText = `${distance.toFixed(0)}cm | ${angle.toFixed(0)}°`;
    const textColor = new cv.Scalar(255, 255, 255, 255);
    const bgColor = new cv.Scalar(0, 0, 0, 180);
    
    // Calcular tamaño del texto
    const textSize = cv.getTextSize(infoText, cv.FONT_HERSHEY_SIMPLEX, 0.7, 2);
    const textX = centerX - textSize.width / 2;
    const textY = centerY - 40;
    
    // Fondo para texto
    cv.rectangle(img, 
        new cv.Point(textX - 10, textY - textSize.height - 10),
        new cv.Point(textX + textSize.width + 10, textY + 10),
        bgColor, -1);
    
    // Texto
    cv.putText(img, infoText, new cv.Point(textX, textY), 
              cv.FONT_HERSHEY_SIMPLEX, 0.7, textColor, 2);
}

// Manejar errores globales
window.addEventListener('error', function(e) {
    console.error('Error global:', e.error);
});
