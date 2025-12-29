# Fly.io fly.toml Configuration

This document explains the `fly.toml` configuration file for your Fly.io deployment.

## Basic fly.toml

After running `flyctl launch`, you'll get a basic `fly.toml`. Update it as follows:

```toml
# App name (set when you ran flyctl launch)
app = "your-app-name"
primary_region = "iad"  # Your chosen region

# Build configuration
[build]
  # Use buildpacks for Node.js apps
  builder = "paketobuildpacks/builder:base"

# Environment variables (use flyctl secrets for sensitive data)
[env]
  PORT = "3000"
  NODE_ENV = "production"

# HTTP service configuration
[http_service]
  internal_port = 3000  # Port your app listens on
  force_https = true    # Automatically redirect HTTP to HTTPS
  auto_stop_machines = true    # Stop machines when idle (saves money)
  auto_start_machines = true   # Start machines when traffic arrives
  min_machines_running = 0     # No machines running when idle
  processes = ["app"]          # Process name

# HTTP checks (health checks)
[[http_service.checks]]
  interval = "10s"
  timeout = "2s"
  grace_period = "5s"
  method = "GET"
  path = "/api/health"
  protocol = "http"
  tls_skip_verify = false

# Services
[[services]]
  http_checks = []
  internal_port = 3000
  processes = ["app"]
  protocol = "tcp"
  script_checks = []

  # External port (usually 80/443, handled by Fly.io)
  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

## Alternative: Using Dockerfile

If you want to use a Dockerfile instead of buildpacks:

```toml
app = "your-app-name"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[http_service.checks]]
  interval = "10s"
  timeout = "2s"
  grace_period = "5s"
  method = "GET"
  path = "/api/health"
  protocol = "http"

[[services]]
  internal_port = 3000
  processes = ["app"]
  protocol = "tcp"
```

## Configuration Options Explained

### App Name
- Must be unique across all Fly.io apps
- Cannot be changed after creation

### Primary Region
Choose based on your users:
- `iad` - Washington, D.C. (US East)
- `sjc` - San Jose (US West)
- `lhr` - London (Europe)
- `nrt` - Tokyo (Asia)
- See full list: `flyctl regions list`

### Internal Port
- Port your Node.js app listens on
- Should match `PORT` environment variable
- Default: 3000

### Auto Stop/Start Machines
- **auto_stop_machines**: Stops machines when no traffic (saves money)
- **auto_start_machines**: Starts machines when traffic arrives
- **min_machines_running**: Keep at least N machines running (0 = all can stop)

### Health Checks
- Fly.io checks `/api/health` every 10 seconds
- If health check fails, Fly.io restarts the machine
- **interval**: How often to check
- **timeout**: How long to wait for response
- **grace_period**: Wait before first check after startup

## Scaling Configuration

### Vertical Scaling (More Resources)
```toml
[env]
  # Set via flyctl scale vm
  # flyctl scale vm shared-cpu-1x  # 1 shared CPU, 256MB RAM
  # flyctl scale vm shared-cpu-2x  # 2 shared CPUs, 512MB RAM
  # flyctl scale vm performance-1x # 1 dedicated CPU, 2GB RAM
```

### Horizontal Scaling (More Machines)
```toml
[http_service]
  min_machines_running = 1  # Keep at least 1 running
  # Set count via: flyctl scale count 2
```

## Process Configuration

For multi-process apps (not needed for single Express server):

```toml
[[processes]]
  name = "app"
  [processes.env]
    PORT = "3000"
```

## Regions and High Availability

Deploy to multiple regions for HA:

```bash
flyctl regions add lhr  # Add London region
flyctl regions list     # List all regions
```

## Environment Variables vs Secrets

### Environment Variables (fly.toml)
- For non-sensitive config
- Committed to git
- Example: `NODE_ENV`, `PORT`

### Secrets (flyctl secrets set)
- For sensitive data
- NOT in fly.toml
- Example: `DATABASE_URL`, `JWT_SECRET`

## Complete Example for Your App

```toml
app = "pingpong-api"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

  [[http_service.checks]]
    interval = "10s"
    timeout = "2s"
    grace_period = "5s"
    method = "GET"
    path = "/api/health"
    protocol = "http"

[[services]]
  internal_port = 3000
  processes = ["app"]
  protocol = "tcp"
```

## Validating Configuration

```bash
# Validate fly.toml
flyctl config validate

# Show parsed config
flyctl config show

# Show current app config
flyctl config save -a your-app-name
```

## Common Issues

### Port Mismatch
- **Error**: Connection refused
- **Fix**: Ensure `internal_port` matches what your app listens on

### Health Check Failing
- **Error**: Machine keeps restarting
- **Fix**: Verify `/api/health` endpoint exists and returns 200

### Region Issues
- **Error**: High latency
- **Fix**: Choose region closer to users or database


