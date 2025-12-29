# Vercel SPA Routing Fix

## Problem
When refreshing a page on a Vercel-deployed React app, you get a 404 error because Vercel tries to find a file at that path (e.g., `/players`), but it doesn't exist since React Router handles routing client-side.

## Solution
Added `rewrites` configuration to `vercel.json` to redirect all routes to `index.html`, allowing React Router to handle the routing.

## Configuration Added

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This tells Vercel:
- For any route (`(.*)` matches everything)
- Serve `index.html` instead
- React Router will then handle the routing client-side

## Next Steps

1. Commit and push the updated `vercel.json`
2. Vercel will automatically redeploy
3. After deployment, page refreshes should work correctly

## How It Works

- **Direct navigation** (clicking links): React Router handles it client-side ✅
- **Page refresh** (F5 or browser refresh): Vercel serves `index.html`, React loads, then React Router navigates to the correct route ✅
- **Direct URL access** (typing URL in browser): Same as page refresh ✅

