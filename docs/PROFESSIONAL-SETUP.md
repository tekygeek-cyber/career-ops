# Professional Setup Guide

This guide is for setting up the Career Ops workspace in a clean, production-ready way, including local development and Netlify deployment for the static frontend and database-backed API.

## Prerequisites

Before you begin, make sure you have:

- Node.js 18 or newer
- npm
- Git
- A Netlify account with access to the project
- A browser for local testing

Optional but recommended:

- Netlify CLI (`npm install -g netlify-cli`)
- A local terminal with your preferred editor

## 1. Clone the repository

```bash
git clone https://github.com/tekygeek-cyber/career-ops.git
cd career-ops
```

## 2. Install dependencies

```bash
npm install
```

This installs the project toolchain, including the direct dependencies for the Netlify function and the Drizzle schema layer.

## 3. Configure environment

The project is designed to run without secrets for local use. For a production Netlify deployment, the database and function runtime are configured by the Netlify platform.

If you need local environment variables, copy the example file and adjust values as needed:

```bash
cp .env.example .env
```

The `.env.example` file is the place to keep project-specific local overrides or future API credentials if the project expands.

## 4. Run locally

Start the static frontend and function together with Netlify Dev:

```bash
netlify dev
```

This starts the local environment with:

- the static frontend served from `site/`
- the Netlify Function at `/api/*`
- local routing and SPA fallback behavior matching production

Open the local URL printed in the terminal (typically `http://localhost:8888` or similar) to verify the app.

## 5. Verify the app works

Check the key flows:

- dashboard loads without JS errors
- applications list renders
- add/edit/delete application works
- follow-ups render and toggle correctly
- settings page loads and sample data can be inserted

If you want to validate the backend API without the full UI, use the function directly or test through the browser by navigating through the app.

## 6. Netlify deployment

### Create a Netlify project

1. Log in to Netlify.
2. Import the repository.
3. Set the publish directory to `site`.
4. Keep the build command as the default or use the included Netlify configuration.

The repository already includes a `netlify.toml` and the app is configured to serve the static site from `site/` with SPA rewrites and `/api/*` routing.

### Deploy

```bash
netlify deploy --prod
```

After deployment, validate these production behaviors:

- `/` serves the app shell
- `/applications` and `/followups` work via SPA fallback
- `/api/applications` and related routes respond correctly
- the Netlify database tables are created through the configured migration flow

## 7. Recommended project workflow

Use the following pattern for day-to-day work:

1. Make local changes
2. Run `netlify dev` for verification
3. Test API flows and UI interactions
4. Commit changes
5. Deploy via Netlify or GitHub integration

## 8. Troubleshooting

### Static site does not load

- confirm the publish directory is `site`
- check that `netlify.toml` is present
- ensure browser console errors are not blocking startup

### API returns errors

- verify the function path is correct
- confirm the database is configured in Netlify
- check logs in the Netlify dashboard for runtime errors

### Form validation fails unexpectedly

- confirm values are submitted in the correct format
- review date strings for `YYYY-MM-DD`
- ensure no empty required fields are being sent

## 9. Production notes

This workspace is intentionally designed as a personal single-user app. If you want a more secure or team-ready version later, the next natural improvements are:

- authentication and access controls
- environment-based configuration
- stronger validation and audit logs
- broader role-based workspace permissions

## Summary

This setup keeps the project simple and robust:

- no JavaScript build step
- static frontend shipped from `site/`
- server-side requests handled by Netlify Functions
- persistent data stored in Netlify Database
- fast local iteration via `netlify dev`

For an even faster local onboarding flow, use this as a repeatable deployment checklist:

```bash
npm install
netlify dev
netlify deploy --prod
```
