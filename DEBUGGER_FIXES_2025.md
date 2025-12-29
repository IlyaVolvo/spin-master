# Debugger Configuration Fixes - December 2025

## Problems Identified and Fixed

### 1. **Compound Configuration Using "Attach" Instead of "Launch"**
   **Problem**: The "Debug Client + Server" compound configuration was using "Attach to Client (Chrome)" which requires Chrome to already be running with remote debugging enabled on port 9222. This was error-prone and required manual setup.

   **Fix**: 
   - Changed compound configuration to use "Debug Client (Chrome) - No PreLaunch" which automatically launches Chrome
   - Created a new configuration "Debug Client (Chrome) - No PreLaunch" specifically for compound use to avoid double-starting the client server

### 2. **Missing Wait Pattern for Background Tasks**
   **Problem**: Background tasks didn't have proper wait patterns to detect when Vite dev server was ready before launching Chrome.

   **Fix**:
   - Added `problemMatcher` with background detection patterns for `start-client` and `start-client-server` tasks
   - Pattern waits for Vite's "Local: http://localhost:3000" output before proceeding
   - This ensures Chrome doesn't launch before the dev server is ready

### 3. **Duplicate Client Server Starts**
   **Problem**: Compound configuration's preLaunchTask would start the client, then "Debug Client (Chrome)" would try to start it again via its own preLaunchTask.

   **Fix**:
   - Created "Debug Client (Chrome) - No PreLaunch" configuration without a preLaunchTask
   - Compound configuration's preLaunchTask starts the client once
   - Individual configurations use their own preLaunchTasks when run alone

### 4. **Missing Timeouts**
   **Problem**: Chrome debugger configurations had no timeout, which could cause hanging if server wasn't ready.

   **Fix**:
   - Added `"timeout": 30000` (30 seconds) to Chrome launch configurations
   - Added `"timeout": 3000` (3 seconds) to Chrome attach configuration

### 5. **Task Dependency Order**
   **Problem**: `start-client-server` was using "parallel" order which could cause race conditions.

   **Fix**:
   - Changed `dependsOrder` to "sequence" to ensure port cleanup happens before client starts
   - Removed redundant `isBackground: true` from compound task (it inherits from dependencies)

## Configuration Files Modified

1. **`.vscode/launch.json`**:
   - Added "Debug Client (Chrome) - No PreLaunch" configuration
   - Fixed compound configuration to use launch instead of attach
   - Added timeouts to all Chrome configurations

2. **`.vscode/tasks.json`**:
   - Added background problem matcher with Vite wait patterns
   - Fixed task dependency ordering
   - Removed duplicate problemMatcher definitions

## How to Use

### Debug Server Only
1. Press `F5`
2. Select "Debug Server (compiled) - RECOMMENDED" or "Debug Server (tsx watch)"
3. Set breakpoints in server TypeScript files

### Debug Client Only
1. Press `F5`
2. Select "Debug Client (Chrome)"
3. Set breakpoints in client TypeScript files

### Debug Both Client and Server
1. Press `F5`
2. Select "Debug Client + Server"
3. Set breakpoints in both client and server files
4. The configuration will:
   - Clean up ports 3000 and 3001
   - Start the client dev server (waits for it to be ready)
   - Launch the server debugger
   - Launch Chrome with debugging enabled

### Attach to Running Chrome (Manual)
1. Start Chrome manually with remote debugging:
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```
2. Press `F5`
3. Select "Attach to Client (Chrome)"

## Testing

To verify the fixes work:

1. **Test individual configurations**:
   - Try "Debug Server (compiled) - RECOMMENDED"
   - Try "Debug Client (Chrome)"
   - Verify breakpoints work

2. **Test compound configuration**:
   - Try "Debug Client + Server"
   - Verify both client and server start correctly
   - Verify breakpoints work in both

3. **Check for errors**:
   - Look for timeout errors (should be resolved)
   - Check that Chrome doesn't launch before Vite is ready
   - Verify no duplicate server starts

## Notes

- The background task matcher waits for Vite's output showing "Local: http://localhost:3000"
- All configurations now have appropriate timeouts
- Source maps are enabled for both client and server debugging
- The compound configuration properly sequences tasks to avoid conflicts



