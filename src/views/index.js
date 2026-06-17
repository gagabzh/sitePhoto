/**
 * Views
 * 
 * HTML generation and rendering logic.
 * 
 * This directory should contain:
 * - View components (moved from components.js)
 * - Page templates
 * - Layout partials
 * - View helpers
 * 
 * Views should:
 * - Generate HTML markup
 * - Be agnostic of HTTP concerns
 * - Receive data from controllers/services
 * - Use the layout system where appropriate
 * 
 * Structure:
 * views/
 * ├── components/      # Reusable UI components (photoThumb, selectionBar, etc.)
 * ├── pages/          # Page-level templates
 * ├── partials/       # Reusable page sections
 * └── helpers/        # View helper functions
 * 
 * @example
 * // src/views/albums/detail.js
 * function renderAlbumDetail(album, photos, options = {}) {
 *   return `<div class="album-detail">
 *     <h1>${album.title}</h1>
 *     ${photos.map(p => photoThumb(p)).join('')}
 *   </div>`;
 * }
 * 
 * module.exports = renderAlbumDetail;
 */

// This directory will contain view rendering logic
// Import and re-export views as they are created

module.exports = {};
