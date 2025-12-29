#!/bin/bash

echo "=========================================="
echo "JWT_SECRET Investigation"
echo "=========================================="
echo ""

echo "1. Checking local JWT_SECRET (if .env exists):"
if [ -f "server/.env" ]; then
  echo "   Found server/.env"
  grep -E "JWT_SECRET|SESSION_SECRET" server/.env | sed 's/=.*/=***HIDDEN***/'
else
  echo "   No server/.env file found"
fi

echo ""
echo "2. To check Fly.io JWT_SECRET, run:"
echo "   flyctl secrets list -a spin-master"
echo ""

echo "3. To check Fly.io logs for token errors:"
echo "   flyctl logs -a spin-master --follow"
echo ""

echo "4. To set JWT_SECRET in Fly.io (if needed):"
echo "   flyctl secrets set JWT_SECRET=your-secret-here -a spin-master"
echo ""

echo "=========================================="
echo "Most Likely Issue:"
echo "=========================================="
echo "The token in your browser was created with a different"
echo "JWT_SECRET than what Fly.io is using."
echo ""
echo "Solution: Log in again on the deployed app (Vercel)"
echo "This will create a new token with the correct secret."
echo ""


