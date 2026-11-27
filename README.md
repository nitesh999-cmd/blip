# Blip

A tiny plant that lives at the bottom of your screen and grows through the day, plus a tiny news dot that checks the headlines every hour and opens when there's something worth knowing.

## Install on a Mac

Paste this into Terminal (macOS 12 or newer):

```
curl -fsSL https://raw.githubusercontent.com/nitesh999-cmd/blip/main/install-mac.sh | bash
```

It puts everything in `~/blip`, adds a private copy of Node.js if the Mac needs one, and starts Blip. No password needed. Run the same command again to update.

- **Start again later:** `~/blip/start-blip.sh`
- **Use it:** tap Blip to change its look (a flower pot, two sports cars, a robot, a UFO and more). Right-click (two-finger click) for the menu: lines, Change my look, Surprise me. Drag it anywhere. The news dot can be dragged too, and right-clicked for news topics.
- **Smarter with Claude Code:** if [Claude Code](https://claude.com/claude-code) is installed and signed in, Blip writes fresh lines and picks the news with it. That's a few short calls an hour on your own Claude plan. Without it, Blip uses its own lines and the top ABC and BBC headlines.
- **News sources:** ABC News, BBC News, RenewEconomy, pv magazine Australia and Bureau of Meteorology warnings for Victoria (public feeds). Nothing else is sent anywhere.
- **Remove:** quit Blip from its menu, then `rm -rf ~/blip ~/Library/Application\ Support/blip`
