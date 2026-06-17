const errors = {
  /**
   * Return a 404 Not Found response
   * @param {Object} res - Express response object
   * @param {string} entity - Entity name (e.g., 'Album', 'Photo', 'User')
   * @param {boolean} isJson - Whether to return JSON (default: true)
   */
  notFound: (res, entity = 'Resource', isJson = true) => {
    const message = `${entity} not found`;
    if (isJson) {
      return res.status(404).json({ error: message });
    }
    return res.status(404).send(message);
  },

  /**
   * Return a 403 Access Denied response
   * @param {Object} res - Express response object
   * @param {boolean} isJson - Whether to return JSON (default: true)
   */
  accessDenied: (res, isJson = true) => {
    const message = 'Access denied';
    if (isJson) {
      return res.status(403).json({ error: message });
    }
    return res.status(403).send(message);
  },

  /**
   * Return a 422 Validation Error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  validation: (res, message = 'Validation failed') => {
    return res.status(422).json({ error: message });
  },

  /**
   * Return a 400 Bad Request response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  badRequest: (res, message = 'Bad request') => {
    return res.status(400).json({ error: message });
  },

  /**
   * Return a 401 Unauthorized response
   * @param {Object} res - Express response object
   * @param {string} message - Error message (default: 'Unauthorized')
   */
  unauthorized: (res, message = 'Unauthorized') => {
    return res.status(401).json({ error: message });
  },

  /**
   * Return a 500 Internal Server Error response
   * @param {Object} res - Express response object
   * @param {Error} err - Optional error object (message used in development)
   */
  serverError: (res, err = null) => {
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err?.message || 'Internal server error';
    return res.status(500).json({ error: message });
  },

  /**
   * Return a 403 Forbidden response (alias for accessDenied with different message)
   * @param {Object} res - Express response object
   * @param {string} message - Error message (default: 'Forbidden')
   * @param {boolean} isJson - Whether to return JSON (default: true)
   */
  forbidden: (res, message = 'Forbidden', isJson = true) => {
    if (isJson) {
      return res.status(403).json({ error: message });
    }
    return res.status(403).send(message);
  },
};

module.exports = errors;
