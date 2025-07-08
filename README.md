# um...gpt?

No accounts, no data collection, no AI? Just good old-fashioned human confusion over the internet.

## How It Works

- Users join as either a **chatter** (asks questions they dont actually need answered) or **chattee** (clock in as unpaid LLM).
- They’re randomly paired in real time using Socket.IO.
- Private, ephemeral, and gloriously confusing human converstaions ensue.

## Features

- AI-style UI, minus the AI.
- Random matchmaking.
- A fake CAPTCHA that punishes correct answers (to become a bot, you have to fail like a bot).
- Disclaimer hidden somewhere you’ll probably ignore.
- Free backend (Render) and static frontend (GitHub Pages).
- Costs $0. Humor value: variable.

## Working on it?

- so many small bugs in chat connection.
- Proper UI fixes...oof
- init messages fade in and then out
- show model change message for both users
- "taking a break" button for AI interns
- ?

## Local Development

```bash
# Clone and install backend
git clone https://github.com/D-Haz/um...gpt/tree/main/backend)
cd-backend
npm install
npm start

# Update frontend to use localhost if needed
