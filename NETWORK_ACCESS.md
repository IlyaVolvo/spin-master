# Accessing the Application from iPad (or any device on the same network)

## Your Network Information
- **Local IP Address**: 192.168.1.128
- **Client (Vite) Port**: 3000
- **Server (API) Port**: 3001

## Steps to Access from iPad

1. **Make sure both servers are running**:
   ```bash
   # Terminal 1: Start the backend server
   cd server && npm run dev
   
   # Terminal 2: Start the frontend client
   cd client && npm run dev
   ```

2. **Connect your iPad to the same Wi-Fi network** as your computer

3. **Open Safari (or any browser) on your iPad** and navigate to:
   ```
   http://192.168.1.128:3000
   ```

## Important Notes

- Both your computer and iPad must be on the same Wi-Fi network
- Make sure your firewall allows connections on ports 3000 and 3001
- If the IP address changes, run this command to find the new IP:
  ```bash
  ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1
  ```

## Troubleshooting

- **Can't connect?** Check that both servers are running and accessible
- **Connection refused?** Make sure your firewall isn't blocking the ports
- **Wrong IP?** The IP address may change if you reconnect to Wi-Fi - check it again

## Server Configuration

The servers are now configured to:
- Listen on all network interfaces (`0.0.0.0`)
- Accept connections from devices on the same network

