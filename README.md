# Let's Go Quizzing

> _Now with 100% less database!_

A blazingly fast, real-time multiplayer trivia app stripped to the studs. Built for anyone who wants to host a live game without wrestling with databases, tracking cookies, or login walls.

## ✨ Core Features

- ⚡ **True Real-Time Sync:** Powered entirely by WebSockets. No clunky API polling.
- 🗂️ **Zero-Bloat Architecture:** Entirely file-based. Quizzes are read from simple YAML files, and game history is logged to JSON.
- 🎮 **Dedicated Game Views:** Mobile-first player inputs, a powerful Host control center with manual scoring overrides, and a distraction-free Projector view for the big screen.
- 👮 **Host Moderation:** Kick disruptive players from the room; optional ban blocks rejoin from the same browser/device for the rest of the session.
- 🚫 **Content Filters:** Built-in profanity filter and custom keyword block list (Settings) for classroom-friendly gameplay.
- 🛡️ **Built-In Security:** Stateful role authentication and websocket rate-limiting prevent event flooding and spoofing.
- 📝 **Frictionless Quiz Creation:** Simple plain-text authoring with a built-in lightweight YAML editor.
- 🔐 **One-Time Setup:** No database or `.env` required. Run `docker compose up`, complete setup in the UI, and manage credentials via the Settings page.

---

## 🚀 Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open `http://localhost:5173` to view the app.

---

## 👥 Host and Player UI

**Host:** When logged in, a nav bar appears with links to home, Settings (gear icon), and Log out. Settings and logout are disabled while a quiz is live—you must end the quiz first. Logout shows a confirmation modal. From the player list in the sidebar, the host can **kick** a player (remove and disconnect) or **kick & ban** (block rejoin from the same browser/device for the session).

**Player:** A compact nav bar appears after joining a room, with Settings (change name/emoji in lobby only) and Exit quiz (door icon). Exit shows a warning: in lobby you can rejoin; once the quiz has started, leaving removes you from the session and leaderboard.

**Projector:** The projector view has no nav bar and does not appear as a player in the leaderboard.

---

## 🐳 Deployment (Docker)

The recommended way to run this application in production is via Docker.

### Option 1: Docker Compose (Recommended)

No `.env` file is required for basic use. Clone the repo and run:

```bash
docker compose up -d --build
```

Then open `http://localhost:3000` (or your server's address). You'll be redirected to the setup page to create an admin username and password, which are stored in `data/config.json` on the mounted volume.

**Optional:** To use environment overrides (e.g. `ORIGIN`, `ROOM_ID_LEN`), create a `.env` file and uncomment the `env_file` section in `docker-compose.yml`. See `.env.example` for available variables.

### Option 2: Docker Run

To run a standalone container with persistent data:

```bash
docker build -t lets-go-quizzing .

docker run -d \
  -p 3000:3000 \
  -v /path/to/host/data:/app/data \
  lets-go-quizzing
```

You'll be redirected to setup automatically when you open the app.

> **Note on Permissions:** The container runs as root by default so it can write to the mounted `data/` volume. If you prefer to run as your host user, use `UID=$(id -u) GID=$(id -g) docker compose up`.

---

## ⚙️ Configuration

### Setup and Config File

On first run, you're redirected to the setup page to create an admin account. Credentials are stored in `data/config.json` (in the mounted volume). Via the **Settings** page (gear icon in the host nav), you can change username, password, ORIGIN, room code length, content filters (profanity filter toggle and custom keyword block list), and prize email SMTP settings.

Prize email SMTP is UI-managed. Readable transport fields are stored in `data/config.json`, while the SMTP password is stored separately in `data/secrets.json` with restrictive file permissions.

From the **Email** settings tab you can:

- Preview a sample prize email in the browser without sending mail.
- Run an SMTP connection test after saving settings. The test checks connect/auth only and does not send a real email.
- Send prize emails using a styled HTML template with a plain-text fallback for simpler mail clients.

### Environment Variables (Optional Overrides)

These override config file values when set. Useful for Kubernetes, CI, or deployment-specific tuning.

| Variable                    | Description                                                                                                                                 | Overrides          |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :----------------- |
| `ORIGIN`                    | Comma-separated allowed origins for Socket.io CORS (e.g., `https://quiz.example.com`). **Set in production** to restrict WebSocket origins. | `config.origin`    |
| `ROOM_ID_LEN`               | Length of generated room codes. Default is `6`.                                                                                             | `config.roomIdLen` |
| `HOST_PASSWORD`             | Legacy: enables hosting when no config exists. Used for migration from env-only setups.                                                     | —                  |
| `ADDRESS_HEADER`            | Set to `x-forwarded-for` if behind a proxy so rate limits use real client IPs.                                                              | —                  |
| `BODY_SIZE_LIMIT`           | Maximum request body size accepted by the Node app (for example `50M`). Increase this if quiz ZIP imports or image uploads fail on deploy. | —                  |
| `LOAD_TEST_PLAYER_JOIN_MAX` | Test-only override for benchmark deployments. Raises the player/projector join limit without changing normal defaults.                      | —                  |

> **Local development:** The dev server runs at `http://localhost:5173`. If Socket.io rejects connections, set `ORIGIN=http://localhost:5173` in your config or `.env`.

### Reverse Proxy Setup (Nginx, Cloudflare, Traefik, etc.)

When running behind a reverse proxy that handles TLS/SSL, ensure you forward the correct headers so secure cookies and websockets function properly:

- Forward the real IP: `proxy_set_header X-Forwarded-For $remote_addr;`
- Terminate TLS correctly: `proxy_set_header X-Forwarded-Proto $scheme;`
- Add security headers for all responses (including static assets): `add_header X-Content-Type-Options nosniff always;` (the `always` parameter ensures the header is set even for error responses).

### Load Testing

The repository includes a raw Socket.IO load harness that exercises the real host/player game flow:

```bash
npm run load -- --base-url http://localhost:3000 --quiz-filename test_quiz.yaml --players 50
```

Recommended usage:

- Run the app on the target server and run the load generator from a separate machine for realistic capacity measurements.
- Point `--base-url` at either the direct app URL or the Nginx-fronted URL to compare both paths.
- If the benchmark deployment would otherwise hit the per-IP join limiter, temporarily set `LOAD_TEST_PLAYER_JOIN_MAX` higher on the app server.

The first version prints a CLI summary with join latency, answer latency, disconnect counts, and host question-patch propagation timing.

---

## 📝 Creating Quizzes

You can use the built-in **Quiz Creator** at `/creator` to author games directly in your browser, or you can drop manually written `.yaml` files into the `data/quizzes/` directory.

### Question Types

| Type           | Description                                  | Scoring |
| :------------- | :------------------------------------------- | :------ |
| `choice`       | Multiple choice: pick one correct option     | ✓       |
| `true_false`   | True or false                                | ✓       |
| `poll`         | Opinion poll; no correct answer              | —       |
| `multi_select` | Choose multiple correct options              | ✓       |
| `slider`       | Numeric value within a range                 | ✓       |
| `input`        | Fill in the blank (exact or fuzzy match)     | ✓       |
| `open_ended`   | Long text response; not scored               | —       |
| `word_cloud`   | Short text aggregated into a visual cloud    | —       |
| `reorder`      | Arrange options in the correct order         | ✓       |
| `matching`     | Match left-side items to right-side options  | ✓       |
| `hotspot`      | Tap a region on an image (e.g. map, diagram) | ✓       |

Scored question types support an optional `points` multiplier (e.g. `points: 2` = double points, `points: 3` = triple). Default is 1. Works in both Standard and Ranked modes.

Option-based question types also support `shuffle_options`:
- `choice`, `poll`, `multi_select`: set `shuffle_options: true` to shuffle the displayed options per room
- `matching`, `reorder`: current quizzes already shuffle by default per room; set `shuffle_options: false` if you want to keep the authored order

### Examples by Type

**choice** — Single correct option (0-based index):

```yaml
- id: q1
  type: choice
  text: What is the capital of Australia?
  options: [Sydney, Melbourne, Canberra, Perth]
  answer: 2
  explanation: Canberra is Australia's capital city.
```

**true_false** — `true` = True is correct, `false` = False is correct:

```yaml
- id: q2
  type: true_false
  text: Lightning is hotter than the surface of the sun.
  answer: true
  explanation: A lightning bolt can briefly reach ~30,000 K.
```

**poll** — Collect opinions; no answer stored:

```yaml
- id: q3
  type: poll
  text: Which snack should the host bring next?
  options: [Popcorn, Nachos, Cookies, Fruit]
```

**multi_select** — Indexes of all correct options:

```yaml
- id: q4
  type: multi_select
  text: Which of these are prime numbers?
  options: ['2', '4', '5', '9']
  answer: [0, 2]
  explanation: 2 and 5 are prime.
```

**slider** — Min, max, step, and correct value:

```yaml
- id: q5
  type: slider
  text: How many players on a soccer team on the field?
  min: 5
  max: 15
  step: 1
  answer: 11
```

**input** — Accepted answers (add alternatives for typos). Optional `points` multiplier:

```yaml
- id: q6
  type: input
  text: "Complete: 'Is this the real life? Is this just _____?'"
  answer: [fantasy, fantsy, Phantasy]
  points: 2
  explanation: Queen's Bohemian Rhapsody.
```

**open_ended** — Long text; responses shown on reveal:

```yaml
- id: q7
  type: open_ended
  text: In one sentence, why do you like pub quizzes?
  explanation: Open-ended questions are not scored.
```

**word_cloud** — Short text aggregated by frequency:

```yaml
- id: q8
  type: word_cloud
  text: Describe your current mood in one word!
  explanation: Repeated words appear larger in the cloud.
```

**reorder** — Correct order of option indexes:

```yaml
- id: q9
  type: reorder
  text: Order these historical events from earliest to most recent.
  options: [French Revolution, Moon Landing, Declaration of Independence]
  answer: [2, 0, 1]
  explanation: 1776, 1789, 1969.
```

**matching** — `items` are the prompts, `options` are the answer pool, and `answer[i]` is the correct option index for `items[i]`:

```yaml
- id: q10
  type: matching
  text: Match each country to its capital.
  items: [France, Japan, Canada]
  options: [Tokyo, Ottawa, Paris]
  answer: [2, 0, 1]
  explanation: Paris is in France, Tokyo is in Japan, and Ottawa is in Canada.
```

**hotspot** — Tap a region on an image. Requires `image`, `answer` with `x`, `y` (0–1, center), and `radius` (tolerance as fraction, e.g. `0.1` = 10%). The schema also supports optional `radiusY` and `rotation` for elliptical targets. Use the Form editor to click the image to set the target:

```yaml
- id: q11
  type: hotspot
  text: Where is the Eiffel Tower on this map?
  image: https://example.com/europe-map.png
  imageAspectRatio: 0.75
  answer:
    x: 0.48
    y: 0.42
    radius: 0.08
  explanation: The Eiffel Tower is in Paris, France.
```

### Full Example Quiz

The tracked sample quiz at `data/quizzes/quiz_reference_sample.yml` includes the core shipped types and can be used as a starting point. A complete example:

```yaml
meta:
  name: 'Pub Quiz Night'
  author: 'Quizmaster'
  default_timer: 30
  # Optional: choice option labels in views: "letters" (A,B,C) or "numbers" (1,2,3)
  option_label_style: 'letters'

rounds:
  - name: 'Round 1'
    questions:
      - id: 'q1'
        type: 'choice'
        text: 'What is the capital of Australia?'
        options: ['Sydney', 'Melbourne', 'Canberra', 'Perth']
        answer: 2
        explanation: 'Canberra is Australia’s capital city.'
      - id: 'q2'
        type: 'input'
        text: "Complete: 'Is this the real life? Is this just _____?'"
        answer: ['fantasy', 'fantsy']
        explanation: "This lyric is from Queen's Bohemian Rhapsody."
      - id: 'q3'
        type: 'true_false'
        text: 'Lightning is hotter than the surface of the sun.'
        answer: true
      - id: 'q4'
        type: 'poll'
        text: 'Which snack should the host bring to the next quiz night?'
        options: ['Popcorn', 'Nachos', 'Cookies', 'Fruit']
  - name: 'Round 2'
    questions:
      - id: 'q5'
        type: 'multi_select'
        text: 'Which of these are prime numbers?'
        options: ['2', '4', '5', '9']
        answer: [0, 2]
      - id: 'q6'
        type: 'slider'
        text: 'How many players are on a standard soccer team on the field at once?'
        min: 5
        max: 15
        step: 1
        answer: 11
  - name: 'Round 3'
    questions:
      - id: 'q7'
        type: 'open_ended'
        text: 'In one sentence, why do you like pub quizzes?'
        explanation: 'Open-ended questions allow longer text answers without being scored.'
      - id: 'q8'
        type: 'word_cloud'
        text: 'Describe your current mood in one word!'
        explanation: 'Word clouds aggregate repeated answers into a visual display.'
  - name: 'Round 4'
    questions:
      - id: 'q9'
        type: 'reorder'
        text: 'Order these historical events from earliest to most recent.'
        options: ['French Revolution', 'Moon Landing', 'Declaration of Independence']
        answer: [2, 0, 1]
```

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** SvelteKit, Tailwind CSS
- **Backend:** Node.js, Socket.io
- **Data Storage:** YAML (quizzes) and JSON (history)
- **Transparency:** Ships with an automatically generated SPDX 2.3 `sbom.json` for easy software supply chain auditing. Regenerate with `npm run sbom`.

> **Architecture Note:** Game state (rooms, active players) is held entirely in-memory for maximum speed. Restarting the server will wipe active games. Horizontal scaling (multiple instances) is not currently supported.

---

## Security & System Architecture

This section explains the security model for contributors. Understanding these protections helps avoid introducing vulnerabilities when adding features or changing socket/API behavior.

### Security Model Overview

| Layer                   | Protection                                                                                                                                                                    | Location                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Host auth**           | Username + password; scrypt hashing in config; session cookie; constant-time env fallback (SHA-256)                                                                           | `auth/index.ts`, `config.ts`, `api/auth/login`        |
| **Room password**       | Optional per-room password for player joins; same constant-time verification                                                                                                  | `socket.ts` `player:join`                             |
| **Kick & ban**          | Lightweight session moderation: host kicks; ban blocks rejoin by `playerId` (same browser/device). Bypassable via clear storage or incognito—not strong identity enforcement. | `socket.ts` `host:kick`, `player:join`                |
| **Content filters**     | Profanity filter + custom block list applied to names, emoji, open-ended, word cloud, input                                                                                   | `profanity.ts`, config, Settings API, socket handlers |
| **Player identity**     | Server-authoritative; client-supplied `playerId` ignored for register/answer                                                                                                  | `socket.ts`                                           |
| **Duplicate joins**     | Reject if `playerId` already connected                                                                                                                                        | `socket.ts` `player:join`                             |
| **Answer key exposure** | Role-aware serialization; players/projector get scrubbed quiz until reveal                                                                                                    | `socket.ts` `serializePlayerState`                    |
| **Input bounds**        | Name 50 chars; emoji 4 chars; answerText 75–200 chars (by type); truncation                                                                                                   | `socket.ts`                                           |
| **Rate limiting**       | Player join, host create/join, login, host get_state                                                                                                                          | `rate-limit.ts`                                       |
| **Path validation**     | Quiz filenames, images, archives; no `..` or traversal                                                                                                                        | `parser.ts`, API routes                               |
| **Privacy by design**   | In-memory state; nothing persists unless explicitly logged to history                                                                                                         | Game state lifecycle                                  |

### Key Architectural Decisions

**Server-authoritative player identity**  
The server assigns and binds `playerId` to the socket on join. `player:register` and all answer handlers use `socket.data.playerId` exclusively. Client-supplied `playerId` in payloads is ignored. This prevents impersonation and duplicate-ID abuse.

**Role-aware serialization**  
`broadcastStateToRoom` sends different state to host vs players/projector. Host receives full quiz (including answer keys). Players and projector receive a scrubbed quiz: `answer` is omitted for questions not yet revealed. On reveal, the current question’s answer is included for correct-answer highlighting.

**Input truncation**  
Over-long input (name, emoji, answerText) is truncated rather than rejected. This reduces DoS from huge payloads while keeping UX smooth. Character counters in the UI help users stay within limits.

**Projector and room password**  
The projector joins via `projector:join` (view-only; it does not appear as a player in the leaderboard). If the room has a player password, the projector shows a password form. The host can enter it to display the projector view.

### Security Disclosure

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue.
2. Email the maintainers or open a private security advisory (if the project supports it).
3. Include steps to reproduce, impact assessment, and any suggested fix.
4. Allow reasonable time for a fix before public disclosure.

We appreciate responsible disclosure and will acknowledge contributors who help improve security.

### For Contributors

When modifying socket handlers, auth, or serialization:

- **Never trust client-supplied identity.** Use `socket.data.playerId`, `socket.data.role`, and `socket.data.roomId` from the server session.
- **Preserve role-aware serialization.** Any new broadcast of game state must use `serializePlayerState` for players/projector and `serializeHostState` for host.
- **Bound all untrusted input.** Apply length limits and validation before storing or broadcasting.
- **Use `verifyPasswordConstantTime`** for any password comparison; do not use `===` on raw strings.
