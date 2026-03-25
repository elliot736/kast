# Kast

**Open-source, event-driven job & pipeline monitor.**

Kast watches your cron jobs, scheduled tasks, and data pipelines. When a job doesn't ping on time, runs too long, or reports a failure, Kast alerts you through Slack, Discord, email, webhooks, PagerDuty, or Telegram.

Built on Redpanda (Kafka-compatible), every event is durable and replayable. No polling — real-time streaming to your dashboard.

## Quickstart

```bash
git clone https://github.com/your-org/kast.git
cd kast
pnpm install
docker compose up -d redpanda postgres
cd apps/api && pnpm db:migrate
cd ../..
pnpm dev
```

- **API**: http://localhost:3001
- **Dashboard**: http://localhost:3000
- **Swagger docs**: http://localhost:3001/api/docs
- **Redpanda Console**: http://localhost:28080

### First monitor in 60 seconds

```bash
# 1. Create an API key
curl -X POST http://localhost:3001/api/v1/api-keys \
  -H 'Content-Type: application/json' \
  -d '{"label": "my-app"}'
# Save the returned key

# 2. Create a monitor
curl -X POST http://localhost:3001/api/v1/monitors \
  -H 'x-api-key: kst_YOUR_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"name": "DB Backup", "slug": "db-backup", "schedule": "0 3 * * *"}'
# Note the pingUuid in the response

# 3. Add to your cron job
curl -fsS --retry 3 http://localhost:3001/ping/PING_UUID/success
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│                NestJS Process                     │
│                                                   │
│  PingModule → publishes to ping-events            │
│  SinkModule → consumes → writes to Postgres       │
│  ScheduleModule → evaluates cron → detects late   │
│  IncidentModule → opens/resolves incidents         │
│  NotifyModule → dispatches Slack/Discord/etc       │
│  WebSocketGateway → pushes to dashboard            │
│  ReplayModule → seeks Redpanda offsets → SSE       │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │         Redpanda (Kafka-compatible)          │  │
│  │  7 topics · partitioned by monitor UUID      │  │
│  └─────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────┐  │
│  │     PostgreSQL (Drizzle ORM projections)     │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Data flow**: Job sends HTTP ping → PingModule publishes to `ping-events` → SinkModule writes to Postgres → ScheduleModule evaluates schedule → IncidentModule opens incidents → NotifyModule dispatches alerts → WebSocket pushes to dashboard.

## Ping Protocol

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ping/:uuid` | GET | Simple success ping |
| `/ping/:uuid/start` | POST | Job started |
| `/ping/:uuid/success` | POST | Job succeeded |
| `/ping/:uuid/fail` | POST | Job failed (body = error output) |
| `/ping/:uuid/log` | POST | Append log output |

### Integration examples

**Bash**
```bash
curl -fsS --retry 3 https://kast.example.com/ping/UUID/start
./my-backup-script.sh
curl -fsS --retry 3 https://kast.example.com/ping/UUID/success
```

**Python**
```python
import requests
requests.post("https://kast.example.com/ping/UUID/start")
try:
    run_job()
    requests.get("https://kast.example.com/ping/UUID/success")
except Exception as e:
    requests.post("https://kast.example.com/ping/UUID/fail", data=str(e))
```

**Node.js**
```javascript
await fetch("https://kast.example.com/ping/UUID/start", { method: "POST" });
try {
  await runJob();
  await fetch("https://kast.example.com/ping/UUID/success");
} catch (err) {
  await fetch("https://kast.example.com/ping/UUID/fail", {
    method: "POST", body: err.message
  });
}
```

## API Reference

Full Swagger docs at `/api/docs` when the API is running.

### Management API (requires `x-api-key` header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/monitors` | Create monitor |
| GET | `/api/v1/monitors` | List monitors (filter: `status`, `tag`, `teamId`) |
| GET | `/api/v1/monitors/:id` | Get monitor |
| PATCH | `/api/v1/monitors/:id` | Update monitor |
| DELETE | `/api/v1/monitors/:id` | Delete monitor |
| POST | `/api/v1/monitors/:id/pause` | Pause monitoring |
| POST | `/api/v1/monitors/:id/resume` | Resume monitoring |
| GET | `/api/v1/monitors/:id/pings` | Ping history |
| GET | `/api/v1/monitors/:id/stats` | Uptime %, avg runtime, failure rate |
| GET | `/api/v1/incidents` | List incidents (filter: `status`) |
| GET | `/api/v1/incidents/:id` | Incident detail |
| POST | `/api/v1/incidents/:id/acknowledge` | Acknowledge incident |
| POST | `/api/v1/alert-configs` | Create alert config |
| GET | `/api/v1/alert-configs` | List alert configs |
| DELETE | `/api/v1/alert-configs/:id` | Delete alert config |
| GET | `/api/v1/dead-letters` | Failed alert deliveries |
| POST | `/api/v1/dead-letters/:id/retry` | Retry failed delivery |
| POST | `/api/v1/replay` | Start replay session |
| GET | `/api/v1/replay/:id` | Replay session status |
| GET | `/api/v1/replay/:id/events` | Stream replayed events (SSE) |
| POST | `/api/v1/teams` | Create team |
| GET | `/api/v1/teams` | List teams |
| DELETE | `/api/v1/teams/:id` | Delete team |
| POST | `/api/v1/api-keys` | Create API key (public) |
| GET | `/api/v1/api-keys` | List API keys |
| DELETE | `/api/v1/api-keys/:id` | Revoke API key |

## Alert Channels

| Channel | Status | Destination format |
|---------|--------|--------------------|
| Slack | Ready | Incoming webhook URL |
| Discord | Ready | Webhook URL |
| Email | Stub (needs SMTP config) | Email address |
| Webhook | Ready | Any HTTP URL |
| PagerDuty | Ready | Integration/routing key |
| Telegram | Ready | Chat ID (requires `botToken` in config) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `KAFKA_BROKERS` | `localhost:29092` | Redpanda/Kafka broker addresses |
| `KAFKA_CLIENT_ID` | `kast-api` | Kafka client identifier |
| `API_PORT` | `3001` | API server port |
| `NODE_ENV` | `development` | Environment |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |
| `PING_RETENTION_DAYS` | `30` | Days to keep ping records |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS (Node.js/TypeScript) |
| Event streaming | Redpanda (Kafka-compatible) |
| Database | PostgreSQL + Drizzle ORM |
| Frontend | Next.js + shadcn/ui + Tailwind CSS |
| Real-time | Socket.IO (WebSocket) |
| Charts | Recharts |
| Monorepo | Turborepo + pnpm |

## Project Structure

```
kast/
├── apps/
│   ├── api/          # NestJS backend (14 modules)
│   └── web/          # Next.js dashboard (13 pages)
├── tests/e2e/        # Playwright API tests (37 tests)
├── docker-compose.yml
└── turbo.json
```

## Development

```bash
pnpm install                    # Install dependencies
docker compose up -d redpanda postgres  # Start infra
cd apps/api && pnpm db:migrate  # Run migrations
pnpm dev                        # Start API + dashboard

# Run E2E tests
pnpm test:e2e
```

## License

MIT
