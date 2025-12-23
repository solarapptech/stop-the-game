# Room Cleanup Implementation

## Overview
This document describes the comprehensive room cleanup system implemented to ensure **NO empty rooms ever linger in the database**.

It also covers the TTL-based expiration policy that ensures **no rooms or games can remain in the database indefinitely**, even if they are not empty.

## Problem
Previously, rooms could become orphaned (empty but not deleted) when users left or disconnected, causing database bloat and potential issues with the Quick Play matchmaking system.

## Solution: Multi-Layer Defense System

### TTL Expiration (15 minutes)

In addition to deleting empty rooms, the system enforces a MongoDB TTL expiry for both rooms and games:

- `Room.expiresAt`
- `Game.expiresAt`

Behavior:

- Documents are automatically deleted by MongoDB when `expiresAt` is reached.
- Expiration is set to **15 minutes**.
- Expiration is refreshed during normal activity.
- Expiration is refreshed when each round ends (validation completes).
- On **rematch**, the expiration is refreshed back to **15 minutes** again.

This acts as the final safety net to guarantee database hygiene even for edge cases where a room/game might not become empty.

### Layer 1: Centralized Cleanup Helper (socketHandlers.js)
**Location**: `backend/socket/socketHandlers.js` (lines 17-50)

A centralized `cleanupEmptyRoom()` helper function that:
- Checks if a room has 0 players
- Deletes the room from database if empty
- Cleans up associated timers (rematch timers, etc.)
- Provides comprehensive logging for debugging

```javascript
const cleanupEmptyRoom = async (roomId) => {
  // Safely deletes room if empty
  // Cleans up all associated data
  // Returns true if deleted, false otherwise
}
```

### Layer 2: Socket Event Handlers

#### A. Leave Room Event (`leave-room`)
**Location**: `backend/socket/socketHandlers.js` (lines 327-409)

When a user explicitly leaves a room via the UI:
1. Removes player from room
2. Checks if room is empty
3. If empty → calls `cleanupEmptyRoom()`
4. If not empty → transfers ownership if needed
5. Notifies remaining players

**Logging**: 
- `[LEAVE ROOM] User X leaving room Y`
- `[LEAVE ROOM] After removal, room X has Y player(s)`
- `[LEAVE ROOM] Room is empty, calling cleanup`

#### B. Disconnect Event (`disconnect`)
**Location**: `backend/socket/socketHandlers.js` (lines 1066-1153)

When a user disconnects (browser close, network loss, etc.):
1. Cleans up quick play queue if applicable
2. Removes player from room
3. Aborts any rematch countdowns
4. Checks if room is empty
5. If empty → calls `cleanupEmptyRoom()`
6. If not empty → transfers ownership if needed

**Logging**:
- `[DISCONNECT] User X disconnected from room Y`
- `[DISCONNECT] After removal, room X has Y player(s)`
- `[DISCONNECT] Room is empty, calling cleanup`

#### C. Delete Room Event (`delete-room`)
**Location**: `backend/socket/socketHandlers.js` (lines 1006-1040)

When a room owner manually deletes the room:
1. Notifies all players
2. Deletes room from database
3. Forces all sockets to leave the room

### Layer 3: HTTP REST Endpoints

#### Leave Room Endpoint
**Location**: `backend/routes/room.js` (lines 243-296)

When a user leaves via HTTP API:
1. Removes player atomically
2. **CRITICAL**: Immediately deletes room if `players.length === 0`
3. Transfers ownership if needed

**Logging**:
- `[HTTP LEAVE] User X leaving room Y`
- `[HTTP LEAVE] After removal, room X has Y player(s)`
- `[HTTP LEAVE] Room X is empty, deleting`

### Layer 4: Periodic Cleanup Task (Safety Net)

#### Automatic Background Cleanup
**Location**: `backend/utils/roomCleanup.js`

Runs every **5 minutes** automatically:
1. Queries database for all rooms with 0 players
2. Deletes any found empty rooms
3. Logs all deletions with timestamps

**Purpose**: Catches any edge cases that might slip through the other layers

**Startup**: Initiated in `server.js` after MongoDB connection

**Logging**:
- `[ROOM CLEANUP TASK] Starting periodic cleanup check...`
- `[ROOM CLEANUP TASK] Found X empty room(s)`
- `[ROOM CLEANUP TASK] Deleting empty room: X (name) created at Y`
- `[ROOM CLEANUP TASK] Cleanup complete. Deleted X room(s)`

#### Manual Cleanup Endpoint
**Location**: `backend/routes/room.js` (lines 366-379)

**Endpoint**: `POST /api/room/cleanup-empty`

For debugging/admin use - manually trigger cleanup:
```bash
# Requires authentication
POST /api/room/cleanup-empty
Authorization: Bearer <token>

# Response
{
  "message": "Cleanup completed",
  "deleted": 2,
  "rooms": [
    {
      "id": "...",
      "name": "Quick Play Room",
      "createdAt": "2025-11-01T..."
    }
  ]
}
```

## Coverage Matrix

| Exit Scenario | Cleanup Handler | Location |
|--------------|----------------|----------|
| User clicks "Leave" button | `leave-room` socket event | socketHandlers.js:327 |
| User closes browser/app | `disconnect` socket event | socketHandlers.js:1066 |
| Network disconnection | `disconnect` socket event | socketHandlers.js:1066 |
| Owner deletes room | `delete-room` socket event | socketHandlers.js:1006 |
| HTTP API leave call | `/leave/:roomId` endpoint | routes/room.js:243 |
| Edge cases/missed scenarios | Periodic cleanup task | utils/roomCleanup.js |
| Manual intervention | `/cleanup-empty` endpoint | routes/room.js:366 |

## Monitoring & Debugging

### Log Patterns to Watch For

**Normal Operation**:
```
[LEAVE ROOM] User 123 (PlayerName) leaving room abc
[LEAVE ROOM] After removal, room abc has 0 player(s)
[LEAVE ROOM] Room is empty, calling cleanup
[ROOM CLEANUP] Deleting empty room: abc (Room Name)
[ROOM CLEANUP] Successfully deleted room abc
```

**Periodic Cleanup Finding Orphans** (should be rare):
```
[ROOM CLEANUP TASK] Found 1 empty room(s)
[ROOM CLEANUP TASK] Deleting empty room: xyz (Quick Play Room) created at ...
```
⚠️ If this happens frequently, investigate why rooms aren't being cleaned up by the primary handlers.

### Database Query to Check for Orphans

Run this in MongoDB to manually check:
```javascript
db.rooms.find({ $expr: { $eq: [{ $size: "$players" }, 0] } })
```

**Expected Result**: Empty array `[]`

If you find orphaned rooms, check logs for errors in the cleanup handlers.

## Configuration

### Environment Variables

In `.env`:
```env
# Periodic cleanup runs every 5 minutes by default
# Modify startPeriodicCleanup(N) in server.js to change interval
```

## Testing Recommendations

### Test Cases to Verify

1. **Normal Leave**: User leaves room → room deleted if last player
2. **Disconnect**: User disconnects → room deleted if last player
3. **Owner Leave**: Owner leaves → ownership transfers, then room deleted when last player leaves
4. **Quick Play**: User joins via quick play then leaves → room deleted properly
5. **Multiple Rapid Leaves**: All players leave quickly → room deleted (no race conditions)
6. **Network Interruption**: Simulate network loss → room cleaned up on disconnect

### How to Test

1. Create a room
2. Join with multiple users
3. Have all users leave (or disconnect)
4. Query database: `db.rooms.find({ _id: ObjectId("...") })`
5. Should return empty (room deleted)

## Files Modified

1. **backend/socket/socketHandlers.js**
   - Added `cleanupEmptyRoom()` helper
   - Enhanced `leave-room` event
   - Enhanced `disconnect` event
   - Added comprehensive logging

2. **backend/routes/room.js**
   - Enhanced `/leave/:roomId` endpoint
   - Added `/cleanup-empty` endpoint
   - Added logging

3. **backend/utils/roomCleanup.js** (NEW)
   - Periodic cleanup task
   - Manual cleanup function

4. **backend/server.js**
   - Starts periodic cleanup on server start

## Success Criteria

✅ **No empty rooms persist in database**
✅ **All player exit paths trigger cleanup**
✅ **Comprehensive logging for debugging**
✅ **Periodic safety net catches edge cases**
✅ **Manual cleanup available for emergencies**

## Maintenance

- Monitor logs for `[ROOM CLEANUP TASK]` messages
- If periodic cleanup frequently finds orphans, investigate primary handlers
- Adjust cleanup interval in `server.js` if needed (default: 5 minutes)
- Use manual cleanup endpoint for immediate debugging
