# Let's Go Quizzing
> *Now with 100% less database!*

A blazingly fast, real-time multiplayer trivia app stripped to the studs. Built for anyone who wants to host a live game without wrestling with databases, tracking cookies, or login walls.

## ✨ Core Features
* ⚡ **True Real-Time Sync:** Powered entirely by WebSockets. No clunky API polling.
* 🗂️ **Zero-Bloat Architecture:** Entirely file-based. Quizzes are read from simple YAML files, and game history is logged to JSON.
* 🎮 **Dedicated Game Views:** Mobile-first player inputs, a powerful Host control center with manual scoring overrides, and a distraction-free Projector view for the big screen.
* 🛡️ **Built-In Security:** Stateful role authentication and websocket rate-limiting prevent event flooding and spoofing.
* 📝 **Frictionless Quiz Creation:** Simple plain-text authoring with a built-in lightweight YAML editor.

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

## 🐳 Deployment (Docker)
The recommended way to run this application in production is via Docker. 

### Option 1: Docker Compose (Recommended)
1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and set your `HOST_PASSWORD`.
3. Deploy the stack:
   ```bash
   docker compose up -d --build
   ```

### Option 2: Docker Run
To run a standalone container with persistent data and a host password:
```bash
docker build -t lets-go-quizzing .

docker run -d \
  -p 3000:3000 \
  -e HOST_PASSWORD=your_secure_password \
  -v /path/to/host/data:/app/data \
  lets-go-quizzing
```

> **Note on Permissions:** The container runs as a non-root user. If you encounter permission errors writing to your mapped `data/` volume, run `chown -R 1001:1001 /path/to/host/data` on your host machine.

---

## ⚙️ Configuration & Environment Variables

Whether you are using a `.env` file, Docker environment variables, or standard shell exports, you can configure the app using the following variables:

| Variable | Description | Required? |
| :--- | :--- | :--- |
| `HOST_PASSWORD` | Secures the Host and Quiz Creator controls. If left blank, hosting and creating quizzes is disabled. | **Yes** (for hosting) |
| `ORIGIN` | A comma-separated list of allowed origins (e.g., `https://quiz.example.com`). **Must be set in production** to prevent Socket.io CORS rejections. | **Yes** (in Prod) |
| `ROOM_ID_LEN` | Length of the generated room code. Default is `6`. | No |
| `ADDRESS_HEADER`| Set to `x-forwarded-for` if running behind a proxy so rate limits apply to real client IPs, not the proxy IP. | No |

> **Local development:** The dev server runs at `http://localhost:5173`. If Socket.io rejects connections, set `ORIGIN=http://localhost:5173` in your `.env`.

### Reverse Proxy Setup (Nginx, Cloudflare, Traefik, etc.)
When running behind a reverse proxy that handles TLS/SSL, ensure you forward the correct headers so secure cookies and websockets function properly:
* Forward the real IP: `proxy_set_header X-Forwarded-For $remote_addr;`
* Terminate TLS correctly: `proxy_set_header X-Forwarded-Proto $scheme;`

---

## 📝 Creating Quizzes

You can use the built-in **Quiz Creator** at `/creator` to author games directly in your browser, or you can drop manually written `.yaml` files into the `data/quizzes/` directory.

### Question Types

| Type | Description | Scoring |
| :--- | :--- | :--- |
| `choice` | Multiple choice: pick one correct option | ✓ |
| `true_false` | True or false | ✓ |
| `poll` | Opinion poll; no correct answer | — |
| `multi_select` | Choose multiple correct options | ✓ |
| `slider` | Numeric value within a range | ✓ |
| `input` | Fill in the blank (exact or fuzzy match) | ✓ |
| `open_ended` | Long text response; not scored | — |
| `word_cloud` | Short text aggregated into a visual cloud | — |
| `reorder` | Arrange options in the correct order | ✓ |
| `hotspot` | Tap a region on an image (e.g. map, diagram) | ✓ |

Scored question types support an optional `points` multiplier (e.g. `points: 2` = double points, `points: 3` = triple). Default is 1. Works in both Standard and Ranked modes.

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
  options: ["2", "4", "5", "9"]
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

**hotspot** — Tap a region on an image. Requires `image`, `answer` with `x`, `y` (0–1, center), and `radius` (tolerance as fraction, e.g. 0.1 = 10%). Use the Form editor to click the image to set the target:
```yaml
- id: q10
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

The tracked sample quiz at `data/quizzes/quiz_reference_sample.yml` includes all of the above types. A complete example:
```yaml
meta:
  name: "Pub Quiz Night"
  author: "Quizmaster"
  default_timer: 30
  # Optional: choice option labels in views: "letters" (A,B,C) or "numbers" (1,2,3)
  option_label_style: "letters"

rounds:
  - name: "Round 1"
    questions:
      - id: "q1"
        type: "choice"
        text: "What is the capital of Australia?"
        options: ["Sydney", "Melbourne", "Canberra", "Perth"]
        answer: 2
        explanation: "Canberra is Australia’s capital city."
      - id: "q2"
        type: "input"
        text: "Complete: 'Is this the real life? Is this just _____?'"
        answer: ["fantasy", "fantsy"]
        explanation: "This lyric is from Queen's Bohemian Rhapsody."
      - id: "q3"
        type: "true_false"
        text: "Lightning is hotter than the surface of the sun."
        answer: true
      - id: "q4"
        type: "poll"
        text: "Which snack should the host bring to the next quiz night?"
        options: ["Popcorn", "Nachos", "Cookies", "Fruit"]
  - name: "Round 2"
    questions:
      - id: "q5"
        type: "multi_select"
        text: "Which of these are prime numbers?"
        options: ["2", "4", "5", "9"]
        answer: [0, 2]
      - id: "q6"
        type: "slider"
        text: "How many players are on a standard soccer team on the field at once?"
        min: 5
        max: 15
        step: 1
        answer: 11
  - name: "Round 3"
    questions:
      - id: "q7"
        type: "open_ended"
        text: "In one sentence, why do you like pub quizzes?"
        explanation: "Open-ended questions allow longer text answers without being scored."
      - id: "q8"
        type: "word_cloud"
        text: "Describe your current mood in one word!"
        explanation: "Word clouds aggregate repeated answers into a visual display."
  - name: "Round 4"
    questions:
      - id: "q9"
        type: "reorder"
        text: "Order these historical events from earliest to most recent."
        options: ["French Revolution", "Moon Landing", "Declaration of Independence"]
        answer: [2, 0, 1]
```

---

## 🛠️ Tech Stack & Architecture

* **Frontend:** SvelteKit, Tailwind CSS
* **Backend:** Node.js, Socket.io
* **Data Storage:** YAML (quizzes) and JSON (history)
* **Transparency:** Ships with an automatically generated SPDX 2.3 `sbom.json` for easy software supply chain auditing. Regenerate with `npm run sbom`.

> **Architecture Note:** Game state (rooms, active players) is held entirely in-memory for maximum speed. Restarting the server will wipe active games. Horizontal scaling (multiple instances) is not currently supported.

---

## Security & System Architecture

This section explains the security model for contributors. Understanding these protections helps avoid introducing vulnerabilities when adding features or changing socket/API behavior.

### Security Model Overview

| Layer | Protection | Location |
|-------|------------|----------|
| **Host auth** | Cookie or password; constant-time comparison (SHA-256 + `timingSafeEqual`) | `auth/index.ts`, `api/auth/login` |
| **Room password** | Optional per-room password for player joins; same constant-time verification | `socket.ts` `player:join` |
| **Player identity** | Server-authoritative; client-supplied `playerId` ignored for register/answer | `socket.ts` |
| **Duplicate joins** | Reject if `playerId` already connected | `socket.ts` `player:join` |
| **Answer key exposure** | Role-aware serialization; players/projector get scrubbed quiz until reveal | `socket.ts` `serializePlayerState` |
| **Input bounds** | Name 50 chars; emoji 4 chars; answerText 75–200 chars (by type); truncation | `socket.ts` |
| **Rate limiting** | Player join, host create/join, login, host get_state | `rate-limit.ts` |
| **Path validation** | Quiz filenames, images, archives; no `..` or traversal | `parser.ts`, API routes |
| **Privacy by design** | In-memory state; nothing persists unless explicitly logged to history | Game state lifecycle |

### Key Architectural Decisions

**Server-authoritative player identity**  
The server assigns and binds `playerId` to the socket on join. `player:register` and all answer handlers use `socket.data.playerId` exclusively. Client-supplied `playerId` in payloads is ignored. This prevents impersonation and duplicate-ID abuse.

**Role-aware serialization**  
`broadcastStateToRoom` sends different state to host vs players/projector. Host receives full quiz (including answer keys). Players and projector receive a scrubbed quiz: `answer` is omitted for questions not yet revealed. On reveal, the current question’s answer is included for correct-answer highlighting.

**Input truncation**  
Over-long input (name, emoji, answerText) is truncated rather than rejected. This reduces DoS from huge payloads while keeping UX smooth. Character counters in the UI help users stay within limits.

**Projector and room password**  
The projector joins via `player:join`. If the room has a player password, the projector shows a password form instead of redirecting. The host (who set the password) can enter it to display the projector view.

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