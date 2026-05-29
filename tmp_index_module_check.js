
    import {
      initWorld,
      initWorldFromLevel,
      updateWorld,
      drawWorld,
      shootFromPlayer,
      resizeWorld,
      world,
      toggleLevelDebugOverlay,
      toggleDebugMode
    } from "./world.js";
    import { config } from "./config.js";
    import { DEFAULTS as PlayerDef  } from "./Player.js";
    import { DEFAULTS as EnemyDef   } from "./Enemy.js";
    import { DEFAULTS as MacroDef   } from "./Macrophage.js";
    import { DEFAULTS as StentorDef } from "./Stentor.js";
    import { DEFAULTS as ObsDef     } from "./Obstacle.js";
    import { DEFAULTS as StoneDef   } from "./Stone.js";
    import {
      getActiveSpriteTheme,
      getSpriteThemes,
      preloadAssetsForLevel,
      preloadAssetsForRandomSession,
      preloadCoreSpriteAssets,
      setActiveSpriteTheme,
      subscribeSpriteThemeChange
    } from "./spriteAssets.js";

    const canvas = document.getElementById("canvas");
    const ctx    = canvas.getContext("2d");
    const launcherPreviewCanvas = document.getElementById("launcher-preview-canvas");
    const launcherPreviewCtx    = launcherPreviewCanvas.getContext("2d");
    const launcherScopeFrame    = document.querySelector(".launcher-scope");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    launcherPreviewCtx.imageSmoothingEnabled = true;
    launcherPreviewCtx.imageSmoothingQuality = "high";
    const launcherStatus = document.getElementById("launcher-status");
    const launcherButtons = Array.from(document.querySelectorAll(".launcher-btn"));
    const resumeButton = document.getElementById("launcher-resume");
    const playNowButton = document.getElementById("launcher-play-now");
    const launcherSettingRadius = document.getElementById("launcher-setting-radius");
    const launcherSettingSpeed = document.getElementById("launcher-setting-speed");
    const launcherSettingFertility = document.getElementById("launcher-setting-fertility");
    const launcherRadiusValue = document.getElementById("launcher-radius-value");
    const launcherSpeedValue = document.getElementById("launcher-speed-value");
    const launcherFertilityValue = document.getElementById("launcher-fertility-value");
    const spriteThemeSelect = document.getElementById("sprite-theme-select");
    const spriteThemeChip = document.getElementById("sprite-theme-chip");
    const spriteThemeDescription = document.getElementById("sprite-theme-description");

    let initialized  = false;
    let currentLevel = null;
    let levelName    = "";
    let sessionState = "launcher";
    let launcherBusy = false;
    let levelResizeReflowHandle = null;
    let introLevel = null;
    let introPreviewReady = false;
    let spriteAssetsReady = false;
    let spritePreloadRequestId = 0;
    let levelRuntimeDebugPending = false;

    // ── helpers ────────────────────────────────────────────────────────────

    function fmt(v) {
      if (typeof v !== "number" || !Number.isFinite(v)) return String(v);
      return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    }

    function getBounds() {
      return { width: canvas.width, height: canvas.height };
    }

    function getLevelPlayfieldRect(levelJson = currentLevel) {
      const bounds = getBounds();
      const refWidth = Number(levelJson?.canvasRef?.width ?? 0);
      const refHeight = Number(levelJson?.canvasRef?.height ?? 0);
      if (!(refWidth > 0) || !(refHeight > 0)) {
        return { x: 0, y: 0, width: bounds.width, height: bounds.height };
      }

      const scale = Math.min(bounds.width / refWidth, bounds.height / refHeight);
      const width = Math.max(1, Math.round(refWidth * scale));
      const height = Math.max(1, Math.round(refHeight * scale));
      return {
        x: Math.round((bounds.width - width) * 0.5),
        y: Math.round((bounds.height - height) * 0.5),
        width,
        height
      };
    }

    function getLevelWorldBounds(levelJson = currentLevel) {
      const refWidth = Number(levelJson?.canvasRef?.width ?? 0);
      const refHeight = Number(levelJson?.canvasRef?.height ?? 0);
      if (!(refWidth > 0) || !(refHeight > 0)) return getBounds();
      return { width: refWidth, height: refHeight };
    }

    function getActiveSessionBounds() {
      return currentLevel ? getLevelPlayfieldRect(currentLevel) : getBounds();
    }

    function captureLevelRuntimeDebug(worldBounds, playfield) {
      const sampleParticles = (world.particles ?? [])
        .filter(p => p && !p.absorbed && !p.isPlayer && !p.isProjectile)
        .slice(0, 10)
        .map((p, index) => ({
          index,
          x: Number.isFinite(p.x) ? Number(p.x.toFixed(2)) : p.x,
          y: Number.isFinite(p.y) ? Number(p.y.toFixed(2)) : p.y,
          radius: Number.isFinite(p.radius) ? Number(p.radius.toFixed(2)) : p.radius
        }));

      const snapshot = {
        levelName,
        playfield,
        worldBounds,
        player: world.player ? {
          x: Number.isFinite(world.player.x) ? Number(world.player.x.toFixed(2)) : world.player.x,
          y: Number.isFinite(world.player.y) ? Number(world.player.y.toFixed(2)) : world.player.y,
          radius: Number.isFinite(world.player.radius) ? Number(world.player.radius.toFixed(2)) : world.player.radius,
          absorbed: !!world.player.absorbed
        } : null,
        enemies: (world.enemies ?? []).slice(0, 3).map((enemy, index) => ({
          index,
          x: Number.isFinite(enemy?.x) ? Number(enemy.x.toFixed(2)) : enemy?.x,
          y: Number.isFinite(enemy?.y) ? Number(enemy.y.toFixed(2)) : enemy?.y,
          radius: Number.isFinite(enemy?.radius) ? Number(enemy.radius.toFixed(2)) : enemy?.radius,
          removed: !!enemy?.removed
        })),
        macrophages: (world.macrophages ?? []).slice(0, 3).map((entity, index) => ({
          index,
          x: Number.isFinite(entity?.x) ? Number(entity.x.toFixed(2)) : entity?.x,
          y: Number.isFinite(entity?.y) ? Number(entity.y.toFixed(2)) : entity?.y,
          radius: Number.isFinite(entity?.radius) ? Number(entity.radius.toFixed(2)) : entity?.radius
        })),
        particles: sampleParticles
      };

      window.__levelRuntimeDebug = snapshot;
      console.group("[Level Runtime Debug]");
      console.log(snapshot);
      console.log("Tip: copy(window.__levelRuntimeDebug)");
      console.groupEnd();
    }

    function getLauncherPreviewBounds() {
      const rect = launcherScopeFrame.getBoundingClientRect();
      return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
      };
    }

    function syncLauncherPreviewCanvasSize() {
      const { width, height } = getLauncherPreviewBounds();
      launcherPreviewCanvas.width = width;
      launcherPreviewCanvas.height = height;
    }

    async function ensureSpriteAssetsLoaded(loadFn, loadingMessage, readyMessage = null) {
      const requestId = ++spritePreloadRequestId;
      spriteAssetsReady = false;
      setLauncherStatus(loadingMessage, "ready");

      try {
        await loadFn();
        if (requestId !== spritePreloadRequestId) return false;
        spriteAssetsReady = true;
        if (readyMessage) setLauncherStatus(readyMessage, "ready");
        return true;
      } catch (err) {
        if (requestId === spritePreloadRequestId) {
          spriteAssetsReady = true;
        }
        throw err;
      }
    }

    async function restoreLauncherPreview() {
      if (sessionState === "active") return;
      if (!introLevel) return;
      const ready = await ensureSpriteAssetsLoaded(
        () => preloadAssetsForLevel(introLevel),
        "Preloading intro sprites..."
      );
      if (!ready) return;
      if (sessionState === "active") return;
      syncLauncherPreviewCanvasSize();
      initWorldFromLevel(applyLauncherLevelSettings(introLevel), getLauncherPreviewBounds());
      introPreviewReady = true;
    }

    function applySpriteThemeUI(theme = getActiveSpriteTheme()) {
      if (!theme) return;
      document.body.dataset.spriteTheme = theme.id;
      spriteThemeSelect.value = theme.id;
      spriteThemeChip.textContent = theme.label;
      spriteThemeDescription.textContent = `${theme.description} Rozmery spritesheetu zustavaji kompatibilni s existujicimi levely a entitami.`;
    }

    function populateSpriteThemeOptions() {
      const themes = getSpriteThemes();
      spriteThemeSelect.innerHTML = "";

      for (const theme of themes) {
        const option = document.createElement("option");
        option.value = theme.id;
        option.textContent = theme.label;
        spriteThemeSelect.appendChild(option);
      }

      applySpriteThemeUI();
    }

    function setLauncherStatus(message, tone = "ready") {
      launcherStatus.textContent = message;
      launcherStatus.dataset.tone = tone;
    }

    function setLauncherBusy(busy) {
      launcherBusy = busy;
      launcherButtons.forEach(button => {
        if (!button.hidden) button.disabled = busy;
      });
      playNowButton.disabled = busy;
    }

    function getLauncherLevelSettings() {
      return {
        radius: Number(launcherSettingRadius.value),
        speed: Number(launcherSettingSpeed.value),
        fertility: Math.round(Number(launcherSettingFertility.value))
      };
    }

    function syncLauncherSettingReadouts() {
      const settings = getLauncherLevelSettings();
      launcherRadiusValue.textContent = fmt(settings.radius);
      launcherSpeedValue.textContent = fmt(settings.speed);
      launcherFertilityValue.textContent = fmt(settings.fertility);
    }

    function applyLauncherLevelSettings(json) {
      const settings = getLauncherLevelSettings();
      const nextJson = JSON.parse(JSON.stringify(json));

      nextJson.entities = (nextJson.entities ?? []).map(entity => {
        if (entity?.type !== "Enemy" || entity.instanceIndex !== 1) return entity;
        return {
          ...entity,
          radius: settings.radius,
          speed: settings.speed,
          gitMaxParticles: settings.fertility
        };
      });

      return nextJson;
    }

    function setSessionActive(active) {
      sessionState = active ? "active" : "launcher";
      document.body.classList.toggle("session-active", active);
      resumeButton.hidden = !initialized;
      if (!active) {
        document.body.classList.remove("menu-open");
        if (!initialized) restoreLauncherPreview();
      }
    }

    async function startRandomSession() {
      currentLevel = null;
      levelName = "";
      setLauncherBusy(true);

      try {
        const ready = await ensureSpriteAssetsLoaded(
          () => preloadAssetsForRandomSession(),
          "Preloading random session sprites..."
        );
        if (!ready) return;

        initWorld(getBounds());
        initialized = true;
        setSessionActive(true);
        updateLevelPanel();
        buildInstanceList();
        setLauncherStatus("Random field initialized. Session is live.", "ready");
      } finally {
        setLauncherBusy(false);
      }
    }

    async function startLevelSession(json, name) {
      currentLevel = json;
      levelName = name;
      if (json && typeof json === "object") {
        json.__debugLevelName = name;
      }
      introPreviewReady = false;
      setSessionActive(true);
      setLauncherBusy(true);

      try {
        const ready = await ensureSpriteAssetsLoaded(
          () => preloadAssetsForLevel(json),
          `Preloading sprites for ${name}...`
        );
        if (!ready) return;

        canvas.width = Math.max(1, window.innerWidth);
        canvas.height = Math.max(1, window.innerHeight);
        initWorldFromLevel(json, getLevelWorldBounds(json));
        levelRuntimeDebugPending = true;
        initialized = true;
        updateLevelPanel();
        buildInstanceList();
        setLauncherStatus(`Loaded ${name}. Session is live.`, "ready");
      } finally {
        setLauncherBusy(false);
      }
    }

    async function loadBundledLevel() {
      const wasActive = sessionState === "active";
      setLauncherBusy(true);
      setLauncherStatus("Loading bundled level profile...", "ready");

      try {
        const response = await fetch("./level.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        await startLevelSession(json, "level.json");
      } catch (err) {
        setSessionActive(wasActive && initialized);
        setLauncherStatus(`Bundled level could not be loaded: ${err.message}`, "error");
      } finally {
        setLauncherBusy(false);
      }
    }

    async function loadIntroPreview() {
      if (sessionState === "active") return;
      syncLauncherPreviewCanvasSize();

      try {
        const response = await fetch("./introlevel.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        introLevel = await response.json();
        if (sessionState === "active") return;
        await restoreLauncherPreview();
      } catch (err) {
        introPreviewReady = false;
        setLauncherStatus(`Intro preview could not be loaded: ${err.message}`, "error");
      }
    }

    function clampToBounds(obj) {
      if (!obj) return;
      const b = getBounds();
      if (typeof obj.x === "number") obj.x = Math.max(obj.radius, Math.min(b.width  - obj.radius, obj.x));
      if (typeof obj.y === "number") obj.y = Math.max(obj.radius, Math.min(b.height - obj.radius, obj.y));
    }

    // ── World-level sliders (affect config + future particles, not live ones) ─

    const worldControlDefs = [
      {
        label: "Particle count",
        key:   "particleCount",
        min: 10, max: 400, step: 5,
        note: "Takes effect on next New / Reload."
      },
      {
        label: "Max particle radius",
        key:   "maxRadius",
        min: 10, max: 120, step: 1,
      },
      {
        label: "Min particle speed",
        key:   "minSpeed",
        min: 0.01, max: 3, step: 0.01,
      },
      {
        label: "Brownian motion",
        key:   "brownianStrength",
        min: 0, max: 0.3, step: 0.002,
      },
      {
        label: "Player friction",
        key:   "playerFriction",
        min: 0.80, max: 1.0, step: 0.002,
      },
      {
        label: "Player min friction",
        key:   "playerMinFriction",
        min: 0.70, max: 1.0, step: 0.002,
      },
      {
        label: "Player slow start",
        key:   "playerSlowdownStartRadius",
        min: 10, max: 80, step: 1,
      },
      {
        label: "Particle friction",
        key:   "particleFriction",
        min: 0.90, max: 1.0, step: 0.001,
      },
      {
        label: "Division radius",
        key:   "divisionRadius",
        min: 10, max: 100, step: 1,
      },
      {
        label: "Player split radius",
        key:   "playerSplitRadius",
        min: 20, max: 80, step: 1,
      },
      {
        label: "Split child radius",
        key:   "playerSplitChildRadius",
        min: 6, max: 30, step: 1,
      },
    ];

    function buildWorldControls() {
      const container = document.getElementById("world-controls");
      container.innerHTML = "";

      for (const def of worldControlDefs) {
        const group = document.createElement("div");
        group.className = "control-group";

        const head  = document.createElement("div");
        head.className = "control-head";

        const name  = document.createElement("div");
        name.className = "control-name";
        name.textContent = def.label;

        const val   = document.createElement("div");
        val.className = "control-value";
        val.textContent = fmt(config[def.key]);

        head.append(name, val);
        group.appendChild(head);

        const input = document.createElement("input");
        input.type  = "range";
        input.min   = def.min;
        input.max   = def.max;
        input.step  = def.step;
        input.value = config[def.key];
        input.addEventListener("input", () => {
          const v = Number(input.value);
          config[def.key] = v;
          val.textContent = fmt(v);
        });
        group.appendChild(input);

        if (def.note) {
          const note = document.createElement("div");
          note.className = "control-note";
          note.textContent = def.note;
          group.appendChild(note);
        }

        container.appendChild(group);
      }
    }

    // ── Instance-level sliders (write directly to a live object) ──────────

    /**
     * Builds a single slider row that reads/writes a prop on `obj`.
     * @param {object}  obj       live entity instance
     * @param {string}  label     display label
     * @param {string}  prop      property path on obj (dot-notation for nested)
     * @param {number}  min
     * @param {number}  max
     * @param {number}  step
     * @param {Function} [onChange]  optional side-effect after write
     */
    function makeSlider(obj, label, prop, min, max, step, onChange) {
      const group = document.createElement("div");
      group.className = "control-group";

      const head  = document.createElement("div");
      head.className = "control-head";

      const name  = document.createElement("div");
      name.className  = "control-name";
      name.textContent = label;

      const val   = document.createElement("div");
      val.className = "control-value";

      const get = () => {
        const parts = prop.split(".");
        let v = obj;
        for (const p of parts) v = v?.[p];
        return v;
      };
      const set = (v) => {
        const parts = prop.split(".");
        let target = obj;
        for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
        target[parts[parts.length - 1]] = v;
      };

      val.textContent = fmt(get());

      head.append(name, val);
      group.appendChild(head);

      const input = document.createElement("input");
      input.type  = "range";
      input.min   = min;
      input.max   = max;
      input.step  = step;
      input.value = get() ?? min;
      input.addEventListener("input", () => {
        const v = Number(input.value);
        set(v);
        val.textContent = fmt(v);
        if (onChange) onChange(v, obj);
        clampToBounds(obj);
      });
      group.appendChild(input);

      return group;
    }

    function makeToggle(obj, label, prop, onChange) {
      const group = document.createElement("div");
      group.className = "control-group";

      const head  = document.createElement("div");
      head.className = "control-head";

      const name  = document.createElement("div");
      name.className  = "control-name";
      name.textContent = label;

      const val   = document.createElement("div");
      val.className = "control-value";

      const get = () => !!obj?.[prop];
      const set = (v) => { obj[prop] = !!v; };

      val.textContent = get() ? "ON" : "OFF";

      head.append(name, val);
      group.appendChild(head);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "launcher-btn";
      button.textContent = get() ? "Disable" : "Enable";
      button.addEventListener("click", () => {
        const next = !get();
        set(next);
        val.textContent = next ? "ON" : "OFF";
        button.textContent = next ? "Disable" : "Enable";
        if (onChange) onChange(next, obj);
      });
      group.appendChild(button);

      return group;
    }

    /**
     * Builds all controls for one entity card and appends them to `container`.
     */
    function buildInstanceCard(type, obj, index, listEl) {
      const card = document.createElement("div");
      card.className = "instance-card";

      // header
      const hdr = document.createElement("div");
      hdr.className = "instance-card-header";

      const lbl = document.createElement("div");
      lbl.className = "instance-label";
      lbl.textContent = type;

      const idx = document.createElement("div");
      idx.className = "instance-index";
      idx.textContent = `#${index}`;

      hdr.append(lbl, idx);
      card.appendChild(hdr);

      const controls = document.createElement("div");
      controls.className = "instance-controls";

      switch (type) {
        case "Player":
          controls.appendChild(makeSlider(obj, "Radius",      "radius",     2, 120, 1,
            (v) => { obj.prevRadius = v; }));
          controls.appendChild(makeSlider(obj, "Click force", "clickForce", 0.1, 4, 0.05));
          break;

        case "Enemy":
          controls.appendChild(makeSlider(obj, "Radius", "radius", 4, 120, 1));
          controls.appendChild(makeSlider(obj, "Speed",  "speed",  0.01, 4, 0.01));
          controls.appendChild(makeSlider(obj, "Bounce force", "bounceForce", 0, 8, 0.1));
          break;

        case "Macrophage":
          controls.appendChild(makeSlider(obj, "Radius",    "radius",     4, 140, 1));
          controls.appendChild(makeSlider(obj, "Turn rate", "mouth.turnRate",  0.001, 0.3, 0.001,
            // mouth object may be null — write to obj.mouth, lazily create
            (v, o) => {
              if (!o.mouth) o.mouth = {};
              o.mouth.turnRate = v;
            }
          ));
          controls.appendChild(makeSlider(obj, "Idle spin", "mouth.idleSpin", 0, 0.2, 0.001,
            (v, o) => { if (!o.mouth) o.mouth = {}; o.mouth.idleSpin = v; }
          ));
          controls.appendChild(makeSlider(obj, "Bounce force", "bounceForce", 0, 4, 0.05));
          break;

        case "ComposedStone":
          controls.appendChild(makeSlider(obj, "Sprite scale", "spriteScale", 0.05, 10, 0.01));
          controls.appendChild(makeToggle(obj, "Sprite debug", "spriteDebug"));
          break;

        case "Stentor":
          controls.appendChild(makeSlider(obj, "Mouth turn rate",    "mouth.turnRate",          0.001, 0.3, 0.001,
            (v, o) => { if (!o.mouth) o.mouth = {}; o.mouth.turnRate = v; }
          ));
          controls.appendChild(makeSlider(obj, "Mouth idle spin",    "mouth.idleSpin",          0, 0.2, 0.001,
            (v, o) => { if (!o.mouth) o.mouth = {}; o.mouth.idleSpin = v; }
          ));
          controls.appendChild(makeSlider(obj, "Body idle spin",     "bodyRotation.idleSpin",   0, 0.02, 0.0002,
            (v, o) => { if (!o.bodyRotation) o.bodyRotation = {}; o.bodyRotation.idleSpin = v; }
          ));
          break;

        case "Obstacle":
          controls.appendChild(makeSlider(obj, "Radius",       "radius",      4, 140, 1));
          controls.appendChild(makeSlider(obj, "Bounce force", "bounceForce", 0, 5,   0.1));
          break;

        case "Stone":
        case "Oldbody":
          controls.appendChild(makeSlider(obj, "Radius",    "radius",   4, 140, 1));
          controls.appendChild(makeSlider(obj, "Max speed", "maxSpeed", 0.05, 8, 0.05));
          controls.appendChild(makeSlider(obj, "Friction",  "friction", 0.80, 1, 0.005));
          break;
      }

      card.appendChild(controls);
      listEl.appendChild(card);
    }

    /**
     * Rebuilds the entire Instances section from current world state.
     * Called after each level load/init, and whenever the menu is opened.
     */
    function buildInstanceList() {
      const list = document.getElementById("instance-list");
      list.innerHTML = "";

      if (!initialized) {
        list.innerHTML = '<div class="empty-note">Start a game to see live instances.</div>';
        return;
      }

      let count = 0;

      // Player
      if (world.player && !world.player.absorbed) {
        buildInstanceCard("Player", world.player, 1, list);
        count++;
      }

      // Enemies
      (world.enemies ?? []).forEach((e, i) => {
        buildInstanceCard("Enemy", e, i + 1, list);
        count++;
      });

      // Macrophages
      (world.macrophages ?? []).forEach((m, i) => {
        buildInstanceCard("Macrophage", m, i + 1, list);
        count++;
      });

      // Stentors
      (world.stentors ?? []).forEach((s, i) => {
        buildInstanceCard("Stentor", s, i + 1, list);
        count++;
      });

      // Obstacles
      (world.obstacles ?? []).forEach((o, i) => {
        buildInstanceCard("Obstacle", o, i + 1, list);
        count++;
      });

      // Stones
      (world.stones ?? []).forEach((s, i) => {
        buildInstanceCard("Stone", s, i + 1, list);
        count++;
      });

      // Composed stones
      (world.composedStones ?? []).forEach((s, i) => {
        buildInstanceCard("ComposedStone", s, i + 1, list);
        count++;
      });

      // Old bodies
      (world.oldbodies ?? []).forEach((o, i) => {
        buildInstanceCard("Oldbody", o, i + 1, list);
        count++;
      });

      if (count === 0) {
        list.innerHTML = '<div class="empty-note">No live instances found.</div>';
      }
    }

    // ── Level management ───────────────────────────────────────────────────

    function updateLevelPanel() {
      const hasLevel = !!currentLevel;
      document.getElementById("btn-reload").style.display = hasLevel ? "" : "none";
      document.getElementById("btn-unload").style.display = hasLevel ? "" : "none";
      document.getElementById("level-name").textContent   = hasLevel
        ? `Loaded: ${levelName}`
        : initialized
          ? "Random field active"
          : "no level loaded";
    }

    function loadLevelJSON(json, name) {
      return startLevelSession(json, name);
    }

    window.loadRandom = function () {
      startRandomSession();
    };

    window.reloadLevel = function () {
      if (!currentLevel) { loadRandom(); return; }
      if (levelName === "level.json") {
        loadBundledLevel();
        return;
      }
      startLevelSession(currentLevel, levelName);
    };

    window.unloadLevel = function () {
      if (!initialized) return;
      setSessionActive(false);
      setLauncherStatus("Session unloaded. Choose how you want to start the next observation.", "ready");
    };

    // ── File input / drag-drop ─────────────────────────────────────────────

    document.getElementById("file-input").addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      const wasActive = sessionState === "active";
      setLauncherBusy(true);
      setLauncherStatus(`Importing ${file.name}...`, "ready");
      const reader = new FileReader();
      reader.onload = async ev => {
        try {
          await loadLevelJSON(JSON.parse(ev.target.result), file.name);
        } catch (err) {
          setSessionActive(wasActive && initialized);
          setLauncherStatus(`Invalid JSON: ${err.message}`, "error");
        }
        setLauncherBusy(false);
      };
      reader.onerror = () => {
        setLauncherBusy(false);
        setLauncherStatus(`Could not read ${file.name}.`, "error");
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    document.addEventListener("dragover",  e => { e.preventDefault(); document.body.classList.add("drag-over"); });
    document.addEventListener("dragleave", e => { if (e.relatedTarget === null) document.body.classList.remove("drag-over"); });
    document.addEventListener("drop", e => {
      e.preventDefault();
      document.body.classList.remove("drag-over");
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const wasActive = sessionState === "active";
      setLauncherBusy(true);
      setLauncherStatus(`Importing ${file.name}...`, "ready");
      const reader = new FileReader();
      reader.onload = async ev => {
        try { await loadLevelJSON(JSON.parse(ev.target.result), file.name); }
        catch (err) {
          setSessionActive(wasActive && initialized);
          setLauncherStatus(`Invalid JSON: ${err.message}`, "error");
        }
        setLauncherBusy(false);
      };
      reader.onerror = () => {
        setLauncherBusy(false);
        setLauncherStatus(`Could not read ${file.name}.`, "error");
      };
      reader.readAsText(file);
    });

    // ── Input ──────────────────────────────────────────────────────────────

    canvas.addEventListener("click", e => {
      if (!initialized || sessionState !== "active" || document.body.classList.contains("menu-open")) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const playfield = getActiveSessionBounds();
      if (currentLevel && (mx < playfield.x || my < playfield.y || mx > playfield.x + playfield.width || my > playfield.y + playfield.height)) return;
      const worldBounds = currentLevel ? getLevelWorldBounds(currentLevel) : playfield;
      const scaleX = playfield.width / Math.max(1, worldBounds.width);
      const scaleY = playfield.height / Math.max(1, worldBounds.height);
      shootFromPlayer((mx - (playfield.x ?? 0)) / scaleX, (my - (playfield.y ?? 0)) / scaleY);
    });

    // ── Menu open/close ────────────────────────────────────────────────────

    const toggleButton = document.getElementById("menu-toggle");
    const backdrop     = document.getElementById("menu-backdrop");

    spriteThemeSelect.addEventListener("change", async () => {
      const theme = setActiveSpriteTheme(spriteThemeSelect.value);
      applySpriteThemeUI(theme);

      try {
        const preloadForActiveScene = () => {
          if (currentLevel) return preloadAssetsForLevel(currentLevel, theme.id);
          if (initialized) return preloadAssetsForRandomSession(theme.id);
          if (introLevel) return preloadAssetsForLevel(introLevel, theme.id);
          return preloadCoreSpriteAssets(theme.id);
        };

        const ready = await ensureSpriteAssetsLoaded(
          preloadForActiveScene,
          `Preloading ${theme.label} sprite theme...`,
          `Sprite theme switched to ${theme.label}.`
        );
        if (ready && sessionState !== "active") {
          await restoreLauncherPreview();
        }
      } catch (err) {
        setLauncherStatus(`Sprite theme preload failed: ${err.message}`, "error");
      }
    });

    subscribeSpriteThemeChange(theme => {
      applySpriteThemeUI(theme);
    });

    function setMenuOpen(open) {
      document.body.classList.toggle("menu-open", open);
      // Rebuild instance list every time menu opens so sliders reflect live state
      if (open) {
        buildInstanceList();
        applySpriteThemeUI();
      }
    }

    toggleButton.addEventListener("click", () => {
      setMenuOpen(!document.body.classList.contains("menu-open"));
    });
    backdrop.addEventListener("click", () => setMenuOpen(false));
    window.addEventListener("keydown", e => {
      if (e.key === "Escape") setMenuOpen(false);
      if (e.repeat) return;
      if (e.key === "d" || e.key === "D" || e.key === "F6") {
        e.preventDefault();
        const enabled = e.key === "F6"
          ? toggleLevelDebugOverlay()
          : toggleDebugMode();
        setLauncherStatus(
          enabled
            ? "Debug mode enabled. Background bounds and anchor markers are visible."
            : "Debug mode disabled.",
          "ready"
        );
      }
    });

    // ── Resize / animate ───────────────────────────────────────────────────

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      syncLauncherPreviewCanvasSize();

      if (sessionState !== "active" && !initialized) {
        restoreLauncherPreview();
      }

      if (!initialized) return;

      if (currentLevel) {
        if (levelResizeReflowHandle) clearTimeout(levelResizeReflowHandle);
        levelResizeReflowHandle = setTimeout(() => {
          initWorldFromLevel(currentLevel, getLevelWorldBounds(currentLevel));
          levelRuntimeDebugPending = true;
          buildInstanceList();
          levelResizeReflowHandle = null;
        }, 120);
        return;
      }

      resizeWorld(getBounds(), { rebuildField: true });
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      launcherPreviewCtx.clearRect(0, 0, launcherPreviewCanvas.width, launcherPreviewCanvas.height);

      if (!spriteAssetsReady) {
        requestAnimationFrame(animate);
        return;
      }

      if (sessionState === "active" && initialized) {
        const playfield = getActiveSessionBounds();
        const worldBounds = currentLevel ? getLevelWorldBounds(currentLevel) : playfield;
        if (currentLevel) {
          ctx.save();
          ctx.fillStyle = "rgba(8, 12, 14, 0.92)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        updateWorld(worldBounds);
        if (currentLevel && levelRuntimeDebugPending) {
          captureLevelRuntimeDebug(worldBounds, playfield);
          levelRuntimeDebugPending = false;
        }
        drawWorld(ctx, currentLevel ? { viewRect: playfield, worldBounds } : null);
      } else if (introPreviewReady) {
        updateWorld(getLauncherPreviewBounds());
        drawWorld(launcherPreviewCtx);
      }
      requestAnimationFrame(animate);
    }

    // ── Boot ───────────────────────────────────────────────────────────────

    window.addEventListener("resize", resize);
    resize();
    populateSpriteThemeOptions();
    syncLauncherSettingReadouts();
    buildWorldControls();
    updateLevelPanel();
    buildInstanceList();
    animate();
    loadIntroPreview();

    document.getElementById("launcher-new-game").addEventListener("click", () => {
      if (!launcherBusy) startRandomSession();
    });

    playNowButton.addEventListener("click", () => {
      if (!launcherBusy) loadBundledLevel();
    });

    document.getElementById("launcher-load-default").addEventListener("click", () => {
      if (!launcherBusy) loadBundledLevel();
    });

    document.getElementById("launcher-import-json").addEventListener("click", () => {
      if (launcherBusy) return;
      setLauncherStatus("Select a JSON level file to import.", "ready");
      document.getElementById("file-input").click();
    });

    document.getElementById("launcher-level-design").addEventListener("click", () => {
      if (launcherBusy) return;
      const editorWindow = window.open("./LEVEL_DESIGN/final_editor/index.html", "_blank", "noopener");
      if (editorWindow) {
        setLauncherStatus("Level editor opened in a new window.", "ready");
      } else {
        setLauncherStatus("Level editor could not be opened. Please allow pop-ups for this page.", "error");
      }
    });

    resumeButton.addEventListener("click", () => {
      if (!initialized || launcherBusy) return;
      setSessionActive(true);
      setLauncherStatus("Returning to active session.", "ready");
    });

    launcherSettingRadius.addEventListener("input", () => {
      syncLauncherSettingReadouts();
      if (sessionState !== "active") restoreLauncherPreview();
    });
    launcherSettingSpeed.addEventListener("input", () => {
      syncLauncherSettingReadouts();
      if (sessionState !== "active") restoreLauncherPreview();
    });
    launcherSettingFertility.addEventListener("input", () => {
      syncLauncherSettingReadouts();
      if (sessionState !== "active") restoreLauncherPreview();
    });

    setSessionActive(false);
  