const spriteImageCache = new Map();
const spriteImageLoadCache = new Map();
const DEFAULT_THEME_ID = "microscopic";
const SPRITE_THEME_STORAGE_KEY = "microscopic.game.spriteTheme";

export const SPRITE_THEMES = {
  microscopic: {
    id: "microscopic",
    label: "Microscopic",
    description: "Zakladni biologicky vzhled. Pouziva aktualni produkcni spritesheety.",
    assetRoots: ["./src"]
  },
  dark: {
    id: "dark",
    label: "Dark Mode",
    description: "Tlumeny kontrastni styl pro tmavsi, laboratorni atmosferu.",
    assetRoots: ["./src"]
  },
  neon: {
    id: "neon",
    label: "Neon",
    description: "Sytne kontury a zarive akcenty pri zachovani stejne geometrie spriteu.",
    assetRoots: ["./src"]
  },
  osmo: {
    id: "osmo",
    label: "Osmo",
    description: "Mekci organicky styl s pripravenou cestou pro osmo-like sadu.",
    assetRoots: ["./src"]
  }
};

const NAMED_SPRITE_ASSETS = {
  playerOuter: { relativePath: "Player/Player_outer_01.png" },
  playerInner: { relativePath: "Player/Player_inner_01.png" },
  oldbodyBase: { relativePath: "Player/Player_outer_01.png" },
  oldbodyOverlay: { relativePath: "Player/old_body01.png" }
};

let activeSpriteThemeId = loadInitialSpriteThemeId();
const spriteThemeListeners = new Set();

function loadInitialSpriteThemeId() {
  try {
    const stored = localStorage.getItem(SPRITE_THEME_STORAGE_KEY);
    if (stored && SPRITE_THEMES[stored]) return stored;
  } catch {}

  return DEFAULT_THEME_ID;
}

function joinAssetPath(root, relativePath) {
  const cleanRoot = String(root ?? "").replace(/\/+$/, "");
  const cleanRelative = String(relativePath ?? "").replace(/^\/+/, "");
  return `${cleanRoot}/${cleanRelative}`;
}

function isRenderableImage(img) {
  return !!(img && img.complete && img.naturalWidth);
}

function getThemeAssetRoots(themeId = activeSpriteThemeId) {
  return SPRITE_THEMES[themeId]?.assetRoots ?? SPRITE_THEMES[DEFAULT_THEME_ID].assetRoots;
}

function buildThemeCandidatePaths(relativePath, themeId = activeSpriteThemeId) {
  return getThemeAssetRoots(themeId).map(root => joinAssetPath(root, relativePath));
}

function getFirstRenderableImage(candidatePaths) {
  const images = candidatePaths.map(getCachedImage);
  return images.find(isRenderableImage) ?? images[0] ?? null;
}

function createImageLoadPromise(img, path) {
  if (spriteImageLoadCache.has(path)) {
    return spriteImageLoadCache.get(path);
  }

  const loadPromise = new Promise(resolve => {
    const finish = () => resolve(img);

    if (isRenderableImage(img)) {
      finish();
      return;
    }

    const handleLoad = () => {
      if (typeof img.decode === "function") {
        img.decode().catch(() => {}).finally(finish);
        return;
      }
      finish();
    };

    const handleError = () => finish();

    img.addEventListener("load", handleLoad, { once: true });
    img.addEventListener("error", handleError, { once: true });
  });

  spriteImageLoadCache.set(path, loadPromise);
  return loadPromise;
}

export function getCachedImage(path) {
  if (!spriteImageCache.has(path)) {
    const img = new Image();
    img.decoding = "async";
    img.src = path;
    spriteImageCache.set(path, img);
    createImageLoadPromise(img, path);
  }

  return spriteImageCache.get(path);
}

export function preloadImage(path) {
  const img = getCachedImage(path);
  return createImageLoadPromise(img, path);
}

export function getSpriteThemes() {
  return Object.values(SPRITE_THEMES);
}

export function getSpriteTheme(themeId) {
  return SPRITE_THEMES[themeId] ?? SPRITE_THEMES[DEFAULT_THEME_ID];
}

export function getActiveSpriteTheme() {
  return getSpriteTheme(activeSpriteThemeId);
}

export function getActiveSpriteThemeId() {
  return activeSpriteThemeId;
}

export function setActiveSpriteTheme(themeId) {
  const nextTheme = getSpriteTheme(themeId);
  if (nextTheme.id === activeSpriteThemeId) return nextTheme;

  activeSpriteThemeId = nextTheme.id;

  try {
    localStorage.setItem(SPRITE_THEME_STORAGE_KEY, nextTheme.id);
  } catch {}

  for (const listener of spriteThemeListeners) {
    listener(nextTheme);
  }

  return nextTheme;
}

export function subscribeSpriteThemeChange(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  spriteThemeListeners.add(listener);
  return () => spriteThemeListeners.delete(listener);
}

export function normalizeSpriteIndex(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(n));
}

export function formatSpriteIndex(value, fallback = 1) {
  return String(normalizeSpriteIndex(value, fallback)).padStart(2, "0");
}

export function formatSequenceFrame(value, padding = 5, fallback = 1) {
  return String(normalizeSpriteIndex(value, fallback)).padStart(padding, "0");
}

export function buildSpriteFileName({ family, variant = null, index = 1, ext = "png" }) {
  if (family === "particle" && variant === "red") {
    return `particle_orange_01.${ext}`;
  }

  const parts = [family];
  if (variant) parts.push(variant);
  parts.push(formatSpriteIndex(index));
  return `${parts.join("_")}.${ext}`;
}

export function buildSpriteAssetPath({
  folder,
  subfolder = null,
  family,
  variant = null,
  index = 1,
  ext = "png",
  basePath = "./src"
}) {
  const pathParts = [basePath, folder];
  if (subfolder) pathParts.push(subfolder);
  pathParts.push(buildSpriteFileName({ family, variant, index, ext }));
  return pathParts.join("/");
}

export function buildSpriteAssetCandidatePaths(spec, themeId = activeSpriteThemeId) {
  const relativePaths = [];
  const pushRelativePath = path => {
    if (!path || relativePaths.includes(path)) return;
    relativePaths.push(path);
  };

  pushRelativePath(
    buildSpriteAssetPath({ ...spec, basePath: "" }).replace(/^\/+/, "")
  );

  if (spec?.family === "particle" && normalizeSpriteIndex(spec?.index, 1) !== 1) {
    pushRelativePath(
      buildSpriteAssetPath({ ...spec, index: 1, basePath: "" }).replace(/^\/+/, "")
    );
  }

  return relativePaths.flatMap(relativePath => buildThemeCandidatePaths(relativePath, themeId));
}

export function getSpriteImage(spec) {
  return getFirstRenderableImage(buildSpriteAssetCandidatePaths(spec));
}

export function buildSequenceAssetPath({
  folder,
  subfolder = null,
  index = 1,
  padding = 5,
  ext = "png",
  basePath = "./src"
}) {
  const pathParts = [basePath, folder];
  if (subfolder) pathParts.push(subfolder);
  pathParts.push(`${formatSequenceFrame(index, padding)}.${ext}`);
  return pathParts.join("/");
}

export function buildSequenceAssetCandidatePaths(spec, themeId = activeSpriteThemeId) {
  const relativePath = buildSequenceAssetPath({ ...spec, basePath: "" }).replace(/^\/+/, "");
  return buildThemeCandidatePaths(relativePath, themeId);
}

export function getSequenceImage(spec) {
  return getFirstRenderableImage(buildSequenceAssetCandidatePaths(spec));
}

export function getNamedSpriteAssetPaths(name, themeId = activeSpriteThemeId) {
  const asset = NAMED_SPRITE_ASSETS[name];
  if (!asset) return [];
  return buildThemeCandidatePaths(asset.relativePath, themeId);
}

export function getNamedSpriteImage(name) {
  return getFirstRenderableImage(getNamedSpriteAssetPaths(name));
}

const CORE_SPRITE_ASSET_SPECS = [
  { folder: "Particle", family: "particle", variant: "green", index: 1 },
  { folder: "Particle", family: "particle", variant: "red", index: 1 },
  { folder: "Egg", family: "egg", index: 1 }
];

const CORE_SEQUENCE_ASSET_SPECS = [
  { folder: "Enemy", index: 1, padding: 5, ext: "png" },
  { folder: "Enemy", index: 2, padding: 5, ext: "png" },
  { folder: "Enemy", index: 3, padding: 5, ext: "png" },
  { folder: "Enemy", index: 4, padding: 5, ext: "png" },
  { folder: "Enemy", index: 5, padding: 5, ext: "png" },
  { folder: "Macrophage", subfolder: "Macrophage_01", index: 1, padding: 5, ext: "png" },
  { folder: "Macrophage", subfolder: "Macrophage_01", index: 2, padding: 5, ext: "png" },
  { folder: "Macrophage", subfolder: "Macrophage_01", index: 3, padding: 5, ext: "png" },
  { folder: "Macrophage", subfolder: "Macrophage_01", index: 4, padding: 5, ext: "png" },
  { folder: "Macrophage", subfolder: "Macrophage_01", index: 5, padding: 5, ext: "png" }
];

const CORE_NAMED_SPRITES = ["playerOuter", "playerInner", "oldbodyBase", "oldbodyOverlay"];

function pushUniquePath(target, seen, path) {
  if (!path || seen.has(path)) return;
  seen.add(path);
  target.push(path);
}

function collectCoreSpriteAssetPaths(themeId = activeSpriteThemeId) {
  const paths = [];
  const seen = new Set();

  for (const spec of CORE_SPRITE_ASSET_SPECS) {
    for (const path of buildSpriteAssetCandidatePaths(spec, themeId)) {
      pushUniquePath(paths, seen, path);
    }
  }

  for (const spec of CORE_SEQUENCE_ASSET_SPECS) {
    for (const path of buildSequenceAssetCandidatePaths(spec, themeId)) {
      pushUniquePath(paths, seen, path);
    }
  }

  for (const name of CORE_NAMED_SPRITES) {
    for (const path of getNamedSpriteAssetPaths(name, themeId)) {
      pushUniquePath(paths, seen, path);
    }
  }

  return paths;
}

function collectLevelAssetPaths(levelJson, themeId = activeSpriteThemeId) {
  const paths = [];
  const seen = new Set();

  for (const path of collectCoreSpriteAssetPaths(themeId)) {
    pushUniquePath(paths, seen, path);
  }

  const backgroundSrc = levelJson?.background?.src;
  if (backgroundSrc) {
    pushUniquePath(paths, seen, backgroundSrc);
  }

  for (const entity of levelJson?.entities ?? []) {
    switch (entity?.type) {
      case "Enemy": {
        const spriteIndex = normalizeSpriteIndex(entity.spriteIndex, 1);
        const spriteSubfolder = typeof entity.spriteSubfolder === "string" ? entity.spriteSubfolder : "";
        const animationSubfolder = typeof entity.spriteAnimationSubfolder === "string"
          ? entity.spriteAnimationSubfolder
          : spriteSubfolder;
        const frames = Math.max(1, Math.round(Number(entity.spriteAnimationFrames ?? 5)));
        const start = normalizeSpriteIndex(entity.spriteAnimationStart ?? 1, 1);
        const padding = Math.max(1, Math.round(Number(entity.spriteAnimationPadding ?? 5)));
        const ext = entity.spriteAnimationExt ?? "png";

        if (entity.spriteAnimationEnabled === false) {
          for (const path of buildSpriteAssetCandidatePaths({
            folder: entity.spriteFolder ?? "Enemy",
            subfolder: spriteSubfolder || null,
            family: entity.spriteFamily ?? "enemy",
            variant: entity.spriteVariant ?? null,
            index: spriteIndex
          }, themeId)) {
            pushUniquePath(paths, seen, path);
          }
        }

        for (let frame = 0; frame < frames; frame++) {
          for (const path of buildSequenceAssetCandidatePaths({
            folder: entity.spriteAnimationFolder ?? entity.spriteFolder ?? "Enemy",
            subfolder: animationSubfolder || null,
            index: start + frame,
            padding,
            ext
          }, themeId)) {
            pushUniquePath(paths, seen, path);
          }
        }
        break;
      }

      case "Egg": {
        for (const path of buildSpriteAssetCandidatePaths({
          folder: "Egg",
          family: "egg",
          variant: null,
          index: normalizeSpriteIndex(entity.spriteIndex, 1)
        }, themeId)) {
          pushUniquePath(paths, seen, path);
        }
        break;
      }

      case "Particle":
      case "ParticleZone":
      case "Stone": {
        for (const path of buildSpriteAssetCandidatePaths({
          folder: "Particle",
          family: "particle",
          variant: "green",
          index: 1
        }, themeId)) {
          pushUniquePath(paths, seen, path);
        }
        break;
      }

      case "ComposedStone": {
        for (const path of buildSpriteAssetCandidatePaths({
          folder: "CompoundStone",
          subfolder: entity.spriteSubfolder || null,
          family: "compoundstone",
          variant: null,
          index: normalizeSpriteIndex(entity.spriteIndex, 1)
        }, themeId)) {
          pushUniquePath(paths, seen, path);
        }
        break;
      }

      case "Algae": {
        for (const path of buildSpriteAssetCandidatePaths({
          folder: "Algae",
          subfolder: entity.spriteSubfolder || null,
          family: "algae",
          variant: null,
          index: normalizeSpriteIndex(entity.spriteIndex, 1)
        }, themeId)) {
          pushUniquePath(paths, seen, path);
        }
        break;
      }

      case "Macrophage": {
        const spriteIndex = normalizeSpriteIndex(entity.spriteIndex, entity.instanceIndex ?? 1);
        const spriteSubfolder = typeof entity.spriteSubfolder === "string" ? entity.spriteSubfolder : "";
        const animationSubfolder = typeof entity.spriteAnimationSubfolder === "string"
          ? entity.spriteAnimationSubfolder
          : spriteSubfolder || `Macrophage_${String(spriteIndex).padStart(2, "0")}`;
        const frames = Math.max(1, Math.round(Number(entity.spriteAnimationFrames ?? 5)));
        const start = normalizeSpriteIndex(entity.spriteAnimationStart ?? 1, 1);
        const padding = Math.max(1, Math.round(Number(entity.spriteAnimationPadding ?? 5)));
        const ext = entity.spriteAnimationExt ?? "png";

        for (let frame = 0; frame < frames; frame++) {
          for (const path of buildSequenceAssetCandidatePaths({
            folder: entity.spriteAnimationFolder ?? "Macrophage",
            subfolder: animationSubfolder || null,
            index: start + frame,
            padding,
            ext
          }, themeId)) {
            pushUniquePath(paths, seen, path);
          }
        }
        break;
      }

      default:
        break;
    }
  }

  return paths;
}

export function preloadSpritePaths(paths) {
  return Promise.all((paths ?? []).map(preloadImage));
}

export function preloadCoreSpriteAssets(themeId = activeSpriteThemeId) {
  return preloadSpritePaths(collectCoreSpriteAssetPaths(themeId));
}

export function preloadAssetsForLevel(levelJson, themeId = activeSpriteThemeId) {
  return preloadSpritePaths(collectLevelAssetPaths(levelJson, themeId));
}

export function preloadAssetsForRandomSession(themeId = activeSpriteThemeId) {
  return preloadCoreSpriteAssets(themeId);
}
