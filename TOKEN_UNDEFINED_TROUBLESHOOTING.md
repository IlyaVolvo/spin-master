# Token Undefined Troubleshooting

## Issues Identified

1. **Token is undefined** - No token in localStorage
2. **No "Member logged in" message** - Login may not have completed
3. **All requests return 401** - No authentication
4. **Wrong localStorage key** - You're checking `'token'` but the key is `'pingpong_token'`

## Steps to Diagnose

### 1. Check Correct localStorage Key

The token is stored under `'pingpong_token'`, NOT `'token'`. Run this in browser console:

```javascript
// Check correct key
console.log('Token (correct key):', localStorage.getItem('pingpong_token'));
console.log('Member:', localStorage.getItem('pingpong_member'));
console.log('All localStorage:', { ...localStorage });
```

### 2. Check if You Actually Logged In

The browser console shows no login attempt. You need to:

1. **Go to the login page** (if not already there)
2. **Enter credentials** (admin@pingpong.com / your password)
3. **Click Login**
4. **Watch the browser console** - you should see:
   - `Login response:` message (from our new logging)
   - `Storing token in localStorage:` message
   - `Token stored. Verifying:` message

### 3. Check Network Tab During Login

1. Open DevTools → Network tab
2. **Clear the network log**
3. **Log in**
4. Look for `POST /api/auth/member/login`:
   - **Status:** Should be 200 (success)
   - **Response:** Should contain `{ token: "...", member: {...} }`
   - **If status is 401:** Login credentials are wrong
   - **If status is 500:** Server error (check Fly.io logs)

### 4. Check Fly.io Logs During Login

While logging in, watch Fly.io logs:

```bash
flyctl logs -a spin-master --follow
```

**Look for:**
- `[INFO] Creating JWT token` - Token creation attempt
- `[INFO] JWT token created successfully` - Token was created
- `[INFO] Member logged in` - Login succeeded
- `[INFO] Sending login response` - Response being sent
- `[ERROR] Error creating JWT token` - Token creation failed

**If you don't see ANY of these:**
- The login request isn't reaching the server
- Check Network tab to see if request is being sent

### 5. Current State Analysis

From your console output:
- ✅ Fly.io is using JWT_SECRET (that's good)
- ❌ No token in localStorage (need to log in first)
- ❌ No login logs in console (need to perform login)
- ❌ All API calls return 401 (expected - no token/session)

## Action Plan

1. **First, verify current localStorage state:**
   ```javascript
   console.log('pingpong_token:', localStorage.getItem('pingpong_token'));
   console.log('pingpong_member:', localStorage.getItem('pingpong_member'));
   ```

2. **If both are null/undefined:**
   - You haven't logged in yet, OR
   - Login failed, OR
   - Token was cleared

3. **To log in:**
   - Make sure you're on the login page
   - Enter credentials
   - Click Login button
   - **Watch browser console for our new logging messages**
   - **Watch Network tab for login request**

4. **After login:**
   - Check localStorage again (using correct key: `pingpong_token`)
   - Check if token exists
   - Check Fly.io logs for "Member logged in" message

## Expected Flow

1. **User clicks Login** → Browser sends POST to `/api/auth/member/login`
2. **Server processes login** → Creates token, stores session
3. **Server responds** → `{ token: "...", member: {...} }`
4. **Client receives response** → Stores token in localStorage under `pingpong_token`
5. **Client navigates** → Makes API calls with `Authorization: Bearer <token>` header
6. **Server verifies token** → Allows request if valid

## If Login Still Fails

After attempting login, share:
1. **Network tab:** Status code and response of `/api/auth/member/login` request
2. **Browser console:** Any error messages or our logging output
3. **Fly.io logs:** Everything from the login attempt

