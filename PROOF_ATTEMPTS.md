# Proof Attempts for `sum_equals_total` in `odd_weave_not_balanced`

This document records the various approaches attempted to prove the seemingly trivial statement:

```lean
Fintype.card (warpOnTopPositions w) + Fintype.card (weftOnTopPositions w) = n ^ 2
```

Where:
- `warpOnTopPositions w = {p : ZMod n × ZMod n // w p = 0}`
- `weftOnTopPositions w = {p : ZMod n × ZMod n // w p = 1}`
- We have `partition : ∀ p : ZMod n × ZMod n, w p = 0 ∨ w p = 1`

The mathematical content is trivial: every position is either warp-on-top or weft-on-top (but not both), so the counts add up to the total. The challenge is expressing this in Lean's type system.

---

## Attempt 1: Direct Finset Filtering

**Idea**: Count using `Finset.filter` and show the filtered sets partition the universe.

```lean
have sum_equals_total : Fintype.card (warpOnTopPositions w) +
                        Fintype.card (weftOnTopPositions w) = n ^ 2 := by
  let warp_set := Finset.univ.filter (fun p : ZMod n × ZMod n => w p = 0)
  let weft_set := Finset.univ.filter (fun p : ZMod n × ZMod n => w p = 1)

  have disjoint : Disjoint warp_set weft_set := by
    rw [Finset.disjoint_iff_ne]
    intros x hx y hy
    simp [warp_set, weft_set] at hx hy
    intro heq
    rw [← heq] at hy
    rw [hx] at hy
    exact absurd hy zero_ne_one

  have cover : warp_set ∪ weft_set = Finset.univ := by
    ext p
    simp [warp_set, weft_set]
    exact partition p

  have h1 : Fintype.card (warpOnTopPositions w) = warp_set.card := by rfl
  have h2 : Fintype.card (weftOnTopPositions w) = weft_set.card := by rfl

  calc Fintype.card (warpOnTopPositions w) + Fintype.card (weftOnTopPositions w)
      = warp_set.card + weft_set.card := by rw [h1, h2]
    _ = (warp_set ∪ weft_set).card := (Finset.card_union_of_disjoint disjoint).symm
    _ = Finset.univ.card := by rw [cover]
    _ = Fintype.card (ZMod n × ZMod n) := rfl
    _ = n ^ 2 := total_positions
```

**Error**: The `rfl` proofs for `h1` and `h2` failed because:
```
Tactic `rfl` failed: The left-hand side
  Fintype.card w.warpOnTopPositions
is not definitionally equal to the right-hand side
  warp_set.card
```

The issue is that `Fintype.card` for a subtype doesn't definitionally reduce to the corresponding finset cardinality.

---

## Attempt 2: Using `Fintype.card_of_subtype`

**Idea**: Use the lemma that relates subtype cardinality to finset cardinality.

```lean
have h1 : Fintype.card (warpOnTopPositions w) = warp_set.card := by
  rw [Fintype.card_of_subtype warp_set]
  simp [warpOnTopPositions, warp_set]
```

**Error**:
```
Tactic `rewrite` failed: Did not find an occurrence of the pattern
  Fintype.card_of_subtype ?s
in the target expression
```

The lemma `Fintype.card_of_subtype` seems to have a different signature or doesn't exist in the form I expected.

---

## Attempt 3: Using `simp` to Normalize

**Idea**: Let `simp` figure out the equalities.

```lean
calc Fintype.card (warpOnTopPositions w) + Fintype.card (weftOnTopPositions w)
    = warp_set.card + weft_set.card := by
      simp [warpOnTopPositions, weftOnTopPositions, warp_set, weft_set]
  _ = (warp_set ∪ weft_set).card := (Finset.card_union_of_disjoint disjoint).symm
  ...
```

**Error**:
```
unsolved goals
...
⊢ Fintype.card { p // w p = 0 } + Fintype.card { p // w p = 1 } =
  {p | w p = 0}.card + {p | w p = 1}.card
```

The issue is that `{p | w p = 0}` creates a `Set`, not a `Finset`, and sets don't have a `.card` operation.

---

## Attempt 4: Using `Equiv.sumCompl`

**Idea**: Use the fact that `{p | P p} ⊕ {p | ¬P p} ≃ α` for any predicate `P`.

```lean
have sum_equals_total : Fintype.card (warpOnTopPositions w) +
                        Fintype.card (weftOnTopPositions w) = n ^ 2 := by
  have : Fintype.card (ZMod n × ZMod n) =
         Fintype.card (warpOnTopPositions w) + Fintype.card (weftOnTopPositions w) := by
    rw [← Fintype.card_sum]
    apply Fintype.card_congr
    exact Equiv.sumCompl (fun p => w p = 0)
  rw [← this, total_positions]
```

**Error**:
```
Type mismatch
  Equiv.sumCompl fun p ↦ w p = 0
has type
  { a // w a = 0 } ⊕ { a // ¬w a = 0 } ≃ ZMod n × ZMod n
but is expected to have type
  ZMod n × ZMod n ≃ { p // w p = 0 } ⊕ { p // w p = 1 }
```

The issue is:
1. Direction is backwards (need `.symm`)
2. Need to show `{a | ¬w a = 0} ≃ {a | w a = 1}` (follows from `partition`)

---

## Attempt 5: `Equiv.sumCompl.symm` with Manual Equiv

**Idea**: Fix the direction and manually construct the equivalence between `{p | ¬w p = 0}` and `{p | w p = 1}`.

```lean
have : Fintype.card (ZMod n × ZMod n) =
       Fintype.card (warpOnTopPositions w) + Fintype.card (weftOnTopPositions w) := by
  rw [← Fintype.card_sum]
  apply Fintype.card_congr
  refine (Equiv.sumCompl (fun p => w p = 0)).symm.trans ?_
  refine Equiv.sumCongr (Equiv.refl _) ?_
  refine { toFun := fun p => ⟨p.1, ?_⟩, invFun := fun p => ⟨p.1, ?_⟩, left_inv := ?, right_inv := ? }
  · simp [weftOnTopPositions]
    intro h
    have : w p.val = 0 ∨ w p.val = 1 := partition p.val
    tauto
  · exact p.2
  · intro p; rfl
  · intro p; rfl
```

**Error**: Multiple type unification errors in constructing the manual equivalence. The proof obligations generated by the structure were more complex than expected.

---

## Attempt 6: Using Hypothetical `Fintype.card_subtype_or_disjoint`

**Idea**: Look for a lemma that directly states the partition property.

```lean
have partition_card : Fintype.card (ZMod n × ZMod n) =
                      Fintype.card {p | w p = 0} + Fintype.card {p | w p = 1} := by
  classical
  exact Fintype.card_subtype_or_disjoint (fun p => w p = 0) (fun p => w p = 1)
           (by intro p; have := partition p; tauto)
           (by intro p h0 h1; rw [h0] at h1; exact absurd h1 zero_ne_one)
```

**Error**:
```
Function expected at
  Fintype.card_subtype_or_disjoint (fun p ↦ w p = 0) (fun p ↦ w p = 1) ?m.211
but this term has type
  Fintype.card { x // (fun p ↦ w p = 0) x ∨ (fun p ↦ w p = 1) x } =
    Fintype.card { x // (fun p ↦ w p = 0) x } + Fintype.card { x // (fun p ↦ w p = 1) x }
```

The lemma exists but has a different form - it states the cardinality of the union, not a partition of the whole space.

---

## What Should Work (In Theory)

The cleanest approach should be:

```lean
have sum_equals_total : Fintype.card (warpOnTopPositions w) +
                        Fintype.card (weftOnTopPositions w) = n ^ 2 := by
  conv_lhs => rw [← Fintype.card_sum]
  rw [← total_positions]
  apply Fintype.card_congr
  -- Need: (warpOnTopPositions w ⊕ weftOnTopPositions w) ≃ (ZMod n × ZMod n)
  -- This follows from Equiv.sumCompl plus the fact that ¬(w p = 0) ↔ (w p = 1)
  sorry
```

The missing piece is constructing or finding the right equivalence that:
1. Uses `Equiv.sumCompl` to get `{p | w p = 0} ⊕ {p | ¬w p = 0} ≃ ZMod n × ZMod n`
2. Composes with an equivalence showing `{p | ¬w p = 0} ≃ {p | w p = 1}` (via `partition`)

---

## Lessons Learned

1. **Definitional equality is strict**: `Fintype.card` of a subtype is not definitionally equal to the corresponding finset cardinality, even when they're obviously equal mathematically.

2. **Type unification is fragile**: Small differences in how subtypes are expressed can prevent Lean from unifying types, even when they're obviously equivalent.

3. **Equiv composition is tricky**: Manually constructing equivalences requires getting all the proof obligations exactly right, which can be tedious.

4. **Missing lemmas**: There may be a lemma in mathlib that directly expresses this partition property, but finding it requires knowing the exact naming convention and signature.

---

## Recommended Solution

For production code, this `sorry` should be replaced with either:

1. A call to a mathlib lemma that directly handles disjoint partitions (if one exists)
2. A carefully constructed use of `Equiv.sumCompl` with a helper lemma about `¬(w p = 0) ↔ (w p = 1)`
3. A custom lemma proved separately that can be reused for similar counting arguments

The mathematical content is trivial; the challenge is purely Lean bookkeeping.
