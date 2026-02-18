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

```bash
docker build -t lets-go-quizzing .
docker run -p 3000:3000 lets-go-quizzing
```

With host password (optional):

```bash
docker run -e HOST_PASSWORD=yourpassword -p 3000:3000 lets-go-quizzing
```

## Host Password (optional)

To require a password before creating/hosting a quiz, set the `HOST_PASSWORD` environment variable:

- **Shell**: `export HOST_PASSWORD=mysecret` then `npm run start`
- **Inline**: `HOST_PASSWORD=mysecret npm run start`
- **.env file**: Add `HOST_PASSWORD=mysecret` to a `.env` file in the project root (ensure `.env` is in `.gitignore`)
- **Docker**: `-e HOST_PASSWORD=mysecret`

When set, users must enter the password when clicking "Create Room" to host a quiz.

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
