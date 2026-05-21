import { Scene, Input } from "phaser";
import Level from "./Level.js";
import { setupMultiplayer, emitMove, performAttack, ensureAnims } from "./net.js";
import { playerConfig } from "./config.js";

export default class DungeonScene extends Scene {
  constructor() {
    super("DungeonScene");
    this.player = null;
    this.level = new Level();
    this.spike = null;
    this.healthBar = null;
  }

  preload() {
    this.load.image("Dungeon_1", "/assets/Dungeon_1.png");
    this.load.image("windows", "/assets/Dungeon_2_Arch_small.png");
    this.load.image("pillars", "/assets/Dungeon_2_Pillars.png");
    this.load.image("objects", "/assets/Dungeon_Objects.png");
    this.load.image("spikes", "/assets/Floor_spikes_1.png");
    this.load.tilemapTiledJSON("dungeon", "assets/dmap.json");
    this.load.spritesheet("Spearman", "assets/Spearman.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.spritesheet("orc", "assets/orc.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.spritesheet("spike", "assets/spk1.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
    // this.load.image("spike", "assets/tile000.png");
  }

  create() {
this.game.scale.resize(256,256)
    const map = this.make.tilemap({ key: "dungeon" });
    const floor = map.addTilesetImage("Dungeon_1", "Dungeon_1");
    const floorLayer = map.createLayer("Tile Layer 1", [floor], 0, -100);
    floorLayer.setScale(1, 2).setOrigin(0, 0);

    const windows = map.addTilesetImage("windows", "windows");
    const windowsLayer = map.createLayer("windows", [windows], 0, 0);
    windowsLayer.setScale(1, 1).setOrigin(0, 0);

    const pillars = map.addTilesetImage("pillars", "pillars");
    const pillarLayer = map.createLayer("pillars", pillars, 0, 0);
    pillarLayer.setScale(1, 1).setOrigin(0, 0);
    pillarLayer.setCollisionByProperty({ collider: true });

    const objects = map.addTilesetImage("objects", "objects");
    const spikes = map.addTilesetImage("spikes", "spikes");
    const objectLayer = map.createLayer("objects", [objects, spikes], 0, 0);
    objectLayer
        .setScale(1, 1)
        .setOrigin(0, 0)
        .setCollisionByProperty({ collider: true });
    // this.spike = this.physics.add.image(
    //   this.game.config.width / 2 - 70,
    //   this.game.config.height / 2 - 25,
    //   "spike",
    // );
    //
    // this.anims.create({
    //   key: "spike-anim",
    //   frames: this.anims.generateFrameNumbers("spike", { start: 0, end: 7 }),
    //   frameRate: 10,
    //   repeat: -1,
    // });
    // this.spike.play("spike-anim", true);

    this.spriteKey = playerConfig.sprite;
    this.player = this.physics.add
        .sprite(256 / 2 - 50, 256 / 2 - 35, this.spriteKey)
        .setScale(1);

    this.player.life = 100;

    this.player.setScale(1);
    this.player.setBodySize(24, 28);
    this.player.setOffset(10, 13);
    this.cursors = this.input.keyboard.createCursorKeys();

    this.physics.add.collider(this.player, pillarLayer);
    this.physics.add.collider(this.player, objectLayer);

    // Build animations for both characters (prefixed by sheet key).
    ensureAnims(this, "Spearman");
    ensureAnims(this, "orc");

    this.player.play(this.spriteKey + "_idleDown");
    this.healthBar = this.createHealthBar(this.player.x, this.player.y, this.player);

    // SPACE to attack the nearest opponent, ESC to leave the arena.
    this.attackKey = this.input.keyboard.addKey(Input.Keyboard.KeyCodes.SPACE);
    this.leaveKey = this.input.keyboard.addKey(Input.Keyboard.KeyCodes.ESC);

    this.add
      .text(4, 4, "SPACE attack   ESC leave", { fontSize: "8px", color: "#ffffff" })
      .setScrollFactor(0)
      .setDepth(200);

    // Join the Dungeon battle room and start syncing opponents.
    setupMultiplayer(this, "DungeonScene");
  }

  createHealthBar(x, y, player) {
    const width = 40;
    const height = 5;
    
    // White outline
    const outline = this.add.rectangle(x, y - 40, width + 2, height + 2, 0xffffff);
    
    // Black background
    const healthBarBackground = this.add.rectangle(x, y - 40, width, height, 0x000000);
    
    // Red health bar - set origin to left
    const healthBar = this.add.rectangle(x - width/2, y - 40, width, height, 0xff0000)
        .setOrigin(0, 0.5);
    
    return { 
        outline: outline,
        background: healthBarBackground, 
        bar: healthBar 
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

    emitMove(this, toPlay);

    if (Input.Keyboard.JustDown(this.leaveKey)) {
      this.scene.start("CommonScene");
    }

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
