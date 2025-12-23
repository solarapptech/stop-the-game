# Stats Tracking Debug Guide

## Overview
This document helps debug the stats tracking system (winPoints and matchesPlayed).

## Expected Flow

### When a Game Finishes:

1. **Backend Updates Stats** (HTTP route or Socket handler)
   - All players: `matchesPlayed += 1`
   - Winner only (no tie): `winPoints += score`
   - Stats saved to MongoDB

2. **Frontend Receives game-finished Event**
   - GameplayScreen calls `refreshUser()`
   - Fetches latest user data from `/api/user/profile/:userId`
   - Updates local state and AsyncStorage

3. **Dashboard Shows Updated Stats**
   - MenuScreen refreshes on focus
   - Displays latest winPoints and matchesPlayed

## Debug Checklist

### Backend Logs to Look For:

```
[GAME FINISH] Game <gameId> has finished! Updating stats...
[GAME FINISH] Standings: [...]
[GAME FINISH] Highest score: X, Winners count: Y, Is tie: false/true
[GAME FINISH] Processing player <userId>...
[GAME FINISH] Before update - <displayName>: matchesPlayed=X, winPoints=Y
[GAME FINISH] After save - <displayName>: matchesPlayed=X+1, winPoints=Y+Z
```

OR (if using socket handler):

```
[SOCKET GAME FINISH] Game <gameId> has finished! Updating stats...
[SOCKET GAME FINISH] Standings: [...]
[SOCKET GAME FINISH] Processing player <userId>...
[SOCKET GAME FINISH] Before update - <displayName>: matchesPlayed=X, winPoints=Y
[SOCKET GAME FINISH] After save - <displayName>: matchesPlayed=X+1, winPoints=Y+Z
```

### Frontend Logs to Look For:

```
[GameplayScreen] User stats refreshed after game finish
[AuthContext] refreshUser - Fetching profile for user <userId>
[AuthContext] refreshUser - Response: { user: { winPoints: X, matchesPlayed: Y } }
[AuthContext] refreshUser - Updated user: { _id: ..., winPoints: X, matchesPlayed: Y }
[MenuScreen] User stats refreshed
```

## Common Issues & Solutions

### Issue 1: Stats Not Updating in Database
**Symptoms**: Backend logs show "Before update" but values don't change
**Possible Causes**:
- User not found in database
- Database save failing silently
- Wrong user ID being used

**Check**:
- Look for `[GAME FINISH] ERROR: User <userId> not found in database!`
- Verify user IDs in standings match actual user documents

### Issue 2: Frontend Not Refreshing
**Symptoms**: Backend updates but dashboard shows 0
**Possible Causes**:
- refreshUser() not being called
- API endpoint returning wrong data
- User object not updating in state

**Check**:
- Look for `[AuthContext] refreshUser` logs
- Verify API response contains correct winPoints/matchesPlayed
- Check if user state is being updated

### Issue 3: Wrong User ID Format
**Symptoms**: Profile endpoint returns 404
**Possible Causes**:
- Using `id` instead of `_id`
- User object structure mismatch

**Solution**: Backend now returns `_id` in profile endpoint

## Testing Steps

1. **Start a game** with 2+ players
2. **Complete all rounds** until game finishes
3. **Check backend console** for `[GAME FINISH]` logs
4. **Check frontend console** for `[AuthContext] refreshUser` logs
5. **Navigate to Menu** and verify stats updated
6. **Check MongoDB** directly:
   ```javascript
   db.users.find({ username: "yourUsername" }, { winPoints: 1, matchesPlayed: 1 })
   ```

## Key Files

### Backend:
- `backend/routes/game.js` - HTTP /next-round endpoint (lines 483-523)
- `backend/socket/socketHandlers.js` - Socket advanceToNextRound (lines 1110-1152)
- `backend/routes/user.js` - Profile endpoint (lines 7-30)
- `backend/models/User.js` - User schema (lines 78-85)

### Frontend:
- `frontend/src/contexts/AuthContext.js` - refreshUser function (lines 251-282)
- `frontend/src/screens/GameplayScreen.js` - onGameFinished handler (lines 414-429)
- `frontend/src/screens/MenuScreen.js` - Stats display and refresh (lines 24-48, 193-208)

## Expected Behavior

### After 1 Game (Winner with 50 points):
- Winner: `matchesPlayed = 1`, `winPoints = 50`
- Loser: `matchesPlayed = 1`, `winPoints = 0`

### After 2 Games (Winner with 50 then 60 points):
- Winner: `matchesPlayed = 2`, `winPoints = 110`

### Draw/Tie Game:
- All players: `matchesPlayed += 1`, `winPoints` unchanged
