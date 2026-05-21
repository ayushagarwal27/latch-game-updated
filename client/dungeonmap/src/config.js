// Player-chosen settings, set on the character-select screen before the game
// boots and then read by every scene. `sprite` must match a loaded
// spritesheet key ("Spearman" or "orc").
export const playerConfig = {
  sprite: "Spearman",
};

// Characters available on the select screen. Both sheets share the exact same
// 6x13 frame layout, so the animation frame numbers below work for either.
export const CHARACTERS = ["Spearman", "orc"];
