# Nonno's fixtures

This project gathers men's Juventus (Serie A), Collingwood (AFL), and Melbourne Victory (A-League Men) fixtures from the free Fixture Download JSON feeds. It does not yet include a dashboard.

## Run

Install Node.js 20 or newer, then run:

```sh
npm run fixtures
```

No account, API key, or other credentials are required. The command writes `data/fixtures.json`; run it again to refresh the data. The file contains fixtures from the previous, current, and following calendar-year season feeds, plus unavailable feeds and errors. Failed requests produce a nonzero exit code; the output may be partial. An unavailable season may simply not have been published yet.

Times are stored in UTC. Fixture Download can use placeholder times for fixtures that have not been scheduled, and its feed does not reliably identify these. All times are therefore marked `unverified`: check the official competition or club fixture before relying on a kickoff time. Convert times to the viewer's timezone when the dashboard is built. Past fixtures are included so the dashboard can choose what to display.

Run the checks with `npm test`.
