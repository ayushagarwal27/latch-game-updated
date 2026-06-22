// Player-chosen settings, set on the character-select screen before the game
// boots and then read by every scene. `sprite` must match a loaded
// spritesheet key ("Spearman" or "orc").
export const playerConfig = {
  sprite:        "Spearman",
  username:      null,  // set after wallet login
  walletAddress: null,  // set after wallet connects
  battleId:      null,  // set when entering a wager battle via the lobby
  isCreator:     null,  // true = player A (created battle), false = player B (joined)
};

export const CHARACTERS = ["Spearman", "orc", "Player", "Skeleton"];
