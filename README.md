# TrustFactor Discord Bot

TrustFactor is a community-driven Discord bot designed to track user scores through a voting system. It empowers server members to recognize positive contributions and build a reputation system within the community.

## Features

*   **Score Tracking:** Users can award points to each other, building a "Trust Factor" score.
*   **Voting System:** Community-driven voting mechanisms to validate scores or decisions.
*   **Leaderboards:** View top-ranking members based on their trust scores.
*   **Administration:** Robust admin commands for managing scores and bot configurations.
*   **Configurable:** Customize the bot's behavior to fit your server's needs.

## Tech Stack

*   **Node.js** (>=18.0.0)
*   **Discord.js** (v14)
*   **Supabase** (Database & Realtime)

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/0x29a-blink/TrustFactor.git
    cd TrustFactor
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Copy `.env.example` to `.env` and fill in your credentials:
    ```bash
    cp .env.example .env
    ```
    Required variables include:
    *   `DISCORD_TOKEN`: Your Discord Bot Token.
    *   `SUPABASE_URL`: Your Supabase Project URL.
    *   `SUPABASE_KEY`: Your Supabase Anon Key.
    *   `CLIENT_ID`: Discord Application ID.
    *   `GUILD_ID`: (Optional) Development Guild ID for instant command registration.

4.  **Deploy Commands:**
    Register slash commands with Discord:
    ```bash
    npm run deploy-commands
    ```

5.  **Start the Bot:**
    ```bash
    npm start
    # Or for development with hot-reload:
    npm run dev
    ```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
