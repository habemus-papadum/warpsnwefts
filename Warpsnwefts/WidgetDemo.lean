import Warpsnwefts.Weave
import Warpsnwefts.Widget

/-!
# Widget demo

This file demonstrates the dummy weave widgets by instantiating concrete weaves
and invoking the custom commands defined in `Warpsnwefts.Widget`.
-/

namespace Warpsnwefts

open scoped BigOperators

def sampleWeave : Weave 4 := fun _ => 0

def sampleColoredWeave : ColoredWeave 4 3 2 where
  weave := sampleWeave
  warpColoring := fun _ => 0
  weftColoring := fun _ => 1

#weave_widget sampleWeave

#colored_weave_widget sampleColoredWeave

end Warpsnwefts
