import { Scene, Input } from "phaser";
import Level from "./Level.js";
import { setupMultiplayer, emitMove, ensureAnims } from "./net.js";
import { playerConfig } from "./config.js";
export default class CommonScene extends Scene {
  constructor() {
    super("CommonScene");
    this.player = null;
    this.otherPlayers = {};
    this.level = new Level();
    this.spike = null;
    this.lastEmitTime = 0;
  }

  preload() {
    this.load.image("Apple_Tree", "/assets/Apple_Tree.png");
    this.load.image("Barn", "/assets/Barn.png");
    this.load.image("Beach_Decor_Tiles", "/assets/Beach_Decor_Tiles.png");
    this.load.image("Beach_Tile", "/assets/Beach_Tile.png");
    this.load.image("Birch_Tree", "/assets/Birch_Tree.png");
    this.load.image("Boat", "/assets/Boat.png");
    this.load.image("Cobble_Road_1", "/assets/Cobble_Road_1.png");
    this.load.image("Cobble_Road_2", "/assets/Cobble_Road_2.png");
    this.load.image("Fences", "/assets/Fences.png");
    this.load.image("Fountain", "/assets/Fountain.png");
    this.load.image("Grass_Middle", "/assets/Grass_Middle.png");
    this.load.image("Grass_Tiles_1", "/assets/Grass_Tiles_1.png");
    this.load.image("Water_Middle", "/assets/Water_Middle.png");
    this.load.image("Water_Tile", "/assets/Water_Tile.png");
    this.load.image("Well", "/assets/Well.png");
    this.load.image("With_Hut", "/assets/With_Hut.png");
    this.load.image("Cave_Floor", "/assets/Cave_Floor.png");
    this.load.image("Water_Troughs", "/assets/Water_Troughs.png");

    this.load.tilemapTiledJSON("common", "/assets/common.json");
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
    // Restore full-size viewport (battle scenes shrink it to 256x256).
    this.game.scale.resize(800, 600);

    const map = this.make.tilemap({ key: "common" });
    const grass = map.addTilesetImage("Grass_Middle", "Grass_Middle");
    const water = map.addTilesetImage("Water_Tile", "Water_Tile");
    const waterMiddle = map.addTilesetImage("Water_Middle", "Water_Middle");
    const Cobble_Road_1 = map.addTilesetImage("Cobble_Road_1", "Cobble_Road_1");
    const Grass_Tiles_1 = map.addTilesetImage("Grass_Tiles_1", "Grass_Tiles_1");
    const Cave_Floor = map.addTilesetImage("Cave_Floor", "Cave_Floor");
    const beachDecorTiles = map.addTilesetImage(
      "Beach_Decor_Tiles",
      "Beach_Decor_Tiles"
    );
    const layer1 = map.createLayer(
      "floor",
      [
        grass,
        waterMiddle,
        water,
        beachDecorTiles,
        Cobble_Road_1,
        Grass_Tiles_1,
        Cave_Floor,
      ],
      0,
      0
    );
    layer1
      .setScale(1, 1)
      .setOrigin(0, 0)
      .setCollisionByProperty({ collider: true });

    const Fountain = map.addTilesetImage("Fountain", "Fountain");
    const Barn = map.addTilesetImage("Barn", "Barn");
    const Fences = map.addTilesetImage("Fences", "Fences");
    const Well = map.addTilesetImage("Well", "Well");
    const Boat = map.addTilesetImage("Boat", "Boat");
    const With_Hut = map.addTilesetImage("With_Hut", "With_Hut");
    const Birch_Tree = map.addTilesetImage("Birch_Tree", "Birch_Tree");
    const Apple_Tree = map.addTilesetImage("Apple_Tree", "Apple_Tree");
    const Water_Troughs = map.addTilesetImage("Water_Troughs", "Water_Troughs");
    const objectLayer = map.createLayer(
      "objects",
      [
        Fountain,
        Barn,
        Fences,
        Well,
        Boat,
        With_Hut,
        Birch_Tree,
        Apple_Tree,
        Grass_Tiles_1,
        Cave_Floor,
        Water_Troughs,
      ],
      0,
      0
    );
    objectLayer
      .setScale(1, 1)
      .setOrigin(0, 0)
      .setCollisionByProperty({ collider: true });

    // const tileset2 = map.addTilesetImage("pillars", "pillars");
    // const layer3 = map.createLayer("pillars", tileset2, 0, 0);
    // layer3.setScale(1, 1).setOrigin(0, 0);
    // layer3.setCollisionByProperty({ collider: true });

    this.spriteKey = playerConfig.sprite;
    this.player = this.physics.add
      .sprite(this.game.config.width / 2, this.game.config.height / 2, this.spriteKey)
      .setScale(1);

    this.player.setCollideWorldBounds(true);
    this.player.life = 100;
    this.player.attack = 10;
    this.player.weapon = "sword";
    this.player.setScale(1);
    this.player.setBodySize(24, 28);
    this.player.setOffset(10, 13);
    this.cursors = this.input.keyboard.createCursorKeys();
    let element = document.getElementById("input-box");
    const yesButton = document.getElementById("yes");
    const noButton = document.getElementById("no");
    this.physics.add.collider(this.player, layer1);
    this.physics.add.collider(this.player, objectLayer, (a, b) => {
      if (b?.properties?.dungeon) {
        element.style.display = "block";
        yesButton.addEventListener("click", () => {
          this.scene.start("DungeonScene");
          element.style.display = "none";
        });
        noButton.addEventListener("click", () => {
          element.style.display = "none";
        });
      }
      if (b?.properties?.bridge) {
        element.style.display = "block";
        yesButton.addEventListener("click", () => {
          this.scene.start("BridgeScene");
          element.style.display = "none";
        });
        noButton.addEventListener("click", () => {
          element.style.display = "none";
        });
      }
    });

    // this.cameras.main.setBounds(0, 0, +this.game.config.width, +this.game.config.height);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.setFollowOffset(-50, -50);
    this.player.setOrigin(0.5, 0.5);

    // Build animations for both characters (prefixed by sheet key).
    ensureAnims(this, "Spearman");
    ensureAnims(this, "orc");

    this.player.play(this.spriteKey + "_idleDown");
    // No health bars in the peaceful common area.
    setupMultiplayer(this, "CommonScene", { showBars: false });

    // Common area is peaceful — no combat here. Battle happens only after
    // entering the Bridge or Dungeon arena via the house portal.

    // Add inventory key
    this.inventoryKey = this.input.keyboard.addKey(
      Input.Keyboard.KeyCodes.I
    );

    // Create inventory (initially hidden)
    this.createInventory();
  }

  createInventory() {
    // Create inventory container
    const padding = 10;
    const cellSize = 40;
    const rows = 4;
    const cols = 6;
    const width = cellSize * cols + padding * 2;
    const height = cellSize * rows + padding * 2;

    // Position in center of screen
    const x = this.cameras.main.centerX - width / 2;
    const y = this.cameras.main.centerY - height / 2;

    // Create semi-transparent background
    this.inventoryBg = this.add
      .rectangle(x, y, width, height, 0x000000)
      .setOrigin(0, 0)
      .setAlpha(0.7)
      .setScrollFactor(0)
      .setDepth(100);

    // Create grid cells
    this.inventorySlots = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const slotX = x + padding + col * cellSize;
        const slotY = y + padding + row * cellSize;

        // Create slot background
        const slot = this.add
          .rectangle(slotX, slotY, cellSize - 2, cellSize - 2, 0x666666)
          .setOrigin(0, 0)
          .setAlpha(0.8)
          .setScrollFactor(0)
          .setDepth(101);

        this.inventorySlots.push(slot);
      }
    }

    // Hide inventory initially
    this.hideInventory();
  }

  hideInventory() {
    this.inventoryBg.setVisible(false);
    this.inventorySlots.forEach((slot) => slot.setVisible(false));
  }

  showInventory() {
    this.inventoryBg.setVisible(true);
    this.inventorySlots.forEach((slot) => slot.setVisible(true));
  }

  update(time, delta) {
    const speed = 80;
    const prevVelocity = this.player.body.velocity.clone();
    let newX = this.player.x;
    let newY = this.player.y;

    // Stop any previous movement from the last frame
    this.player.body.setVelocity(0);

    // Stop any previous movement
    this.player.body.setVelocity(0);

    let animation = this.lastDirection
      ? "idle" + this.lastDirection
      : "idleDown";

    // Handle movement and set last direction
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

    // Normalize and scale the velocity
    this.player.body.velocity.normalize().scale(speed);

    // Handle idle animations based on last direction
    if (
      !this.cursors.left.isDown &&
      !this.cursors.right.isDown &&
      !this.cursors.up.isDown &&
      !this.cursors.down.isDown
    ) {
      if (this.lastDirection) {
        animation = "idle" + this.lastDirection;
      }
    }

    // Play the animation (prefixed by the chosen character sheet).
    const toPlay = this.spriteKey + "_" + animation;
    this.player.play(toPlay, true);

    // Emit movement to the server (throttled inside emitMove).
    emitMove(this, toPlay);

    // Add inventory toggle at the end of update
    if (Input.Keyboard.JustDown(this.inventoryKey)) {
      if (this.inventoryBg.visible) {
        this.hideInventory();
      } else {
        this.showInventory();
      }
    }
  }
}
