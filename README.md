# Lets Go Quizzing

**The Markdown of Quiz Apps.** Text-based, portable, fast, and privacy-respecting. No database bloat, no tracking, no login walls.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Production

```bash
npm run build
npm run start
```

## Docker

### Docker Compose (recommended)

One-time setup:

```bash
cp .env.example .env
# Edit .env and set HOST_PASSWORD
```

Deploy or update:

```bash
git pull
docker compose up -d --build
```

Open http://localhost:3000 (or your server's address). Quizzes and history persist in `./data`.

If you get permission errors writing to `data/`, run: `chown -R 1001:1001 data`

### Docker run

```bash
docker build -t lets-go-quizzing .
docker run -p 3000:3000 lets-go-quizzing
```

With host password:

```bash
docker run -e HOST_PASSWORD=yourpassword -p 3000:3000 lets-go-quizzing
```

For persistence: mount `data/` as a volume so quizzes and game history survive container restarts:

```bash
docker run -v /path/to/data:/app/data -p 3000:3000 lets-go-quizzing
```

The container runs as a non-root user. If the host `data/` directory has restrictive permissions, ensure the container can write to it (e.g. `chown` the host directory to match the container user, or run with `--user`).

## Host Password (required for hosting and quiz creation)

Hosting and quiz creation require authentication. Set the `HOST_PASSWORD` environment variable:

- **Shell**: `export HOST_PASSWORD=mysecret` then `npm run start`
- **Inline**: `HOST_PASSWORD=mysecret npm run start`
- **.env file**: Add `HOST_PASSWORD=mysecret` to a `.env` file in the project root (ensure `.env` is in `.gitignore`)
- **Docker**: `-e HOST_PASSWORD=mysecret`

When set:
- **Host a Game**: Users must enter the password when creating a room. A session cookie is set for 24 hours.
- **Quiz Creator**: Users must log in with the password to create or edit quizzes.

When not set, hosting and quiz creation are disabled. Joining games as a player remains open.

**Security note:** The host password may be stored in browser sessionStorage to support creating new rooms after a game ends. It is stored in plaintext. Avoid using shared or public computers for hosting.

## Production / Reverse Proxy

**Important:** For production deployments, you **must** set `ORIGIN` to your public site origin(s). If unset, the app defaults to `https://localhost:3000`, which will reject connections from your actual domain.

When running behind Nginx, Cloudflare, or another reverse proxy:

- **ORIGIN** (production only, **required**): Comma-separated list of allowed origins for Socket.io CORS. Example: `ORIGIN=https://quiz.example.com,https://www.quiz.example.com`
- **X-Forwarded-Proto**: Your proxy must set this to `https` when terminating TLS, so the app can issue Secure cookies correctly.
- **X-Forwarded-For**: Your proxy must forward the real client IP. Set `ADDRESS_HEADER=x-forwarded-for` so both REST and Socket.io use the real client IP for rate limiting and logging.
- **ROOM_ID_LEN** (optional): Room ID length (4–12 chars, default 6). Increase for higher entropy if needed.

Example with Nginx: `proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $remote_addr;`

## Creating Quizzes

Use the **Quiz Creator** at `/creator` to create and edit quizzes in the browser, or add YAML files manually to `data/quizzes/`. Example:

```yaml
meta:
  name: "Pub Quiz Night"
  author: "You"
  default_timer: 30

rounds:
  - name: "Round 1"
    questions:
      - id: "q1"
        type: "choice"
        text: "What is the capital of Australia?"
        options: ["Sydney", "Melbourne", "Canberra", "Perth"]
        answer: 2
      - id: "q2"
        type: "input"
        text: "Complete: 'Is this the real life? Is this just _____?'"
        answer: ["fantasy", "fantsy"]
```

## Tech Stack

- **Frontend**: SvelteKit, Tailwind CSS
- **Backend**: Node.js, Socket.io
- **Data**: YAML files, JSON history

**Note:** Game state (rooms, players) is in-memory only. Restarting the server wipes active games. Single-instance only; horizontal scaling is not supported.
