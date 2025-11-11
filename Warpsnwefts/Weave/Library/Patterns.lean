import Warpsnwefts.Weave

namespace Warpsnwefts
namespace Weave
namespace Library
namespace Patterns

open Nat

/-- Ensure that user-facing natural number parameters are at least `1`. -/
private def sanitize (k : ℕ) : ℕ := max 1 k

/-- A symmetric saw-tooth wave that rises for `half` steps and then falls. -/
private def triangularWave (half coord : ℕ) : ℕ :=
  let half := sanitize half
  let period := 2 * half
  let x := coord % period
  if x < half then x else period - x - 1

/-- Decide whether a diagonal twill stripe places the warp (`0`) or weft (`1`) on top. -/
private def twillStripe (diag over under : ℕ) : ZMod 2 :=
  let over := sanitize over
  let under := sanitize under
  let period := over + under
  if (diag % period) < over then 0 else 1

variable {n : ℕ} [NeZero n]

/-- The classic plain weave where warp and weft alternate every pick. -/
def plain : Weave n :=
  fun p => (((p.1.val + p.2.val) % 2 : ℕ) : ZMod 2)

/--
A basic rising twill: the warp floats over `over` picks, then under `under` picks,
producing diagonal ribs in the fabric.
-/
def risingTwill (over under : ℕ) : Weave n :=
  fun p => twillStripe (p.1.val + p.2.val) over under

/--
A herringbone weave reverses the twill direction every `segmentLen` warp threads,
producing the characteristic V-shaped chevrons.
`over` and `under` configure the (balanced) twill sequence inside each chevron.
-/
def herringbone (segmentLen over under : ℕ) : Weave n :=
  let segment := sanitize segmentLen
  fun p =>
    let i := p.1.val
    let j := p.2.val
    let blockOdd : Bool := decide (((i / segment) % 2) = 1)
    let jBlock := j / segment
    let jInBlock := j % segment
    let orientedJ := if blockOdd then segment - 1 - jInBlock else jInBlock
    let diag := i + jBlock * segment + orientedJ
    twillStripe diag over under

/-- Distance from the center of a mirrored block of width `2 * half`. -/
private def centeredAbs (half coord : ℕ) : ℕ :=
  let half := sanitize half
  let period := 2 * half
  let x := (coord + half) % period
  if x < half then half - x else x - half

/--
A diamond weave (pointed twill) reflects the rising twill in both warp and weft
directions, producing lozenge-shaped motifs whose half-diagonal is `halfDiagonal`.
The parameter controls the Manhattan radius of each diamond.
-/
def diamond (halfDiagonal : ℕ) : Weave n :=
  let half := sanitize halfDiagonal
  fun p =>
    let dx := centeredAbs half p.1.val
    let dy := centeredAbs half p.2.val
    if dx + dy ≤ half then 0 else 1

end Patterns
end Library
end Weave
end Warpsnwefts
