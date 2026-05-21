import { Scene, Input } from "phaser";
import Level from "./Level.js";
import { setupMultiplayer, emitMove, performAttack, ensureAnims } from "./net.js";
import { playerConfig } from "./config.js";

export default class BridgeScene extends Scene {
  constructor() {
    super("BridgeScene");
    this.player = null;
    this.level = new Level();
    this.spike = null;
    this.healthBar = null;
  }

  preload() {
    this.load.image(
      "Bridge_Stone_Horizontal",
      "/assets/Bridge_Stone_Horizontal.png"
    );
    this.load.image("Water_Tile", "/assets/Water_Tile.png");
    this.load.tilemapTiledJSON("bridge", "/assets/bridge.json");
    this.load.spritesheet("Spearman", "/assets/Spearman.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.spritesheet("orc", "/assets/orc.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
  }

  create() {
    this.game.scale.resize(256, 256);
    const map = this.make.tilemap({ key: "bridge" });
    const floor = map.addTilesetImage("Water_Tile", "Water_Tile");

    const floorLayer = map.createLayer("floor", [floor], 0, 0);
    console.log(floorLayer);
    floorLayer
      .setScale(1, 1)
      .setOrigin(0, 0)
      .setCollisionByProperty({ collider: true });

    const Bridge_Stone_Horizontal = map.addTilesetImage(
      "Bridge_Stone_Horizontal",
      "Bridge_Stone_Horizontal"
    );
    const objectLayer = map.createLayer(
      "object",
      [Bridge_Stone_Horizontal],
      0,
      0
    );
    objectLayer
      .setScale(1, 1)
      .setOrigin(0, 0)
      .setCollisionByProperty({ collider: true });

    this.spriteKey = playerConfig.sprite;
    this.player = this.physics.add
      .sprite(256 / 2 - 50, 256 / 2 - 35, this.spriteKey)
      .setScale(1);

    this.player.life = 100;

    this.player.setScale(1);
    this.player.setBodySize(24, 28);
    this.player.setOffset(10, 13);
    this.cursors = this.input.keyboard.createCursorKeys();

    this.physics.add.collider(this.player, objectLayer);

    // Build animations for both characters (prefixed by sheet key).
    ensureAnims(this, "Spearman");
    ensureAnims(this, "orc");

    this.player.play(this.spriteKey + "_idleDown");

    this.healthBar = this.createHealthBar(
      this.player.x,
      this.player.y,
      this.player
    );

    // SPACE to attack the nearest opponent, ESC to leave the arena.
    this.attackKey = this.input.keyboard.addKey(Input.Keyboard.KeyCodes.SPACE);
    this.leaveKey = this.input.keyboard.addKey(Input.Keyboard.KeyCodes.ESC);

    // On-screen hint.
    this.add
      .text(4, 4, "SPACE attack   ESC leave", { fontSize: "8px", color: "#ffffff" })
      .setScrollFactor(0)
      .setDepth(200);

    // Join the Bridge battle room and start syncing opponents.
    setupMultiplayer(this, "BridgeScene");
  }

  createHealthBar(x, y, player) {
    const width = 40;
    const height = 5;

    // White outline
    const outline = this.add.rectangle(
      x,
      y - 40,
      width + 2,
      height + 2,
      0xffffff
    );

    // Black background
    const healthBarBackground = this.add.rectangle(
      x,
      y - 40,
      width,
      height,
      0x000000
    );

    // Red health bar - set origin to left
    const healthBar = this.add
      .rectangle(x - width / 2, y - 40, width, height, 0xff0000)
      .setOrigin(0, 0.5);

    return {
      outline: outline,
      background: healthBarBackground,
      bar: healthBar,
    };
  }

  update() {
    if (!this.player || !this.player.body || this.isDead) return;

    const speed = 80;
    this.player.body.setVelocity(0);

    let animation = this.lastDirection ? "idle" + this.lastDirection : "idleDown";

    if (this.cursors.left.isDown) {
      this.player.body.setVelocityX(-speed);
      animation = "walkRight";
      this.lastDirection = "Right";
      this.player.flipX = true;
    } else if (this.cursors.right.isDown) {
      this.player.body.setVelocityX(speed);
      animation = "walkRight";
      this.lastDirection = "Right";
      this.player.flipX = false;
    }

    if (this.cursors.up.isDown) {
      this.player.body.setVelocityY(-speed);
      animation = "walkUp";
      this.lastDirection = "Up";
    } else if (this.cursors.down.isDown) {
      this.player.body.setVelocityY(speed);
      animation = "walkDown";
      this.lastDirection = "Down";
    }

    // Keep diagonal speed consistent.
    this.player.body.velocity.normalize().scale(speed);

    const idle =
      !this.cursors.left.isDown &&
      !this.cursors.right.isDown &&
      !this.cursors.up.isDown &&
      !this.cursors.down.isDown;
    if (idle && this.lastDirection) animation = "idle" + this.lastDirection;

    // Start a swing on SPACE (ignored while one is already playing).
    if (Input.Keyboard.JustDown(this.attackKey)) {
      performAttack(this, 45);
    }

    // While attacking, hold the attack clip and broadcast it; otherwise play
    // the movement animation as usual. Keys are prefixed by the chosen sheet.
    let toPlay;
    if (this.isAttacking) {
      toPlay = this.attackAnimKey;
    } else {
      toPlay = this.spriteKey + "_" + animation;
      this.player.play(toPlay, true);
    }

    // Sync to other players in this arena.
    emitMove(this, toPlay);

    if (Input.Keyboard.JustDown(this.leaveKey)) {
      this.scene.start("CommonScene");
    }

    // Update local health bar position and width.
    if (this.healthBar) {
      const yOffset = -20;
      const width = 40;
      this.healthBar.outline.x = this.player.x;
      this.healthBar.outline.y = this.player.y + yOffset;
      this.healthBar.background.x = this.player.x;
      this.healthBar.background.y = this.player.y + yOffset;
      this.healthBar.bar.x = this.player.x - width / 2;
      this.healthBar.bar.y = this.player.y + yOffset;
      this.healthBar.bar.width = (Math.max(0, this.player.life) / 100) * width;
    }
  }
}
