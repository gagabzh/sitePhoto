#!/usr/bin/env node
'use strict';

/**
 * AI Review Debug Script
 * Run: node scripts/ai-review-debug.js
 * 
 * This script helps diagnose why AI Review page isn't showing identifications
 */

const db = require('../src/db');

async function main() {
  console.log('🔍'.repeat(50));
  console.log('   AI Review Debug Script');
  console.log('🔍'.repeat(50));
  console.log('');

  // 1. Check if table exists
  console.log('1️⃣  Checking if ai_identification_proposals table exists...');
  try {
    const { rows } = await db.query(`
      SELECT 
        EXISTS(SELECT FROM information_schema.tables WHERE table_name = 'ai_identification_proposals') as table_exists,
        EXISTS(SELECT FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'ai_identification_status') as status_column_exists
    `);
    const tableExists = rows[0].table_exists;
    const statusColExists = rows[0].status_column_exists;
    
    console.log(`   → ai_identification_proposals table: ${tableExists ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   → photos.ai_identification_status column: ${statusColExists ? '✅ EXISTS' : '❌ MISSING'}`);
    
    if (!tableExists) {
      console.log('   ⚠️  FIX: Run the migration:');
      console.log('      psql -U your_db_user -d your_db_name -f migrations/v16-us-ai5-identification-queue.sql');
      process.exit(1);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    process.exit(1);
  }
  console.log('');

  // 2. Check migration
  console.log('2️⃣  Checking if v16 migration is applied...');
  try {
    const { rows } = await db.query('SELECT version, applied_at FROM schema_migrations WHERE version = $1', ['v16']);
    if (rows.length === 0) {
      console.log('   ⚠️  FIX: v16 migration not applied!');
      console.log('      psql -U your_db_user -d your_db_name -f migrations/v16-us-ai5-identification-queue.sql');
    } else {
      console.log(`   ✅ v16 migration applied at: ${rows[0].applied_at}`);
    }
  } catch (err) {
    console.log(`   ❌ Error checking migration: ${err.message}`);
  }
  console.log('');

  // 3. Count proposals
  console.log('3️⃣  Counting proposals...');
  try {
    const { rows } = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE status = 'edited') as edited
      FROM ai_identification_proposals
    `);
    const counts = rows[0];
    console.log(`   → Total: ${counts.total || 0}`);
    console.log(`   → Pending: ${counts.pending || 0}`);
    console.log(`   → Accepted: ${counts.accepted || 0}`);
    console.log(`   → Rejected: ${counts.rejected || 0}`);
    console.log(`   → Edited: ${counts.edited || 0}`);
    
    if (parseInt(counts.total || '0', 10) === 0) {
      console.log('   ⚠️  No proposals found! This means:');
      console.log('      - Worker is using OLD code (not calling new endpoints)');
      console.log('      - OR suggestions have no bboxes');
      console.log('      - OR migration was applied AFTER identifications ran');
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }
  console.log('');

  // 4. Recent proposals
  console.log('4️⃣  Recent proposals (last 10)...');
  try {
    const { rows } = await db.query(`
      SELECT id, photo_id, user_id, person_name, bbox, confidence, status, created_at
      FROM ai_identification_proposals
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    if (rows.length === 0) {
      console.log('   (no proposals found)');
    } else {
      rows.forEach(row => {
        console.log(`   - ID: ${row.id}, Photo: ${row.photo_id}, User: ${row.user_id}`);
        console.log(`     Person: ${row.person_name}, Status: ${row.status}, Bbox: ${JSON.stringify(row.bbox)}`);
        console.log(`     Created: ${row.created_at}`);
      });
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }
  console.log('');

  // 5. Photos with identification status
  console.log('5️⃣  Photos with ai_identification_status...');
  try {
    const { rows } = await db.query(`
      SELECT id, user_id, title, ai_identification_status, updated_at
      FROM photos
      WHERE ai_identification_status IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 5
    `);
    
    if (rows.length === 0) {
      console.log('   (no photos with identification status)');
    } else {
      rows.forEach(row => {
        console.log(`   - Photo ${row.id} (${row.title}): status = ${row.ai_identification_status}`);
        console.log(`     User: ${row.user_id}, Updated: ${row.updated_at}`);
      });
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }
  console.log('');

  // 6. Check for triggers
  console.log('6️⃣  Checking database triggers...');
  try {
    const { rows } = await db.query(`
      SELECT trigger_name, event_manipulation, event_object_table, action_statement
      FROM information_schema.triggers
      WHERE trigger_name LIKE '%ai_identification%'
      OR trigger_name LIKE '%proposal%'
    `);
    
    if (rows.length === 0) {
      console.log('   ⚠️  No triggers found for ai_identification_proposals');
      console.log('   (Triggers are in the v16 migration - was it applied?)');
    } else {
      console.log(`   ✅ Found ${rows.length} trigger(s)`);
      rows.forEach(row => {
        console.log(`   - ${row.trigger_name} on ${row.event_object_table}: ${row.event_manipulation}`);
      });
    }
  } catch (err) {
    console.log(`   ⚠️  Could not check triggers: ${err.message}`);
  }
  console.log('');

  // Summary
  console.log('🔍'.repeat(50));
  console.log('   SUMMARY');
  console.log('🔍'.repeat(50));
  console.log('');
  console.log('If you see:');
  console.log('  - ❌ Table missing → Apply migration');
  console.log('  - ❌ No proposals → Worker using old code OR migration applied after identifications');
  console.log('  - ✅ Proposals exist → Check if user has permission to view them');
  console.log('');
  console.log('The most likely issue is that the v16 migration was applied');
  console.log('AFTER the identifications ran, so existing identifications');
  console.log('were not captured. New identifications should work.');
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
