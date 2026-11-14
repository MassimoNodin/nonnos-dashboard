# Nonno's dashboard

A large-print dashboard, built for a TV turned on its side (portrait, 1080 x 1920), showing the upcoming games for Juventus (Serie A), Collingwood (AFL), and Melbourne Victory (A-League Men).

The soonest game fills a big panel at the top. Below it, the following games for all three teams are listed in kickoff order, as many as fit on the screen. Each game is coloured in its team's colours and says whether it is a home or away game, who the opponent is, and the stadium. Games today, tomorrow, or in progress get a yellow outline. A team with no game in the list (for example, Collingwood in the AFL off-season) gets one line at the bottom with its next game.

Fixtures come from the free [Fixture Download](https://fixturedownload.com) JSON feeds. No account, API key, or other credentials are required.

## Run

Install Node.js 20 or newer (there are no npm dependencies), then run:

```sh
npm start
```

Open http://localhost:3000. The server fetches fresh fixtures when it starts (if the saved ones are more than 6 hours old) and every 6 hours after that. The page reloads the data every 15 minutes, so it can be left open full-screen on a tablet or TV.

To open the dashboard from another device on the same network, start it with `HOST=0.0.0.0` (PowerShell: `$env:HOST='0.0.0.0'; npm start`) and visit `http://<this-computer's-IP>:3000`. Set `PORT` to use a different port.

To refresh the data without starting the server, run `npm run fixtures`.

## Showing it on a portrait TV

Rotate the display to portrait in the computer's display settings (Windows: Settings > System > Display > Display orientation > Portrait). Then open the page full-screen, for example with `msedge --kiosk http://localhost:3000 --edge-kiosk-type=fullscreen`. The layout scales with the screen size and never needs scrolling. It also works in a normal browser window.

## Data notes

- Fixtures are saved to `data/fixtures.json` (ignored by Git). It holds the previous, current, and following calendar-year season feeds. An unavailable season has usually just not been published yet.
- If a feed fails during a refresh (for example, no internet), the previously saved fixtures for that team and season are kept, and the dashboard says that some teams could not be updated.
- Times are stored in UTC and shown in the viewing device's time zone.
- Fixture Download fills in placeholder kickoff times for games that have not been scheduled yet. A fixture gets `timeStatus: "tbc"` when its time is missing, is exactly midnight UTC, or is part of a run of 4 or more unplayed games at the end of a season that all share one kickoff time. The dashboard shows these as "Time not announced yet". This is a best guess, so check official club or league sources for games far in the future.

## Test

```sh
npm test
```
