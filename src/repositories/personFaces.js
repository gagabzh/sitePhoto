'use strict';

const db = require('../db');

async function fetchPersonFacesForPhoto(photoId) {
  const { rows } = await db.query(
    `SELECT id, person_name, bbox FROM person_faces WHERE photo_id = $1 ORDER BY created_at ASC`,
    [photoId]
  );
  return rows;
}

module.exports = { fetchPersonFacesForPhoto };
