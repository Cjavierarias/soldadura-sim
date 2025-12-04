// pattern-converter.js - MEJORADO
// Incluye patrón embebido para que funcione inmediatamente

class PatternConverter {
  constructor() {
    this.patternReady = false;
    this.patternData = null;
  }
  
  init() {
    console.log("PatternConverter: Inicializando...");
    
    // Primero intentar cargar patrón existente
    this.loadExistingPattern();
  }
  
  loadExistingPattern() {
    // Intentar cargar desde varias fuentes
    const sources = [
      '4x4_1000.patt',
      'pattern.patt',
      'assets/4x4_1000.patt'
    ];
    
    let loaded = false;
    
    sources.forEach(source => {
      if (!loaded) {
        this.tryLoadPattern(source).then(success => {
          if (success) loaded = true;
        });
      }
    });
    
    // Si no carga después de 2 segundos, usar patrón embebido
    setTimeout(() => {
      if (!this.patternReady) {
        console.log("PatternConverter: Usando patrón embebido...");
        this.createEmbeddedPattern();
      }
    }, 2000);
  }
  
  async tryLoadPattern(url) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        this.patternData = text;
        this.patternReady = true;
        console.log(`PatternConverter: Patrón cargado desde ${url}`);
        this.onPatternReady();
        return true;
      }
    } catch (error) {
      console.log(`PatternConverter: No se pudo cargar ${url}`);
    }
    return false;
  }
  
  createEmbeddedPattern() {
    // Patrón AR.js embebido (patrón simple de 4x4)
    this.patternData = `25 25
238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238
238 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 238
238 0 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 0 238
238 0 238 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 238 0 238
238 0 238 0 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 0 238 0 238
238 0 238 0 238 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 238 0 238 0 238
238 0 238 0 238 0 238 238 238 238 238 238 238 238 238 238 238 238 238 0 238 0 238 0 238
238 0 238 0 238 0 238 0 0 0 0 0 0 0 0 0 0 0 238 0 238 0 238 0 238
238 0 238 0 238 0 238 0 238 238 238 238 238 238 238 238 238 0 238 0 238 0 238 0 238
238 0 238 0 238 0 238 0 238 0 0 0 0 0 0 0 238 0 238 0 238 0 238 0 238
238 0 238 0 238 0 238 0 238 0 238 238 238 238 0 238 238 0 238 0 238 0 238 0 238
238 0 238 0 238 0 238 0 238 0 238 0 0 238 0 238 238 0 238 0 238 0 238 0 238
238 0 238 0 238 0 238 0 238 0 238 0 0 238 0 238 238 0 238 0 238 0 238 0 238
238 0 238 0 238 0 238 0 238 0 238 238 238 238 0 238 238 0 238 0 238 0 238 0 238
238 0 238 0 238 0 238 0 238 0 0 0 0 0 0 0 238 0 238 0 238 0 238 0 238
238 0 238 0 238 0 238 0 238 238 238 238 238 238 238 238 238 0 238 0 238 0 238 0 238
238 0 238 0 238 0 238 0 0 0 0 0 0 0 0 0 0 0 238 0 238 0 238 0 238
238 0 238 0 238 0 238 238 238 238 238 238 238 238 238 238 238 238 238 0 238 0 238 0 238
238 0 238 0 238 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 238 0 238 0 238
238 0 238 0 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 0 238 0 238
238 0 238 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 238 0 238
238 0 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 0 238
238 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 238
238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238 238`;
    
    this.patternReady = true;
    
    // Crear URL para el patrón embebido
    this.createPatternBlob();
    
    console.log("PatternConverter: Patrón embebido listo");
    this.onPatternReady();
  }
  
  createPatternBlob() {
    // Crear blob con el patrón
    const blob = new Blob([this.patternData], { type: 'text/plain' });
    this.patternUrl = URL.createObjectURL(blob);
    
    // Actualizar el marcador AR.js para usar este blob
    this.updateARMarker();
  }
  
  updateARMarker() {
    // Esperar a que AR.js esté listo
    const checkInterval = setInterval(() => {
      const arMarker = document.querySelector('a-marker');
      if (arMarker && this.patternUrl) {
        arMarker.setAttribute('url', this.patternUrl);
        console.log("PatternConverter: Marcador actualizado con patrón embebido");
        clearInterval(checkInterval);
      }
    }, 500);
  }
  
  onPatternReady() {
    // Notificar que el patrón está listo
    const statusEl = document.getElementById('loadStatus');
    if (statusEl) {
      statusEl.textContent = 'Patrón AR listo ✅';
    }
    
    // Disparar evento personalizado
    const event = new CustomEvent('patternReady', { 
      detail: { url: this.patternUrl, data: this.patternData } 
    });
    document.dispatchEvent(event);
  }
  
  getPatternUrl() {
    return this.patternUrl;
  }
  
  getPatternData() {
    return this.patternData;
  }
}

// Crear instancia global
window.patternConverter = new PatternConverter();

// Inicializar cuando la página cargue
document.addEventListener('DOMContentLoaded', () => {
  window.patternConverter.init();
});
