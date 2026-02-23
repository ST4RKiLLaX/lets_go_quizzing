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

**Example Quiz Structure:**
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
```

---

## 🛠️ Tech Stack & Architecture

* **Frontend:** SvelteKit, Tailwind CSS
* **Backend:** Node.js, Socket.io
* **Data Storage:** YAML (quizzes) and JSON (history)
* **Transparency:** Ships with an automatically generated SPDX 2.3 `sbom.json` for easy software supply chain auditing. Regenerate with `npm run sbom`.

> **Architecture Note:** Game state (rooms, active players) is held entirely in-memory for maximum speed. Restarting the server will wipe active games. Horizontal scaling (multiple instances) is not currently supported.