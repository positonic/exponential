# Database Migrations Guide

This guide covers best practices for database migrations in our development workflow.

## Overview

We use Prisma for database migrations with PostgreSQL hosted on Railway. Migrations are a critical part of our workflow and require careful coordination between developers.

## Migration Workflow

### 1. Creating Migrations

Always create migrations using Prisma's migration tools:

```bash
# After modifying schema.prisma
npx prisma migrate dev --name descriptive_migration_name

# Examples of good migration names:
npx prisma migrate dev --name add_user_roles_table
npx prisma migrate dev --name add_status_to_projects
npx prisma migrate dev --name create_notifications_system
```

### 2. Migration Files

Migrations are stored in `prisma/migrations/` and include:
- SQL file with the actual database changes
- `migration_lock.toml` to ensure consistency

**Never manually edit migration files!**

### 3. Testing Migrations

All migrations MUST be tested on the test database before production:

1. Push your branch with migrations
2. Check preview deployment on Vercel
3. Verify schema changes applied correctly
4. Test application functionality with new schema

## Coordination Between Developers

### Daily Communication

Since we share a test database, coordination is essential:

1. **Morning Sync**: "I'm working on user roles migration today"
2. **Before Running Migrations**: Check Slack/Discord
3. **After Running Migrations**: Notify team of schema changes

### Handling Conflicts

When two developers have conflicting migrations:

```bash
# Developer A: adds 'status' column to projects
# Developer B: adds 'priority' column to projects
# Both create migrations at the same time
```

Resolution:
1. Communicate and decide merge order
2. First developer merges to develop
3. Second developer:
   - Pulls latest develop
   - Resets their migration: `npx prisma migrate reset`
   - Recreates migration with new timestamp
   - Tests thoroughly

## Best Practices

### ✅ DO

1. **Use Descriptive Names**
   ```bash
   # Good
   npx prisma migrate dev --name add_user_authentication_fields
   
   # Bad
   npx prisma migrate dev --name update
   ```

2. **Make Migrations Atomic**
   - Each migration should do one thing
   - Easier to debug and rollback if needed

3. **Consider Data Migration**
   ```prisma
   // When adding a required field, consider:
   // 1. Add as optional first
   // 2. Migrate existing data
   // 3. Make required in second migration
   ```

4. **Test with Existing Data**
   - Migrations should work with production data
   - Test on copy of production if possible

### ❌ DON'T

1. **Never Use `prisma db push` in Production**
   - Bypasses migration history
   - Can cause data loss
   - Only for rapid prototyping in development

2. **Don't Modify Existing Migrations**
   - Once merged, migrations are immutable
   - Create new migrations to fix issues

3. **Avoid Destructive Changes**
   ```sql
   -- Avoid in same PR as feature using the column
   DROP COLUMN important_data;
   
   -- Better: deprecate first, remove later
   ALTER TABLE ... RENAME COLUMN old_name TO deprecated_old_name;
   ```

## Common Patterns

### Adding a New Table

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
  
  @@index([userId, read])
}
```

### Adding a Column

```prisma
model User {
  // existing fields...
  
  // Add with default for existing rows
  isActive Boolean @default(true)
}
```

### Creating Relations

```prisma
model Project {
  // existing fields...
  
  // Add foreign key
  teamId String?
  team   Team?   @relation(fields: [teamId], references: [id])
}
```

## Migration Safety Checklist

Before creating a PR with migrations:

- [ ] Migration tested on test database
- [ ] No data loss for existing records
- [ ] Application code handles both old and new schema
- [ ] PR description mentions migration
- [ ] Team notified of schema changes
- [ ] Consider rollback strategy

## Emergency Procedures

### Rolling Back Locally

```bash
# Undo last migration
npx prisma migrate resolve --rolled-back

# Reset to specific migration
npx prisma migrate reset
```

### Production Rollback

1. **Immediate**: Revert code deployment
2. **If needed**: Run compensating migration
3. **Last resort**: Restore from backup

### Test Database Reset

When test database gets corrupted:

```bash
# Coordinate with team first!
# Then reset test database
npx prisma migrate reset --skip-seed

# Or copy from production structure
pg_dump --schema-only $PROD_DB | psql $TEST_DB
```

## Weekly Migration Release

Every Monday morning:
1. Review all migrations in develop
2. Test full migration path
3. Create PR: develop → main
4. Monitor deployment carefully
5. Be ready to rollback if issues

## Migration Review Checklist

When reviewing PRs with migrations:

- [ ] Migration name is descriptive
- [ ] No destructive changes without discussion
- [ ] Indexes added for new foreign keys
- [ ] Default values for new required fields
- [ ] Application code handles migration gracefully
- [ ] No manual SQL unless absolutely necessary

## Tools and Commands

```bash
# View migration status
npx prisma migrate status

# Generate Prisma Client after migrations
npx prisma generate

# Create migration without applying
npx prisma migrate dev --create-only

# Apply pending migrations (production)
npx prisma migrate deploy

# Reset database (development only!)
npx prisma migrate reset
```

## Common Issues and Solutions

### "Migration already applied"
- Someone else ran the same migration
- Pull latest and regenerate

### "Schema drift detected"
- Database doesn't match migrations
- Usually from using db push
- Reset and reapply migrations

### "Foreign key constraint failed"
- Trying to reference non-existent data
- Add data migration step first

---

Remember: **Migrations are code**. Treat them with the same care as application code. Test thoroughly, review carefully, and always have a rollback plan.