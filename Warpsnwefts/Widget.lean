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
  deriving RpcEncodable

/-- Props for a dummy widget describing a colored weave. -/
structure ColoredWeaveWidgetProps where
  size : Nat
  warpPalette : Nat
  weftPalette : Nat
  description : String
  deriving RpcEncodable

@[widget_module]
def weaveWidget : Component WeaveWidgetProps where
  javascript := "
    import * as React from 'react';
    const e = React.createElement;
    export default function(props) {
      const message = props.description ?? 'A weave.';
      return e('div', { className: 'weave-widget' },
        `Weave (size ${props.size}): ${message}`);
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
        `Colored weave (size ${props.size}, warp colors ${props.warpPalette}, weft colors ${props.weftPalette}): ${message}`);
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
      let e ← Term.elabTerm t none
      Term.synthesizeSyntheticMVarsNoPostponing
      let e ← instantiateMVars e
      let ty ← inferType e
      let args ← expectConstApp ``Warpsnwefts.Weave 1 ty
      let size ← evalNatExpr args[0]!
      saveWeaveWidget
        { size
          description := s!"The weave has period {size}×{size}." }
        stx
  | _ => throwUnsupportedSyntax

syntax (name := coloredWeaveWidgetCmd) "#colored_weave_widget " term : command

@[command_elab coloredWeaveWidgetCmd]
def elabColoredWeaveWidget : CommandElab
  | stx@`(#colored_weave_widget $t) => do
      let e ← Term.elabTerm t none
      Term.synthesizeSyntheticMVarsNoPostponing
      let e ← instantiateMVars e
      let ty ← inferType e
      let args ← expectConstApp ``Warpsnwefts.ColoredWeave 3 ty
      let base ← evalNatExpr args[0]!
      let warp ← evalNatExpr args[1]!
      let weft ← evalNatExpr args[2]!
      saveColoredWeaveWidget
        { size := base
          warpPalette := warp
          weftPalette := weft
          description :=
            s!"Warp colors: {warp}; Weft colors: {weft}; Period: {base}." }
        stx
  | _ => throwUnsupportedSyntax

end Widget

end Warpsnwefts
