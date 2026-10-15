Quick capture recipes

Capture means: jot one node under a configured path (default /tmp) as fast as
possible. The semantics are shared by every entry (see data_structure.md
"Quick capture"): the first line becomes the node's name, the rest its note,
missing path segments are created, a name collision gets a ` (2)` suffix and
the node lands on top. Everything is an ordinary add op.

--
CLI (P)

  worktree capture 买牛奶 明天          # the rest of the line is the text
  worktree cap 买牛奶 明天             # same command (alias)
  worktree capture -c                  # capture the clipboard (macOS)
  pbpaste | worktree capture           # capture piped stdin
  worktree config quickAddPath=/inbox  # move the capture inbox

The REPL splits on whitespace (no quoting): `capture 买牛奶 明天` just works.
A one-shot run waits ~3s for the sync and prints `(synced)` or the offline
note; when it runs offline the op is queued (it also works for the local
user). Undo (`undo`) drops the newest capture like any pending add.

System-wide hotkey glue (needs `worktree` on PATH — e.g. `npm link` in
frontend/cli):

  # macOS Automator: a Quick Action running a shell script, then bind a
  # shortcut in System Settings → Keyboard → Keyboard Shortcuts → Services.
  text=$(osascript -e 'tell application (path to frontmost application as text) to display dialog "Capture" default answer ""' -e 'text returned of result')
  [ -n "$text" ] && worktree capture "$text"

  # Hammerspoon (~/.hammerspoon/init.lua):
  hs.hotkey.bind({"alt"}, "space", function()
    local ok, text = hs.dialog.textPrompt("Capture", "", "", "OK", "Cancel")
    if ok == "OK" and text ~= "" then
      hs.execute("worktree capture " .. hs.shlex.quote(text))
    end
  end)

  # Raycast: a Script Command whose argument is the text → `worktree capture "$1"`.

Editors: a VS Code task or Vim mapping can pipe the selection in
(`… | worktree capture`).

--
Web (U)

  ⌘K / Ctrl+K          open the capture overlay from anywhere in the app
  Enter                capture the typed text; Shift+Enter inserts a line break
  Enter (empty)        capture the clipboard content
  Esc                  close

  /?quick=1            open the overlay via a link (prefill with &text=…)

Installed PWA: Android — long-press the icon → "Quick add", or share text or
a link from any app to WORKTREE (the title becomes the name, the link its
note). iOS has no Web Share Target — use Shortcuts below. The target path is
configurable in Settings → Quick capture.

--
API (A)

  curl -X POST https://<host>/api/capture \
    -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
    -d "{\"id\": \"$(uuidgen)\", \"text\": \"买牛奶\\n顺路去超市\"}"

The endpoint plans through the same core function and appends through the
normal submit machinery; the full contract is in sync.md. An `id` makes the
call retry-safe (a repeat is an idempotent no-op); omit it for one-shot
scripts. Online only.

iOS Shortcuts (the fastest iPhone capture). A link cannot work here — an
installed PWA and Safari keep separate storage on iOS, so an opened link
lands in a logged-out copy; /api/capture is the way in.

  Get a device token first (label it so it can be revoked later):
    curl -s -X POST https://<host>/api/login -H 'Content-Type: application/json' \
      -d '{"username":"<you>","password":"<password>","label":"iphone-shortcuts"}'
    → copy `token` from the response.

  The shortcut (Shortcuts app → +):
    1. Action "Dictate Text" (听写文本) — or "Ask for Input" to type instead.
    2. Action "Get Contents of URL" (获取 URL 内容), Show More →:
         URL     https://<host>/api/capture
         Method  POST
         Headers Authorization: Bearer <token>
                 Content-Type: application/json
         Body    JSON, field `text` = the Dictated Text variable
       No `id`: Shortcuts does not auto-retry requests, so the server-generated
       one is fine; re-running after a lost response yields a ` (2)` suffixed
       node instead of losing the capture.
    3. Optional: "Get Dictionary Value" (displayPath) + "Show Notification" to
       confirm with "captured /tmp/…".
    Run it once to verify the node appears under /tmp.

  Pin it (fastest first):
    - "Hey Siri, <shortcut name>" — hands-free, dictation included.
    - Lock Screen widget: long-press the Lock Screen → Customize → add a
      Shortcuts widget.
    - Action Button (15 Pro+), Back Tap, or a Control Center control (iOS 18+).
    - Share Sheet variant: in the shortcut's details (ⓘ) enable "Show in Share
      Sheet" (accept Text/URLs) and use "Shortcut Input" (快捷指令输入) as the
      `text` value — or wrap it in an If: the input when present, dictation
      otherwise.

Android Tasker: an HTTP Request action (POST, JSON body {"text": "%par1"})
triggered by a home-screen widget, a quick-settings tile or the Assistant
gives the same dictation-speed capture.
