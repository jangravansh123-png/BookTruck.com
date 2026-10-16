# BookTruck — Full-stack starter

## What's included
- Responsive BookTruck frontend (`public/index.html`, `style.css`, `app.js`)
- Express backend (`server.js`)
- Booking creation and lookup by Booking ID
- Driver/admin GPS coordinate update endpoint
- Status update endpoint
- JSON-file storage for local development

## Run locally
1. Install Node.js (LTS) from https://nodejs.org/
2. Open this folder in VS Code.
3. In the VS Code terminal run:
   ```bash
   npm install
   npm start
   ```
4. Open http://localhost:3000

## API examples
Create booking:
```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"customer":"Aman","phone":"9876543210","pickup":"Delhi","drop":"Jaipur","truckType":"Container Truck"}'
```

Look up a booking:
`GET /api/bookings/BOOKING_ID`

Update a booking's location (demo endpoint; add authentication before production):
```bash
curl -X PATCH http://localhost:3000/api/bookings/BOOKING_ID/location \
  -H "Content-Type: application/json" \
  -d '{"lat":28.6139,"lng":77.2090,"source":"driver phone"}'
```

Update status:
```bash
curl -X PATCH http://localhost:3000/api/bookings/BOOKING_ID/status \
  -H "Content-Type: application/json" \
  -d '{"status":"In Transit"}'
```

## Important before launch
This is a starter prototype, not a production logistics platform. JSON storage is for local testing only; use a database such as PostgreSQL in production. Add login/roles, OTP verification, input validation/rate limiting, HTTPS, driver assignment, secure admin endpoints, payment integration, quote calculation, and privacy controls. GPS only works when a driver app/browser explicitly shares real coordinates; this starter does not automatically locate trucks or provide live map tiles.