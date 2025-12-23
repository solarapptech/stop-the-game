# Round Skipping Bug Fix

## Problem Summary
Rounds were sometimes getting skipped when the letter selector didn't pick a letter within the time limit. The turn would pass to another player, but then the entire round would be skipped instead of starting with a random letter.

## Root Causes Identified

### 1. **Duplicate Timer Management**
- Socket handlers and HTTP routes created independent, uncoordinated timers
- When a letter was selected manually, only socket timers were cleared, leaving HTTP route timers running
- This caused race conditions where multiple timers could fire simultaneously

### 2. **No Centralized Timer Cleanup**
- Timers were created in multiple places without proper cleanup
- Old timers from previous rounds could interfere with new rounds
- No single source of truth for active timers

### 3. **Race Conditions in Round Advancement**
- Multiple simultaneous calls to `game.nextRound()` could cause double advancement
- HTTP route and socket 'next-round-ready' event both called `game.nextRound()` independently
- No locking mechanism to prevent concurrent advancement

### 4. **Incomplete State Validation**
- No safeguards to verify game state before advancing rounds
- Missing checks for whether letter selection completed properly

## Solution Implemented

### **Centralized Timer Management** (socketHandlers.js)

#### 1. Created `clearGameTimers()` function
- Clears ALL timers for a game in one place
- Handles letter selection, letter reveal, and round timers
- Comprehensive logging for debugging

```javascript
const clearGameTimers = (gameId) => {
  const id = gameId.toString();
  
  // Clear letter selection timer
  const lt = letterTimers.get(id);
  if (lt) {
    clearTimeout(lt);
    letterTimers.delete(id);
    console.log(`[TIMER CLEANUP] Cleared letter timer for game ${id}`);
  }
  
  // Clear letter reveal timer
  const rt = letterRevealTimers.get(id);
  if (rt) {
    clearTimeout(rt);
    letterRevealTimers.delete(id);
    console.log(`[TIMER CLEANUP] Cleared letter reveal timer for game ${id}`);
  }
  
  // Clear round timer
  const rnd = roundTimers.get(id);
  if (rnd) {
    clearTimeout(rnd);
    roundTimers.delete(id);
    console.log(`[TIMER CLEANUP] Cleared round timer for game ${id}`);
  }
};
```

#### 2. Created `startLetterSelection()` function
- Single entry point for starting letter selection phase
- Clears all existing timers before creating new ones
- Sets up 12-second countdown for manual selection
- **Guarantees** auto-pick after 12 seconds if no letter chosen
- Proceeds to reveal phase automatically

```javascript
const startLetterSelection = async (game) => {
  const gameId = game._id.toString();
  
  // Clear any existing timers first
  clearGameTimers(gameId);
  
  // Set up letter selection with deadline
  game.letterDeadline = new Date(Date.now() + 12000);
  game.status = 'selecting_letter';
  await game.save();
  
  // Emit to clients
  io.to(`game-${gameId}`).emit('letter-selection-started', {...});
  
  // Schedule auto-pick after 12s if not chosen
  const selTimer = setTimeout(async () => {
    const g = await Game.findById(gameId);
    if (g && g.status === 'selecting_letter' && !g.currentLetter) {
      const autoLetter = g.selectRandomLetter();
      await g.save();
      await proceedWithLetterReveal(gameId, autoLetter);
    }
  }, 12000);
  
  letterTimers.set(gameId, selTimer);
};
```

#### 3. Created `proceedWithLetterReveal()` function
- Handles letter reveal animation (3-second countdown)
- Transitions to 'playing' status
- Starts 60-second round timer
- Centralizes all round start logic

#### 4. Refactored `letter-selected` socket handler
- Now uses centralized `proceedWithLetterReveal()` function
- Properly clears timer when user manually selects
- Falls back to random letter if invalid letter provided
- Enhanced logging for debugging

### **Race Condition Prevention**

#### 1. Added Round Advancement Lock
```javascript
const roundAdvancementLocks = new Map(); // Prevent concurrent round advancement
```

- Prevents multiple simultaneous round advancements
- Lock is acquired at start of `advanceToNextRound()`
- Lock is released in finally block
- Additional safety: checks `game.status === 'round_ended'` before advancing

#### 2. Refactored `advanceToNextRound()` function
- Uses lock mechanism to prevent concurrent calls
- Validates game status before advancing
- Uses centralized `startLetterSelection()` function
- Proper error handling and lock cleanup

### **HTTP Route Delegation** (routes/game.js)

#### Modified `/next-round` endpoint
- Removed ALL timer management code from HTTP layer
- HTTP route advances round and saves state
- Emits `'advance-round-trigger'` event to socket layer
- Socket layer handles all timer creation via centralized functions

#### Added `'advance-round-trigger'` socket listener
- Receives event from HTTP route
- Validates game state
- Calls `startLetterSelection()` for timer management
- Ensures consistency with socket-initiated round advancement

## Flow Diagrams

### Letter Selection Flow (When Player Picks)
```
Player clicks letter
  → 'letter-selected' socket event
  → Validate player is selector
  → Clear letter selection timer ✓
  → Validate and set letter (or random fallback)
  → proceedWithLetterReveal()
    → Emit 'letter-accepted' with 3s countdown
    → After 3s: Set status = 'playing'
    → Start 60s round timer
    → Emit 'letter-selected'
```

### Letter Selection Flow (When Timer Expires)
```
12 seconds pass with no selection
  → Auto-pick timer fires
  → Check status === 'selecting_letter' AND no letter chosen
  → selectRandomLetter() ✓
  → proceedWithLetterReveal()
    → Emit 'letter-accepted' with 3s countdown
    → After 3s: Set status = 'playing'
    → Start 60s round timer
    → Emit 'letter-selected'
```

### Round Advancement Flow (Socket)
```
Players click "Next Round"
  → 'next-round-ready' socket event
  → Add to ready set
  → When all ready:
    → advanceToNextRound()
      → Acquire lock ✓
      → Check status === 'round_ended' ✓
      → game.nextRound() (increments round, rotates selector)
      → startLetterSelection() (centralized timer mgmt)
      → Release lock
```

### Round Advancement Flow (HTTP)
```
HTTP POST /next-round
  → Check status === 'round_ended' ✓
  → game.nextRound() (increments round, rotates selector)
  → Save game
  → Emit 'advance-round-trigger' to socket layer
  → Socket handler receives event:
    → Check status === 'selecting_letter' ✓
    → startLetterSelection() (centralized timer mgmt)
```

## Key Guarantees

### ✓ Letter Always Selected
- Auto-pick timer ALWAYS fires after 12 seconds
- Validates status before auto-picking
- Falls back to random if manual selection invalid
- No way to skip letter selection phase

### ✓ No Timer Conflicts
- All timers cleared before creating new ones
- Single source of timer management
- HTTP layer delegates to socket layer
- Timers properly cleaned up on disconnection

### ✓ No Double Round Advancement
- Lock prevents concurrent socket-initiated advancement
- Status checks prevent HTTP/socket race conditions
- Only one path can successfully advance at a time
- Lock released even on errors (finally block)

### ✓ Proper Timer Cleanup
- `clearGameTimers()` removes all timers for a game
- Called before starting new letter selection
- Called when letter is manually selected
- Prevents old timers from firing

## Testing Checklist

- [x] Letter auto-selected when timer expires (round starts)
- [x] Round does NOT skip when timer expires
- [x] Manual letter selection clears timer
- [x] Random letter fallback works
- [x] Multiple players can't advance round simultaneously
- [x] HTTP and socket paths both work correctly
- [x] Timers cleaned up properly
- [x] Game state stays consistent

## Files Modified

1. **backend/socket/socketHandlers.js**
   - Added `roundAdvancementLocks` Map
   - Added `clearGameTimers()` function
   - Added `startLetterSelection()` function  
   - Added `proceedWithLetterReveal()` function
   - Refactored `letter-selected` handler
   - Refactored `advanceToNextRound()` function
   - Added `'advance-round-trigger'` listener

2. **backend/routes/game.js**
   - Modified `/next-round` endpoint
   - Removed duplicate timer logic
   - Delegates to socket layer via event emission

## Logging

Enhanced logging helps debug issues:
- `[TIMER CLEANUP]` - Timer cleanup operations
- `[LETTER SELECTION]` - Letter selection phase start
- `[LETTER AUTO-PICK]` - Automatic letter selection
- `[LETTER SELECTED]` - Manual letter selection
- `[LETTER REVEAL]` - Letter reveal phase
- `[ROUND START]` - Round play phase start
- `[ROUND ADVANCEMENT]` - Round advancement operations
- `[ADVANCE-ROUND-TRIGGER]` - HTTP-triggered advancement
- `[HTTP NEXT-ROUND]` - HTTP route operations

## Migration Notes

No database migration needed. Changes are purely code-level.

Existing games in progress should automatically benefit from the fixes on next round.

## Future Improvements

1. Consider extracting timer management to a separate service
2. Add metrics/monitoring for timer-related issues
3. Consider WebSocket heartbeat for better disconnection handling
4. Add unit tests for timer logic
