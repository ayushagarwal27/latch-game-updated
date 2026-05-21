import Phaser from "phaser";
import DungeonScene from "./DungeonScene.js";
import CommonScene from "./CommonScene.js";
import BridgeScene from "./BridgeScene.js";
import socket from "./socket.js";
import { playerConfig } from "./config.js";

function startGame() {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
      default: "arcade",
      arcade: {
        gravity: { y: 0 },
        debug: false,
      },
    },
    scene: [CommonScene, DungeonScene, BridgeScene],
    scale: {
      zoom: 3,
    },
    callbacks: {
      postBoot: () => {
        window.socket = socket;
      },
    },
  });
}

// Boot the game only after the player picks a character on the select screen.
const select = document.getElementById("char-select");
document.querySelectorAll("#char-select .char-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    playerConfig.sprite = btn.getAttribute("data-sprite") || "Spearman";
    if (select) select.style.display = "none";
    startGame();
  });
});
