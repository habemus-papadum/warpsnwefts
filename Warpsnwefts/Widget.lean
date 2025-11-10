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
  tilePixels : Nat
  colorGrid : Array (Array String)
  deriving RpcEncodable

/-- Props for a dummy widget describing a colored weave. -/
structure ColoredWeaveWidgetProps where
  size : Nat
  warpPalette : Nat
  weftPalette : Nat
  description : String
  pattern : String
  tilePixels : Nat
  colorGrid : Array (Array String)
  deriving RpcEncodable

@[widget_module]
def weaveWidget : Component WeaveWidgetProps where
  javascript := "
    import * as React from 'react';
    const e = React.createElement;
    const PIXEL_LIMIT = 400;
    function renderSvg(props) {
      const grid = props.colorGrid ?? [];
      const rows = grid.length;
      const cols = rows > 0 ? (grid[0]?.length ?? 0) : 0;
      if (rows === 0 || cols === 0) {
        return e('div', { className: 'weave-widget__canvas--empty' }, 'No weave data');
      }
      const tile = Math.max(1, props.tilePixels ?? 2);
      const patchSize = rows * tile;
      let repeats = Math.max(1, Math.floor(PIXEL_LIMIT / patchSize));
      const totalRows = rows * repeats;
      const totalCols = cols * repeats;
      const width = totalCols * tile;
      const height = totalRows * tile;
      const svgWidth = Math.min(width, PIXEL_LIMIT);
      const svgHeight = Math.min(height, PIXEL_LIMIT);
      const elements = [];
      for (let ry = 0; ry < repeats; ry++) {
        for (let y = 0; y < rows; y++) {
          const rowColors = grid[y] ?? [];
          for (let rx = 0; rx < repeats; rx++) {
            for (let x = 0; x < cols; x++) {
              const fill = rowColors[x] ?? '#000000';
              const px = (rx * cols + x) * tile;
              const py = (ry * rows + y) * tile;
              elements.push(e('rect', {
                key: `${ry}-${y}-${rx}-${x}`,
                x: px,
                y: py,
                width: tile,
                height: tile,
                fill
              }));
            }
          }
        }
      }
      return e('svg', {
        className: 'weave-widget__canvas',
        width: svgWidth,
        height: svgHeight,
        viewBox: `0 0 ${width} ${height}`,
        shapeRendering: 'crispEdges'
      }, elements);
    }
    export default function(props) {
      const message = props.description ?? 'A weave.';
      return e('div', { className: 'weave-widget' },
        e('div', null, `Weave (size ${props.size}): ${message}`),
        e('pre', { className: 'weave-widget__pattern' }, props.pattern ?? ''),
        renderSvg(props));
    }
  "

@[widget_module]
def coloredWeaveWidget : Component ColoredWeaveWidgetProps where
  javascript := "
    import * as React from 'react';
    const e = React.createElement;
    const PIXEL_LIMIT = 400;
    function renderSvg(props) {
      const grid = props.colorGrid ?? [];
      const rows = grid.length;
      const cols = rows > 0 ? (grid[0]?.length ?? 0) : 0;
      if (rows === 0 || cols === 0) {
        return e('div', { className: 'colored-weave-widget__canvas--empty' }, 'No colored weave data');
      }
      const tile = Math.max(1, props.tilePixels ?? 2);
      const patchSize = rows * tile;
      let repeats = Math.max(1, Math.floor(PIXEL_LIMIT / patchSize));
      const totalRows = rows * repeats;
      const totalCols = cols * repeats;
      const width = totalCols * tile;
      const height = totalRows * tile;
      const elements = [];
      for (let ry = 0; ry < repeats; ry++) {
        for (let y = 0; y < rows; y++) {
          const rowColors = grid[y] ?? [];
          for (let rx = 0; rx < repeats; rx++) {
            for (let x = 0; x < cols; x++) {
              const fill = rowColors[x] ?? '#000000';
              const px = (rx * cols + x) * tile;
              const py = (ry * rows + y) * tile;
              elements.push(e('rect', {
                key: `${ry}-${y}-${rx}-${x}`,
                x: px,
                y: py,
                width: tile,
                height: tile,
                fill
              }));
            }
          }
        }
      }
      const svgWidth = Math.min(width, PIXEL_LIMIT);
      const svgHeight = Math.min(height, PIXEL_LIMIT);
      return e('svg', {
        className: 'colored-weave-widget__canvas',
        width: svgWidth,
        height: svgHeight,
        viewBox: `0 0 ${width} ${height}`,
        shapeRendering: 'crispEdges'
      }, elements);
    }
    export default function(props) {
      const message = props.description ?? 'A colored weave.';
      return e('div', { className: 'colored-weave-widget' },
        e('div', null,
          `Colored weave (size ${props.size}, warp colors ${props.warpPalette}, weft colors ${props.weftPalette}): ${message}`),
        e('pre', { className: 'colored-weave-widget__pattern' }, props.pattern ?? ''),
        renderSvg(props));
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

private def defaultTilePixels : Nat := 2

private def plainWarpColor : String := "#111111"

private def plainWeftColor : String := "#d7263d"

private def paletteColors : Array String := #[
  "#e63946", "#f1a208", "#52b788", "#457b9d", "#8d5b4c",
  "#6d597a", "#ff934f", "#2d6a4f", "#3a86ff", "#8338ec"
]

private def paletteColor (idx : Nat) : String :=
  if paletteColors.isEmpty then
    "#000000"
  else
    paletteColors.getD (idx % paletteColors.size) "#000000"

private def listGridToArray (rows : List (List String)) : Array (Array String) :=
  rows.toArray.map fun r => r.toArray

private def buildColorGrid (size : Nat) (value : ZMod size → ZMod size → String) : Array (Array String) :=
  listGridToArray <|
    (List.range size).map fun i =>
      let ii : ZMod size := (i : ZMod size)
      (List.range size).map fun j =>
        let jj : ZMod size := (j : ZMod size)
        value ii jj

private def zmodIndex : (n : Nat) → ZMod n → Nat
  | 0, _ => 0
  | Nat.succ m, x =>
      haveI : NeZero (Nat.succ m) := ⟨Nat.succ_ne_zero _⟩
      x.val

private def weaveColorGrid (size : Nat) (w : Weave size) : Array (Array String) :=
  buildColorGrid size fun i j => if w (i, j) = 0 then plainWarpColor else plainWeftColor

private def coloredColorGrid (size warp weft : Nat)
    (cw : ColoredWeave size warp weft) : Array (Array String) :=
  buildColorGrid size fun i j =>
    let top := cw.weave (i, j)
    if top = 0 then
      paletteColor (zmodIndex warp (cw.warpColoring i))
    else
      paletteColor (zmodIndex weft (cw.weftColoring j))

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

private def analyzeWeaveTerm (t : Term) :
    CommandElabM (Nat × String × Array (Array String)) :=
  runTermElab t fun e => do
    let ty ← inferType e
    let args ← expectConstApp ``Warpsnwefts.Weave 1 ty
    let size ← evalNatExpr args[0]!
    let (pattern, colors) ←
      (unsafe do
        let weaveVal ← Meta.evalExpr (Weave size) ty e
        pure (weavePatternString size weaveVal, weaveColorGrid size weaveVal))
    pure (size, pattern, colors)

private def analyzeColoredWeaveTerm (t : Term) :
    CommandElabM (Nat × Nat × Nat × String × Array (Array String)) :=
  runTermElab t fun e => do
    let ty ← inferType e
    let args ← expectConstApp ``Warpsnwefts.ColoredWeave 3 ty
    let size ← evalNatExpr args[0]!
    let warp ← evalNatExpr args[1]!
    let weft ← evalNatExpr args[2]!
    let (pattern, colors) ←
      (unsafe do
        let coloredVal ← Meta.evalExpr (ColoredWeave size warp weft) ty e
        pure (coloredPatternString size warp weft coloredVal,
              coloredColorGrid size warp weft coloredVal))
    pure (size, warp, weft, pattern, colors)

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
      let (size, pattern, colors) ← analyzeWeaveTerm t
      saveWeaveWidget
        { size
          description := s!"The weave has period {size}×{size}."
          pattern
          tilePixels := defaultTilePixels
          colorGrid := colors }
        stx
  | _ => throwUnsupportedSyntax

syntax (name := coloredWeaveWidgetCmd) "#colored_weave_widget " term : command

@[command_elab coloredWeaveWidgetCmd]
def elabColoredWeaveWidget : CommandElab
  | stx@`(#colored_weave_widget $t) => do
      let (base, warp, weft, pattern, colors) ← analyzeColoredWeaveTerm t
      saveColoredWeaveWidget
        { size := base
          warpPalette := warp
          weftPalette := weft
          description :=
            s!"Warp colors: {warp}; Weft colors: {weft}; Period: {base}."
          pattern
          tilePixels := defaultTilePixels
          colorGrid := colors }
        stx
  | _ => throwUnsupportedSyntax

end Widget

end Warpsnwefts
