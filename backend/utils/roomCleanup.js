const Room = require('../models/Room');

/**
 * Periodic cleanup of empty rooms - safety net for any edge cases
 * This should not be necessary if all leave/disconnect handlers work correctly,
 * but provides additional protection against orphaned rooms
 */
async function cleanupEmptyRooms() {
  try {
    console.log('[ROOM CLEANUP TASK] Starting periodic cleanup check...');
    
    // Find all rooms with no players
    const emptyRooms = await Room.find({
      $expr: { $eq: [{ $size: '$players' }, 0] }
    }).select('_id name createdAt');

    if (emptyRooms.length === 0) {
      console.log('[ROOM CLEANUP TASK] No empty rooms found');
      return { deleted: 0, rooms: [] };
    }

    console.log(`[ROOM CLEANUP TASK] Found ${emptyRooms.length} empty room(s)`);
    
    const deletedRooms = [];
    for (const room of emptyRooms) {
      console.log(`[ROOM CLEANUP TASK] Deleting empty room: ${room._id} (${room.name}) created at ${room.createdAt}`);
      await Room.deleteOne({ _id: room._id });
      deletedRooms.push({
        id: room._id.toString(),
        name: room.name,
        createdAt: room.createdAt
      });
    }

    console.log(`[ROOM CLEANUP TASK] Cleanup complete. Deleted ${deletedRooms.length} room(s)`);
    return { deleted: deletedRooms.length, rooms: deletedRooms };
  } catch (error) {
    console.error('[ROOM CLEANUP TASK] Error during cleanup:', error);
    return { error: error.message };
  }
}

/**
 * Start periodic cleanup interval
 * Runs every 5 minutes by default
 */
function startPeriodicCleanup(intervalMinutes = 5) {
  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[ROOM CLEANUP TASK] Starting periodic cleanup (every ${intervalMinutes} minutes)`);
  
  // Run immediately on startup
  cleanupEmptyRooms();
  
  // Then run periodically
  setInterval(cleanupEmptyRooms, intervalMs);
}

module.exports = {
  cleanupEmptyRooms,
  startPeriodicCleanup
};
