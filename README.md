# Sound Raspi Dashboard

A small production-oriented backend + EJS dashboard built with:

- Node.js
- TypeScript
- Express
- Socket.IO
- TypeORM
- MySQL
- EJS
- bcrypt
- jsonwebtoken

## Architecture

```
src/
├── config/
│   └── data-source.ts
├── entities/
│   ├── User.ts
│   ├── Device.ts
│   └── DeviceHistory.ts
├── routes/
│   ├── user.routes.ts
│   ├── device.routes.ts
│   └── history.routes.ts
├── controllers/
│   ├── user.controller.ts
│   ├── device.controller.ts
│   └── history.controller.ts
├── services/
│   ├── user.service.ts
│   ├── device.service.ts
│   └── history.service.ts
├── sockets/
│   └── device.socket.ts
├── utils/
│   └── ...
├── views/
│   ├── login.ejs
│   └── dashboard.ejs
├── public/
│   ├── css/
│   └── js/
├── app.ts
└── server.ts
```

## Environment Variables

Copy `.env.example` to `.env` and adjust values.

Required:

- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_DATABASE`
- `JWT_SECRET`
- `SOCKET_CORS_ORIGIN`

Optional local seed values:

- `INIT_ADMIN_NAME`
- `INIT_ADMIN_USERNAME`
- `INIT_ADMIN_PASSWORD`

## Installation

```bash
npm install
```

## MySQL Database Creation

```sql
CREATE DATABASE device_monitor;
```

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
npm start
```

## Socket.IO Contract (Project X -> This App)

### Incoming event name

`device:data`

### Incoming payload

```json
{
  "deviceId": 1,
  "timestamp": "2026-08-18T09:30:00.000Z",
  "data": [
    [12.2, 15.4, 18.1],
    [10.5, 14.2, 17.8],
    [8.1, 11.3, 16.4]
  ]
}
```

### Minimal sender example (Project X side)

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

socket.emit("device:data", {
  deviceId: 1,
  timestamp: new Date().toISOString(),
  data: [
    [1.2, 3.4, 5.6],
    [2.1, 4.5, 6.7]
  ]
});
```

### Outgoing event name (This App -> Web Clients)

`device:data`

Broadcast occurs only after payload validation + database persistence.

## REST API Summary

### Auth

- `POST /api/auth/login`

### Users (admin only)

- `GET /api/users`
- `POST /api/users`
- `GET /api/users/:id`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`

### Devices

- `GET /api/devices` (admin, emp)
- `POST /api/devices` (admin)
- `GET /api/devices/:id` (admin, emp)
- `PUT /api/devices/:id` (admin)
- `DELETE /api/devices/:id` (admin)

### History

- `GET /api/devices/:id/history?from=...&to=...` (admin, emp)
- If `from` and `to` are missing, latest 24 hours are returned.

## Authentication Behavior

- Login returns JWT token and user profile.
- API endpoints (except login) require `Authorization: Bearer <token>`.
- Roles:
  - `admin`: manage users/devices + view history/live data
  - `emp`: view devices/history/live data

## TypeORM Note

- Development uses `synchronize: true`.
- Production should use `synchronize: false`.
- No migrations are included intentionally.
- For production schema changes, coordinate and apply carefully.

## Security Notes

- Passwords are hashed with bcrypt.
- JWT secret is loaded from environment variables.
- No plaintext password storage.
- Do not keep default seed admin password in real environments.
