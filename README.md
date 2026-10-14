# Event Marketplace Core

Core event marketplace — auth, events and tickets, quote/bid flows, event/vendor search listings, organizer and vendor dashboards, and external sync.

## Included
- Auth (JWT + Google)
- Events, tickets, bookings
- Quote / bid negotiation
- Event search listing page
- Vendor search / marketplace listing page
- Organizer dashboard + vendor dashboard
- Ticketmaster sync + OSM external vendors support modules

## Setup
1. Copy `.env.example` to `.env`
2. `npm install`
3. `npx prisma generate`
4. `npm run start:dev`

Extracted from production marketplace work under NDA. Branding removed from package metadata.
