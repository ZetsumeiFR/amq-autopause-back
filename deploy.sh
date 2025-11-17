#!/bin/bash

# AMQ Autopause Backend Deployment Script
# Domain: https://api.amqautopause.zetsumei.xyz

set -e

echo "==================================="
echo "AMQ Autopause Backend Deployment"
echo "==================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "Please copy .env.docker to .env and fill in your credentials:"
    echo "  cp .env.docker .env"
    echo "  nano .env"
    exit 1
fi

# Validate required environment variables
echo "Validating environment variables..."
source .env

REQUIRED_VARS=(
    "POSTGRES_PASSWORD"
    "BETTER_AUTH_SECRET"
    "TWITCH_CLIENT_ID"
    "TWITCH_CLIENT_SECRET"
    "TWITCH_EVENTSUB_SECRET"
)

MISSING_VARS=()
for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ] || [[ "${!VAR}" == *"your_"* ]]; then
        MISSING_VARS+=("$VAR")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "ERROR: The following environment variables are not configured:"
    for VAR in "${MISSING_VARS[@]}"; do
        echo "  - $VAR"
    done
    echo "Please update your .env file with actual values."
    exit 1
fi

echo "✓ Environment variables validated"

# Build and start containers
echo ""
echo "Building Docker images..."
docker compose build --no-cache

echo ""
echo "Starting services..."
docker compose up -d

echo ""
echo "Waiting for services to be healthy..."
sleep 10

# Check service health
echo "Checking service status..."
docker compose ps

echo ""
echo "==================================="
echo "Deployment Complete!"
echo "==================================="
echo ""
echo "API is available at: https://api.amqautopause.zetsumei.xyz"
echo "Webhook URL: https://api.amqautopause.zetsumei.xyz/webhook/twitch"
echo ""
echo "Important: Configure your reverse proxy (nginx/traefik) to forward"
echo "traffic from https://api.amqautopause.zetsumei.xyz to localhost:3000"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f api    # View API logs"
echo "  docker compose logs -f db     # View database logs"
echo "  docker compose down            # Stop all services"
echo "  docker compose restart api     # Restart API"
echo ""
echo "Don't forget to configure your Twitch app redirect URI:"
echo "  https://api.amqautopause.zetsumei.xyz/api/auth/callback/twitch"
