import Warpsnwefts.Weave
import Warpsnwefts.Widget

/-!
# Widget demo

This file demonstrates the dummy weave widgets by instantiating concrete weaves
and invoking the custom commands defined in `Warpsnwefts.Widget`.
-/

namespace Warpsnwefts

open scoped BigOperators

def sampleWeave : Weave 4 := fun p =>
  let i := p.1.val
  let j := p.2.val
  if (i + j) % 2 = 0 then 0 else 1

def twill : Weave 4 := fun p =>
  let i := p.1.val
  let j := p.2.val
  if (i + j) % 4 < 2 then 0 else 1


def sampleColoredWeave : ColoredWeave 4 3 2 where
  weave := sampleWeave
  warpColoring := fun i => (i.val : ZMod 3)
  weftColoring := fun j => (j.val : ZMod 2)


#weave_widget sampleWeave

#weave_widget twill


#colored_weave_widget sampleColoredWeave

end Warpsnwefts
