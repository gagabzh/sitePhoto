#!/bin/bash
# Debug script for AI Review issues
# Run this from the project root: ./scripts/ai-review-debug.sh

echo "🔍 ==========================================="
echo "   AI Review Debug Script"
echo "🔍 ==========================================="
echo ""

# Check 1: Is the migration applied?
echo "1️⃣ Checking if v16 migration is applied..."
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT 
    EXISTS(SELECT FROM information_schema.tables WHERE table_name = 'ai_identification_proposals') as table_exists,
    EXISTS(SELECT FROM schema_migrations WHERE version = 'v16') as migration_applied;
" 2>&1 | grep -v "^ $" || echo "   ❌ Cannot connect to PostgreSQL"

echo ""

# Check 2: Are there any proposals?
echo "2️⃣ Checking for existing proposals..."
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT COUNT(*) as total, 
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected
  FROM ai_identification_proposals;
" 2>&1 | grep -v "^ $" || echo "   ❌ Cannot query proposals"

echo ""

# Check 3: Recent proposals
echo "3️⃣ Recent proposals (last 5)..."
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT id, photo_id, user_id, person_name, status, created_at
  FROM ai_identification_proposals
  ORDER BY created_at DESC
  LIMIT 5;
" 2>&1 | grep -v "^ $" || echo "   (none found or error)"

echo ""

# Check 4: Test API endpoint
echo "4️⃣ Testing API endpoint (requires curl)..."
if command -v curl &> /dev/null; then
    # Try with a sample user ID
    curl -s -H "Accept: application/json" "http://localhost:3000/api/ai/identification-queue?page=1&limit=10" 2>&1 | head -20 || echo "   ❌ API endpoint not responding"
else
    echo "   ⚠️  curl not available, skipping API test"
fi

echo ""

# Check 5: Photos with identification status
echo "5️⃣ Photos with ai_identification_status..."
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT id, title, ai_identification_status, updated_at
  FROM photos
  WHERE ai_identification_status IS NOT NULL
  ORDER BY updated_at DESC
  LIMIT 5;
" 2>&1 | grep -v "^ $" || echo "   (none found or error)"

echo ""
echo "🔍 ==========================================="
echo "   Debug Complete"
echo "🔍 ==========================================="
