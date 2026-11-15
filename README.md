# Nonno's dashboard

A large-print dashboard, built for a TV turned on its side (portrait, 1080 x 1920), showing the upcoming games for Juventus (Serie A), the Italy men's national team (all competitions), Collingwood (AFL), and Melbourne Victory (A-League Men).

The screen keeps the words to a minimum: for each game it shows the team (with its crest and colours), who they play, and the day and time. The soonest game fills a big panel at the top, and the following games for all teams are listed below it in kickoff order, as many as fit. Games today or tomorrow get a yellow outline. While a game is on, it gets a red outline and its kickoff time is replaced by the live score. A team with no game in the list (for example, Collingwood in the AFL off-season) gets one line at the bottom with its next game.

Club fixtures come from the free [Fixture Download](https://fixturedownload.com) JSON feeds. Italy's games come from ESPN's public team schedule (`site.api.espn.com`), which covers qualifiers, the Nations League, friendlies, and tournaments in one feed. That ESPN endpoint is free and needs no key, but it is unofficial and undocumented, so it could change without notice. If it breaks, the dashboard keeps showing the last saved Italy games and says some teams could not be updated. No account, API key, or other credentials are required.

## Run

Install Node.js 20 or newer (there are no npm dependencies), then run:

```sh
npm start
```

Open http://localhost:3000. The server fetches fresh fixtures when it starts (if the saved ones are more than 6 hours old) and every 6 hours after that. The page reloads the data every 15 minutes, so it can be left open full-screen on a tablet or TV.

To open the dashboard from another device on the same network, start it with `HOST=0.0.0.0` (PowerShell: `$env:HOST='0.0.0.0'; npm start`) and visit `http://<this-computer's-IP>:3000`. Set `PORT` to use a different port.

To refresh the data without starting the server, run `npm run fixtures`.

## Live scores

From 15 minutes before kickoff until 4 hours after, the server looks up the game on ESPN's public scoreboard (free, no key) at most every 30 seconds, and the page shows the score and match clock. ESPN's status also decides when a game is over, so extra time or a long AFL game stays on screen. Like the Italy schedule, this ESPN endpoint is unofficial; if it fails, the page simply says "On now" without a score.

## Showing it on a portrait TV

Rotate the display to portrait in the computer's display settings (Windows: Settings > System > Display > Display orientation > Portrait). Then open the page full-screen, for example with `msedge --kiosk http://localhost:3000 --edge-kiosk-type=fullscreen`. The layout scales with the screen size and never needs scrolling. It also works in a normal browser window.

## Team logos

The club crests are trademarks, so they are not stored in this repository. The server downloads them from Wikimedia into `data/logos/` (ignored by Git) the first time it starts. If a download fails, the page shows the team's initials instead, and the server tries again on its next start.

## Data notes

- Fixtures are saved to `data/fixtures.json` (ignored by Git). For the clubs it holds the previous, current, and following calendar-year season feeds; an unavailable season has usually just not been published yet. For Italy it holds ESPN's recent results and every scheduled game. National teams often have nothing scheduled for months between international windows, and the dashboard says "No games scheduled yet" then.
- If a feed fails during a refresh (for example, no internet), the previously saved fixtures from that feed are kept, and the dashboard says that some teams could not be updated.
- Times are stored in UTC and shown in the viewing device's time zone.
- ESPN marks kickoff times that are not confirmed yet; these also get `timeStatus: "tbc"`.
- Fixture Download fills in placeholder kickoff times for games that have not been scheduled yet. A fixture gets `timeStatus: "tbc"` when its time is missing, is exactly midnight UTC, or is part of a run of 4 or more unplayed games at the end of a season that all share one kickoff time. The dashboard shows these as "Time not announced yet". This is a best guess, so check official club or league sources for games far in the future.

## Test

```sh
npm test
```
