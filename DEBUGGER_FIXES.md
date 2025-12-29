# Debugger Configuration Fixes

## Issues Fixed

### 1. Server Source Maps Configuration
**Problem**: `server/tsconfig.json` was using `inlineSourceMap: true` which embeds source maps in JavaScript files, making debugging harder.

**Fix**: Changed to `sourceMap: true` and `inlineSourceMap: false` to generate separate `.map` files that work better with VS Code/Cursor debugger.

### 2. Server Environment Variables
**Problem**: Debug configurations weren't loading `.env` file automatically.

**Fix**: Added `"envFile": "${workspaceFolder}/server/.env"` to both server debug configurations.

### 3. Client Debugging Configuration
**Problem**: No configuration existed to debug the React/Vite client application.

**Fixes Applied**:
- Added "Debug Client (Chrome)" configuration to launch Chrome and debug the client
- Added "Attach to Client (Chrome)" configuration to attach to an already running Chrome instance
- Added "Debug Client + Server" compound configuration to debug both simultaneously
- Added source map path overrides for Vite's module resolution

### 4. Missing Tasks
**Problem**: No tasks existed to start the client for debugging.

**Fix**: Added `start-client` and `start-client-server` tasks to `tasks.json`.

### 5. Trace Logging
**Problem**: Trace logging was enabled causing excessive output.

**Fix**: Changed `"trace": true` to `"trace": false` in the compiled server debug configuration.

### 6. Improved tsx Debugger
**Problem**: The tsx debugger configuration had a note saying "Breakpoints may not work".

**Fix**: 
- Added `--inspect` flag to enable proper debugging
- Improved environment variable handling
- Added `.env` file loading

## How to Use

### Debug Server Only

1. **Recommended - Compiled**: Use "Debug Server (compiled) - RECOMMENDED"
   - Builds the server first
   - Most reliable breakpoints
   - F5 → Select configuration → Start debugging

2. **Development - tsx watch**: Use "Debug Server (tsx watch)"
   - Uses tsx watch for hot reloading
   - Set breakpoints in TypeScript files
   - F5 → Select configuration → Start debugging

### Debug Client Only

1. **Launch Chrome**: Use "Debug Client (Chrome)"
   - Automatically starts the client
   - Launches Chrome with debugging enabled
   - F5 → Select configuration → Start debugging

2. **Attach to Running Chrome**: Use "Attach to Client (Chrome)"
   - Start Chrome manually with: `chrome --remote-debugging-port=9222`
   - Or start client with `npm start` in client directory
   - F5 → Select configuration → Attach

### Debug Both Client and Server

Use "Debug Client + Server" compound configuration:
- F5 → Select "Debug Client + Server"
- This will start the client and attach to server simultaneously
- Set breakpoints in both client and server files

## Prerequisites

1. **Server `.env` file**: Ensure `server/.env` exists with proper configuration
2. **Build server first** (for compiled debug): Run `cd server && npm run build` if using compiled debug
3. **Chrome installed**: Required for client debugging

## Tips

- Breakpoints work in TypeScript source files, not compiled JavaScript
- Source maps are automatically generated on build
- Use Chrome DevTools (F12) as an alternative for client debugging
- Server logs will appear in the integrated terminal

## Troubleshooting

### Breakpoints not hitting in server?
1. Check that source maps were generated: `ls server/dist/*.map`
2. Rebuild: `cd server && npm run build`
3. Ensure `.env` file exists and is properly configured

### Breakpoints not hitting in client?
1. Check that Vite dev server is running on port 3000
2. Verify source maps are enabled (they are by default in dev mode)
3. Try using Chrome DevTools directly (F12) first

### Can't attach to Chrome?
1. Make sure Chrome isn't already running (kill all Chrome processes)
2. Start Chrome with: `/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222`
3. Or use the "Launch" configuration instead of "Attach"

