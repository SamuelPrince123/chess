# Endgame ♟️

A quiet, modern two-player chess board — built with plain HTML, CSS, and JavaScript. No frameworks, no libraries, no build step.

**Features**
- Full chess rules: legal move generation, check/checkmate/stalemate detection
- Castling (kingside & queenside), en passant, pawn promotion
- Move history in algebraic notation
- Captured-piece trays for both sides
- Undo, new game, and board flip
- Responsive layout, keyboard-focus visible, respects reduced-motion

## Play locally

Just open `index.html` in a browser — that's it, no server or install needed.

## Put it live with GitHub Pages

1. Create a new repository on GitHub (or use an existing one).
2. Upload these three files to the repo root: `index.html`, `style.css`, `script.js` (and this `README.md` if you like).
   - Easiest way: on your repo's GitHub page, click **Add file → Upload files**, drag in the files, and commit.
3. Go to your repo's **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Pick the **`main`** branch and the **`/ (root)`** folder, then **Save**.
6. Wait about a minute, then refresh the Pages settings — you'll see a live URL like:
   ```
   https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
   ```

That link is now live and shareable — anyone can open it and play.

## Notes

- This is local two-player (hotseat) chess — both players share one screen and alternate moves.
- Everything is a static file, so it works entirely offline once loaded.
