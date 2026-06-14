#!/usr/bin/env node
'use strict';

/**
 * Test script to manually create a test proposal in the AI Review queue
 * Run: node scripts/test-ai-review.js
 * 
 * This bypasses the worker entirely and creates a proposal directly
 */

const db = require('../src/db');
const { notifyUser } = require('../src/notifications');

async function main() {
  console.log('🧪 Testing AI Review Proposal Creation\n');

  try {
    // 1. Check if table exists
    console.log('1. Checking table exists...');
    const { rows: tableCheck } = await db.query(
      `SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name = 'ai_identification_proposals') as exists`
    );
    
    if (!tableCheck[0].exists) {
      console.log('❌ ai_identification_proposals table does not exist!');
      console.log('Run: psql -U your_db_user -d your_db_name -f migrations/v16-us-ai5-identification-queue.sql');
      process.exit(1);
    }
    console.log('✅ Table exists\n');

    // 2. Get a photo and user ID from the database
    console.log('2. Finding a test photo and user...');
    const { rows: photos } = await db.query(
      `SELECT id, user_id FROM photos WHERE user_id IS NOT NULL LIMIT 1`
    );
    
    if (photos.length === 0) {
      console.log('❌ No photos found in database!');
      process.exit(1);
    }
    
    const photoId = photos[0].id;
    const userId = photos[0].user_id;
    console.log(`✅ Using photo ${photoId}, user ${userId}\n`);

    // 3. Create a test proposal
    console.log('3. Creating test proposal...');
    const { rows: proposal } = await db.query(
      `INSERT INTO ai_identification_proposals 
       (photo_id, user_id, person_name, bbox, confidence, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [photoId, userId, 'Test Person', JSON.stringify({x: 0.1, y: 0.1, width: 0.2, height: 0.2}), 0.95]
    );
    
    console.log(`✅ Created proposal ID: ${proposal[0].id}\n`);

    // 4. Send notification
    console.log('4. Sending notification...');
    notifyUser(userId, {
      photoId,
      count: 1,
      suggestions: [{ name: 'Test Person', bbox: {x: 0.1, y: 0.1, width: 0.2, height: 0.2} }]
    }, 'identification-proposals-ready');
    console.log('✅ Notification sent\n');

    // 5. Verify it was created
    console.log('5. Verifying proposal exists...');
    const { rows: check } = await db.query(
      `SELECT COUNT(*) as count FROM ai_identification_proposals WHERE photo_id = $1 AND user_id = $2`,
      [photoId, userId]
    );
    
    console.log(`✅ Found ${check[0].count} proposal(s) for photo ${photoId}\n`);

    console.log('🎉 SUCCESS! Test proposal created.');
    console.log('\nNow visit: http://localhost:3000/ai/identification-queue');
    console.log('You should see the test proposal there.\n');

    // 6. Cleanup (optional)
    console.log('To remove the test proposal later, run:');
    console.log(`  DELETE FROM ai_identification_proposals WHERE photo_id = ${photoId} AND person_name = 'Test Person';\n`);

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
