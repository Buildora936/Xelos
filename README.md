
# XELOS

Modern, modular and secure e-commerce frontend.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript with ES modules
- Supabase for authentication and database access
- GitHub for source control and deployment preparation

## Project structure

- `css/core/` — design tokens and foundational styles
- `css/components/` — reusable UI components
- `css/pages/` — page-specific styles
- `js/` — frontend logic and services
- `assets/` — images, icons, logos and fonts
- `admin/` — administration interface
- Root HTML files — public storefront and customer pages

## Development rules

1. Keep database access in dedicated JavaScript modules.
2. Centralize the Supabase client in `js/supabase.js`.
3. Never commit private API keys, passwords or service-role keys.
4. Validate authorization on the server; frontend checks alone are insufficient.
5. Use demo data until the relevant database permissions are validated.
6. Build and test one module at a time.

## Development status

Day 1 — Repository organization and conventions.
