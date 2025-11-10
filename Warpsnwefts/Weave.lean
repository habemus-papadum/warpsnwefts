import Mathlib.Data.ZMod.Basic

/-!
# Weave level primitives

This file provides a minimal model for periodic weaves together with colorings
for the warp and weft directions.  The guiding idea is that a weave of size `n`
is encoded by a function `(ℤ / nℤ × ℤ / nℤ) → ℤ / 2ℤ` which records whether the
warp (`0`) or the weft (`1`) thread is on top at a given intersection.
-/

namespace Warpsnwefts

open scoped BigOperators

/-- A periodic weave of size `n`. -/
abbrev Weave (n : ℕ) : Type _ :=
  (ZMod n × ZMod n) → ZMod 2

/-- A periodic coloring of size `n` that takes values in `ℤ / kℤ`. -/
abbrev PeriodicColoring (n k : ℕ) : Type _ :=
  ZMod n → ZMod k

/-- A weave equipped with independent periodic colorings for warp and weft. -/
structure ColoredWeave (n warpColors weftColors : ℕ) where
  weave : Weave n
  warpColoring : PeriodicColoring n warpColors
  weftColoring : PeriodicColoring n weftColors

namespace Weave

variable {n : ℕ}

/-- Decidability for the predicate "the warp is on top" at a given position. -/
instance (w : Weave n) :
    DecidablePred (fun p : ZMod n × ZMod n => w p = 0) :=
  fun _ => inferInstance

/-- Decidability for the predicate "the weft is on top" at a given position. -/
instance (w : Weave n) :
    DecidablePred (fun p : ZMod n × ZMod n => w p = 1) :=
  fun _ => inferInstance

/-- Positions where the warp thread sits on top (encoded by `0`). -/
def warpOnTopPositions (w : Weave n) : Type _ :=
  { p : ZMod n × ZMod n // w p = 0 }

/-- Positions where the weft thread sits on top (encoded by `1`). -/
def weftOnTopPositions (w : Weave n) : Type _ :=
  { p : ZMod n × ZMod n // w p = 1 }

/--
A weave is *reversible* if viewing it from the reverse side recovers the same
pattern after possibly shifting along warp (`a`) and weft (`b`) directions.
Looking from the back swaps which thread appears on top, so reversing relates
each crossing to one where the on-top indicator is flipped.
-/
def Reversible (w : Weave n) : Prop :=
  ∃ a b : ZMod n, ∀ i j : ZMod n, w (i, j) = 1 - w (a - i, b + j)

/-- A weave is *balanced* if the warp-on-top and weft-on-top positions correspond
via a bijection (hence, when the grid is finite, they occur equally often). -/
def Balanced (w : Weave n) : Prop :=
  Nonempty (weftOnTopPositions w ≃ warpOnTopPositions w)

/-- Reversible weaves are necessarily balanced. -/
theorem reversible_implies_balanced {w : Weave n} (h : Reversible w) :
    Balanced w := by
  classical
  rcases h with ⟨a, b, hrev⟩
  -- The map pairing a front-facing crossing with its reversed counterpart.
  let f : ZMod n × ZMod n → ZMod n × ZMod n := fun p ↦ (a - p.1, b + p.2)
  let g : ZMod n × ZMod n → ZMod n × ZMod n := fun p ↦ (a - p.1, p.2 - b)
  -- Build an explicit bijection between weft-on-top and warp-on-top positions.
  have hEquiv :
      weftOnTopPositions w ≃ warpOnTopPositions w :=
    { toFun := fun p =>
        ⟨f p.1, by
          have hbase := hrev p.1.1 p.1.2
          have hFront :
              (1 : ZMod 2) = 1 - w (f p.1) := by
            simpa [f, p.property] using hbase
          have := congrArg (fun t => (1 : ZMod 2) - t) hFront
          simpa [f, sub_sub, sub_self] using this.symm⟩
      invFun := fun q =>
        ⟨g q.1, by
          have hbase := hrev (g q.1).1 (g q.1).2
          have hBack :
              w (g q.1) = 1 - w (f (g q.1)) := by
            simpa [f, g] using hbase
          simpa [f, g, q.property] using hBack⟩
      left_inv := by
        intro p
        apply Subtype.ext
        ext <;> simp [f, g, sub_eq_add_neg]
      right_inv := by
        intro q
        apply Subtype.ext
        ext <;> simp [f, g, sub_eq_add_neg] }
  exact ⟨hEquiv⟩

/--
For a weave of odd size, it is impossible for the weave to be balanced.
This is because the total number of positions n² is odd, so we cannot
evenly split positions between warp-on-top and weft-on-top.
-/
theorem odd_weave_not_balanced {n : ℕ} [NeZero n] (hn : Odd n) (w : Weave n) :
    ¬ Balanced w := by
  classical
  -- Assume for contradiction that the weave is balanced
  intro ⟨equiv⟩

  -- The total number of positions in the grid is n²
  have total_positions : Fintype.card (ZMod n × ZMod n) = n ^ 2 := by
    simp only [Fintype.card_prod, ZMod.card, sq]

  -- Every position is either warp-on-top or weft-on-top
  have partition : ∀ p : ZMod n × ZMod n, w p = 0 ∨ w p = 1 := by
    intro p
    have : (w p).val < 2 := ZMod.val_lt (w p)
    have : (w p).val = 0 ∨ (w p).val = 1 := by omega
    cases this with
    | inl h => left; exact ZMod.val_injective 2 h
    | inr h => right; exact ZMod.val_injective 2 h

  -- The warp and weft position types have Fintype instances
  letI : Fintype (warpOnTopPositions w) := Subtype.fintype (fun p => w p = 0)
  letI : Fintype (weftOnTopPositions w) := Subtype.fintype (fun p => w p = 1)

  -- Since there's a bijection, the counts must be equal
  have equal_counts : Fintype.card (warpOnTopPositions w) =
                      Fintype.card (weftOnTopPositions w) :=
    Fintype.card_congr equiv.symm

  -- The sum of warp-on-top and weft-on-top positions equals the total
  have sum_equals_total : Fintype.card (warpOnTopPositions w) +
                          Fintype.card (weftOnTopPositions w) = n ^ 2 := by
    -- Every position is either warp-on-top or weft-on-top (disjoint partition)
    classical
    -- Convert the complement `{p // ¬ w p = 0}` to the weft positions.
    have complEquivWeft :
        { p : ZMod n × ZMod n // ¬ w p = 0 } ≃ weftOnTopPositions w := by
      refine
        { toFun := ?_,
          invFun := ?_,
          left_inv := ?_,
          right_inv := ?_ }
      · intro p
        refine ⟨p.1, ?_⟩
        exact Or.resolve_left (partition p.1) p.2
      · intro p
        refine ⟨p.1, ?_⟩
        intro h0
        have : (0 : ZMod 2) = 1 := by
          calc
            (0 : ZMod 2) = w p.1 := by simp [h0]
            _ = 1 := by simp [p.2]
        exact (by decide : (0 : ZMod 2) ≠ 1) this
      · intro p
        apply Subtype.ext
        rfl
      · intro p
        apply Subtype.ext
        rfl
    -- Combine the partition equivalence with `Equiv.sumCompl` to relate counts.
    have totalEquiv :
        warpOnTopPositions w ⊕ weftOnTopPositions w ≃ ZMod n × ZMod n :=
      (Equiv.sumCongr (Equiv.refl _) complEquivWeft.symm).trans
        (Equiv.sumCompl fun p : ZMod n × ZMod n => w p = 0)
    have card_sum := Fintype.card_congr totalEquiv
    -- Translate the cardinality equality into the desired numeric identity.
    calc
      Fintype.card (warpOnTopPositions w) + Fintype.card (weftOnTopPositions w)
          = Fintype.card (warpOnTopPositions w ⊕ weftOnTopPositions w) := by
            simp [Fintype.card_sum]
        _ = Fintype.card (ZMod n × ZMod n) := card_sum
        _ = n ^ 2 := total_positions

  -- Therefore, 2 * card(warpOnTopPositions) = n²
  have double_warp : 2 * Fintype.card (warpOnTopPositions w) = n ^ 2 := by
    calc 2 * Fintype.card (warpOnTopPositions w)
        = Fintype.card (warpOnTopPositions w) + Fintype.card (warpOnTopPositions w) := two_mul _
      _ = Fintype.card (warpOnTopPositions w) + Fintype.card (weftOnTopPositions w) := by
          rw [equal_counts]
      _ = n ^ 2 := sum_equals_total

  -- This means 2 divides n², so n² is even
  have n_sq_even : Even (n ^ 2) := by
    use Fintype.card (warpOnTopPositions w)
    rw [← double_warp, two_mul]

  -- But n is odd, so n² is odd (contradiction)
  have n_sq_odd : Odd (n ^ 2) :=
    hn.pow

  -- Even and odd are contradictory
  have : ¬ Even (n ^ 2) := Nat.not_even_iff_odd.mpr n_sq_odd
  contradiction

end Weave

end Warpsnwefts
