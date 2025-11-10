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
