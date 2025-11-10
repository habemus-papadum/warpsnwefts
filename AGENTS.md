# AGENTS.md - Guide for Theorem Proving and Lean 4 in This Repository

This file provides guidance for AI agents working on theorem proving in Lean 4 within this repository.

## How to Run Things

There are three main ways to interact with Lean 4 code in this project:

### 1. Pipe Code Directly into the Lean Compiler

You can test arbitrary Lean 4 expressions by piping them directly to the compiler:

```bash
echo 'def foo := "bar"' | lake env lean --stdin
```

**Important**: The current working directory must be the project root (e.g. `warpsnwefts`) for this to work properly.

### 2. Build Individual Files

To compile a specific file, use the module path (not the file path):

```bash
lake build Warpsnwefts.Fermat
```

Note: Use dots to separate module names (e.g., `Warpsnwefts.Fermat` for the file `Warpsnwefts/Fermat.lean`).

### 3. Build the Entire Project

To build all files in the project:

```bash
lake build
```

## How to Explore Mathlib

### Location of Mathlib

Mathlib is located in `.lake/packages/mathlib/`. The compiled library files are in `.lake/packages/mathlib/.lake/build/lib/lean/Mathlib/`.

### Searching for Theorems and Definitions

The easiest way to find relevant theorems and lemmas is to use your search tools (like `rg` or `Grep`) to search through mathlib:

```bash
# Search for theorems about modular arithmetic
rg "theorem.*mod" --type lean .lake/packages/mathlib/Mathlib/Data/ZMod/

# Search for specific function names
rg "pow_card" .lake/packages/mathlib/Mathlib/
```

## Modular Arithmetic in This Project

Since this project focuses on modular arithmetic, here are the common imports, namespaces, and theorems you'll need:

### Common Imports

```lean
import Mathlib  -- Import all of Mathlib (simplest approach)

-- Or, for more targeted imports:
import Mathlib.Data.Nat.Prime.Basic
import Mathlib.Data.ZMod.Basic
import Mathlib.GroupTheory.OrderOfElement
```

### Common Namespaces

```lean
open Nat ZMod
```

### Key Theorems and Lemmas for Modular Arithmetic

#### ZMod (Integers Modulo n)

- `ZMod.pow_card`: For elements in `ZMod p`, raising to the cardinality gives the element back
- `ZMod.pow_card_sub_one`: Fermat's little theorem in ZMod p (for nonzero elements)
- `ZMod.natCast_eq_natCast_iff`: Conversion between ZMod equality and natural number congruence
- `ZMod.natCast_eq_zero_iff`: When a cast to ZMod equals zero

#### Natural Number Modular Equivalence

- `Nat.ModEq`: The basic modular equivalence relation `a ≡ b [MOD n]`
- `Nat.ModEq.pow_card_sub_one_eq_one`: Fermat's little theorem for natural numbers
- `Nat.Prime.coprime_iff_not_dvd`: Relates coprimality to non-divisibility for primes

#### Useful Tactics

- `ring`: Solves equality goals in rings using normalization
- `simp`: Simplifies expressions using the simp lemma database
- `rw`: Rewrite using specific lemmas
- `calc`: Chain equalities/inequalities step by step (very useful for modular arithmetic!)
- `exact`: Provide the exact proof term
- `contradiction`: Derive a contradiction from contradictory hypotheses

## Style Guide

### Theorem Documentation

Every theorem must have a doc comment (`/-- ... -/`) above it with a natural language statement:

```lean
/--
For any prime p and any natural number a not divisible by p,
a raised to the power (p-1) is congruent to 1 modulo p.
-/
theorem fermat_little_theorem (p : ℕ) (a : ℕ) (hp : p.Prime) (ha : ¬ p ∣ a) :
    a ^ (p - 1) ≡ 1 [MOD p] := by
  ...
```

### Proof Structure

Proofs should be well-structured using `have` clauses to break down the argument into logical steps. Each `have` clause should:

1. Have a natural language comment above it explaining the step
2. Contain a short proof (ideally 2-3 lines of tactics)
3. Represent a step that a mathematician would make (possibly implicitly)

Example:

```lean
theorem fermat_little_theorem (p : ℕ) (a : ℕ) (hp : p.Prime) (ha : ¬ p ∣ a) :
    a ^ (p - 1) ≡ 1 [MOD p] := by
  -- We need the fact that p is prime as a typeclass instance
  haveI : Fact p.Prime := ⟨hp⟩

  -- p is positive since it is prime
  have hp_pos : 0 < p :=
    hp.pos

  -- a is nonzero in ZMod p since p does not divide a
  have ha_nonzero : (a : ZMod p) ≠ 0 := by
    intro h
    rw [ZMod.natCast_eq_zero_iff] at h
    contradiction

  ...
```

### Using Calc Mode

For proofs involving chains of equalities or modular arithmetic, use `calc` mode:

```lean
-- Therefore, a^(p-1) * a = a in ZMod p
have pow_pred_times_a : (a : ZMod p) ^ (p - 1) * (a : ZMod p) = (a : ZMod p) := by
  calc (a : ZMod p) ^ (p - 1) * (a : ZMod p)
      = (a : ZMod p) ^ (p - 1 + 1) := by rw [pow_succ]
    _ = (a : ZMod p) ^ p := by rw [Nat.sub_add_cancel hp_pos]
    _ = (a : ZMod p) := pow_card
```

### Nested Have Clauses vs. Lemmas

You can nest `have` clauses within other `have` clauses, similar to inner functions in Python. However, if you find yourself creating deep trees of nested `have` clauses, consider extracting independent lemmas instead:

```lean
-- Sometimes useful to keep as nested have clauses (doesn't clutter namespace)
have outer : ... := by
  have inner1 : ... := ...
  have inner2 : ... := ...
  ...

-- But if the structure gets complex, extract to a lemma
lemma helper_result : ... := by
  ...

theorem main_theorem : ... := by
  have step1 := helper_result
  ...
```

## Complete Example: Fermat's Little Theorem

Here's a complete example demonstrating all the style guidelines:

```lean
import Mathlib

namespace Warpsnwefts

open Nat ZMod

/-
# Fermat's Little Theorem

This file contains a proof of Fermat's Little Theorem, which is fundamental
in number theory and modular arithmetic.
-/

/--
For any prime p and any natural number a not divisible by p,
a raised to the power (p-1) is congruent to 1 modulo p.
-/
theorem fermat_little_theorem (p : ℕ) (a : ℕ) (hp : p.Prime) (ha : ¬ p ∣ a) :
    a ^ (p - 1) ≡ 1 [MOD p] := by
  -- We need the fact that p is prime as a typeclass instance
  haveI : Fact p.Prime := ⟨hp⟩

  -- p is positive since it is prime
  have hp_pos : 0 < p :=
    hp.pos

  -- a is nonzero in ZMod p since p does not divide a
  have ha_nonzero : (a : ZMod p) ≠ 0 := by
    intro h
    rw [ZMod.natCast_eq_zero_iff] at h
    contradiction

  -- In a finite field, every element raised to the cardinality equals itself
  have pow_card : (a : ZMod p) ^ p = (a : ZMod p) :=
    ZMod.pow_card (a : ZMod p)

  -- Therefore, a^(p-1) * a = a in ZMod p
  have pow_pred_times_a : (a : ZMod p) ^ (p - 1) * (a : ZMod p) = (a : ZMod p) := by
    calc (a : ZMod p) ^ (p - 1) * (a : ZMod p)
        = (a : ZMod p) ^ (p - 1 + 1) := by rw [pow_succ]
      _ = (a : ZMod p) ^ p := by rw [Nat.sub_add_cancel hp_pos]
      _ = (a : ZMod p) := pow_card

  -- Canceling a from both sides (valid since a ≠ 0), we get a^(p-1) = 1
  have pow_eq_one : (a : ZMod p) ^ (p - 1) = 1 := by
    calc (a : ZMod p) ^ (p - 1)
        = (a : ZMod p) ^ (p - 1) * 1 := by ring
      _ = (a : ZMod p) ^ (p - 1) * ((a : ZMod p) * (a : ZMod p)⁻¹) := by
          rw [← mul_inv_cancel₀ ha_nonzero]
      _ = ((a : ZMod p) ^ (p - 1) * (a : ZMod p)) * (a : ZMod p)⁻¹ := by ring
      _ = (a : ZMod p) * (a : ZMod p)⁻¹ := by rw [pow_pred_times_a]
      _ = 1 := mul_inv_cancel₀ ha_nonzero

  -- Converting from ZMod p equality to natural number congruence
  rw [← ZMod.natCast_eq_natCast_iff]
  simp only [Nat.cast_pow, Nat.cast_one]
  exact pow_eq_one

end Warpsnwefts
```

### Breaking Down the Example

1. **Searching for Premises**: The key theorems used are:
   - `ZMod.pow_card`: Found by searching for "pow" and "card" in mathlib
   - `ZMod.natCast_eq_natCast_iff`: Found by searching for conversion between ZMod and Nat
   - `mul_inv_cancel₀`: Standard group theory lemma

2. **Have Clause Structure**: Each `have` clause has:
   - A clear natural language comment
   - A short proof (often just one or two tactics)
   - A logical step in the overall argument

3. **Calc Mode Proofs**: Used twice to show chains of equalities clearly

4. **Natural Language Comments**: Every major step is documented so a mathematician can follow the proof without reading tactics

This style makes proofs readable, maintainable, and educational!
