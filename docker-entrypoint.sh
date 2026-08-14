#!/bin/sh
set -e

PORT=${PORT:-3000}

echo ""
echo "========================================"
echo "  Natura SecOps — Server starting"
echo "========================================"
echo "  Internal port: ${PORT}"
echo "  Access URLs:"
echo "    http://localhost:${PORT}/"
echo "    http://127.0.0.1:${PORT}/"
echo ""
echo "  Use the server IP to access from"
echo "  another machine, e.g.:"
echo "    http://<SERVER-IP>:${PORT}/"
echo "========================================"
echo ""

exec node .output/server/index.mjs
