# Plasma Bands Anti-Camping Mechanic

## Overview

Plasma bands force the player to keep moving. Staying stationary triggers horizontal and vertical plasma bands that close in from the arena edges, shrinking the safe zone. The mechanic punishes passive play with lethal consequences.

## Behaviour

### Stationary Detection

- Track player velocity each frame
- If velocity falls below threshold for 0.5 second, player is considered "stationary"
- Grace period at wave start and after respawn before stationary detection activates (prevents punishment for spawning into chaos)

### Band Spawning

- When stationary threshold exceeded, two plasma bands appear. One at the top or bottom edge, another at the left or right edge. The edges should be the closest to the player.
- The bands appear based on the viewable area of the player, not the arena bounds
- Bands create a cross hair moving in on the players position

### Band Movement

- Bands zero in on the player at a consistent rate, shrinking the safe zone
- When player moves (velocity exceeds threshold), bands **stop closing** but do **not disappear**
- Bands remain in place, still lethal, during a fade-out period
- Only after fade completes does the arena space become safe again

### Death Spiral

- If player remains stationary becomes stationary again while bands are still active, **new bands spawn again**
- Completely fair: player gets multiple chances to respond, but each ignored warning makes recovery harder

### Collision

- Bands are **lethal at all times** while visible (including during fade-out)
- Contact with any band kills the player instantly
- No damage/health - instant death

## Visual Design

### Core Appearance

- White hot core running the full length of each band
- Sells "instant death" - reads as pure energy

### Particle Effect

- Dense yellow particles tightly clustered along the band's length
- Particles **jitter in place** (not travelling along the band)
- Creates volatile, unstable, crackling appearance
- Should look like barely-contained energy, Tesla coil aesthetic
- Fizzing, dangerous, something you don't want to touch

### Colour Choice Rationale

- White/yellow cuts through the neon chaos
- Distinct from enemy colours - reads as environmental threat, not entity
- Players instantly recognise it as "different rules"

### Fade-Out Visual

- During fade-out, bands should dim/destabilise but remain clearly visible
- Player must be able to see that the space is still dangerous
- Could increase jitter/instability during fade to signal imminent dissipation

## Tuning Parameters

| Parameter           | Description                                  | Suggested Starting Value                                      |
|---------------------|----------------------------------------------|---------------------------------------------------------------|
| `velocityThreshold` | Minimum velocity to count as "moving"        | Very low, near-zero                                           |
| `stationaryTime`    | Time before bands spawn                      | 0.5 second                                                    |
| `graceTime`         | Immunity time at game / wave start / respawn | 3 seconds                                                     |
| `closeSpeed`        | How fast bands move inward                   | Tune to feel - fast enough to threaten, slow enough to escape |
| `fadeTime`          | How long bands persist after player moves    | 1-2 seconds                                                   |
| `particleDensity`   | Yellow particles per unit length             | Dense enough to fizz                                          |
| `jitterAmount`      | Particle position variance                   | Enough to feel volatile                                       |

## Implementation Notes

- Consider visual telegraph before bands become lethal (brief dim appearance before full intensity)
- Particle system should be GPU-friendly given existing particle load

## Emergent Gameplay

- Camping during heavy wave = self-inflicted crisis (dodging enemies in reduced space)
- Creates genuine consequences for passive play
- Aggressive play rewarded by never triggering the mechanic