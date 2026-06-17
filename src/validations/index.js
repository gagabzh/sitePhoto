/**
 * Validations
 * 
 * Request validation schemas and validators.
 * 
 * This directory should contain:
 * - Joi validation schemas (when Joi is installed)
 * - Custom validators
 * - Validation middleware
 * - Validation utilities
 * 
 * Validations should:
 * - Define schemas for request bodies, query params, URL params
 * - Be reusable across multiple routes
 * - Return consistent error messages
 * - Support both sync and async validation
 * 
 * Structure:
 * validations/
 * ├── schemas/        # Schema definitions by entity
 * │   ├── album.js
 * │   ├── photo.js
 * │   ├── user.js
 * │   └── ...
 * └── middleware.js   # Validation middleware factories
 * 
 * @example
 * // src/validations/schemas/album.js
 * const Joi = require('joi');
 * 
 * const createAlbumSchema = Joi.object({
 *   title: Joi.string().required().max(255),
 *   description: Joi.string().max(5000).allow(''),
 * });
 * 
 * const updateAlbumSchema = Joi.object({
 *   title: Joi.string().max(255),
 *   description: Joi.string().max(5000).allow(''),
 * });
 * 
 * module.exports = { createAlbumSchema, updateAlbumSchema };
 * 
 * @example
 * // src/validations/middleware.js
 * const { createAlbumSchema } = require('./schemas/album');
 * 
 * function validateCreateAlbum(req, res, next) {
 *   const { error } = createAlbumSchema.validate(req.body);
 *   if (error) {
 *     return res.status(422).json({ error: error.details[0].message });
 *   }
 *   next();
 * }
 * 
 * module.exports = { validateCreateAlbum };
 */

// This directory will contain validation schemas and middleware
// Current implementation: middleware/validation.js contains simple validators
// Future: Install Joi and create proper schema files

// Re-export from middleware/validation for now
const validationMiddleware = require('../middleware/validation');

module.exports = validationMiddleware;
