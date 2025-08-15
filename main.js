(function(){
    const canvas = document.getElementById('rain');
    const ctx = canvas.getContext('2d');
    const flash = document.getElementById('flash');

    const controls = {
      density: document.getElementById('density'),
      speed: document.getElementById('speed'),
      wind: document.getElementById('wind'),
      thickness: document.getElementById('thickness'),
      color: document.getElementById('color'),
      splash: document.getElementById('splash'),
      lightning: document.getElementById('lightning'),
    };

    let W=0, H=0, DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    let targetCount = 900;

    function resize(){
      const w = window.innerWidth, h = window.innerHeight;
      W = Math.floor(w * DPR); H = Math.floor(h * DPR);
      canvas.width = W; canvas.height = H; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      targetCount = Math.round(parseInt(controls.density.value,10) * (W*H)/(1280*720));
      targetCount = Math.min(targetCount, 8000);
    }
    window.addEventListener('resize', resize); resize();

    // ---------- Physics ----------
    const drops = []; // active drop pool
    const splashes = []; // splash particles
    let paused = false;

    function rand(a,b){ return Math.random()*(b-a)+a; }

    class Drop{
      constructor(){ this.reset(true); }
      reset(fromTop){
        // spawn from slightly outside screen to account for wind drift
        this.x = rand(-W*0.1, W*1.1);
        this.y = fromTop ? rand(-H*1.0, -10) : rand(-H*0.2, -10);
        this.base = rand(700, 1400); // base fall speed (px/s along vertical when speed=1)
        this.life = 1; // flag
      }
      update(dt, cfg){
        if(this.life <= 0) return;
        const theta = cfg.wind * Math.PI/180; // from vertical
        const v = this.base * cfg.speed; // magnitude along vertical
        const vx = Math.sin(theta) * v; // horizontal drift
        const vy = Math.cos(theta) * v; // vertical component
        this.x += vx * dt * DPR;
        this.y += vy * dt * DPR;
        if(this.y > H){
          this.life = 0;
          if(cfg.splash) makeSplash(this.x, H-2, v*0.012);
          // recycle from top
          this.reset(true);
        }
        // wrap horizontally for strong wind
        if(this.x < -W*0.2) this.x += W*1.4;
        if(this.x > W*1.2) this.x -= W*1.4;
        // draw
        const len = Math.max(8, Math.min(32, (v*0.02)))*DPR; // length depends on speed
        ctx.lineWidth = Math.max(0.5, cfg.thickness*DPR);
        ctx.strokeStyle = cfg.color;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - Math.sin(theta)*len, this.y - Math.cos(theta)*len);
        ctx.stroke();
      }
    }

    class Splash{
      constructor(x,y,vx,vy,life){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.life=life; }
      update(dt, cfg){
        if(this.life<=0) return;
        this.vy += 1800*dt; // gravity
        this.x += this.vx*dt*DPR; this.y += this.vy*dt*DPR;
        this.life -= dt;
        if(this.y>H || this.life<=0){ this.life=0; return; }
        const alpha = Math.max(0, Math.min(1, this.life/0.25));
        ctx.globalAlpha = 0.6*alpha;
        ctx.fillStyle = cfg.color;
        ctx.fillRect(this.x, this.y, Math.max(1, cfg.thickness*DPR*0.9), Math.max(1, cfg.thickness*DPR*0.9));
        ctx.globalAlpha = 1;
      }
    }

    function makeSplash(x, y, power){
      const n = 5 + (power*0.5|0);
      for(let i=0;i<n;i++){
        const a = rand(-Math.PI*0.9, -Math.PI*0.1);
        const s = rand(80, 260) * (power*0.25);
        splashes.push(new Splash(x, y, Math.cos(a)*s, Math.sin(a)*s, rand(0.15,0.35)));
      }
    }

    // Populate initial drops
    function ensureDrops(){
      const need = targetCount - drops.length;
      for(let i=0;i<need;i++) drops.push(new Drop());
      if(need < 0) drops.splice(targetCount);
    }

    // Lightning
    let lightningTimer = 0;
    function triggerLightning(){
      flash.style.background = 'rgba(255,255,255,0.0)';
      // two quick flashes
      setTimeout(()=> flash.style.background = 'rgba(255,255,255,0.8)', 10);
      setTimeout(()=> flash.style.background = 'rgba(255,255,255,0.0)', 120);
      setTimeout(()=> flash.style.background = 'rgba(255,255,255,0.6)', 200);
      setTimeout(()=> flash.style.background = 'rgba(255,255,255,0.0)', 320);
    }

    // Read config from controls
    function getConfig(){
      return {
        speed: parseFloat(controls.speed.value),
        wind: parseFloat(controls.wind.value),
        thickness: parseFloat(controls.thickness.value),
        color: controls.color.value,
        splash: controls.splash.checked,
        lightning: controls.lightning.checked,
      };
    }

    // Hook up UI
    controls.density.addEventListener('input', ()=>{ resize(); ensureDrops(); });
    ['speed','wind','thickness','color','splash','lightning'].forEach(id=>{
      controls[id].addEventListener('input', ()=>{});
    });

    window.addEventListener('keydown', (e)=>{
      if(e.code==='Space'){ e.preventDefault(); paused=!paused; }
      else if(e.key==='l' || e.key==='L'){ triggerLightning(); }
      else if(e.key==='r' || e.key==='R'){ drops.length=0; splashes.length=0; ensureDrops(); }
    });

    // Main loop
    let last = performance.now();
    function loop(now){
      const dt = Math.min(0.033, (now - last)/1000); // clamp for stability
      last = now;
      if(!paused){
        ensureDrops();
        ctx.clearRect(0,0,W,H);
        const cfg = getConfig();
        // subtle depth fog
        const grad = ctx.createLinearGradient(0,0,0,H);
        grad.addColorStop(0, 'rgba(15,20,28,0.0)');
        grad.addColorStop(1, 'rgba(15,20,28,0.06)');
        ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);

        for(let i=0;i<drops.length;i++) drops[i].update(dt, cfg);
        for(let i=splashes.length-1;i>=0;i--){
          const p = splashes[i]; p.update(dt, cfg); if(p.life<=0) splashes.splice(i,1);
        }

        // occasional natural lightning
        if(cfg.lightning){
          lightningTimer -= dt;
          if(lightningTimer<=0 && Math.random()<0.0015){ triggerLightning(); lightningTimer = rand(5, 18); }
        }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  })();
  

  const audio = document.getElementById('bgMusic');
  let playBtn = document.getElementById('playBtn');

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play();
      playBtn.textContent = 'Выключить звук';
    } else {
      audio.pause();
      playBtn.textContent = 'Включить звук';
    }
  });

  const panel = document.querySelector('.panel');
const toggleBtn = document.getElementById('togglePanel');

toggleBtn.addEventListener('click', () => {
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        toggleBtn.textContent = 'Скрыть панель';
    } else {
        panel.style.display = 'none';
        toggleBtn.textContent = 'Показать панель';
    }
});
