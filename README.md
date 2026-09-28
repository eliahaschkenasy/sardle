# Sardle

An unlimited-play version of a daily Israeli Premier League player-guessing game (Hebrew UI).
Every game picks a random secret player. Guess by name and use the club, position and age feedback to close in.

Fully static: open `index.html` or serve the folder. Player data lives in `data/players.js`.

## Ages

Ages are refreshed every night at 00:00 Israel time by `.github/workflows/update-ages.yml`,
which runs `scripts/update_ages.py` (one guess per player against ligadle.app, which only exposes
current ages) and commits `data/players.js`. Players with a `birthDate` field have their age computed
live in the browser instead. Run the workflow manually from the Actions tab to refresh on demand.
