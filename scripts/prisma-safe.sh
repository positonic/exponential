#!/bin/bash

# Safe Prisma wrapper script
# Usage: ./scripts/prisma-safe.sh migrate dev --name migration_name

COMMAND="$1"
SUBCOMMAND="$2"

# Block dangerous db push
if [[ "$COMMAND" == "db" && "$SUBCOMMAND" == "push" ]]; then
    echo "❌ BLOCKED: 'prisma db push' is not allowed!"
    echo ""
    echo "Use proper migrations instead:"
    echo "  npx prisma migrate dev --name descriptive_migration_name"
    echo ""
    echo "Why? db push:"
    echo "  - Bypasses migration history"
    echo "  - Can cause data loss"
    echo "  - Makes deployments unreliable"
    echo ""
    echo "If you really need db push (dev only), use: npx prisma db push --force-reset"
    exit 1
fi

# Check for uncommitted schema changes before migration
if [[ "$COMMAND" == "migrate" ]]; then
    if git diff --name-only | grep -q "prisma/schema.prisma"; then
        echo "⚠️  WARNING: You have uncommitted schema changes!"
        echo ""
        git diff prisma/schema.prisma
        echo ""
        read -p "Continue with migration? (y/N): " confirm
        if [[ $confirm != [yY] ]]; then
            echo "❌ Migration cancelled."
            exit 1
        fi
    fi
fi

# Execute the actual Prisma command
npx prisma "$@"