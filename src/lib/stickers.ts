export const STICKERS = [
  { id: "locked-in", label: "Locked in" },
  { id: "ship-it", label: "Ship it" },
  { id: "on-it", label: "On it" },
  { id: "brb-research", label: "BRB, research" },
  { id: "help", label: "Help" },
  { id: "done", label: "Done" },
  { id: "w", label: "W" },
  { id: "gm", label: "GM" },
].map((s) => ({ ...s, src: `/stickers/${s.id}.svg` }));

export const QUICK_REACTIONS = ["👍", "🔥", "😂", "✅", "👀", "🙏"];
