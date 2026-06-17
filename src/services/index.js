/**
 * Services
 * 
 * Service layer that encapsulates business logic and coordinates
 * between repositories and external services.
 * 
 * Services should:
 * - Contain business logic (not in routes or controllers)
 * - Coordinate between multiple repositories
 * - Handle transactions
 * - Call external APIs (Nextcloud, AI services, etc.)
 * - Be agnostic of HTTP concerns
 * 
 * Naming convention: <entity>Service.js (e.g., AlbumService.js, PhotoService.js)
 * 
 * @example
 * // src/services/AlbumService.js
 * class AlbumService {
 *   constructor(albumRepository, photoRepository) {
 *     this.albumRepository = albumRepository;
 *     this.photoRepository = photoRepository;
 *   }
 *   
 *   async getAll(session) {
 *     return this.albumRepository.findAllByUser(session.userId, session.role);
 *   }
 *   
 *   async create(data, session) {
 *     const album = await this.albumRepository.create(data, session.userId);
 *     // Additional business logic can go here
 *     return album;
 *   }
 * }
 * 
 * module.exports = AlbumService;
 */

// This directory will contain service layer classes
// Import and re-export services as they are created

module.exports = {};
