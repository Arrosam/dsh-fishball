# SMART-PROMPT.md

## Project
- Goal: a general, always-on personal-assistant agent named **Fishball**, built on DSH, that manages the user's daily life and work.
- The project is a from-scratch rebuild. The user rejected the earlier direction and wants the current code deleted. The design/architecture plan lives in `DESIGN.md` (numbered sections, e.g. §4 plugins, §7 capabilities, §7a permissions, §10 button, §16 safety limits).
- Fishball is a standard DSH plugin. It installs into the profile the user chooses and has no profile of its own. Its session folder is `~/.dsh/fishball/assistant`.
- Once installed, it replaces the DeepSeek Harness logo/brand button in the DSH sidebar with a Fishball icon. Clicking the icon opens the Fishball session.
- Fishball does not fully adopt DSH's global profile. It enables, disables and adds plugins for itself only, never for the whole DSH process. Adding a plugin needs the user's approval through DSH's normal permission escalation request.
- Plugins that feed Fishball must be standard DSH plugins that can be enabled in Fishball only.
- It has exactly one session, which always accepts steer messages: every arriving message steers the current session.
- Other agents/sessions can message Fishball on their own. Fishball can send messages into other sessions, start new sessions, and register hooks that tell it when a session finishes.
- Model: uses DSH's settings. The context window defaults to the default model's size, and the user can set a smaller one.
- Role: an information processing centre that does no work on its own (the user's summary: "processes information, does no work"). Its prompt should state this role explicitly. Its inputs are users, online search, other agent sessions, and hooks from installed plugins.
- Capabilities: no local file writes. Plugin tools that save files are not exposed to Fishball at all. Everything else is allowed, including browser use and computer use through plugins.
- Permissions exception: every permission request from another session always goes to Fishball. Fishball may approve requests only when the user has explicitly allowed it, through messages in the user's chat with Fishball (no settings file, no fixed list). With an allowance, it auto-approves what it judges low-risk and brings high-risk requests to the user. Without one, it escalates everything. The low/high-risk rubric lives in its prompt.
- It exposes a hook, so users can write plugins that add hooks to it.

## Vocabulary
- DSH: DeepSeek Harness, the host platform/runtime the agent runs on. It has a global profile, plugins, sessions and hooks.
- Fishball: the name of the assistant agent/plugin and of its session.
- "session": a DSH agent session.
- "steer" / "steer message": a message that is injected into Fishball's running session.
- "hook": DSH's mechanism for receiving events or messages, such as when a session finishes. Plugins can add hooks.
- "permission": a permission request raised by a session. Fishball can approve these for other sessions once the user has allowed it.
- "weak constrained by prompt": a constraint enforced softly through the agent's prompt (its instructions), not through a hard-coded mechanism.

## Preferences
- For big changes, the user wants a design/architecture plan to review before any implementation or code deletion.
- The user answers the agent's open questions by quoting each question with the answer after it.
- When an agent's questions are unclear, the user asks for plain-language explanations.
