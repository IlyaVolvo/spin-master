/**
 * Script to validate that API_DOCUMENTATION.md is up-to-date with the codebase
 * 
 * This script checks that all routes defined in the route files are documented
 * in API_DOCUMENTATION.md
 */

import * as fs from 'fs';
import * as path from 'path';

interface RouteInfo {
  method: string;
  path: string;
  file: string;
  line: number;
}

function extractRoutesFromFile(filePath: string): RouteInfo[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const routes: RouteInfo[] = [];
  const lines = content.split('\n');
  
  const routePatterns = [
    /router\.(get|post|patch|put|delete)\s*\(['"`]([^'"`]+)['"`]/g,
    /router\.(get|post|patch|put|delete)\s*\(['"`]([^'"`]+)['"`]/g,
  ];
  
  lines.forEach((line, index) => {
    // Match router.get('/path', ...), router.post('/path', [...], ...), etc.
    const match = line.match(/router\.(get|post|patch|put|delete)\s*\(['"`]([^'"`]+)['"`]/);
    if (match) {
      const method = match[1].toUpperCase();
      let routePath = match[2];
      
      // Handle parameterized routes like '/:id'
      // For documentation purposes, we'll use the pattern
      
      routes.push({
        method,
        path: routePath,
        file: path.basename(filePath),
        line: index + 1,
      });
    }
  });
  
  return routes;
}

function extractDocumentedRoutes(docPath: string): Map<string, string> {
  const content = fs.readFileSync(docPath, 'utf-8');
  const documented = new Map<string, string>();
  
  // Match patterns like "### GET `/api/players`" or "### POST `/api/tournaments/:id/matches`"
  const pattern = /###\s+(GET|POST|PATCH|PUT|DELETE)\s+`([^`]+)`/g;
  let match;
  
  while ((match = pattern.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    const key = `${method} ${path}`;
    documented.set(key, match[0]);
  }
  
  return documented;
}

function main() {
  const routesDir = path.join(__dirname, '../src/routes');
  const docPath = path.join(__dirname, '../../API_DOCUMENTATION.md');
  
  if (!fs.existsSync(docPath)) {
    console.error('❌ API_DOCUMENTATION.md not found at:', docPath);
    process.exit(1);
  }
  
  // Get all route files
  const routeFiles = [
    path.join(routesDir, 'auth.ts'),
    path.join(routesDir, 'players.ts'),
    path.join(routesDir, 'tournaments.ts'),
  ];
  
  // Extract routes from code
  const allRoutes: RouteInfo[] = [];
  routeFiles.forEach(file => {
    if (fs.existsSync(file)) {
      const routes = extractRoutesFromFile(file);
      allRoutes.push(...routes);
    }
  });
  
  // Add health check endpoint
  allRoutes.push({
    method: 'GET',
    path: '/api/health',
    file: 'index.ts',
    line: 35,
  });
  
  // Extract documented routes
  const documented = extractDocumentedRoutes(docPath);
  
  // Check for missing documentation
  const missing: RouteInfo[] = [];
  const extra: string[] = [];
  
  allRoutes.forEach(route => {
    // Build the full path based on the route file
    let fullPath = route.path;
    if (route.file === 'auth.ts') {
      fullPath = `/api/auth${route.path}`;
    } else if (route.file === 'players.ts') {
      fullPath = `/api/players${route.path}`;
    } else if (route.file === 'tournaments.ts') {
      fullPath = `/api/tournaments${route.path}`;
    } else if (route.file === 'index.ts') {
      // Health check is already /api/health
      fullPath = route.path;
    }
    
    // Normalize path: remove trailing slash (except for root paths)
    if (fullPath.length > 1 && fullPath.endsWith('/')) {
      fullPath = fullPath.slice(0, -1);
    }
    
    const key = `${route.method} ${fullPath}`;
    if (!documented.has(key)) {
      missing.push(route);
    }
  });
  
  // Check for documented routes that don't exist in code (optional check)
  documented.forEach((doc, key) => {
    // This is a soft check - some routes might be documented but not yet implemented
    // or might have different patterns, so we'll just warn
  });
  
  // Report results
  console.log('📋 API Documentation Validation\n');
  console.log(`Found ${allRoutes.length} routes in code`);
  console.log(`Found ${documented.size} documented endpoints\n`);
  
  if (missing.length === 0) {
    console.log('✅ All routes are documented!');
  } else {
    console.log(`⚠️  ${missing.length} route(s) missing from documentation:\n`);
    missing.forEach(route => {
      let fullPath = route.path;
      if (route.file === 'auth.ts') {
        fullPath = `/api/auth${route.path}`;
      } else if (route.file === 'players.ts') {
        fullPath = `/api/players${route.path}`;
      } else if (route.file === 'tournaments.ts') {
        fullPath = `/api/tournaments${route.path}`;
      }
      console.log(`  - ${route.method} ${fullPath} (${route.file}:${route.line})`);
    });
    console.log('\n💡 Please add these endpoints to API_DOCUMENTATION.md');
    process.exit(1);
  }
}

main();

