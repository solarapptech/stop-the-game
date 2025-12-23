# IMMEDIATE TEST GUIDE - Stats Tracking

## What I Just Fixed

1. ✅ Added detailed logging throughout the entire flow
2. ✅ Fixed backend profile endpoint to return `_id` instead of `id`
3. ✅ Added stats update in socket handler (was already there)
4. ✅ Added refreshUser call in frontend when game finishes

## EXACT LOGS YOU SHOULD SEE

### When Game Finishes - Backend Console:

```
[ROUND ADVANCEMENT] Starting for game <gameId>
[ROUND ADVANCEMENT] game.nextRound() returned: false for game <gameId>
[SOCKET GAME FINISH] ===== GAME <gameId> HAS FINISHED! =====
[SOCKET GAME FINISH] Game <gameId> has finished! Updating stats...
[SOCKET GAME FINISH] Standings: [ { user: <userId>, score: 50 }, ... ]
[SOCKET GAME FINISH] Highest score: 50, Winners count: 1, Is tie: false
[SOCKET GAME FINISH] Game winner: <winnerId>
[SOCKET GAME FINISH] Processing player <userId>...
[SOCKET GAME FINISH] Before update - PlayerName: matchesPlayed=0, winPoints=0
[SOCKET GAME FINISH] Winner PlayerName (<userId>) earned 50 points. Total winPoints: 50
[SOCKET GAME FINISH] After save - PlayerName: matchesPlayed=1, winPoints=50
[SOCKET GAME FINISH] Emitting game-finished event to game-<gameId>
[SOCKET GAME FINISH] game-finished event emitted successfully
```

### When Game Finishes - Frontend Console:

```
[GameplayScreen] onGameFinished called with data: { winner: {...}, standings: [...] }
[GameplayScreen] Calling refreshUser...
[AuthContext] refreshUser - Fetching profile for user <userId>
[AuthContext] refreshUser - Response: { user: { _id: ..., winPoints: 50, matchesPlayed: 1 } }
[AuthContext] refreshUser - Updated user: { _id: ..., winPoints: 50, matchesPlayed: 1 }
[GameplayScreen] User stats refreshed after game finish
```

### When You Navigate to Menu - Frontend Console:

```
[MenuScreen] User stats refreshed
[AuthContext] refreshUser - Fetching profile for user <userId>
[AuthContext] refreshUser - Response: { user: { _id: ..., winPoints: 50, matchesPlayed: 1 } }
```

## TEST STEPS (DO THIS NOW)

1. **Restart your backend server** (IMPORTANT - code changes need restart)
   ```bash
   cd backend
   npm start
   ```

2. **Restart your frontend** (IMPORTANT)
   ```bash
   cd frontend
   npm start
   ```

3. **Open TWO browser/device instances** (to have 2 players)

4. **Create a room** and start a game with **1 round only** (to test quickly)

5. **Play through the round** until you see "Continue" button

6. **Click Continue** on both players

7. **WATCH THE CONSOLE LOGS** - you should see the logs above

## IF YOU DON'T SEE BACKEND LOGS

This means the game is NOT finishing. Check:
- Are you playing all the rounds? (currentRound must equal total rounds)
- Is the game status 'round_ended'?
- Look for: `[ROUND ADVANCEMENT] Game <id> not in round_ended status`

## IF YOU SEE BACKEND LOGS BUT NOT FRONTEND LOGS

This means:
- Socket event not being received
- Check if socket is connected when game finishes
- Look for: `[GameplayScreen] onGameFinished called`

## IF YOU SEE FRONTEND LOGS BUT STATS STILL 0

This means:
- Backend didn't save stats properly
- Check the "After save" log shows updated values
- Check MongoDB directly:
  ```javascript
  db.users.findOne({ username: "yourUsername" })
  ```

## QUICK DEBUG COMMANDS

### Check if user exists in DB:
```javascript
// In MongoDB shell or Compass
db.users.findOne({ username: "yourUsername" }, { winPoints: 1, matchesPlayed: 1, _id: 1 })
```

### Manually update stats for testing:
```javascript
// In MongoDB shell
db.users.updateOne(
  { username: "yourUsername" },
  { $set: { winPoints: 100, matchesPlayed: 5 } }
)
```

Then refresh the menu screen and see if it shows 100 points and 5 games.

## WHAT TO SEND ME

If it still doesn't work, send me:
1. **Backend console output** from when you click "Continue"
2. **Frontend console output** from when you click "Continue"  
3. **Screenshot of the dashboard** showing the stats
4. **MongoDB query result** showing the user document

The logs will tell me EXACTLY where it's failing.
