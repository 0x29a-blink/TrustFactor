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
    npx playwright install chromium
    ```

3.  **Configure Environment:**
    Copy `.env.example` to `.env`. This project uses a **profile system** to switch between development and production easily.
    ```bash
    cp .env.example .env
    ```
    
    **Development (Local):**
    *   Set `BOT_PROFILE=dev` in your `.env` file.
    *   Fill in `DISCORD_TOKEN_DEV` and `CLIENT_ID_DEV` with your test bot credentials.
    *   For the database, we recommend using **Supabase CLI** for local testing (see below).
    
    **Production:**
    *   Set `BOT_PROFILE=main`.
    *   Fill in the `_MAIN` variables with your production credentials.

4.  **Local Database Setup (Supabase):**
    For local development, we use the Supabase CLI to spin up a local database instance. This keeps development isolated from the live production database.
    
    *   **Install Supabase CLI:** [Follow the official guide](https://supabase.com/docs/guides/cli).
    *   **Start Local Supabase:**
        Run the following command in the project root:
        ```bash
        supabase start
        ```
    *   **Update .env:**
        After starting, the CLI will output an `API URL` and a `service_role key`.
        *   Set `SUPABASE_URL_DEV` to the `API URL`.
        *   Set `SUPABASE_SERVICE_ROLE_DEV` to the `service_role key`.

    *   **Note:** The `main` branch and production deployments connect to a hosted Supabase project. Local usage is strictly for safe testing and development.

5.  **Deploy Commands:**
    Register slash commands with Discord:
    ```bash
    npm run deploy-commands
    ```

6.  **Start the Bot:**
    ```bash
    npm start
    # Or for development with hot-reload:
    npm run dev
    ```

## Database Maintenance

We maintain a single "master" SQL file to initialize the database, which keeps the setup process clean.

**Squashing Migrations:**
If you have multiple small migration files and want to combine them into the single master script:
1.  Make sure your local database is up to date with all changes.
2.  Run the following command to dump the current schema:
    ```bash
    supabase db dump > supabase/migrations/20240101000000_initial_schema.sql
    ```
3.  Delete any other `.sql` files in `supabase/migrations/` (since their logic is now inside the initial schema).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
