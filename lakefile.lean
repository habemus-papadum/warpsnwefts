import Lake
open Lake DSL

package «warpsnwefts» where
  version := v!"0.1.0"
  keywords := #["math"]
  leanOptions := #[
    ⟨`pp.unicode.fun, true⟩, -- pretty-prints `fun a ↦ b`
    ⟨`autoImplicit, true⟩
  ]

require "leanprover-community" / "mathlib"
require verso from git "https://github.com/leanprover/verso.git"@"v4.25.0-rc2"

@[default_target]
lean_lib «WarpsnWefts» where
  -- add any library configuration options here


lean_lib «Agents» where


lean_exe «build-book» where
  root := `BookBuilder
