// ==UserScript==
// @name         Krunker Tools
// @namespace    https://github.com/cleonaia/krunker_mod
// @version      0.3.0
// @description  Experimental client side overlays and verified team safety checks and aim + esp
// @author       cleonaia
// @match        *://krunker.io/*
// @match        *://browserfps.com/*
// @exclude      *://krunker.io/social*
// @exclude      *://krunker.io/editor*
// @run-at       document-start
// @grant        none
// ==/UserScript==

  const FLAG = '__krSafe22';

  if (window[FLAG]) return;
  window[FLAG] = true;

  const STORE = 'kr-safe-v22';

  const defaults = {
    aim: true,
    esp: true,
    circle: true,
    dot: false,
    tracers: false,
    team: false,
    color: '#00ff77',
    fov: 145,
    height: 6.5,
    strength: 0.65,
    recoil: 0,
    aimHz: 35,
    espHz: 10,
    maxPlayers: 14
  };

  const cfg = { ...defaults };

  try {
    const saved = JSON.parse(
      localStorage.getItem(STORE) || '{}'
    );

    for (const k of Object.keys(cfg)) {
      if (
        typeof saved?.[k] === typeof cfg[k]
      ) {
        cfg[k] = saved[k];
      }
    }
  } catch (_) {}

  const save = () => {
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify(cfg)
      );
    } catch (_) {}
  };

  const clamp = (x, a, b) =>
    Math.max(a, Math.min(b, x));

  const now = () => performance.now();

  const events = new AbortController();

  let dead = false;
  let paused = false;
  let menuOpen = false;
  let held = false;
  let firing = false;

  let scene = null;
  let camera = null;
  let local = null;
  let localTeam = null;

  let actors = [];
  let currentTarget = null;

  let hookTimer = 0;
  let hookActive = false;
  let lastHook = -100000;

  let scanTimer = 0;
  let scanTask = 0;
  let scanJob = null;
  let cameraMisses = 0;

  let espTimer = 0;
  let aimFrame = 0;
  let lastAim = 0;

  let status = 'Waiting for game scene';

  let root, menu, ring, hud;

  const nodes = [];

  const nativePush = Array.prototype.push;

  const add = (
    target,
    type,
    fn,
    opts = {}
  ) => target.addEventListener(
    type,
    fn,
    {
      ...opts,
      signal: events.signal
    }
  );

  // Short, temporary scene discovery.
  // No separate Three.js library or WebGL changes.

  function releaseHook() {
    if (hookTimer) {
      clearTimeout(hookTimer);
    }

    hookTimer = 0;

    if (
      Array.prototype.push === findPush
    ) {
      Array.prototype.push = nativePush;
    }

    hookActive = false;
  }

  function findPush() {
    const value = nativePush.apply(
      this,
      arguments
    );

    if (
      !scene &&
      !dead &&
      !paused
    ) {
      for (
        let i = 0;
        i < arguments.length && i < 3;
        i++
      ) {
        const p = arguments[i]?.parent;

        if (
          p?.type === 'Scene' &&
          p.name === 'Main' &&
          Array.isArray(p.children)
        ) {
          scene = p;

          status =
            'Scene connected; locating camera';

          releaseHook();
          startScan();

          break;
        }
      }
    }

    return value;
  }

  function discover(force = false) {
    if (
      dead ||
      paused ||
      scene ||
      hookActive ||
      document.hidden
    ) return;

    if (
      !force &&
      now() - lastHook < 7500
    ) return;

    if (
      Array.prototype.push !== nativePush
    ) {
      status =
        'Another script is changing Array.push';

      return;
    }

    lastHook = now();
    hookActive = true;

    Array.prototype.push = findPush;

    // Maximum 550 ms of interception.
    hookTimer = setTimeout(() => {
      releaseHook();

      if (!scene) {
        status =
          'Waiting to capture scene; retry during spawn (P)';
      }
    }, 550);
  }

  function clearActors() {
    actors.length = 0;
    currentTarget = null;

    for (const n of nodes) {
      n.el.style.display = 'none';
      n.line.style.display = 'none';
    }
  }

  function loseScene(reason) {
    scene = null;
    camera = null;
    local = null;
    localTeam = null;
    scanJob = null;

    clearTimeout(scanTask);
    scanTask = 0;

    clearActors();

    status = reason;
  }

  // Fail-closed team verification. A plain team/teamId property is not
  // proof that the value is authoritative or fresh. A trusted test adapter
  // must explicitly provide userData.teamVerified === true,
  // userData.team, and userData.teamUpdatedAt from performance.now().
  // The game integration must be validated before these fields are trusted.

  const TEAM_MAX_AGE_MS = 1500;

  function verifiedTeamOf(o, t = now()) {
    const ud = o?.userData;
    const v = ud?.team;
    const updatedAt = ud?.teamUpdatedAt;

    if (
      ud?.teamVerified !== true ||
      !(typeof v === 'string' || typeof v === 'number') ||
      !Number.isFinite(updatedAt) ||
      updatedAt > t ||
      t - updatedAt > TEAM_MAX_AGE_MS
    ) return null;

    return { id: String(v), updatedAt };
  }

  function isConfirmedEnemy(a, t = now()) {
    if (!a?.obj || a.obj === local || !local || !localTeam || !a.team) {
      return false;
    }

    // Revalidate both teams on every decision; never rely on cached labels.
    const currentLocalTeam = verifiedTeamOf(local, t);
    const currentActorTeam = verifiedTeamOf(a.obj, t);

    if (!currentLocalTeam || !currentActorTeam) return false;
    if (currentLocalTeam.id !== localTeam.id) return false;
    if (currentActorTeam.id !== a.team.id) return false;

    // Same team means ally. Unknown/stale values fail closed above.
    return currentActorTeam.id !== currentLocalTeam.id;
  }

  // Incremental scene scanning.

  function startScan() {
    if (
      dead ||
      paused ||
      !scene?.children ||
      scanJob
    ) return;

    scanJob = {
      items: scene.children,
      end: Math.min(
        4000,
        scene.children.length
      ),
      i: 0,
      local: null,
      cam: null,
      found: []
    };

    scanChunk();
  }

  function scanChunk() {
    scanTask = 0;

    const job = scanJob;

    if (
      !job ||
      dead ||
      paused ||
      !scene
    ) return;

    const t = now();
    let n = 0;

    while (
      job.i < job.end &&
      n++ < 75 &&
      now() - t < 0.42
    ) {
      const o = job.items[job.i++];

      if (
        o?.type !== 'Object3D' ||
        !o.position
      ) continue;

      const inner = o.children?.[0];
      const child = inner?.children?.[0];

      if (
        child?.type === 'PerspectiveCamera'
      ) {
        job.local = o;
        job.cam = child;

      } else if (
        child &&
        inner?.children?.length
      ) {
        job.found.push(o);
      }
    }

    if (job.i < job.end) {
      scanTask = setTimeout(
        scanChunk,
        0
      );

      return;
    }

    scanJob = null;

    if (!job.cam || !job.local) {
      status =
        'Camera not ready; retry at spawn (P)';

      if (++cameraMisses >= 3) {
        loseScene(
          'Camera not found; reconnecting'
        );
      }

      return;
    }

    cameraMisses = 0;

    local = job.local;
    camera = job.cam;

    localTeam = verifiedTeamOf(local);

    actors = job.found
      .filter(o => o !== local)
      .slice(0, cfg.maxPlayers)
      .map(obj => ({
        obj,
        team: verifiedTeamOf(obj)
      }));

    const verifiedCount = actors.filter(
      a => isConfirmedEnemy(a)
    ).length;

    status =
      `Connected; ${actors.length} objects; ${verifiedCount} verified enemies. ` +
      `Unknown/stale teams are excluded.`;
  }

  // Project world coordinates using the game's existing camera matrices.

  function project(x, y, z) {
    const m =
      camera?.matrixWorld?.elements;

    const p =
      camera?.projectionMatrix?.elements;

    if (!m || !p) return null;

    const dx = x - m[12];
    const dy = y - m[13];
    const dz = z - m[14];

    const vx =
      m[0]*dx +
      m[1]*dy +
      m[2]*dz;

    const vy =
      m[4]*dx +
      m[5]*dy +
      m[6]*dz;

    const vz =
      m[8]*dx +
      m[9]*dy +
      m[10]*dz;

    const w =
      p[3]*vx +
      p[7]*vy +
      p[11]*vz +
      p[15];

    if (!(w > 0.02)) return null;

    const nx = (
      p[0]*vx +
      p[4]*vy +
      p[8]*vz +
      p[12]
    ) / w;

    const ny = (
      p[1]*vx +
      p[5]*vy +
      p[9]*vz +
      p[13]
    ) / w;

    if (
      !Number.isFinite(nx + ny) ||
      Math.abs(nx) > 4 ||
      Math.abs(ny) > 4
    ) return null;

    return {
      x: (nx + 1) * innerWidth / 2,
      y: (1 - ny) * innerHeight / 2,
      nx,
      ny
    };
  }

  // Lightweight DOM boxes.
  // No objects are inserted into the game renderer.

  function getNode(index) {
    while (nodes.length <= index) {
      if (!root) return null;

      const el =
        document.createElement('div');

      el.className = 'ks-box';

      const mark =
        document.createElement('div');

      mark.className = 'ks-head';

      const line =
        document.createElement('div');

      line.className = 'ks-trace';

      el.append(mark);
      root.append(el, line);

      nodes.push({
        el,
        line,
        mark
      });
    }

    return nodes[index];
  }

  function hideNodes() {
    for (const n of nodes) {
      n.el.style.display = 'none';
      n.line.style.display = 'none';
    }
  }

  function drawESP() {
    if (
      dead ||
      paused ||
      menuOpen ||
      !cfg.esp ||
      !camera ||
      !local
    ) {
      hideNodes();
      return;
    }

    let index = 0;
    const start = now();

    for (const a of actors) {
      if (
        index >= cfg.maxPlayers ||
        now() - start > 2.0
      ) break;

      if (!isConfirmedEnemy(a)) continue;

      const p = a.obj?.position;

      if (!p) continue;

      const top = project(
        p.x,
        p.y + 15,
        p.z
      );

      const bottom = project(
        p.x,
        p.y,
        p.z
      );

      if (!top || !bottom) continue;

      const h = Math.abs(
        bottom.y - top.y
      );

      if (
        h < 3 ||
        h > innerHeight * 3
      ) continue;

      const w = clamp(
        h * 0.36,
        5,
        innerWidth * 0.5
      );

      const n = getNode(index++);

      if (!n) break;

      const x =
        (top.x + bottom.x) / 2;

      const y = Math.min(
        top.y,
        bottom.y
      );

      n.el.style.cssText =
        `display:block;` +
        `left:${x-w/2}px;` +
        `top:${y}px;` +
        `width:${w}px;` +
        `height:${h}px;` +
        `border-color:${cfg.color}`;

      n.mark.style.display =
        cfg.dot ? 'block' : 'none';

      n.mark.style.background =
        cfg.color;

      if (cfg.tracers) {
        const ax = innerWidth / 2;
        const ay = innerHeight;

        const bx = x;
        const by = y + h / 2;

        const len = Math.hypot(
          bx - ax,
          by - ay
        );

        const deg = Math.atan2(
          by - ay,
          bx - ax
        ) * 180 / Math.PI;

        n.line.style.cssText =
          `display:block;` +
          `left:${ax}px;` +
          `top:${ay}px;` +
          `width:${len}px;` +
          `transform:rotate(${deg}deg);` +
          `background:${cfg.color}`;

      } else {
        n.line.style.display = 'none';
      }
    }

    for (
      let i = index;
      i < nodes.length;
      i++
    ) {
      nodes[i].el.style.display = 'none';
      nodes[i].line.style.display = 'none';
    }
  }

  function espLoop() {
    espTimer = 0;

    if (dead) return;

    try {
      if (
        !paused &&
        !menuOpen &&
        cfg.esp
      ) {
        drawESP();
      } else {
        hideNodes();
      }

    } catch (e) {
      status =
        'ESP disabled after error: ' +
        String(e.message).slice(0,80);

      cfg.esp = false;
      hideNodes();
    }

    const interval = (
      !paused &&
      !menuOpen &&
      cfg.esp
    )
      ? 1000 / cfg.espHz
      : 600;

    espTimer = setTimeout(
      espLoop,
      interval
    );
  }

  // Aim calculations run only while RMB is held.

  function aimOnce() {
    if (
      !camera ||
      !local ||
      !actors.length
    ) return;

    let best = null;
    let dBest = cfg.fov ** 2;

    for (const a of actors) {
      if (!isConfirmedEnemy(a)) continue;

      const p = a.obj?.position;

      if (!p) continue;

      const c = project(
        p.x,
        p.y + cfg.height,
        p.z
      );

      if (!c) continue;

      const dx =
        c.x - innerWidth / 2;

      const dy =
        c.y - innerHeight / 2;

      const d =
        dx*dx + dy*dy;

      if (d < dBest) {
        best = c;
        dBest = d;
      }
    }

    if (
      !best ||
      !local.rotation ||
      !local.children?.[0]?.rotation
    ) return;

    const p =
      camera.projectionMatrix.elements;

    if (!p?.[0] || !p?.[5]) return;

    const yaw = Math.atan(
      best.nx / p[0]
    );

    const recoil = firing
      ? cfg.recoil * Math.PI / 180
      : 0;

    const pitch = Math.atan(
      (
        best.ny -
        Math.tan(recoil) * p[5]
      ) / p[5]
    );

    if (
      !Number.isFinite(yaw + pitch)
    ) return;

    local.rotation.y -= clamp(
      yaw * cfg.strength,
      -0.055,
      0.055
    );

    local.children[0].rotation.x =
      clamp(
        local.children[0].rotation.x +
        clamp(
          pitch * cfg.strength,
          -0.05,
          0.05
        ),
        -Math.PI/2 + 0.01,
        Math.PI/2 - 0.01
      );
  }

  function aimLoop(t) {
    aimFrame = 0;

    if (
      dead ||
      paused ||
      menuOpen ||
      !held ||
      !cfg.aim
    ) return;

    if (
      t - lastAim >=
      1000 / cfg.aimHz
    ) {
      lastAim = t;

      try {
        aimOnce();
      } catch (e) {
        status =
          'Aim disabled: ' +
          String(e.message).slice(0,80);

        cfg.aim = false;
      }
    }

    aimFrame =
      requestAnimationFrame(aimLoop);
  }

  function startAim() {
    if (
      !aimFrame &&
      !dead &&
      !paused &&
      held &&
      cfg.aim &&
      !menuOpen
    ) {
      aimFrame =
        requestAnimationFrame(aimLoop);
    }
  }

  function stopAim() {
    held = false;
    currentTarget = null;

    if (aimFrame) {
      cancelAnimationFrame(aimFrame);
    }

    aimFrame = 0;
  }

  // Menu and lifecycle.

  function updateUI() {
    if (!root) return;

    menu.style.display =
      menuOpen ? 'flex' : 'none';

    ring.style.display =
      !paused &&
      !menuOpen &&
      cfg.circle
        ? 'block'
        : 'none';

    ring.style.width =
      ring.style.height =
      `${cfg.fov * 2}px`;

    ring.style.borderColor =
      cfg.color;

    if (menuOpen) {
      hud.textContent =
        `${paused ? 'PAUSED' : 'ACTIVE'}` +
        ` | ${status}` +
        ` | Press F9 to toggle`;
    }
  }

  function pausedSet(value) {
    if (
      dead ||
      paused === value
    ) return;

    paused = value;

    stopAim();

    if (paused) {
      releaseHook();

      clearTimeout(scanTask);
      scanTask = 0;
      scanJob = null;

      hideNodes();

    } else {
      if (scene) {
        startScan();
      } else {
        discover(true);
      }
    }

    updateUI();
  }

  function toggleMenu() {
    if (dead) return;

    menuOpen = !menuOpen;

    stopAim();
    hideNodes();

    if (
      menuOpen &&
      document.pointerLockElement
    ) {
      document.exitPointerLock?.();
    }

    updateUI();
  }

  function quit() {
    if (dead) return;

    dead = true;

    releaseHook();
    clearTimeout(scanTask);
    clearInterval(scanTimer);
    clearTimeout(espTimer);

    stopAim();

    events.abort();
    root?.remove();

    window[FLAG] = false;
  }

  function buildUI() {
    if (
      dead ||
      root ||
      !document.body
    ) return;

    root = document.createElement('div');
    root.id = 'kr-safe22';

    root.innerHTML = `<style>
      #kr-safe22 {
        position:fixed;
        inset:0;
        z-index:2147483000;
        pointer-events:none;
        color:#e9f4ff;
        font:14px system-ui,Arial;
      }

      #kr-safe22 .ks-fov {
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        border:1px solid #00ff77;
        border-radius:50%;
      }

      #kr-safe22 .ks-box {
        position:absolute;
        display:none;
        border:1.5px solid #00ff77;
        box-sizing:border-box;
      }

      #kr-safe22 .ks-head {
        position:absolute;
        display:none;
        width:5px;
        height:5px;
        border-radius:50%;
        left:calc(50% - 2.5px);
        top:1px;
      }

      #kr-safe22 .ks-trace {
        position:absolute;
        display:none;
        height:1px;
        transform-origin:0 50%;
        background:#00ff77;
      }

      #kr-safe22 .ks-shade {
        position:absolute;
        inset:0;
        display:none;
        align-items:center;
        justify-content:center;
        background:#030a15d9;
        pointer-events:auto;
      }

      #kr-safe22 .ks-panel {
        width:min(640px,92vw);
        max-height:85vh;
        overflow:auto;
        background:#15263b;
        border:1px solid #526e85;
        border-radius:12px;
        box-shadow:0 15px 50px #0009;
      }

      #kr-safe22 .ks-top {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        background:#1e344e;
        padding:17px 20px;
      }

      #kr-safe22 h2 {
        margin:0;
        font-size:20px;
      }

      #kr-safe22 small {
        color:#accad8;
      }

      #kr-safe22 .ks-grid {
        padding:16px;
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:12px;
      }

      #kr-safe22 section {
        background:#20334a;
        border:1px solid #39556b;
        border-radius:8px;
        padding:13px;
      }

      #kr-safe22 h3 {
        margin:0 0 8px;
        color:#83f2b5;
        font-size:15px;
      }

      #kr-safe22 label {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        padding:7px 0;
        border-top:1px solid #3c5264;
        font-size:13px;
      }

      #kr-safe22 input[type=range] {
        width:110px;
        accent-color:#26d787;
      }

      #kr-safe22 input[type=checkbox] {
        width:18px;
        height:18px;
        accent-color:#26d787;
      }

      #kr-safe22 button,
      #kr-safe22 select {
        background:#31536d;
        border:1px solid #648fa6;
        border-radius:6px;
        padding:7px;
        color:white;
        cursor:pointer;
      }

      #kr-safe22 output {
        color:#a0fac6;
        margin-left:auto;
        font:12px monospace;
      }

      #kr-safe22 .ks-footer {
        padding:0 18px 16px;
        white-space:pre-wrap;
        font:12px/1.6 monospace;
        color:#d0dfec;
      }

      @media(max-width:580px) {
        #kr-safe22 .ks-grid {
          grid-template-columns:1fr;
        }
      }
    </style>`;

    ring = document.createElement('div');
    ring.className = 'ks-fov';

    menu = document.createElement('div');
    menu.className = 'ks-shade';

    const panel =
      document.createElement('div');

    panel.className = 'ks-panel';

    const header =
      document.createElement('div');

    header.className = 'ks-top';

    const title =
      document.createElement('div');

    title.innerHTML =
      '<h2>KRUNKER · SAFE MODE 2.2</h2>' +
      '<small>~ Menu · F9 Pause · P Retry · F10 Shutdown</small>';

    const close =
      document.createElement('button');

    close.textContent = 'Close ×';
    close.onclick = toggleMenu;

    header.append(title, close);

    const grid =
      document.createElement('div');

    grid.className = 'ks-grid';

    function group(name) {
      const g =
        document.createElement('section');

      const h =
        document.createElement('h3');

      h.textContent = name;

      g.append(h);
      grid.append(g);

      return g;
    }

    function control(
      g,
      label,
      key,
      min,
      max,
      step
    ) {
      const row =
        document.createElement('label');

      const text =
        document.createElement('span');

      text.textContent = label;

      const input =
        document.createElement('input');

      const numeric =
        min !== undefined;

      input.type =
        numeric ? 'range' : 'checkbox';

      if (numeric) {
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = cfg[key];

      } else {
        input.checked = cfg[key];
      }

      row.append(text);

      const out =
        document.createElement('output');

      if (numeric) {
        out.textContent = cfg[key];
        row.append(out);
      }

      row.append(input);
      g.append(row);

      input.addEventListener(
        numeric ? 'input' : 'change',
        () => {
          cfg[key] = numeric
            ? Number(input.value)
            : input.checked;

          if (numeric) {
            out.textContent = input.value;
          }

          if (
            key === 'aim' &&
            !cfg.aim
          ) {
            stopAim();
          }

          save();
          updateUI();
        }
      );
    }

    const a = group('Aiming');

    control(a, 'Hold RMB to aim', 'aim');
    control(a, 'Verified-team safety gate (fail-closed)', 'team');

    control(a, 'FOV (px)', 'fov', 50, 280, 5);
    control(a, 'Target height', 'height', 2, 12, .5);
    control(a, 'Strength', 'strength', .2, 1, .05);
    control(a, 'Fire compensation', 'recoil', 0, 2, .1);

    const e = group('ESP');

    control(e, 'Screen boxes', 'esp');
    control(e, 'Head dot', 'dot');
    control(e, 'Tracers', 'tracers');
    control(e, 'FOV circle', 'circle');

    const colorRow =
      document.createElement('label');

    colorRow.textContent = 'Color';

    const sel =
      document.createElement('select');

    const colorOptions = [
      ['#00ff77', 'Green'],
      ['#ff3a4e', 'Red'],
      ['#2adcff', 'Cyan'],
      ['#ffdd44', 'Yellow'],
      ['#bc88ff', 'Purple']
    ];

    for (const [c, name] of colorOptions) {
      const op =
        document.createElement('option');

      op.value = c;
      op.textContent = name;

      sel.append(op);
    }

    sel.value = cfg.color;

    sel.onchange = () => {
      cfg.color = sel.value;
      save();
      updateUI();
    };

    colorRow.append(sel);
    e.append(colorRow);

    const p = group('Performance');

    control(
      p,
      'ESP updates/sec',
      'espHz',
      4, 16, 1
    );

    control(
      p,
      'Aim updates/sec',
      'aimHz',
      20, 50, 5
    );

    control(
      p,
      'Max tracked objects',
      'maxPlayers',
      4, 20, 2
    );

    const d = group('Status');

    hud = document.createElement('div');

    hud.style.cssText =
      'font:12px/1.6 monospace;' +
      'overflow-wrap:anywhere';

    d.append(hud);

    const retry =
      document.createElement('button');

    retry.textContent = 'Retry scene (P)';

    retry.onclick = () => {
      loseScene('Retrying');
      discover(true);
      updateUI();
    };

    d.append(retry);

    const pause =
      document.createElement('button');

    pause.textContent = 'Pause (F9)';
    pause.style.marginLeft = '6px';

    pause.onclick = () =>
      pausedSet(!paused);

    d.append(pause);

    const footer =
      document.createElement('div');

    footer.className = 'ks-footer';

    footer.textContent =
      'No extra Three.js, native GPU meshes, ' +
      'wall indexing, or WebGL hooks. ' +
      'Boxes are lightweight DOM outlines. ' +
      'Live compatibility depends on game changes. ' +
      'Team gate requires explicit verified, fresh metadata; unknown/stale teams are excluded. ' +
      'No automatic firing is implemented.';

    panel.append(
      header,
      grid,
      footer
    );

    menu.append(panel);

    root.append(
      ring,
      menu
    );

    document.body.append(root);

    updateUI();
  }

  // Controls

  add(window, 'keydown', e => {
    if (dead) return;

    if (e.code === 'F10') {
      e.preventDefault();
      quit();
      return;
    }

    if (e.code === 'F9') {
      e.preventDefault();
      pausedSet(!paused);
      return;
    }

    if (
      e.code === 'Backquote' ||
      e.code === 'F8'
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();

      toggleMenu();
      return;
    }

    if (
      menuOpen ||
      /^(INPUT|TEXTAREA)$/.test(
        document.activeElement?.tagName || ''
      )
    ) return;

    if (e.code === 'KeyP') {
      e.preventDefault();

      loseScene('Manual retry');
      discover(true);
      updateUI();
    }

  }, { capture: true });

  add(window, 'mousedown', e => {
    if (
      dead ||
      paused ||
      menuOpen
    ) return;

    if (e.button === 0) {
      firing = true;
    }

    if (e.button === 2) {
      held = true;
      startAim();
    }

    if (!scene) {
      discover(false);
    }

  }, { capture: true });

  add(window, 'mouseup', e => {
    if (e.button === 2) {
      stopAim();
    }

    if (e.button === 0) {
      firing = false;
    }

  }, { capture: true });

  add(window, 'blur', () => {
    stopAim();
    firing = false;
  });

  add(document, 'pointerlockchange', () => {
    if (
      document.pointerLockElement &&
      !scene
    ) {
      discover(false);
    }
  });

  add(document, 'visibilitychange', () => {
    if (document.hidden) {
      stopAim();
    }
  });

  if (
    document.readyState === 'loading'
  ) {
    add(
      document,
      'DOMContentLoaded',
      buildUI,
      { once: true }
    );

  } else {
    buildUI();
  }

  // Background work stays limited.
  scanTimer = setInterval(() => {
    if (
      dead ||
      paused ||
      document.hidden
    ) return;

    if (scene) {
      startScan();

    } else if (
      document.pointerLockElement
    ) {
      discover(false);
    }

  }, 1600);

  espLoop();
  discover(true);

})();
