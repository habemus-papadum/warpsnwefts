import Warpsnwefts.Weave
import Warpsnwefts.Weave.Library
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

def plainDemo : Weave 8 :=
  Weave.Library.Patterns.plain (n := 8)

def risingTwillDemo : Weave 8 :=
  Weave.Library.Patterns.risingTwill (n := 8) (over := 3) (under := 1)

def herringboneDemo : Weave 12 :=
  Weave.Library.Patterns.herringbone (n := 12) (segmentLen := 3) (over := 2) (under := 2)

def diamondDemo : Weave 24 :=
  Weave.Library.Patterns.diamond (n := 24) (halfDiagonal := 5)

def sampleColoredWeave : ColoredWeave 4 3 2 where
  weave := sampleWeave
  warpColoring := fun i => (i.val : ZMod 3)
  weftColoring := fun j => (j.val : ZMod 2)


#weave_widget sampleWeave

#weave_widget twill

#weave_widget plainDemo

#weave_widget risingTwillDemo

#weave_widget herringboneDemo

#weave_widget diamondDemo


#colored_weave_widget sampleColoredWeave

end Warpsnwefts
