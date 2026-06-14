// Toss Science Lab: Chemical Equilibrium & Le Chatelier's Principle Simulator
// app.js

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const canvas = document.getElementById('cylinder-canvas');
  const ctx = canvas.getContext('2d');
  const graphCanvas = document.getElementById('graph-canvas');
  const graphCtx = graphCanvas.getContext('2d');
  
  const sliderVolume = document.getElementById('slider-volume');
  const sliderTemperature = document.getElementById('slider-temperature');
  const labelVolume = document.getElementById('label-volume');
  const labelTemperature = document.getElementById('label-temperature');
  
  const counterNo2 = document.getElementById('counter-no2');
  const counterN2o4 = document.getElementById('counter-n2o4');
  
  const btnInjectNo2 = document.getElementById('btn-inject-no2');
  const btnInjectN2o4 = document.getElementById('btn-inject-n2o4');
  const btnRemoveGases = document.getElementById('btn-remove-gases');
  const btnReset = document.getElementById('btn-reset');
  const btnAutoRun = document.getElementById('btn-auto-run');
  
  const gaugeMarkerK = document.getElementById('gauge-marker-k');
  const gaugeMarkerQ = document.getElementById('gauge-marker-q');
  const equilibriumStatusText = document.getElementById('equilibrium-status-text');
  
  const systemStatusBadge = document.getElementById('system-status-badge');
  const missionProgressBadge = document.getElementById('mission-progress-badge');
  
  const gasOverlayColor = document.getElementById('gas-overlay-color');
  const pistonCapElement = document.getElementById('piston-cap-element');
  
  const successModal = document.getElementById('success-modal');
  const btnModalClose = document.getElementById('btn-modal-close');
  
  // Toast container elements
  const toastContainer = document.getElementById('toast-container');
  const toastMessage = document.getElementById('toast-message');

  // --- Constants & Physical parameters ---
  const R_CONSTANT = 8.314; // J/(mol*K)
  const T_REF = 298; // Reference Temperature (298K)
  const K_REF = 0.6; // Equilibrium Constant at 298K
  const DELTA_H = -57200; // J/mol (Exothermic reaction)
  
  // Simulation scale settings
  let volume = 1.0; // Liters (0.4 to 1.5)
  let temperature = 298; // Kelvin (100 to 600)
  let particles = [];
  
  // Rates & Constants (Dynamic values)
  let K_constant = K_REF;
  let Q_index = 0.0;
  let rateForward = 0.0; // Current Forward rate
  let rateReverse = 0.0; // Current Reverse rate
  
  // Graph history array for line chart
  const graphHistory = [];
  const maxGraphPoints = 150;
  let graphTimer = 0;
  
  // Auto simulation state
  let isAutoRunning = false;
  let autoTimer = null;
  let hasInjectedNo2 = false; // Flag to track if user/system injected NO2 for Mission 3
  
  // Mission tracking
  const missions = {
    compression: { active: true, completed: false, elementId: 'mission-1' },
    heating: { active: false, completed: false, elementId: 'mission-2' },
    injection: { active: false, completed: false, elementId: 'mission-3' }
  };
  
  // Canvas Dimensions
  let width = 0;
  let height = 0;
  
  // Particle classes
  class Particle {
    constructor(type, x, y) {
      this.type = type; // 'NO2' or 'N2O4'
      this.x = x;
      this.y = y;
      
      // Calculate speed based on temperature
      const speedScale = Math.sqrt(temperature / 298) * 1.5;
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * speedScale;
      this.vy = Math.sin(angle) * speedScale;
      
      this.radius = type === 'NO2' ? 5 : 9;
      this.color = type === 'NO2' ? 'rgba(255, 118, 67, 0.85)' : 'rgba(56, 189, 248, 0.7)';
      this.glowColor = type === 'NO2' ? 'rgba(255, 118, 67, 0.4)' : 'rgba(56, 189, 248, 0.3)';
    }

    update(yBoundMin, yBoundMax) {
      this.x += this.vx;
      this.y += this.vy;
      
      // Bounce walls
      if (this.x - this.radius < 0) {
        this.x = this.radius;
        this.vx *= -1;
      }
      if (this.x + this.radius > width) {
        this.x = width - this.radius;
        this.vx *= -1;
      }
      
      // Bounce floor and ceiling (piston bottom)
      if (this.y - this.radius < yBoundMin) {
        this.y = yBoundMin + this.radius;
        this.vy *= -1;
      }
      if (this.y + this.radius > yBoundMax) {
        this.y = yBoundMax - this.radius;
        this.vy *= -1;
      }
    }

    draw() {
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.glowColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      
      // If N2O4, draw an inner line representing the dimer bond
      if (this.type === 'N2O4') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.x - 4, this.y);
        ctx.lineTo(this.x + 4, this.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // --- Helper Functions ---
  
  // Toast notification
  function showToast(message) {
    toastMessage.textContent = message;
    toastContainer.classList.add('show');
    setTimeout(() => {
      toastContainer.classList.remove('show');
    }, 2500);
  }

  // Update physical calculations (K, Q, and Rates)
  function updateChemicalCalculations() {
    // 1. Calculate K based on Temperature using Van 't Hoff relation
    // ln(K2/K1) = -dH/R * (1/T2 - 1/T1)
    // K(T) = K_REF * exp( -dH/R * (1/T - 1/T_REF) )
    const expTerm = (-DELTA_H / R_CONSTANT) * (1 / temperature - 1 / T_REF);
    K_constant = K_REF * Math.exp(expTerm);
    
    // Scale K to look nice in UI and prevent discretization deadlock at high temperature
    K_constant = Math.max(0.12, Math.min(K_constant, 12.0));

    // Get current particle counts
    const countNo2 = particles.filter(p => p.type === 'NO2').length;
    const countN2o4 = particles.filter(p => p.type === 'N2O4').length;
    
    // 2. Q = [N2O4] / [NO2]^2 = (N_n2o4/V) / (N_no2/V)^2 = (N_n2o4 * V) / (N_no2)^2
    // Minimum 1 to prevent division by zero
    const adjustedNo2 = Math.max(1, countNo2);
    const Q_instant = (countN2o4 * volume) / Math.pow(adjustedNo2, 2) * 50; // multiply scale factor for UI representation
    
    // Apply smoothing filter (EMA) to prevent Q from fluctuating wildly due to single particle fluctuations
    Q_index = Q_index * 0.85 + Q_instant * 0.15;
    
    // 3. Compute rates for display
    // vf = kf * [NO2]^2
    // vr = kr * [N2O4]
    // kr = kf / K
    const k_f = 0.0003 * Math.sqrt(temperature); // Forward rate constant scaling with temp (kinetic effect)
    const k_r = k_f / (K_constant * 0.1); // Scale for graph representation
    
    rateForward = k_f * Math.pow(countNo2, 2) / volume;
    rateReverse = k_r * countN2o4;
    
    // Dynamic text status updates
    updateStatusText(countNo2, countN2o4);
    updateGaugeUI();
  }

  // Update the UI labels and Gauge Position
  function updateGaugeUI() {
    // Map Q/K ratio to gauge slider position using logarithmic scale
    // Q/K = 1 -> center (50%)
    if (Q_index <= 0) {
      gaugeMarkerQ.style.left = '5%';
      return;
    }

    const ratio = Q_index / K_constant;
    let percentQ = 50 + 22 * Math.log2(ratio);
    percentQ = Math.max(5, Math.min(percentQ, 95));
    
    // Since K is the target reference, keep it near center, or scale it dynamically.
    // For simplicity, let's keep K at 50% on the gauge track and slide Q relative to it.
    gaugeMarkerK.style.left = '50%';
    gaugeMarkerQ.style.left = `${percentQ}%`;
  }

  // Update Status Text based on Q and K comparison
  function updateStatusText(no2Count, n2o4Count) {
    counterNo2.textContent = no2Count;
    counterN2o4.textContent = n2o4Count;
    
    const diff = Q_index - K_constant;
    const tolerance = 0.05 * K_constant;
    
    if (Math.abs(diff) < tolerance) {
      equilibriumStatusText.textContent = "동적 평형 상태 (Q = K)";
      equilibriumStatusText.className = "gauge-status equilibrium";
      systemStatusBadge.textContent = "동적 평형 상태";
      systemStatusBadge.className = "tds-badge small weak-green";
    } else if (diff < 0) {
      equilibriumStatusText.textContent = "정반응 우세 (평형 우측 이동 ⇌)";
      equilibriumStatusText.className = "gauge-status forward";
      systemStatusBadge.textContent = "평형 이동 (정반응)";
      systemStatusBadge.className = "tds-badge small weak-blue";
    } else {
      equilibriumStatusText.textContent = "역반응 우세 (평형 좌측 이동 ⇌)";
      equilibriumStatusText.className = "gauge-status reverse";
      systemStatusBadge.textContent = "평형 이동 (역반응)";
      systemStatusBadge.className = "tds-badge small weak-red";
    }
  }

  // Resize canvas according to container dimensions
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    width = canvas.width;
    height = canvas.height;
    
    // Resize graph canvas too
    const graphRect = graphCanvas.parentElement.getBoundingClientRect();
    graphCanvas.width = graphRect.width;
    graphCanvas.height = graphRect.height;
  }

  // Add random particles inside the current cylinder boundary
  function addParticles(type, count) {
    const yPiston = getPistonY();
    const padding = 20;
    
    // Set flag for Mission 3 when NO2 is injected
    if (type === 'NO2') {
      hasInjectedNo2 = true;
    }
    
    for (let i = 0; i < count; i++) {
      const x = padding + Math.random() * (width - padding * 2);
      const y = yPiston + 30 + Math.random() * (height - yPiston - 30 - padding);
      particles.push(new Particle(type, x, y));
    }
    updateChemicalCalculations();
  }

  // Remove random particles
  function removeParticles(count) {
    for (let i = 0; i < count; i++) {
      if (particles.length > 0) {
        const randIdx = Math.floor(Math.random() * particles.length);
        particles.splice(randIdx, 1);
      }
    }
    updateChemicalCalculations();
  }

  // Get current Y coordinate of the piston head
  function getPistonY() {
    // volume is 0.4 to 1.5. Max volume (1.5) -> piston is near top (10px). Min volume (0.4) -> piston is low (180px).
    const maxVal = 1.5;
    const minVal = 0.4;
    const ratio = (volume - minVal) / (maxVal - minVal);
    // Y-coordinate mapping
    return height - 40 - ratio * (height - 100);
  }

  // Set up the system initial state
  function initializeSystem() {
    particles = [];
    volume = 1.0;
    temperature = 298;
    hasInjectedNo2 = false; // Reset injection flag
    
    sliderVolume.value = 1.0;
    sliderTemperature.value = 298;
    
    labelVolume.textContent = "1.0 L";
    labelTemperature.textContent = "298 K";
    
    // Reset auto-run
    if (isAutoRunning) {
      toggleAutoRun();
    }

    // Default start count: 24 NO2, 12 N2O4
    resizeCanvas();
    addParticles('NO2', 24);
    addParticles('N2O4', 12);
    
    // Pre-initialize Q_index to prevent starting fade-in animation
    Q_index = (12 * 1.0) / Math.pow(24, 2) * 50;
    
    // Clear graph history
    graphHistory.length = 0;
    
    // Reset mission states
    resetMissions();
    
    updateChemicalCalculations();
    showToast("실험 환경이 초기화되었습니다.");
  }

  // --- Physical Collision & Reaction Execution ---
  
  function executeReactions() {
    const countNo2 = particles.filter(p => p.type === 'NO2').length;
    const countN2o4 = particles.filter(p => p.type === 'N2O4').length;
    
    // Compute actual probabilities per frame based on current physical parameters
    const k_f_frame = 0.00002 * Math.sqrt(temperature);
    const k_r_frame = k_f_frame / (K_constant * 0.1);
    
    // 1. FORWARD REACTION (Dimerization: 2 NO2 -> N2O4)
    // Find colliding NO2 pairs and combine them independently
    const no2Particles = particles.filter(p => p.type === 'NO2');
    const consumedIndices = new Set();

    for (let i = 0; i < no2Particles.length; i++) {
      if (consumedIndices.has(i)) continue;
      for (let j = i + 1; j < no2Particles.length; j++) {
        if (consumedIndices.has(j)) continue;
        
        const p1 = no2Particles[i];
        const p2 = no2Particles[j];
        
        // Measure distance
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // If close enough and passes probability test (accounting for volume density)
        const densityFactor = 1.0 / volume;
        if (dist < 18 && Math.random() < k_f_frame * densityFactor * 35) {
          // Remove p1 and p2, replace with 1 N2O4
          const index1 = particles.indexOf(p1);
          if (index1 > -1) particles.splice(index1, 1);
          
          const index2 = particles.indexOf(p2);
          if (index2 > -1) particles.splice(index2, 1);
          
          // Spawn N2O4 at center of mass
          const spawnX = (p1.x + p2.x) / 2;
          const spawnY = (p1.y + p2.y) / 2;
          particles.push(new Particle('N2O4', spawnX, spawnY));
          
          consumedIndices.add(i);
          consumedIndices.add(j);
          break; // Break inner loop and check next p1
        }
      }
    }

    // 2. REVERSE REACTION (Dissociation: N2O4 -> 2 NO2)
    // Randomly dissociate multiple N2O4 particles in parallel based on probability
    const n2o4Particles = particles.filter(p => p.type === 'N2O4');
    
    for (let i = 0; i < n2o4Particles.length; i++) {
      const p = n2o4Particles[i];
      
      // Every N2O4 particle has an independent chance to decay based on temperature kinetics
      if (Math.random() < k_r_frame * 0.15) {
        const index = particles.indexOf(p);
        if (index > -1) {
          particles.splice(index, 1);
          
          // Spawn two NO2 particles moving apart
          const angle = Math.random() * Math.PI * 2;
          const distOffset = 8;
          const spawnX1 = p.x + Math.cos(angle) * distOffset;
          const spawnY1 = p.y + Math.sin(angle) * distOffset;
          const spawnX2 = p.x - Math.cos(angle) * distOffset;
          const spawnY2 = p.y - Math.sin(angle) * distOffset;
          
          const p1 = new Particle('NO2', spawnX1, spawnY1);
          const p2 = new Particle('NO2', spawnX2, spawnY2);
          
          // Force velocity directions opposite to each other
          const speedScale = Math.sqrt(temperature / 298) * 1.5;
          p1.vx = Math.cos(angle) * speedScale;
          p1.vy = Math.sin(angle) * speedScale;
          p2.vx = -Math.cos(angle) * speedScale;
          p2.vy = -Math.sin(angle) * speedScale;
          
          particles.push(p1);
          particles.push(p2);
        }
      }
    }
  }

  // --- Real-time Graph Drawing ---
  
  function updateGraphData() {
    graphHistory.push({
      forward: rateForward,
      reverse: rateReverse
    });
    
    if (graphHistory.length > maxGraphPoints) {
      graphHistory.shift();
    }
  }

  function drawGraph() {
    const gw = graphCanvas.width;
    const gh = graphCanvas.height;
    
    graphCtx.clearRect(0, 0, gw, gh);
    
    // Draw Grid Lines
    graphCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    graphCtx.lineWidth = 1;
    for (let y = 30; y < gh; y += 40) {
      graphCtx.beginPath();
      graphCtx.moveTo(0, y);
      graphCtx.lineTo(gw, y);
      graphCtx.stroke();
    }
    
    if (graphHistory.length < 2) return;
    
    // Find Max Value for scaling
    let maxVal = 0.1; // minimum threshold to prevent scaling issue
    graphHistory.forEach(d => {
      if (d.forward > maxVal) maxVal = d.forward;
      if (d.reverse > maxVal) maxVal = d.reverse;
    });
    
    // Add extra padding
    maxVal *= 1.15;
    
    const getX = (index) => (index / (maxGraphPoints - 1)) * gw;
    const getY = (val) => gh - 15 - (val / maxVal) * (gh - 30);
    
    // Draw Forward Rate Line (NO2 Dimerization) - Red/Orange
    graphCtx.lineWidth = 2.5;
    graphCtx.strokeStyle = '#ff7643';
    graphCtx.shadowBlur = 4;
    graphCtx.shadowColor = 'rgba(255, 118, 67, 0.4)';
    graphCtx.beginPath();
    graphCtx.moveTo(getX(0), getY(graphHistory[0].forward));
    for (let i = 1; i < graphHistory.length; i++) {
      graphCtx.lineTo(getX(i), getY(graphHistory[i].forward));
    }
    graphCtx.stroke();
    
    // Draw Reverse Rate Line (N2O4 Dissociation) - Cyan/Blue
    graphCtx.strokeStyle = '#38bdf8';
    graphCtx.shadowColor = 'rgba(56, 189, 248, 0.4)';
    graphCtx.beginPath();
    graphCtx.moveTo(getX(0), getY(graphHistory[0].reverse));
    for (let i = 1; i < graphHistory.length; i++) {
      graphCtx.lineTo(getX(i), getY(graphHistory[i].reverse));
    }
    graphCtx.stroke();
    
    graphCtx.shadowBlur = 0; // Reset shadow
  }

  // --- Animation Loop ---
  
  function animate() {
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    const yPiston = getPistonY();
    
    // Render Piston visual in HTML/CSS by mapping coordinates
    pistonCapElement.style.top = `${yPiston}px`;
    
    // Draw gas background color transition (macro scale)
    const countNo2 = particles.filter(p => p.type === 'NO2').length;
    // Density determines color intensity
    const density = countNo2 / volume;
    // Map density to opacity of the brown layer
    const maxDensityScale = 50.0;
    const opacity = Math.min(0.85, (density / maxDensityScale));
    
    // Smooth transition style setting
    gasOverlayColor.style.backgroundColor = `rgba(184, 80, 20, ${opacity})`;
    gasOverlayColor.style.height = `${height - yPiston}px`;
    gasOverlayColor.style.top = `${yPiston}px`;
    
    // Push particles below piston boundary if they got trapped by compression
    particles.forEach(p => {
      if (p.y - p.radius < yPiston + 24) {
        p.y = yPiston + 24 + p.radius;
        p.vy = Math.abs(p.vy); // Force velocity downwards
      }
    });

    // Handle physical reactions
    executeReactions();
    
    // Update and draw particles
    particles.forEach(p => {
      p.update(yPiston + 24, height);
      p.draw();
    });
    
    // Handle Graph update timer
    graphTimer++;
    if (graphTimer >= 4) { // Update graph points every 4 frames
      updateChemicalCalculations();
      updateGraphData();
      drawGraph();
      graphTimer = 0;
    }
    
    // Check missions
    checkMissionProgress();
    
    requestAnimationFrame(animate);
  }

  // --- Mission Check Logic ---

  function checkMissionProgress() {
    // Mission 1: Compression Check (Volume <= 0.6L)
    if (missions.compression.active && !missions.compression.completed) {
      if (volume <= 0.65) {
        completeMission('compression');
        missions.heating.active = true;
        activateMissionUI('heating');
      }
    }
    
    // Mission 2: Heating Check (Temp >= 450K - HTML 설명과 일치하도록 480K에서 450K로 수정)
    if (missions.heating.active && !missions.heating.completed) {
      if (temperature >= 450) {
        completeMission('heating');
        missions.injection.active = true;
        activateMissionUI('injection');
      }
    }
    
    // Mission 3: Injection Check (NO2 injected & back to equilibrium)
    if (missions.injection.active && !missions.injection.completed) {
      // Target: Injected NO2 and then stabilized to Q = K
      const diff = Q_index - K_constant;
      // 고온 상태(K가 매우 작을 때)에서도 이산적 입자 변동을 수용할 수 있도록 최소 0.15의 절대 허용 폭을 보장합니다.
      const tolerance = Math.max(0.15, 0.35 * K_constant); 
      
      if (hasInjectedNo2 && Math.abs(diff) < tolerance) {
        completeMission('injection');
        // Trigger final success modal!
        showSuccessModal();
      }
    }
  }

  function completeMission(key) {
    missions[key].completed = true;
    const item = document.getElementById(missions[key].elementId);
    item.className = "mission-item completed";
    
    // Change SVG icon inside header
    const icon = item.querySelector('.mission-status-icon');
    icon.className = "mission-status-icon completed";
    icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>`;
    
    // Update header counts
    const completedCount = Object.values(missions).filter(m => m.completed).length;
    missionProgressBadge.textContent = `${completedCount} / 3 완료`;
    
    showToast(`미션 ${completedCount} 완료!`);
  }

  function activateMissionUI(key) {
    const item = document.getElementById(missions[key].elementId);
    item.className = "mission-item active";
    const icon = item.querySelector('.mission-status-icon');
    icon.className = "mission-status-icon active";
  }

  function resetMissions() {
    Object.keys(missions).forEach(key => {
      missions[key].completed = false;
      missions[key].active = false;
      
      const item = document.getElementById(missions[key].elementId);
      item.className = "mission-item";
      
      const icon = item.querySelector('.mission-status-icon');
      icon.className = "mission-status-icon pending";
      icon.innerHTML = `<circle cx="12" cy="12" r="10"></circle>`;
    });
    
    missions.compression.active = true;
    activateMissionUI('compression');
    
    missionProgressBadge.textContent = "0 / 3 완료";
  }

  function showSuccessModal() {
    successModal.classList.add('show');
  }

  function hideSuccessModal() {
    successModal.classList.remove('show');
  }

  // --- Auto Run (Automation Scenario) ---
  
  function toggleAutoRun() {
    if (isAutoRunning) {
      clearInterval(autoTimer);
      btnAutoRun.textContent = "자동 시뮬레이션 시작";
      btnAutoRun.className = "tds-btn large fill-primary full-width";
      isAutoRunning = false;
      showToast("자동 시뮬레이션이 정지되었습니다.");
    } else {
      isAutoRunning = true;
      btnAutoRun.textContent = "시뮬레이션 중단";
      btnAutoRun.className = "tds-btn large fill-danger full-width";
      showToast("자동 학습 시뮬레이션을 개시합니다.");
      
      let step = 0;
      autoTimer = setInterval(() => {
        if (!isAutoRunning) return;
        
        switch (step) {
          case 0:
            showToast("자동 진행: 1단계 - 피스톤 압축 진행...");
            // Animate volume slider down to 0.5
            animateSlider(sliderVolume, 1.0, 0.5, 2000, 'volume', ' L');
            step++;
            break;
          case 1:
            // Wait for compression to settle, then heat
            showToast("자동 진행: 2단계 - 실인더 가열(온도 상승)...");
            animateSlider(sliderTemperature, 298, 500, 2500, 'temperature', ' K');
            step++;
            break;
          case 2:
            // Inject NO2
            showToast("자동 진행: 3단계 - 적갈색 NO₂ 기체 대량 투입...");
            addParticles('NO2', 15);
            step++;
            break;
          case 3:
            showToast("자동 진행: 4단계 - 온도 냉각 및 안정화 대기...");
            animateSlider(sliderTemperature, 500, 200, 3000, 'temperature', ' K');
            step++;
            break;
          case 4:
            showToast("자동 진행 시나리오 완료!");
            toggleAutoRun(); // stop
            break;
        }
      }, 5000);
    }
  }

  // Animate input range values smoothly
  function animateSlider(sliderElem, start, end, duration, type, unit) {
    const startTime = performance.now();
    
    function updateVal(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      const easeVal = start + (end - start) * progress;
      
      sliderElem.value = easeVal;
      
      if (type === 'volume') {
        volume = parseFloat(easeVal.toFixed(2));
        labelVolume.textContent = volume.toFixed(1) + unit;
      } else if (type === 'temperature') {
        temperature = Math.round(easeVal);
        labelTemperature.textContent = temperature + unit;
        
        // Dynamically adjust particle velocities on fly
        const speedScale = Math.sqrt(temperature / 298) * 1.5;
        particles.forEach(p => {
          const angle = Math.atan2(p.vy, p.vx);
          p.vx = Math.cos(angle) * speedScale;
          p.vy = Math.sin(angle) * speedScale;
        });
      }
      
      updateChemicalCalculations();
      
      if (progress < 1.0 && isAutoRunning) {
        requestAnimationFrame(updateVal);
      }
    }
    
    requestAnimationFrame(updateVal);
  }

  // --- Event Listeners ---
  
  sliderVolume.addEventListener('input', (e) => {
    volume = parseFloat(e.target.value);
    labelVolume.textContent = volume.toFixed(1) + " L";
    updateChemicalCalculations();
  });
  
  sliderTemperature.addEventListener('input', (e) => {
    temperature = parseInt(e.target.value);
    labelTemperature.textContent = temperature + " K";
    
    // Recalculate particle velocities based on new temperature
    const speedScale = Math.sqrt(temperature / 298) * 1.5;
    particles.forEach(p => {
      const angle = Math.atan2(p.vy, p.vx);
      p.vx = Math.cos(angle) * speedScale;
      p.vy = Math.sin(angle) * speedScale;
    });
    
    updateChemicalCalculations();
  });
  
  btnInjectNo2.addEventListener('click', () => {
    addParticles('NO2', 5);
    showToast("이산화질소(NO₂) 기체가 5분자 주입되었습니다.");
  });
  
  btnInjectN2o4.addEventListener('click', () => {
    addParticles('N2O4', 5);
    showToast("사산화이질소(N₂O₄) 기체가 5분자 주입되었습니다.");
  });
  
  btnRemoveGases.addEventListener('click', () => {
    const halfCount = Math.floor(particles.length / 2);
    removeParticles(halfCount);
    showToast("기체가 급속 환기되어 농도가 절반으로 급감했습니다.");
  });
  
  btnReset.addEventListener('click', initializeSystem);
  btnAutoRun.addEventListener('click', toggleAutoRun);
  btnModalClose.addEventListener('click', hideSuccessModal);

  // Responsive support
  window.addEventListener('resize', () => {
    resizeCanvas();
    drawGraph();
  });

  // --- Start Code ---
  initializeSystem();
  animate();
});
