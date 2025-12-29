# Debugging Guide - Where to Find Errors

## Browser Console (Primary Location)

**How to Open:**
- **Chrome/Edge**: Press `F12` or `Ctrl+Shift+I` (Windows/Linux) / `Cmd+Option+I` (Mac)
- **Firefox**: Press `F12` or `Ctrl+Shift+K` (Windows/Linux) / `Cmd+Option+K` (Mac)
- **Safari**: Press `Cmd+Option+I` (Mac, requires enabling Developer menu first)

**What to Look For:**
1. **Console Tab**: Shows JavaScript errors, warnings, and `console.log/error/warn` messages
2. **Network Tab**: Shows failed API requests (red entries)
3. **Elements Tab**: Inspect HTML structure

## Error Types You'll See

### 1. React Component Errors
- **Location**: Browser Console + Error Boundary UI
- **What it looks like**: Red error messages in console, error boundary component shown on screen
- **Example**: `TypeError: Cannot read property 'map' of undefined`

### 2. API/Network Errors
- **Location**: Browser Console + Network Tab
- **What it looks like**: Failed requests (status 400, 401, 500, etc.) in Network tab
- **Example**: `GET /api/tournaments 500 (Internal Server Error)`

### 3. Import/Module Errors
- **Location**: Browser Console
- **What it looks like**: `Module not found` or `Cannot resolve module`
- **Example**: `Failed to resolve module './utils/dateFormatter'`

### 4. TypeScript Compilation Errors
- **Location**: Terminal where `npm run dev` is running
- **What it looks like**: Type errors during build
- **Example**: `Property 'xyz' does not exist on type 'ABC'`

## Current Error Handling

### Error Boundary
- Added `ErrorBoundary` component that catches React errors
- Shows error details on screen when a component crashes
- Errors are also logged to console automatically

### Console Logging
- API errors are logged with `console.error()`
- Check console for detailed error information

### Error State Display
- Component-level errors are shown in red error message boxes
- Look for `<div className="error-message">` elements on the page

## Quick Debugging Steps

1. **Open Browser Console** (F12)
2. **Check for red error messages** in the Console tab
3. **Check Network tab** for failed API requests
4. **Look at the error message** - it usually tells you what's wrong
5. **Check the terminal** where your dev server is running for build errors

## Common Issues

### Empty Screen / Component Not Rendering
- Check console for import errors
- Check if API is returning data (Network tab)
- Check if component is wrapped in ErrorBoundary

### API Errors
- Check Network tab for failed requests
- Check server logs (terminal where server is running)
- Verify API endpoint is correct

### Type Errors
- Check terminal where `npm run dev` is running
- Fix TypeScript errors before they cause runtime issues

## Getting Help

When reporting errors, include:
1. **Browser console errors** (screenshot or copy/paste)
2. **Network tab** showing failed requests
3. **Terminal output** from dev server
4. **Steps to reproduce** the error

