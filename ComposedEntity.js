import { getCachedImage, normalizeSpriteIndex } from "./spriteAssets.js";

export const DEFAULTS = {
  name: "ComposedEntity",
  spriteIndex: 1,
  spriteScale: 1,
  spriteReferenceRadius: 64,
  spriteRotationOffset: 0,
  spriteBodyU: 0.5,
  spriteBodyV: 0.5,
  spriteFlipX: false,
  spriteDebug: false,
  spriteSubfolder: "",
  width: 0,
  height: 0,
  radius: 64
};

function formatSpriteIndex(value, fallback = 1) {
  return String(normalizeSpriteIndex(value, fallback)).padStart(2, "0");
}

function makeSafeFilename(value, fallback = "composedentity") {
  const safe = String(value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || fallback;
}

function isRenderableImage(img) {
  return !!(img && img.complete && img.naturalWidth);
}

export class ComposedEntity {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.name = typeof opts.name === "string" && opts.name.trim() ? opts.name.trim() : DEFAULTS.name;
    this.sourcePath = typeof opts.sourcePath === "string" ? opts.sourcePath : null;
    this.spriteIndex = normalizeSpriteIndex(opts.spriteIndex, DEFAULTS.spriteIndex);
    this.spriteScale = Number.isFinite(Number(opts.spriteScale)) ? Number(opts.spriteScale) : DEFAULTS.spriteScale;
    this.spriteReferenceRadius = Number.isFinite(Number(opts.spriteReferenceRadius))
      ? Number(opts.spriteReferenceRadius)
      : DEFAULTS.spriteReferenceRadius;
    this.spriteRotationOffset = Number.isFinite(Number(opts.spriteRotationOffset))
      ? Number(opts.spriteRotationOffset)
      : DEFAULTS.spriteRotationOffset;
    this.spriteBodyU = Number.isFinite(Number(opts.spriteBodyU)) ? Number(opts.spriteBodyU) : DEFAULTS.spriteBodyU;
    this.spriteBodyV = Number.isFinite(Number(opts.spriteBodyV)) ? Number(opts.spriteBodyV) : DEFAULTS.spriteBodyV;
    this.spriteFlipX = !!opts.spriteFlipX;
    this.spriteDebug = opts.spriteDebug == null ? DEFAULTS.spriteDebug : !!opts.spriteDebug;
    this.spriteSubfolder = typeof opts.spriteSubfolder === "string" ? opts.spriteSubfolder : DEFAULTS.spriteSubfolder;
    this.width = Math.max(0, Number(opts.width ?? DEFAULTS.width) || 0);
    this.height = Math.max(0, Number(opts.height ?? DEFAULTS.height) || 0);
    this.radius = Math.max(
      1,
      Number.isFinite(Number(opts.radius))
        ? Number(opts.radius)
        : Math.max(this.spriteReferenceRadius, DEFAULTS.radius)
    );
  }

  _getSpriteSubfolder() {
    if (this.spriteSubfolder?.trim()) return this.spriteSubfolder.trim();
    return `ComposedEntity_${formatSpriteIndex(this.spriteIndex, 1)}`;
  }

  _getSpriteCandidates() {
    const candidates = [];
    const push = path => {
      if (!path || candidates.includes(path)) return;
      candidates.push(path);
    };
    const folder = this._getSpriteSubfolder();
    const slot = formatSpriteIndex(this.spriteIndex, 1);
    const safeName = makeSafeFilename(this.name, "composedentity");

    if (this.sourcePath?.startsWith("src/")) {
      push(`./${this.sourcePath.replace(/\.json$/i, ".png")}`);
    }

    push(`./src/ComposedEntity/${folder}/composedentity_${slot}.png`);
    push(`./src/ComposedEntity/${folder}/ComposedEntity_${slot}.png`);
    push(`./src/ComposedEntity/${folder}/composedentity.png`);
    push(`./src/ComposedEntity/${folder}/${safeName}.png`);
    return candidates;
  }

  _getSpriteImage() {
    const images = this._getSpriteCandidates().map(getCachedImage);
    return images.find(isRenderableImage) ?? images[0] ?? null;
  }

  update() {}

  draw(ctx) {
    const sprite = this._getSpriteImage();
    if (sprite && sprite.complete && sprite.naturalWidth) {
      const drawW = Math.max(2, this.spriteReferenceRadius) * this.spriteScale * 2;
      const drawH = drawW * (sprite.naturalHeight / Math.max(sprite.naturalWidth, 1));
      const anchorX = drawW * this.spriteBodyU;
      const anchorY = drawH * this.spriteBodyV;

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle + this.spriteRotationOffset);
      if (this.spriteFlipX) ctx.scale(-1, 1);
      ctx.drawImage(sprite, -anchorX, -anchorY, drawW, drawH);

      ctx.restore();
      return;
    }
  }
}
