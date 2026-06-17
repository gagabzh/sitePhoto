const errors = require('../utils/errors');

/**
 * Validation schemas definitions
 * These can be used with Joi when available, or with the simple validator below
 */
const schemas = {
  // Album schemas
  album: {
    title: { type: 'string', required: true, minLength: 1, maxLength: 255 },
    description: { type: 'string', required: false, maxLength: 5000 },
  },

  // Photo schemas
  photo: {
    title: { type: 'string', required: false, maxLength: 255 },
    description: { type: 'string', required: false, maxLength: 5000 },
  },

  // Travel schemas
  travel: {
    title: { type: 'string', required: true, minLength: 1, maxLength: 255 },
    description: { type: 'string', required: false, maxLength: 5000 },
  },

  // User schemas
  user: {
    username: { type: 'string', required: true, minLength: 3, maxLength: 50 },
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, minLength: 8 },
  },

  // ID parameter schema
  idParam: {
    id: { type: 'number', required: true, min: 1 },
  },

  // Pagination schema
  pagination: {
    page: { type: 'number', required: false, min: 1, default: 1 },
    limit: { type: 'number', required: false, min: 1, max: 100, default: 20 },
  },
};

/**
 * Simple validation function that validates an object against a schema
 * @param {Object} data - Data to validate
 * @param {Object} schema - Schema to validate against
 * @returns {Object} { isValid: boolean, errors: Array<string> }
 */
function validate(data, schema) {
  const validationErrors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    
    // Check required
    if (rules.required && (value === undefined || value === null || value === '')) {
      validationErrors.push(`${field} is required`);
      continue;
    }

    // Skip if not required and not provided
    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Check type
    if (rules.type) {
      const expectedType = rules.type;
      const actualType = typeof value;
      
      if (expectedType === 'number') {
        if (actualType !== 'number' || isNaN(value)) {
          validationErrors.push(`${field} must be a number`);
          continue;
        }
      } else if (expectedType === 'string') {
        if (actualType !== 'string') {
          validationErrors.push(`${field} must be a string`);
          continue;
        }
      } else if (expectedType === 'email') {
        if (actualType !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          validationErrors.push(`${field} must be a valid email address`);
          continue;
        }
      }
    }

    // Check minLength
    if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
      validationErrors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    // Check maxLength
    if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
      validationErrors.push(`${field} must be at most ${rules.maxLength} characters`);
    }

    // Check min
    if (rules.min && typeof value === 'number' && value < rules.min) {
      validationErrors.push(`${field} must be at least ${rules.min}`);
    }

    // Check max
    if (rules.max && typeof value === 'number' && value > rules.max) {
      validationErrors.push(`${field} must be at most ${rules.max}`);
    }
  }

  return {
    isValid: validationErrors.length === 0,
    errors: validationErrors,
  };
}

/**
 * Creates validation middleware for request body
 * @param {Object} schema - Schema to validate against
 * @param {Object} options - Options
 * @param {string} options.source - Source of data ('body', 'query', 'params') (default: 'body')
 * @returns {Function} Express middleware
 */
function validateRequest(schema, options = {}) {
  const { source = 'body' } = options;

  return (req, res, next) => {
    const data = req[source];
    const result = validate(data, schema);

    if (!result.isValid) {
      return errors.validation(res, result.errors.join(', '));
    }

    next();
  };
}

/**
 * Creates middleware that validates a specific field from request parameters
 * @param {string} fieldName - Name of the field to validate
 * @param {string} type - Type of validation ('number', 'string', 'email')
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware
 */
function validateParam(fieldName, type = 'number', options = {}) {
  const { min = 1, required = true } = options;

  return (req, res, next) => {
    const value = req.params[fieldName];

    if (required && !value) {
      return errors.validation(res, `${fieldName} parameter is required`);
    }

    if (!value) {
      return next();
    }

    if (type === 'number') {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < min) {
        return errors.validation(res, `${fieldName} must be a valid number`);
      }
      req.params[fieldName] = num;
    } else if (type === 'string') {
      if (typeof value !== 'string') {
        return errors.validation(res, `${fieldName} must be a string`);
      }
    }

    next();
  };
}

/**
 * Creates middleware that checks if a required parameter exists
 * @param {string} paramName - Name of the parameter
 * @returns {Function} Express middleware
 */
function requireParam(paramName) {
  return (req, res, next) => {
    if (!req.params[paramName]) {
      return errors.notFound(res, `${paramName.charAt(0).toUpperCase() + paramName.slice(1)} not found`);
    }
    next();
  };
}

/**
 * Creates middleware that validates an array of IDs from request body
 * @param {string} fieldName - Name of the field containing the IDs (default: 'ids')
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
function validateIdArray(fieldName = 'ids', options = {}) {
  const { required = true, min = 1 } = options;

  return (req, res, next) => {
    const raw = req.body[fieldName];

    if (required && !raw) {
      return errors.validation(res, `${fieldName} is required`);
    }

    if (!raw) {
      req.body[fieldName] = [];
      return next();
    }

    const ids = [].concat(raw).map(Number).filter(n => n > 0);

    if (required && ids.length === 0) {
      return errors.validation(res, `${fieldName} must contain at least one valid ID`);
    }

    if (ids.length < min) {
      return errors.validation(res, `${fieldName} must contain at least ${min} valid IDs`);
    }

    req.body[fieldName] = ids;
    next();
  };
}

module.exports = {
  schemas,
  validate,
  validateRequest,
  validateParam,
  requireParam,
  validateIdArray,
};
