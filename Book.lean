import VersoManual
import Warpsnwefts.Book

open Verso.Genre Manual
open Verso Code External

open Verso.Output.Html in


def config : Config where
  emitTeX := false
  emitHtmlSingle := false
  emitHtmlMulti := true
  htmlDepth := 2
  -- extraFiles := [("static", "static")]
  -- extraCss := [
  --   "/static/theme.css",
  --   "/static/fonts/source-serif/source-serif-text.css",
  --   "/static/fonts/source-code-pro/source-code-pro.css",
  --   "/static/fonts/source-sans/source-sans-3.css",
  --   "/static/fonts/noto-sans-mono/noto-sans-mono.css"
  -- ]
  -- extraHead := #[plausible]
  -- logo := some "/static/lean_logo.svg"
  sourceLink := some "https://github.com/habmeus-papadum/warpsnwefts"
  issueLink := some "https://github.com/habmeus-papadum/warpsnwefts/issues"
  linkTargets := fun st => st.localTargets ++ st.remoteTargets
def main := manualMain (%doc Warpsnwefts.Book) (config := config.addKaTeX)
