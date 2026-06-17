const { canModify } = require('../permissions');
const errors = require('../utils/errors');

/**
 * Creates middleware that requires the user to be able to modify a specific entity.
 * The entity is fetched using the provided getter function.
 * 
 * @param {Function} entityGetter - Async function that takes (req) and returns the entity or null
 * @param {Object} options - Configuration options
 * @param {string} options.entityName - Name of the entity for error messages (default: 'Entity')
 * @param {boolean} options.isJson - Whether to return JSON responses (default: true)
 * @returns {Function} Express middleware function
 * 
 * @example
 * // In routes file:
 * const { requireCanModify } = require('../middleware/access');
 * const { getAlbum } = require('../repositories/albums');
 * 
 * router.delete('/albums/:id', requireCanModify(
 *   async (req) => getAlbum(req.params.id),
 *   { entityName: 'Album' }
 * ), async (req, res) => {
 *   // req.entity contains the album, user can modify it
 *   await deleteAlbum(req.entity);
 *   res.send('Deleted');
 * });
 */
function requireCanModify(entityGetter, options = {}) {
  const { entityName = 'Entity', isJson = true } = options;

  return async (req, res, next) => {
    try {
      const entity = await entityGetter(req);
      
      if (!entity) {
        return errors.notFound(res, entityName, isJson);
      }
      
      if (!canModify(req.session, entity)) {
        return errors.accessDenied(res, isJson);
      }
      
      // Attach entity to request for use in route handler
      req.entity = entity;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Creates middleware that requires the user to be the owner of a specific entity.
 * Similar to requireCanModify but uses a custom ownership check.
 * 
 * @param {Function} entityGetter - Async function that takes (req) and returns the entity or null
 * @param {Function} ownerChecker - Function that takes (session, entity) and returns boolean
 * @param {Object} options - Configuration options
 * @param {string} options.entityName - Name of the entity for error messages (default: 'Entity')
 * @param {boolean} options.isJson - Whether to return JSON responses (default: true)
 * @returns {Function} Express middleware function
 */
function requireOwner(entityGetter, ownerChecker, options = {}) {
  const { entityName = 'Entity', isJson = true } = options;

  return async (req, res, next) => {
    try {
      const entity = await entityGetter(req);
      
      if (!entity) {
        return errors.notFound(res, entityName, isJson);
      }
      
      if (!ownerChecker(req.session, entity)) {
        return errors.accessDenied(res, isJson);
      }
      
      req.entity = entity;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Creates middleware that checks if an entity exists.
 * Does not check permissions - just existence.
 * 
 * @param {Function} entityGetter - Async function that takes (req) and returns the entity or null
 * @param {Object} options - Configuration options
 * @param {string} options.entityName - Name of the entity for error messages (default: 'Entity')
 * @param {boolean} options.isJson - Whether to return JSON responses (default: true)
 * @returns {Function} Express middleware function
 */
function requireEntityExists(entityGetter, options = {}) {
  const { entityName = 'Entity', isJson = true } = options;

  return async (req, res, next) => {
    try {
      const entity = await entityGetter(req);
      
      if (!entity) {
        return errors.notFound(res, entityName, isJson);
      }
      
      req.entity = entity;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Simple middleware to check canModify on an already-fetched entity.
 * Use this when the entity is already attached to req by a previous middleware.
 * 
 * @param {string} entityPath - Path to the entity in req (default: 'entity')
 * @param {Object} options - Configuration options
 * @param {boolean} options.isJson - Whether to return JSON responses (default: true)
 * @returns {Function} Express middleware function
 */
function checkCanModify(entityPath = 'entity', options = {}) {
  const { isJson = true } = options;

  return (req, res, next) => {
    const entity = req[entityPath];
    
    if (!entity) {
      return errors.notFound(res, 'Entity', isJson);
    }
    
    if (!canModify(req.session, entity)) {
      return errors.accessDenied(res, isJson);
    }
    
    next();
  };
}

module.exports = {
  requireCanModify,
  requireOwner,
  requireEntityExists,
  checkCanModify,
};
