# How to Set Breakpoints and Debug in Cursor

## Quick Start - Easiest Method (Chrome DevTools)

**You don't need to start components differently!** Just use Chrome DevTools:

1. **Start your app normally:**
   ```bash
   npm run dev
   ```

2. **Open your app in Chrome** (http://localhost:3000)

3. **Open Chrome DevTools:**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)
   - Or right-click → "Inspect"

4. **Go to Sources tab** in DevTools

5. **Find your file:**
   - Look in the file tree on the left
   - Navigate to: `webpack://` → `src` → `components` → `Tournaments.tsx` (or any file)
   - Or use `Cmd+P` (Mac) / `Ctrl+P` (Windows) to search for files

6. **Set breakpoints:**
   - Click in the gutter (left of line numbers) to add a red dot
   - Breakpoints will hit when that code executes

7. **Debug:**
   - Use the controls: Resume (F8), Step Over (F10), Step Into (F11), Step Out (Shift+F11)
   - Check variables in the right panel
   - Use the Console tab to evaluate expressions

## Method 2: VS Code/Cursor Built-in Debugger

1. **Set breakpoints in Cursor:**
   - Click in the gutter (left of line numbers) to add a red dot
   - Or place cursor on line and press `F9`

2. **Start debugging:**
   - Press `F5` or go to Run & Debug panel (`Cmd+Shift+D`)
   - Select "Launch Chrome against localhost" from dropdown
   - Click the green play button

3. **The debugger will:**
   - Launch Chrome automatically
   - Hit your breakpoints in Cursor
   - Show variables, call stack, etc. in Cursor's debug panel

## Method 3: Attach to Running Chrome

If Chrome is already running:

1. **Start Chrome with debugging enabled:**
   ```bash
   # Mac
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   
   # Or add to Chrome shortcut: --remote-debugging-port=9222
   ```

2. **In Cursor:**
   - Press `F5`
   - Select "Attach to Chrome"
   - Your breakpoints in Cursor will work

## Tips

- **Source Maps**: Already enabled in `vite.config.ts` - your TypeScript files will be debuggable
- **Hot Reload**: Breakpoints persist through hot reloads
- **Conditional Breakpoints**: Right-click a breakpoint → "Edit Breakpoint" → add condition
- **Logpoints**: Right-click → "Add Logpoint" - logs without stopping execution

## Server-Side Debugging

For debugging the backend server:

1. **Set breakpoints** in server files (e.g., `server/src/routes/tournaments.ts`)

2. **Start debugging:**
   - Press `F5`
   - Select "Debug Server (Node)"
   - Or use "Launch Client + Server" to debug both

3. **Breakpoints will hit** when API endpoints are called

## No Special Startup Needed!

You can debug with your normal `npm run dev` command. The debugger attaches to the running process or launches Chrome with debugging enabled.

