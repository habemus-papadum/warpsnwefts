import Lean.Elab.Command
import Lean.Meta
import ProofWidgets.Component.Basic
import Warpsnwefts.Weave

/-!
# Simple widgets for weaves

This module hooks the abstract weave models into ProofWidgets.  For now the
widgets simply print textual summaries, which is already enough to ensure the
data flows from Lean into the InfoView.
-/

namespace Warpsnwefts

open Lean Meta Elab Command ProofWidgets Server

/-- Props for a dummy widget describing a concrete weave. -/
structure WeaveWidgetProps where
  size : Nat
  description : String
  pattern : String
  deriving RpcEncodable

/-- Props for a dummy widget describing a colored weave. -/
structure ColoredWeaveWidgetProps where
  size : Nat
  warpPalette : Nat
  weftPalette : Nat
  description : String
  pattern : String
  deriving RpcEncodable

@[widget_module]
def weaveWidget : Component WeaveWidgetProps where
  javascript := "
    import * as React from 'react';
    const e = React.createElement;
    export default function(props) {
      const message = props.description ?? 'A weave.';
      return e('div', { className: 'weave-widget' },
        e('div', null, `Weave (size ${props.size}): ${message}`),
        e('pre', { className: 'weave-widget__pattern' }, props.pattern ?? ''));
    }
  "

@[widget_module]
def coloredWeaveWidget : Component ColoredWeaveWidgetProps where
  javascript := "
    import * as React from 'react';
    const e = React.createElement;
    export default function(props) {
      const message = props.description ?? 'A colored weave.';
      return e('div', { className: 'colored-weave-widget' },
        e('div', null,
          `Colored weave (size ${props.size}, warp colors ${props.warpPalette}, weft colors ${props.weftPalette}): ${message}`),
        e('pre', { className: 'colored-weave-widget__pattern' }, props.pattern ?? ''));
    }
  "

namespace Widget

private def evalNatExpr (e : Expr) : MetaM Nat := do
  let some n ← (Lean.Meta.evalNat e).run
    | throwError "expected a concrete natural number, but got expression {e}"
  pure n

private def expectConstApp (constName : Name) (expectedArgs : Nat) (ty : Expr) :
    MetaM (Array Expr) := do
  let fn := ty.getAppFn
  let args := ty.getAppArgs
  unless fn.isConstOf constName && args.size == expectedArgs do
    throwError "expected term of type `{constName}` with {expectedArgs} arguments, but got {ty}"
  pure args

private def runTermElab {α} (t : Term) (k : Expr → MetaM α) : CommandElabM α :=
  liftTermElabM do
    let e ← Term.elabTerm t none
    Term.synthesizeSyntheticMVarsNoPostponing
    let e ← instantiateMVars e
    k e

private def renderGrid (size : Nat) (entry : ZMod size → ZMod size → String) : String :=
  if size = 0 then
    "No positions to display (size 0)."
  else
    let rows :=
      (List.range size).map fun i =>
        let ii : ZMod size := (i : ZMod size)
        let cells :=
          (List.range size).map fun j =>
            let jj : ZMod size := (j : ZMod size)
            entry ii jj
        String.intercalate " " cells
    String.intercalate "\n" rows

private def zmodString {n : Nat} (z : ZMod n) : String :=
  reprStr z

private def weavePatternString (size : Nat) (w : Weave size) : String :=
  renderGrid size fun i j =>
    let bit : Nat := (w (i, j)).val
    toString bit

private def coloredPatternString (size warp weft : Nat)
    (cw : ColoredWeave size warp weft) : String :=
  renderGrid size fun i j =>
    let top := cw.weave (i, j)
    if top = 0 then
      s!"0,{zmodString (cw.warpColoring i)}"
    else
      s!"1,{zmodString (cw.weftColoring j)}"

private def analyzeWeaveTerm (t : Term) : CommandElabM (Nat × String) :=
  runTermElab t fun e => do
    let ty ← inferType e
    let args ← expectConstApp ``Warpsnwefts.Weave 1 ty
    let size ← evalNatExpr args[0]!
    let pattern ←
      (unsafe do
        let weaveVal ← Meta.evalExpr (Weave size) ty e
        pure (weavePatternString size weaveVal))
    pure (size, pattern)

private def analyzeColoredWeaveTerm (t : Term) :
    CommandElabM (Nat × Nat × Nat × String) :=
  runTermElab t fun e => do
    let ty ← inferType e
    let args ← expectConstApp ``Warpsnwefts.ColoredWeave 3 ty
    let size ← evalNatExpr args[0]!
    let warp ← evalNatExpr args[1]!
    let weft ← evalNatExpr args[2]!
    let pattern ←
      (unsafe do
        let coloredVal ← Meta.evalExpr (ColoredWeave size warp weft) ty e
        pure (coloredPatternString size warp weft coloredVal))
    pure (size, warp, weft, pattern)

private def saveWeaveWidget (props : WeaveWidgetProps) (stx : Syntax) : CommandElabM Unit :=
  liftCoreM <|
    Widget.savePanelWidgetInfo weaveWidget.javascriptHash (rpcEncode props) stx

private def saveColoredWeaveWidget (props : ColoredWeaveWidgetProps) (stx : Syntax) :
    CommandElabM Unit :=
  liftCoreM <|
    Widget.savePanelWidgetInfo coloredWeaveWidget.javascriptHash (rpcEncode props) stx

syntax (name := weaveWidgetCmd) "#weave_widget " term : command

@[command_elab weaveWidgetCmd]
def elabWeaveWidget : CommandElab
  | stx@`(#weave_widget $t) => do
      let (size, pattern) ← analyzeWeaveTerm t
      saveWeaveWidget
        { size
          description := s!"The weave has period {size}×{size}."
          pattern }
        stx
  | _ => throwUnsupportedSyntax

syntax (name := coloredWeaveWidgetCmd) "#colored_weave_widget " term : command

@[command_elab coloredWeaveWidgetCmd]
def elabColoredWeaveWidget : CommandElab
  | stx@`(#colored_weave_widget $t) => do
      let (base, warp, weft, pattern) ← analyzeColoredWeaveTerm t
      saveColoredWeaveWidget
        { size := base
          warpPalette := warp
          weftPalette := weft
          description :=
            s!"Warp colors: {warp}; Weft colors: {weft}; Period: {base}."
          pattern }
        stx
  | _ => throwUnsupportedSyntax

end Widget

end Warpsnwefts
