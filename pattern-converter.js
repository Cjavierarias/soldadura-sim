// pattern-converter.js
// Convierte tu imagen 4x4_1000.png a formato .patt para AR.js

function convertImageToPattern() {
  // Esta función se ejecuta cuando la página carga
  console.log("Preparando patrón para AR.js...");
  
  // Verificar si ya existe el archivo .patt
  checkPatternFile();
}

function checkPatternFile() {
  // Intentar cargar el patrón
  const testReq = new XMLHttpRequest();
  testReq.open('GET', '4x4_1000.patt', true);
  
  testReq.onload = function() {
    if (testReq.status === 200) {
      console.log("Patrón .patt encontrado");
      document.getElementById('loadStatus').textContent = 'Patrón AR listo ✅';
    } else {
      console.log("Creando patrón .patt desde imagen...");
      createPatternFromImage();
    }
  };
  
  testReq.onerror = function() {
    console.log("No hay patrón .patt, creando uno por defecto...");
    createDefaultPattern();
  };
  
  testReq.send();
}

function createDefaultPattern() {
  // Crear un patrón .patt simple para pruebas
  const defaultPattern = `
    # Patrón AR.js para simulador de soldadura
    # Generado automáticamente
    25 25
    255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255
    255 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 255
    255 0 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 0 255
    255 0 255 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 255 0 255
    255 0 255 0 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 0 255 0 255
    255 0 255 0 255 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 255 0 255 0 255
    255 0 255 0 255 0 255 255 255 255 255 255 255 255 255 255 255 255 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 0 0 0 0 0 0 0 0 0 0 0 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 0 255 255 255 255 255 255 255 255 255 0 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 0 255 0 0 0 0 0 0 0 255 0 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 0 255 0 255 255 255 255 0 255 255 0 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 0 255 0 255 0 0 255 0 255 255 0 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 0 255 0 255 0 0 255 0 255 255 0 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 0 255 0 255 255 255 255 0 255 255 0 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 0 255 0 0 0 0 0 0 0 255 0 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 0 255 255 255 255 255 255 255 255 255 0 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 0 0 0 0 0 0 0 0 0 0 0 255 0 255 0 255 0 255
    255 0 255 0 255 0 255 255 255 255 255 255 255 255 255 255 255 255 255 0 255 0 255 0 255
    255 0 255 0 255 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 255 0 255 0 255
    255 0 255 0 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 0 255 0 255
    255 0 255 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 255 0 255
    255 0 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 0 255
    255 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 255
    255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255 255
  `;
  
  // Crear un blob y descargarlo
  const blob = new Blob([defaultPattern], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  // Guardar en localStorage como fallback
  localStorage.setItem('weldPattern', defaultPattern);
  
  console.log("Patrón por defecto creado");
  document.getElementById('loadStatus').textContent = 'Patrón creado (usando patrón por defecto)';
}

function createPatternFromImage() {
  // Convertir imagen a patrón usando un canvas
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = '4x4_1000.png';
  
  img.onload = function() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Redimensionar a 25x25 (tamaño estándar AR.js)
    canvas.width = 25;
    canvas.height = 25;
    
    ctx.drawImage(img, 0, 0, 25, 25);
    const imageData = ctx.getImageData(0, 0, 25, 25);
    
    // Convertir a formato .patt
    let patternContent = '25 25\n';
    
    for (let y = 0; y < 25; y++) {
      let row = '';
      for (let x = 0; x < 25; x++) {
        const index = (y * 25 + x) * 4;
        const r = imageData.data[index];
        const g = imageData.data[index + 1];
        const b = imageData.data[index + 2];
        
        // Convertir a escala de grises (0-255)
        const gray = Math.round((r + g + b) / 3);
        row += gray + (x < 24 ? ' ' : '');
      }
      patternContent += row + (y < 24 ? '\n' : '');
    }
    
    // Guardar patrón
    savePatternFile(patternContent, '4x4_1000.patt');
  };
  
  img.onerror = function() {
    console.error("Error cargando imagen, usando patrón por defecto");
    createDefaultPattern();
  };
}

function savePatternFile(content, filename) {
  // Crear enlace de descarga
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  // Intentar guardar en servidor (no funciona en GitHub Pages estático)
  // En su lugar, guardamos en localStorage
  localStorage.setItem('weldPattern', content);
  
  console.log("Patrón convertido y guardado");
  document.getElementById('loadStatus').textContent = 'Patrón convertido ✅';
}

// Iniciar conversión al cargar
window.addEventListener('load', convertImageToPattern);
