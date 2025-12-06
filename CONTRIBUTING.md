# Contributing to TrustFactor

Thank you for your interest in contributing to TrustFactor! We welcome contributions from the community to help make this bot better for everyone.

This guide will help you get started with contributing to the project.

## Getting Started

1.  **Fork the Repository:** Click the "Fork" button on the top right of the repository page to create your own copy of the project.
2.  **Clone your Fork:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/TrustFactor.git
    cd TrustFactor
    ```
3.  **Install Dependencies:**
    ```bash
    npm install
    npx playwright install chromium
    ```
4.  **Set up Environment:**
    Copy `.env.example` to `.env` and fill in the necessary credentials (see `README.md` for details).

## Development Workflow

1.  **Create a Branch:** improved-feature-name` or `fix/issue-description`.
    ```bash
    git checkout -b feature/my-cool-feature
    ```
2.  **Make your Changes:** Write clear, maintainable code and follow the existing style.
3.  **Run Tests:** (If applicable) Ensure existing tests pass and add new ones for your changes.
    ```bash
    npm test
    ```

## Code Quality & Linting

We use `eslint` to maintain code quality and consistency. **Before submitting a Pull Request, you must ensure your code passes the linter.**

*   **Check for Linting Errors:**
    Run this command to see if there are any style or syntax issues:
    ```bash
    npm run lint
    ```

*   **Automatically Fix Linting Errors:**
    Many issues can be fixed automatically. Run:
    ```bash
    npm run lint:fix
    ```

**Please run `npm run lint:fix` before committing your changes.** This saves time during the review process.

## Database Migrations

If your changes involve the database schema, you must manage them using the **Supabase CLI**. We do not manually edit the live database schema.

**1. Create a Migration:**
To create a new migration file, run:
```bash
supabase migration new <name_of_change>
```
This will generate a new SQL file in `supabase/migrations/`. You can edit this file to include your SQL changes (e.g., `CREATE TABLE`, `ALTER TABLE`).

**2. Apply Changes Locally:**
To apply your new migration to your local development database:
```bash
supabase db reset
```
*Note: This will reset your local database and re-apply all migrations.*

**3. Verify:**
*   Ensure your local app works with the new schema.
*   Consult the `package.json` scripts or `README.md` for security and performance verification commands.

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

## Submitting a Pull Request

1.  **Push your Branch:**
    ```bash
    git push origin feature/my-cool-feature
    ```
2.  **Open a Pull Request:** Go to the original repository on GitHub and click "New Pull Request".
3.  **Describe your Changes:** Provide a clear description of what you did and why. Link to any relevant issues.

## Reporting Issues

If you find a bug or have a feature request, please use the [GitHub Issues](https://github.com/0x29a-blink/TrustFactor/issues) page.

Thank you for contributing!
