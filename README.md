# Nonno's dashboard

A large-print dashboard showing when Juventus (Serie A), Collingwood (AFL), and Melbourne Victory (A-League Men) play next, what happened in their last game, and the games after that.

Fixtures come from the free [Fixture Download](https://fixturedownload.com) JSON feeds. No account, API key, or other credentials are required.

## Run

Install Node.js 20 or newer (there are no npm dependencies), then run:

```sh
npm start
```

Open http://localhost:3000. The server fetches fresh fixtures when it starts (if the saved ones are more than 6 hours old) and every 6 hours after that. The page reloads the data every 15 minutes, so it can be left open full-screen on a tablet or TV.

To open the dashboard from another device on the same network, start it with `HOST=0.0.0.0` (PowerShell: `$env:HOST='0.0.0.0'; npm start`) and visit `http://<this-computer's-IP>:3000`. Set `PORT` to use a different port.

To refresh the data without starting the server, run `npm run fixtures`.

## Data notes

- Fixtures are saved to `data/fixtures.json` (ignored by Git). It holds the previous, current, and following calendar-year season feeds. An unavailable season has usually just not been published yet.
- If a feed fails during a refresh (for example, no internet), the previously saved fixtures for that team and season are kept, and the dashboard says that some teams could not be updated.
- Times are stored in UTC and shown in the viewing device's time zone.
- Fixture Download fills in placeholder kickoff times for games that have not been scheduled yet. A fixture gets `timeStatus: "tbc"` when its time is missing, is exactly midnight UTC, or is part of a run of 4 or more unplayed games at the end of a season that all share one kickoff time. The dashboard shows these as "Time not announced yet". This is a best guess, so check official club or league sources for games far in the future.

## Test

```sh
npm test
```
