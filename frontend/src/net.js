import { Math as PhaserMath } from "phaser";
import socket from "./socket.js";
import { playerConfig } from "./config.js";

/* Shared multiplayer layer used by every scene.
 *
 * Each scene calls setupMultiplayer(this, "<SceneName>") at the end of its
 * create(). That tells the server which room we're in (and which character
 * we picked), renders the other players already there, and keeps everyone in
 * sync as they move, attack, and get defeated. Combat is server-authoritative:
 * a client only ever asks "I attacked", and the server decides the damage.
 *
 * Animation keys are prefixed by the character sheet, e.g. "Spearman_walkDown"
 * or "orc_attackRight", so the two characters can coexist and each opponent
 * renders as the character they actually chose. */

export { socket };

// The most recent room-join payload, and whether we've bound the one-time
// reconnect handler. Used so a dropped socket re-enters its room on reconnect.
let lastJoin = null;
let reconnectBound = false;

const SERVER_EVENTS = [
  "currentPlayers",
  "newPlayer",
  "playerMoved",
  "playerAttacked",
  "playerDefeated",
  "playerDisconnected",
  "chatMessage",
];

// Frame layout, identical for Spearman.png and orc.png (both 6x13).
const FRAMES = {
  idleDown: [0, 5],
  idleRight: [6, 11],
  idleUp: [12, 17],
  walkDown: [18, 23],
  walkRight: [24, 29],
  walkUp: [30, 35],
  attackDown: [36, 39],
  attackRight: [42, 46],
  attackUp: [48, 52],
  die: [54, 56],
};

// Create the full set of animations for one character sheet, prefixed by its
// texture key. Idempotent — safe to call from every scene's create().
export function ensureAnims(scene, key) {
  for (const [name, [start, end]] of Object.entries(FRAMES)) {
    const animKey = key + "_" + name;
    if (scene.anims.exists(animKey)) continue;
    const oneShot = name.indexOf("attack") === 0 || name === "die";
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(key, { start, end }),
      frameRate: name.indexOf("attack") === 0 ? 12 : 10,
      repeat: oneShot ? 0 : -1,
    });
  }
}

// ---- health bars ----------------------------------------------------------

const BAR_W = 40;
const BAR_H = 5;
const BAR_YOFF = -22;

function makeBar(scene, x, y, life) {
  const outline = scene.add.rectangle(x, y + BAR_YOFF, BAR_W + 2, BAR_H + 2, 0xffffff).setDepth(50);
  const bg = scene.add.rectangle(x, y + BAR_YOFF, BAR_W, BAR_H, 0x000000).setDepth(50);
  const bar = scene.add
    .rectangle(x - BAR_W / 2, y + BAR_YOFF, BAR_W, BAR_H, 0xff0000)
    .setOrigin(0, 0.5)
    .setDepth(51);
  const obj = { outline, bg, bar };
  positionBar(obj, x, y, life);
  return obj;
}

function positionBar(b, x, y, life) {
  b.outline.x = x;
  b.outline.y = y + BAR_YOFF;
  b.bg.x = x;
  b.bg.y = y + BAR_YOFF;
  b.bar.x = x - BAR_W / 2;
  b.bar.y = y + BAR_YOFF;
  b.bar.width = (Math.max(0, life) / 100) * BAR_W;
}

function destroyBar(b) {
  if (!b) return;
  b.outline.destroy();
  b.bg.destroy();
  b.bar.destroy();
}

// ---- name tags -------------------------------------------------------------

const TAG_YOFF = -34; // pixels above sprite centre

function makeNameTag(scene, x, y, username) {
  if (!username) return null;
  return scene.add
    .text(x, y + TAG_YOFF, username, {
      fontSize: "7px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
      resolution: 2,
    })
    .setOrigin(0.5, 1)
    .setDepth(55);
}

// ---- game feel (hit / death feedback) --------------------------------------

// Lazily create a tiny white dot texture used for impact particles.
function ensureSpark(scene) {
  if (scene.textures.exists("spark")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture("spark", 8, 8);
  g.destroy();
}

// Brief red flash + squash-and-stretch punch on a sprite that took a hit.
// Squash-and-stretch (wide X, short Y) reads as "compressed by impact"; the
// onComplete reset guarantees the scale returns to 1 even if interrupted.
function flashAndPunch(scene, sprite) {
  if (!sprite || !sprite.active) return;
  sprite.setTint(0xff5a5a);
  scene.time.delayedCall(110, () => sprite.active && sprite.clearTint());
  scene.tweens.add({
    targets: sprite,
    scaleX: 1.3,
    scaleY: 0.75,
    duration: 60,
    ease: "Back.easeOut",
    yoyo: true,
    onComplete: () => sprite.active && sprite.setScale(1),
  });
}

// One-shot particle burst at a point (Phaser 3.60+ particle API).
function burst(scene, x, y, tint, count) {
  ensureSpark(scene);
  const emitter = scene.add.particles(x, y, "spark", {
    speed: { min: 40, max: 140 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.7, end: 0 },
    lifespan: 320,
    quantity: count,
    tint,
    emitting: false,
  });
  emitter.setDepth(60);
  emitter.explode(count, x, y);
  scene.time.delayedCall(420, () => emitter.destroy());
}

// ---- other players ---------------------------------------------------------

function addOtherPlayer(scene, info) {
  if (!info || info.playerId === socket.id) return;
  if (scene.otherPlayers[info.playerId]) return;

  const spriteKey = info.sprite || "Spearman";
  const sprite = scene.physics.add.sprite(info.x, info.y, spriteKey);
  sprite.playerId = info.playerId;
  sprite.spriteKey = spriteKey;
  sprite.life = typeof info.life === "number" ? info.life : 100;
  sprite.setBodySize(24, 28);
  sprite.setOffset(10, 13);
  sprite.flipX = !!info.flipX;

  if (info.animation && scene.anims.exists(info.animation)) {
    sprite.anims.play(info.animation, true);
  } else if (scene.anims.exists(spriteKey + "_idleDown")) {
    sprite.anims.play(spriteKey + "_idleDown", true);
  }

  if (scene._showBars) {
    sprite.healthBar = makeBar(scene, info.x, info.y, sprite.life);
  }
  sprite.nameTag = makeNameTag(scene, info.x, info.y, info.username);
  scene.otherPlayers[info.playerId] = sprite;
}

function removeOtherPlayer(scene, id) {
  const sprite = scene.otherPlayers[id];
  if (!sprite) return;
  destroyBar(sprite.healthBar);
  sprite.nameTag?.destroy();
  sprite.destroy();
  delete scene.otherPlayers[id];
}

function defaultLocalDefeat(scene) {
  scene.isDead = true;
  scene.input.keyboard.enabled = false;
  scene.player.body && scene.player.body.setVelocity(0);
  const dieKey = (scene.spriteKey || "Spearman") + "_die";
  if (scene.anims.exists(dieKey)) scene.player.play(dieKey);
  scene.time.delayedCall(1800, () => {
    scene.input.keyboard.enabled = true;
    scene.scene.start("CommonScene");
  });
}

// ---- setup -----------------------------------------------------------------

/**
 * Wire a scene into the multiplayer layer.
 * @param {Phaser.Scene} scene  the scene (must already have scene.player)
 * @param {string} sceneName    "CommonScene" | "BridgeScene" | "DungeonScene"
 * @param {object} opts         { showBars?, onLocalDefeat?, onLocalHit? }
 */
export function setupMultiplayer(scene, sceneName, opts = {}) {
  scene.socket = socket;
  scene.otherPlayers = {};
  scene._lastEmit = 0;
  scene._showBars = opts.showBars !== false;
  // Reset combat/death state — scene instances are reused across entries.
  scene.isAttacking = false;
  scene.attackAnimKey = null;
  scene.isDead = false;

  SERVER_EVENTS.forEach((evt) => socket.off(evt));

  // Register the game listeners BEFORE announcing, so the server's
  // currentPlayers reply can never arrive before we're listening for it.
  socket.on("currentPlayers", (list) => {
    Object.values(list || {}).forEach((info) => addOtherPlayer(scene, info));
  });

  socket.on("newPlayer", (info) => addOtherPlayer(scene, info));

  socket.on("playerMoved", (info) => {
    const sprite = scene.otherPlayers[info.playerId];
    if (!sprite) return;
    sprite.setPosition(info.x, info.y);
    sprite.flipX = info.flipX;
    if (sprite.healthBar) positionBar(sprite.healthBar, info.x, info.y, sprite.life);
    if (sprite.nameTag) sprite.nameTag.setPosition(info.x, info.y + TAG_YOFF);
    if (sprite._dying) return;

    if (info.animation && scene.anims.exists(info.animation)) {
      const isAttack = info.animation.indexOf("attack") !== -1;
      if (isAttack) {
        // Play an opponent's swing exactly ONCE even though the attacker keeps
        // broadcasting the attack frame for the whole swing.
        if (!sprite._attacking) {
          sprite._attacking = true;
          sprite.anims.play(info.animation, true);
          scene.time.delayedCall(450, () => (sprite._attacking = false));
        }
      } else if (!sprite._attacking) {
        sprite.anims.play(info.animation, true);
      }
    }
  });

  socket.on("playerAttacked", (data) => {
    if (data.target === socket.id) {
      // I took a hit: flash, punch, sparks, and a solid screen shake.
      scene.player.life = data.life;
      flashAndPunch(scene, scene.player);
      burst(scene, scene.player.x, scene.player.y, 0xff5a5a, 10);
      scene.cameras.main.shake(120, 0.006); // skill guide: player takes damage
      if (opts.onLocalHit) opts.onLocalHit(data.life);
    } else {
      const sprite = scene.otherPlayers[data.target];
      if (sprite) {
        // I landed a hit on someone: flash them, sparks, light shake.
        sprite.life = data.life;
        if (sprite.healthBar) positionBar(sprite.healthBar, sprite.x, sprite.y, sprite.life);
        flashAndPunch(scene, sprite);
        burst(scene, sprite.x, sprite.y, 0xffd24a, 9);
        scene.cameras.main.shake(60, 0.004); // light shake for landing a hit
      }
    }
  });

  socket.on("playerDefeated", (id) => {
    if (id === socket.id) {
      // I died: big burst + heavy shake, then the death anim / return home.
      scene.player.life = 0;
      burst(scene, scene.player.x, scene.player.y, 0xffaa33, 18);
      scene.cameras.main.shake(200, 0.012); // skill guide: death
      if (opts.onLocalDefeat) opts.onLocalDefeat();
      else defaultLocalDefeat(scene);
    } else {
      const sprite = scene.otherPlayers[id];
      if (!sprite) return;
      // Opponent died: burst at them, play their death anim, then remove.
      sprite._dying = true;
      sprite.life = 0;
      if (sprite.healthBar) positionBar(sprite.healthBar, sprite.x, sprite.y, 0);
      burst(scene, sprite.x, sprite.y, 0xffaa33, 18);
      scene.cameras.main.shake(160, 0.01); // winner feels the finishing blow
      const dieKey = (sprite.spriteKey || "Spearman") + "_die";
      if (scene.anims.exists(dieKey)) sprite.play(dieKey);
      scene.time.delayedCall(1000, () => removeOtherPlayer(scene, id));
    }
  });

  socket.on("playerDisconnected", (id) => removeOtherPlayer(scene, id));

  // Local player name tag — created once, updated every frame inside emitMove.
  scene.playerNameTag = makeNameTag(
    scene,
    scene.player.x,
    scene.player.y,
    playerConfig.username
  );

  socket.on("chatMessage", (data) => {
    if (typeof scene.showChatBubble !== "function") return;
    if (data.playerId === socket.id) {
      scene.showChatBubble(scene.player, data.message);
    } else {
      const sprite = scene.otherPlayers[data.playerId];
      if (sprite) scene.showChatBubble(sprite, data.message);
    }
  });

  // Remember which room we're in, and (re)join it on EVERY connect — including
  // reconnects after a network blip or a Render free-tier spin-down. Without
  // this, a reconnected socket sits in no room and is invisible to everyone.
  lastJoin = {
    scene:    sceneName,
    sprite:   playerConfig.sprite,
    username: playerConfig.username,
    x:        scene.player.x,
    y:        scene.player.y,
    animation: (scene.spriteKey || "Spearman") + "_idleDown",
    flipX:    scene.player.flipX || false,
  };
  if (!reconnectBound) {
    reconnectBound = true;
    socket.on("connect", () => {
      if (lastJoin) socket.emit("joinScene", lastJoin);
    });
  }
  if (socket.connected) socket.emit("joinScene", lastJoin);
}

// ---- per-frame helpers -----------------------------------------------------

/** Throttled position broadcast. Pass the FULL (prefixed) animation key. */
export function emitMove(scene, animation) {
  // Keep local name tag glued to player every frame (cheap — just sets x/y).
  if (scene.playerNameTag) {
    scene.playerNameTag.setPosition(scene.player.x, scene.player.y + TAG_YOFF);
  }

  const now = scene.time.now;
  if (now - scene._lastEmit < 30) return;
  scene._lastEmit = now;
  socket.emit("movePlayer", {
    x: scene.player.x,
    y: scene.player.y,
    animation,
    flipX: scene.player.flipX,
  });
}

// Facing direction -> base attack animation name ("Left" reuses right + flip).
const ATTACK_ANIM = {
  Down: "attackDown",
  Up: "attackUp",
  Right: "attackRight",
  Left: "attackRight",
};

/**
 * Swing: turn to face the nearest opponent so the thrust points at them, play
 * the directional attack clip once, broadcast it, and ask the server to apply
 * damage ONLY if that opponent is within spear reach. `scene.isAttacking`
 * blocks re-triggering until the clip finishes (natural cooldown).
 */
export function performAttack(scene, range = 45) {
  if (scene.isAttacking || scene.isDead) return;

  // Nearest opponent.
  let target = null;
  let best = Infinity;
  Object.values(scene.otherPlayers).forEach((o) => {
    if (o._dying) return;
    const d = PhaserMath.Distance.Between(scene.player.x, scene.player.y, o.x, o.y);
    if (d < best) {
      best = d;
      target = o;
    }
  });

  // Auto-face the target so the spear thrust visually points at them.
  if (target) {
    const dx = target.x - scene.player.x;
    const dy = target.y - scene.player.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      scene.lastDirection = "Right";
      scene.player.flipX = dx < 0;
    } else {
      scene.lastDirection = dy < 0 ? "Up" : "Down";
    }
  }

  const dir = scene.lastDirection || "Down";
  const base = ATTACK_ANIM[dir] || "attackDown";
  const key = (scene.spriteKey || "Spearman") + "_" + base;

  scene.isAttacking = true;
  scene.attackAnimKey = key;
  scene.player.play(key, true);
  scene.time.delayedCall(450, () => {
    scene.isAttacking = false;
    scene.attackAnimKey = null;
  });

  // Damage only when the target is actually within reach — no hitting across
  // a gap.
  if (target && best <= range) {
    socket.emit("attackPlayer", target.playerId);
  }
}
