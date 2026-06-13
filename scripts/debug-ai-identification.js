#!/usr/bin/env node
'use strict';

/**
 * Debug script for US-AI5 identification queue issues
 * Run: node scripts/debug-ai-identification.js
 */

const db = require('../src/db');

async function main() {
  console.log('🔍 Debugging US-AI5 Identification Queue\n');

  // 1. Check if the ai_identification_proposals table exists
  console.log('1. Checking if ai_identification_proposals table exists...');
  try {
    const { rows } = await db.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'ai_identification_proposals'
      )`
    );
    console.log(`   → Table exists: ${rows[0].exists ? 'YES ✅' : 'NO ❌'}`);
    
    if (!rows[0].exists) {
      console.log('   ⚠️  You need to run the migration first:');
      console.log('   psql -U your_db_user -d your_db_name -f migrations/v16-us-ai5-identification-queue.sql');
      process.exit(1);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    process.exit(1);
  }

  // 2. Count proposals in the table
  console.log('\n2. Counting proposals in ai_identification_proposals...');
  try {
    const { rows } = await db.query('SELECT COUNT(*) as count FROM ai_identification_proposals');
    const count = parseInt(rows[0].count, 10);
    console.log(`   → Total proposals: ${count}`);
    
    if (count === 0) {
      console.log('   ⚠️  No proposals found. This means:');
      console.log('   - Worker is not calling storeIdentificationProposals');
      console.log('   - Or the worker is using old code');
      console.log('   - Or the suggestions have no bboxes');
    } else {
      console.log(`   ✅ Found ${count} proposal(s)`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // 3. Show recent proposals
  console.log('\n3. Recent proposals:');
  try {
    const { rows } = await db.query(
      `SELECT id, photo_id, user_id, person_name, status, created_at 
       FROM ai_identification_proposals 
       ORDER BY created_at DESC 
       LIMIT 10`
    );
    
    if (rows.length === 0) {
      console.log('   (none)');
    } else {
      rows.forEach(row => {
        console.log(`   - ID: ${row.id}, Photo: ${row.photo_id}, Person: ${row.person_name}, Status: ${row.status}, Created: ${row.created_at}`);
      });
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // 4. Check photos with ai_identification_status
  console.log('\n4. Photos with ai_identification_status:');
  try {
    const { rows } = await db.query(
      `SELECT id, title, ai_identification_status 
       FROM photos 
       WHERE ai_identification_status IS NOT NULL 
       ORDER BY updated_at DESC 
       LIMIT 5`
    );
    
    if (rows.length === 0) {
      console.log('   (none)');
    } else {
      rows.forEach(row => {
        console.log(`   - Photo ${row.id} (${row.title}): status = ${row.ai_identification_status}`);
      });
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // 5. Check schema_migrations
  console.log('\n5. Checking schema_migrations for v16:');
  try {
    const { rows } = await db.query('SELECT version, applied_at FROM schema_migrations WHERE version = $1', ['v16']);
    if (rows.length === 0) {
      console.log('   ⚠️  Migration v16 has not been applied yet');
      console.log('   Run: psql -U your_db_user -d your_db_name -f migrations/v16-us-ai5-identification-queue.sql');
    } else {
      console.log(`   ✅ Migration v16 applied at: ${rows[0].applied_at}`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  console.log('\n💡 Next steps:');
  console.log('1. If v16 migration not applied → Run the migration');
  console.log('2. If no proposals → Restart worker container with latest code');
  console.log('3. If proposals exist but not showing → Check socket.io connection on queue page');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
